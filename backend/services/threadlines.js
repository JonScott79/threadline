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

async function ingestArchive(uid, archiveInput, filename, file_size, targetThreadlineId = null, sha256 = null) {
    const archive = (archiveInput && typeof archiveInput.then === "function") ? await archiveInput : archiveInput;
    console.log("");
    console.log("==========================================");
    console.log("SQLITE: INGEST ARCHIVE");
    console.log("==========================================");
    console.log("User UID:", uid);
    console.log("File:", filename);

    const now = new Date().toISOString();
    const threadlineId = targetThreadlineId || crypto.randomUUID();
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

        // 2. Insert imports history record with cryptographic SHA-256 and discovery accounting
        const discoveredInitial = archive.stats?.discovered || archive.messageCount || 0;
        const skippedInitial = archive.stats?.skipped || 0;
        const provenanceMeta = {
            detectedSource: archive.source,
            detectedPlatform: archive.platform,
            confidence: archive.confidence,
            ingestionEngine: "Threadline Local Core v1.0",
            rawFileSize: file_size || 0,
            verifiedAt: now
        };
        const computedSha256 = sha256 || crypto.createHash("sha256").update((filename || "archive") + "_" + now).digest("hex");

        try {
            db.run(
                `INSERT INTO imports (id, owner_id, filename, source, platform, file_size, message_count, participant_count, thread_count, earliest_timestamp, latest_timestamp, imported_at, status, errors, sha256, discovered_count, skipped_count, provenance_metadata)
                 VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, NULL, NULL, ?, 'completed', ?, ?, ?, ?, ?)`,
                [
                    importId,
                    uid,
                    filename || "Unknown File",
                    archive.source || "SMS Backup & Restore",
                    archive.platform || "SMS",
                    file_size || 0,
                    now,
                    JSON.stringify(archive.errors || []),
                    computedSha256,
                    discoveredInitial,
                    skippedInitial,
                    JSON.stringify(provenanceMeta)
                ]
            );
        } catch (insertErr) {
            if (insertErr.message && insertErr.message.includes("has no column named")) {
                console.warn("⚠️ imports table missing provenance columns, executing auto-migration and fallback:", insertErr.message);
                try {
                    db.run("ALTER TABLE imports ADD COLUMN sha256 TEXT;");
                    db.run("ALTER TABLE imports ADD COLUMN discovered_count INTEGER DEFAULT 0;");
                    db.run("ALTER TABLE imports ADD COLUMN skipped_count INTEGER DEFAULT 0;");
                    db.run("ALTER TABLE imports ADD COLUMN provenance_metadata TEXT;");
                    // Retry with new columns
                    db.run(
                        `INSERT INTO imports (id, owner_id, filename, source, platform, file_size, message_count, participant_count, thread_count, earliest_timestamp, latest_timestamp, imported_at, status, errors, sha256, discovered_count, skipped_count, provenance_metadata)
                         VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, NULL, NULL, ?, 'completed', ?, ?, ?, ?, ?)`,
                        [
                            importId,
                            uid,
                            filename || "Unknown File",
                            archive.source || "SMS Backup & Restore",
                            archive.platform || "SMS",
                            file_size || 0,
                            now,
                            JSON.stringify(archive.errors || []),
                            computedSha256,
                            discoveredInitial,
                            skippedInitial,
                            JSON.stringify(provenanceMeta)
                        ]
                    );
                } catch (_migrationErr) {
                    // Fall back to legacy insert
                    db.run(
                        `INSERT INTO imports (id, owner_id, filename, source, platform, file_size, message_count, participant_count, thread_count, earliest_timestamp, latest_timestamp, imported_at, status, errors)
                         VALUES (?, ?, ?, ?, ?, ?, 0, 0, 0, NULL, NULL, ?, 'completed', ?)`,
                        [
                            importId,
                            uid,
                            filename || "Unknown File",
                            archive.source || "SMS Backup & Restore",
                            archive.platform || "SMS",
                            file_size || 0,
                            now,
                            JSON.stringify(archive.errors || [])
                        ]
                    );
                }
            } else {
                throw insertErr;
            }
        }

        // Create or get participant record for the user ("Me")
        let meId;
        const existingMe = db.queryOne("SELECT id FROM participants WHERE threadline_id = ? AND (phone_number = 'Me' OR name = 'Me')", [threadlineId]);
        if (existingMe) {
            meId = existingMe.id;
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

            // Collect and resolve participants for this conversation
            const participantsToLink = new Set();
            participantsToLink.add("Me");

            if (conv.participants && Array.isArray(conv.participants)) {
                conv.participants.forEach(p => participantsToLink.add(p));
            } else {
                participantsToLink.add(convTitle);
            }

            participantsToLink.forEach(pIdentifier => {
                if (!pIdentifier) return;
                let partId;
                const existingPart = db.queryOne(
                    `SELECT id FROM participants WHERE threadline_id = ? AND (phone_number = ? OR name = ?)`,
                    [threadlineId, pIdentifier, pIdentifier]
                );

                if (existingPart) {
                    partId = existingPart.id;
                } else {
                    partId = crypto.randomUUID();
                    const displayName = pIdentifier === "Me" ? "Me" : (conv.metadata?.contact || pIdentifier);
                    db.run(
                        `INSERT INTO participants (id, threadline_id, name, phone_number, email, platform_identifiers, aliases, metadata)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            partId,
                            threadlineId,
                            displayName,
                            pIdentifier,
                            null,
                            JSON.stringify([pIdentifier]),
                            JSON.stringify([]),
                            JSON.stringify({ contact_name: conv.metadata?.contact })
                        ]
                    );
                }

                db.run(`INSERT OR IGNORE INTO conversation_participants (conversation_id, participant_id) VALUES (?, ?)`, [convId, partId]);
            });

            // Process messages within this conversation
            conv.messages.forEach(msg => {
                const msgTimestamp = Number(msg.timestamp);
                if (earliestTs === null || msgTimestamp < earliestTs) earliestTs = msgTimestamp;
                if (latestTs === null || msgTimestamp > latestTs) latestTs = msgTimestamp;

                const msgSender = msg.sender || (msg.direction === "sent" ? "Me" : convTitle);
                const msgRecipient = msg.recipient || (msg.direction === "sent" ? convTitle : "Me");

                // Check for duplicate messages (same conversation, timestamp, sender, and body)
                const existingMsg = db.queryOne(
                    `SELECT id FROM messages WHERE conversation_id = ? AND timestamp = ? AND sender = ? AND body = ?`,
                    [convId, msgTimestamp, msgSender, msg.body || ""]
                );

                if (existingMsg) {
                    duplicateMessagesCount++;
                    db.run(
                        `INSERT OR IGNORE INTO message_imports (message_id, import_id) VALUES (?, ?)`,
                        [existingMsg.id, importId]
                    );
                } else {
                    newMessagesCount++;
                    const msgId = msg.id || crypto.randomUUID();
                    const senderDisplayName = msgSender === "Me" ? "Me" : (msg.metadata?.contact || msgSender);

                    db.run(
                        `INSERT INTO messages (id, conversation_id, threadline_id, sender, recipient, timestamp, body, attachments, platform, direction, metadata)
                         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                        [
                            msgId,
                            convId,
                            threadlineId,
                            msgSender,
                            msgRecipient,
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
                            `Message from ${senderDisplayName}`,
                            msg.body ? (msg.body.length > 60 ? msg.body.substring(0, 60) + "..." : msg.body) : "",
                            msgSender,
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

        // Update the import metadata details with final discovery & accounting counts
        const finalDiscovered = archive.stats?.discovered || (newMessagesCount + duplicateMessagesCount);
        const finalSkipped = archive.stats?.skipped || 0;

        db.run(
            `UPDATE imports SET 
                message_count = ?, 
                participant_count = ?, 
                thread_count = ?, 
                earliest_timestamp = ?, 
                latest_timestamp = ?, 
                errors = ?,
                discovered_count = ?,
                skipped_count = ?
             WHERE id = ?`,
            [
                newMessagesCount + duplicateMessagesCount,
                partCount,
                archive.conversations.length,
                earliestTs,
                latestTs,
                JSON.stringify(archive.errors || []),
                finalDiscovered,
                finalSkipped,
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
 */
async function createThreadline(uid, archive) {
    const result = await ingestArchive(uid, archive, archive.source, 0);
    return result.threadlineId;
}

/**
 * Returns list of authorized UIDs for a user, linking local guest sessions
 * with the primary developer/user Firebase account.
 */
function getAuthorizedUids(uid) {
    if (uid === "local" || uid === "hogUXhgQVEMRu3jgEIeEAQsBhz33" || uid === "user_jonny_live_2_5gb") {
        return ["local", "hogUXhgQVEMRu3jgEIeEAQsBhz33", "user_jonny_live_2_5gb"];
    }
    return [uid];
}

/**
 * Returns a list of all threadlines.
 */
async function getThreadlines(uid) {
    try {
        const uids = getAuthorizedUids(uid);
        const placeholders = uids.map(() => "?").join(",");
        const rows = db.query(
            `SELECT id, name, source, platform, created_at, updated_at, message_count, conversation_count
             FROM threadlines
             WHERE owner_id IN (${placeholders})
             ORDER BY updated_at DESC`,
            uids
        );
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
 */
async function getThreadline(uid, id) {
    try {
        const uids = getAuthorizedUids(uid);
        const placeholders = uids.map(() => "?").join(",");
        const row = db.queryOne(
            `SELECT id, name, source, platform, created_at, updated_at, message_count, conversation_count
             FROM threadlines
             WHERE id = ? AND owner_id IN (${placeholders})`,
            [id, ...uids]
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
 */
async function deleteThreadline(uid, id) {
    try {
        const uids = getAuthorizedUids(uid);
        const placeholders = uids.map(() => "?").join(",");
        const existing = db.queryOne(`SELECT id, owner_id FROM threadlines WHERE id = ? AND owner_id IN (${placeholders})`, [id, ...uids]);
        if (!existing) {
            throw new Error("Threadline not found or you are not the owner.");
        }
        // Clean up unconstrained FTS5 virtual tables explicitly
        try {
            db.run("DELETE FROM chunks_fts WHERE threadline_id = ?", [id]);
            db.run("DELETE FROM messages_fts WHERE threadline_id = ?", [id]);
        } catch (_ftsErr) {}

        db.run(`DELETE FROM threadlines WHERE id = ? AND owner_id = ?`, [id, existing.owner_id]);
        console.log(`✓ Deleted threadline ${id} and all cascaded child records.`);
    } catch (error) {
        console.error(`Error deleting threadline ${id}:`, error);
        throw error;
    }
}

module.exports = {
    createThreadline,
    getThreadlines,
    getThreadline,
    deleteThreadline,
    ingestArchive,
    getAuthorizedUids
};
