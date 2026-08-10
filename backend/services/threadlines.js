/*
    threadlines.js

    SQLite implementation of Threadline service.
    Manages persistence of threadline metadata, conversations, messages, 
    participants, and timeline events in the local database.

    Responsibilities:
    - Save/Insert imported archives.
    - Query threadline list and details.
    - Delete threadlines (cascading to conversations/messages).
*/

// =====================================
// Imports
// =====================================

const crypto = require("crypto");
const db = require("../database/database");

// =====================================
// Public Methods
// =====================================

async function ingestArchive(uid, archive, filename, file_size, targetThreadlineId = null) {
    console.log("");
    console.log("==========================================");
    console.log("SQLITE: INGEST ARCHIVE");
    console.log("==========================================");
    console.log("User UID:", uid);
    console.log("File:", filename);

    const now = new Date().toISOString();
    const threadlineId = targetThreadlineId || `archive_${uid}`;
    const importId = crypto.randomUUID();

    let newMessagesCount = 0;
    let duplicateMessagesCount = 0;
    let newThreadsCount = 0;

    // Use a database transaction to insert all data atomically and with maximum speed
    db.transaction(() => {
        // 1. Ensure the threadline workspace exists
        db.run(
            `INSERT INTO threadlines (id, owner_id, name, source, platform, created_at, updated_at, message_count, conversation_count)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET updated_at = ?`,
            [
                threadlineId,
                uid,
                filename || "Imported Threadline",
                archive.source || "SMS Backup & Restore",
                archive.platform || "SMS",
                now,
                now,
                0,
                0,
                now
            ]
        );

        // 2. Insert imports history record
        db.run(
            `INSERT INTO imports (id, owner_id, filename, source, platform, file_size, message_count, participant_count, thread_count, earliest_timestamp, latest_timestamp, imported_at, status, errors)
             VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, NULL, NULL, ?, 'completed', '[]')`,
            [
                importId,
                uid,
                filename || "Unknown File",
                archive.source || "SMS Backup & Restore",
                archive.platform || "SMS",
                file_size || 0,
                now
            ]
        );

        const conversationMap = new Map(); // key: original_title -> id: UUID
        const participantMap = new Map();  // key: address -> id: UUID

        // Create or get participant record for the user ("Me")
        let meId;
        const existingMe = db.queryOne("SELECT id FROM participants WHERE threadline_id = ? AND phone_number = 'Me'", [threadlineId]);
        if (existingMe) {
            meId = existingMe.id;
            participantMap.set("Me", meId);
        } else {
            meId = crypto.randomUUID();
            db.run(
                `INSERT INTO participants (id, threadline_id, name, phone_number, email, platform_identifiers, aliases, metadata)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    meId,
                    threadlineId,
                    "Me",
                    "Me",
                    null,
                    JSON.stringify(["Me"]),
                    JSON.stringify([]),
                    JSON.stringify({})
                ]
            );
            participantMap.set("Me", meId);
        }

        let earliestTs = null;
        let latestTs = null;

        // Process conversations (discovered threads)
        archive.conversations.forEach(conv => {
            const convTitle = conv.title || "Unknown Conversation";
            
            // Check if conversation already exists under global archive
            let convId;
            const existingConv = db.queryOne(
                `SELECT id FROM conversations WHERE threadline_id = ? AND title = ?`,
                [threadlineId, convTitle]
            );

            if (existingConv) {
                convId = existingConv.id;
            } else {
                convId = crypto.randomUUID();
                newThreadsCount++;
                db.run(
                    `INSERT INTO conversations (id, threadline_id, platform, title, start_date, end_date, message_count, metadata)
                     VALUES (?, ?, ?, ?, ?, ?, 0, ?)`,
                    [
                        convId,
                        threadlineId,
                        conv.platform || archive.platform || "SMS",
                        convTitle,
                        null,
                        null,
                        JSON.stringify(conv.metadata || {})
                    ]
                );
            }
            conversationMap.set(convTitle, convId);

            // Check if participant exists
            let partId;
            const existingPart = db.queryOne(
                `SELECT id FROM participants WHERE threadline_id = ? AND phone_number = ?`,
                [threadlineId, convTitle]
            );

            if (existingPart) {
                partId = existingPart.id;
                participantMap.set(convTitle, partId);
            } else {
                partId = crypto.randomUUID();
                db.run(
                    `INSERT INTO participants (id, threadline_id, name, phone_number, email, platform_identifiers, aliases, metadata)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        partId,
                        threadlineId,
                        conv.metadata?.contact || convTitle,
                        convTitle,
                        null,
                        JSON.stringify([convTitle]),
                        JSON.stringify([]),
                        JSON.stringify({ contact_name: conv.metadata?.contact })
                    ]
                );
                participantMap.set(convTitle, partId);
            }

            // Ensure conversation participants mapping exists
            db.run(`INSERT OR IGNORE INTO conversation_participants (conversation_id, participant_id) VALUES (?, ?)`, [convId, partId]);
            db.run(`INSERT OR IGNORE INTO conversation_participants (conversation_id, participant_id) VALUES (?, ?)`, [convId, meId]);

            // Process messages within this conversation
            conv.messages.forEach(msg => {
                const msgTimestamp = Number(msg.timestamp);
                if (earliestTs === null || msgTimestamp < earliestTs) earliestTs = msgTimestamp;
                if (latestTs === null || msgTimestamp > latestTs) latestTs = msgTimestamp;

                // Check for duplicate messages (same conversation, timestamp, sender, and body)
                const existingMsg = db.queryOne(
                    `SELECT id FROM messages WHERE conversation_id = ? AND timestamp = ? AND sender = ? AND body = ?`,
                    [convId, msgTimestamp, msg.direction === "sent" ? "Me" : msg.sender, msg.body || ""]
                );

                if (existingMsg) {
                    duplicateMessagesCount++;
                    // Insert message imports source link
                    db.run(
                        `INSERT OR IGNORE INTO message_imports (message_id, import_id) VALUES (?, ?)`,
                        [existingMsg.id, importId]
                    );
                } else {
                    newMessagesCount++;
                    const msgId = crypto.randomUUID();
                    const senderName = msg.direction === "sent" ? "Me" : (msg.metadata?.contact || msg.sender);

                    db.run(
                        `INSERT INTO messages (id, conversation_id, threadline_id, sender, recipient, timestamp, body, attachments, platform, direction, metadata)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            msgId,
                            convId,
                            threadlineId,
                            msg.direction === "sent" ? "Me" : msg.sender,
                            msg.direction === "sent" ? msg.sender : "Me",
                            msgTimestamp,
                            msg.body || "",
                            JSON.stringify(msg.attachments || []),
                            msg.platform || conv.platform || "SMS",
                            msg.direction || "received",
                            JSON.stringify(msg.metadata || {})
                        ]
                    );

                    db.run(
                        `INSERT INTO timeline_events (id, threadline_id, timestamp, type, source_id, title, description, sender, metadata)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            crypto.randomUUID(),
                            threadlineId,
                            msgTimestamp,
                            "message",
                            msgId,
                            `Message from ${senderName}`,
                            msg.body ? (msg.body.length > 60 ? msg.body.substring(0, 60) + "..." : msg.body) : "",
                            msg.direction === "sent" ? "Me" : msg.sender,
                            JSON.stringify({ direction: msg.direction, contact: msg.metadata?.contact })
                        ]
                    );

                    db.run(
                        `INSERT INTO message_imports (message_id, import_id) VALUES (?, ?)`,
                        [msgId, importId]
                    );
                }
            });
        });

        // Compute unique participant count involved in this import
        const partCount = db.queryOne(
            `SELECT COUNT(DISTINCT cp.participant_id) AS count 
             FROM conversation_participants cp 
             JOIN messages m ON cp.conversation_id = m.conversation_id
             JOIN message_imports mi ON m.id = mi.message_id
             WHERE mi.import_id = ?`,
            [importId]
        ).count || 0;

        // Update the import metadata details
        db.run(
            `UPDATE imports SET 
                message_count = ?, 
                participant_count = ?, 
                thread_count = ?, 
                earliest_timestamp = ?, 
                latest_timestamp = ?, 
                errors = ? 
             WHERE id = ?`,
            [
                newMessagesCount + duplicateMessagesCount,
                partCount,
                archive.conversations.length,
                earliestTs,
                latestTs,
                JSON.stringify(archive.errors || []),
                importId
            ]
        );

        // Update each conversation's start date, end date, and message count
        const conversationsToUpdate = db.query(
            `SELECT DISTINCT conversation_id FROM messages WHERE threadline_id = ?`,
            [threadlineId]
        );

        conversationsToUpdate.forEach(row => {
            const stats = db.queryOne(
                `SELECT MIN(timestamp) AS start, MAX(timestamp) AS end, COUNT(id) AS count 
                 FROM messages 
                 WHERE conversation_id = ?`,
                [row.conversation_id]
            );
            db.run(
                `UPDATE conversations SET 
                    start_date = ?, 
                    end_date = ?, 
                    message_count = ? 
                 WHERE id = ?`,
                [stats.start, stats.end, stats.count, row.conversation_id]
            );
        });

        // Recalculate total unique messages and conversations count in the threadline
        const totalUniqueMessages = db.queryOne(
            `SELECT COUNT(id) AS count FROM messages WHERE threadline_id = ?`,
            [threadlineId]
        ).count || 0;

        const totalUniqueConversations = db.queryOne(
            `SELECT COUNT(id) AS count FROM conversations WHERE threadline_id = ?`,
            [threadlineId]
        ).count || 0;

        db.run(
            `UPDATE threadlines SET 
                message_count = ?, 
                conversation_count = ? 
             WHERE id = ?`,
            [totalUniqueMessages, totalUniqueConversations, threadlineId]
        );

        console.log(`✓ Ingestion Completed: ${newMessagesCount} new messages, ${duplicateMessagesCount} duplicates de-duplicated.`);
    });

    console.log("✓ Ingestion Transaction completed.");
    console.log("==========================================");
    console.log("");

    return {
        importId,
        threadlineId,
        stats: {
            discovered: newMessagesCount + duplicateMessagesCount,
            imported: newMessagesCount,
            skipped: duplicateMessagesCount,
            failed: 0
        }
    };
}

/**
 * Creates and persists a new Threadline archive inside a single transaction.
 * 
 * @param {string} uid - User identifier (for compatibility)
 * @param {object} archive - The parsed and normalized communication archive
 * @returns {Promise<string>} The generated threadline ID
 */
async function createThreadline(uid, archive) {
    // Wrapper around ingestArchive to preserve backward compatibility for old test scenarios
    const result = await ingestArchive(uid, archive, archive.source, 0);
    return result.threadlineId;
}

/**
 * Returns a list of all threadlines.
 * 
 * @param {string} uid - User identifier (for compatibility)
 * @returns {Promise<Array>} A list of threadline metadata objects
 */
async function getThreadlines(uid) {
    try {
        const rows = db.query(
            `SELECT id, name, source, platform, created_at, updated_at, message_count, conversation_count
             FROM threadlines
             WHERE owner_id = ?
             ORDER BY updated_at DESC`,
            [uid]
        );
        // Map to standard layout expected by frontend (e.g. using firestoreId for UI code compatibility)
        return rows.map(row => ({
            firestoreId: row.id,
            id: row.id,
            title: row.name,
            source: row.source,
            platform: row.platform,
            created: row.created_at,
            updated: row.updated_at,
            messageCount: row.message_count,
            conversationCount: row.conversation_count
        }));
    } catch (error) {
        console.error("Error fetching threadlines from SQLite:", error);
        throw error;
    }
}

/**
 * Fetches a single threadline's metadata.
 * 
 * @param {string} uid - User identifier
 * @param {string} id - The threadline ID
 * @returns {Promise<object|null>} The threadline metadata or null if not found
 */
async function getThreadline(uid, id) {
    try {
        const row = db.queryOne(
            `SELECT id, name, source, platform, created_at, updated_at, message_count, conversation_count
             FROM threadlines
             WHERE id = ? AND owner_id = ?`,
            [id, uid]
        );
        if (!row) {
            return null;
        }
        return {
            firestoreId: row.id,
            id: row.id,
            title: row.name,
            source: row.source,
            platform: row.platform,
            created: row.created_at,
            updated: row.updated_at,
            messageCount: row.message_count,
            conversationCount: row.conversation_count
        };
    } catch (error) {
        console.error(`Error fetching threadline ${id} from SQLite:`, error);
        throw error;
    }
}

/**
 * Deletes a threadline. SQLite cascading deletes will remove all conversations,
 * messages, participants, and timeline events automatically.
 * 
 * @param {string} uid - User identifier
 * @param {string} id - The threadline ID
 * @returns {Promise<void>}
 */
async function deleteThreadline(uid, id) {
    try {
        // Enforce ownership check before deleting
        const existing = db.queryOne("SELECT id FROM threadlines WHERE id = ? AND owner_id = ?", [id, uid]);
        if (!existing) {
            throw new Error("Threadline not found or you are not the owner.");
        }
        db.run(`DELETE FROM threadlines WHERE id = ? AND owner_id = ?`, [id, uid]);
        console.log(`✓ Deleted threadline ${id} and all cascaded child records.`);
    } catch (error) {
        console.error(`Error deleting threadline ${id}:`, error);
        throw error;
    }
}

// =====================================
// Exports
// =====================================

module.exports = {
    createThreadline,
    getThreadlines,
    getThreadline,
    deleteThreadline,
    ingestArchive
};