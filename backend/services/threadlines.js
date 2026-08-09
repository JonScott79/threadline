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

/**
 * Creates and persists a new Threadline archive inside a single transaction.
 * 
 * @param {string} uid - User identifier (for compatibility)
 * @param {object} archive - The parsed and normalized communication archive
 * @returns {Promise<string>} The generated threadline ID
 */
async function createThreadline(uid, archive) {
    console.log("");
    console.log("==========================================");
    console.log("SQLITE: CREATE THREADLINE");
    console.log("==========================================");
    console.log("Source:", archive.source);
    console.log("Messages:", archive.messageCount);
    console.log("Conversations:", archive.conversationCount);

    const threadlineId = crypto.randomUUID();
    const now = new Date().toISOString();

    // Use a database transaction to insert all data atomically and with maximum speed
    db.transaction(() => {
        // 1. Insert Threadline Metadata
        db.run(
            `INSERT INTO threadlines (id, name, source, platform, created_at, updated_at, message_count, conversation_count)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
            [
                threadlineId,
                archive.source || "Imported Communication",
                archive.source || "Unknown File",
                archive.platform || "SMS",
                now,
                now,
                archive.messageCount || 0,
                archive.conversationCount || 0
            ]
        );

        console.log("✓ Threadline metadata written.");

        // We will keep track of created conversations and participants to map them properly
        const conversationMap = new Map(); // key: original_address -> id: UUID
        const participantMap = new Map();  // key: address -> id: UUID

        // Create a participant record for the user ("Me")
        const meId = crypto.randomUUID();
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

        // 2. Insert Conversations & Identify Participants
        archive.conversations.forEach(conv => {
            const convId = crypto.randomUUID();
            const originalTitle = conv.title || "Unknown Conversation";
            
            // Map the contact address/title to this UUID
            conversationMap.set(originalTitle, convId);

            // Compute message stats and boundaries for the conversation
            let startDate = null;
            let endDate = null;
            if (conv.messages && conv.messages.length > 0) {
                const timestamps = conv.messages.map(m => Number(m.timestamp)).filter(t => !isNaN(t));
                if (timestamps.length > 0) {
                    startDate = Math.min(...timestamps);
                    endDate = Math.max(...timestamps);
                }
            }

            // Insert conversation record
            db.run(
                `INSERT INTO conversations (id, threadline_id, platform, title, start_date, end_date, message_count, metadata)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    convId,
                    threadlineId,
                    conv.platform || archive.platform || "SMS",
                    originalTitle,
                    startDate,
                    endDate,
                    conv.messages ? conv.messages.length : 0,
                    JSON.stringify(conv.metadata || {})
                ]
            );

            // Check if participant exists for this conversation (e.g. the contact number)
            let partId = participantMap.get(originalTitle);
            if (!partId) {
                partId = crypto.randomUUID();
                participantMap.set(originalTitle, partId);

                // Insert participant
                db.run(
                    `INSERT INTO participants (id, threadline_id, name, phone_number, email, platform_identifiers, aliases, metadata)
                     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                    [
                        partId,
                        threadlineId,
                        conv.metadata?.contact || originalTitle,
                        originalTitle,
                        null,
                        JSON.stringify([originalTitle]),
                        JSON.stringify([]),
                        JSON.stringify({ contact_name: conv.metadata?.contact })
                    ]
                );
            }

            // Insert Many-to-Many Relationships
            db.run(
                `INSERT INTO conversation_participants (conversation_id, participant_id) VALUES (?, ?)`,
                [convId, partId]
            );
            db.run(
                `INSERT INTO conversation_participants (conversation_id, participant_id) VALUES (?, ?)`,
                [convId, meId]
            );
        });

        console.log(`✓ ${archive.conversations.length} conversations and participants written.`);

        // 3. Insert Messages & Timeline Events
        archive.messages.forEach(msg => {
            const msgId = crypto.randomUUID();
            
            // Map message to its conversation (via the contact address)
            const lookupKey = msg.sender;
            const convId = conversationMap.get(lookupKey);

            if (!convId) {
                console.warn(`Warning: Message sender "${lookupKey}" has no matching conversation. Skipping message.`);
                return;
            }

            const senderName = msg.direction === "sent" ? "Me" : (msg.metadata?.contact || msg.sender);

            // Insert Message
            db.run(
                `INSERT INTO messages (id, conversation_id, threadline_id, sender, recipient, timestamp, body, attachments, platform, direction, metadata)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    msgId,
                    convId,
                    threadlineId,
                    msg.direction === "sent" ? "Me" : msg.sender,
                    msg.direction === "sent" ? msg.sender : "Me",
                    Number(msg.timestamp),
                    msg.body || "",
                    JSON.stringify(msg.attachments || []),
                    msg.platform || archive.platform || "SMS",
                    msg.direction || "received",
                    JSON.stringify(msg.metadata || {})
                ]
            );

            // Insert Timeline Event
            db.run(
                `INSERT INTO timeline_events (id, threadline_id, timestamp, type, source_id, title, description, sender, metadata)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    crypto.randomUUID(),
                    threadlineId,
                    Number(msg.timestamp),
                    "message",
                    msgId,
                    `Message from ${senderName}`,
                    msg.body ? (msg.body.length > 60 ? msg.body.substring(0, 60) + "..." : msg.body) : "",
                    msg.direction === "sent" ? "Me" : msg.sender,
                    JSON.stringify({ direction: msg.direction, contact: msg.metadata?.contact })
                ]
            );
        });

        console.log(`✓ ${archive.messages.length} messages and timeline events written.`);
    });

    console.log("✓ Transaction completed. Threadline successfully persisted.");
    console.log("==========================================");
    console.log("");

    return threadlineId;
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
             ORDER BY updated_at DESC`
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
             WHERE id = ?`,
            [id]
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
        db.run(`DELETE FROM threadlines WHERE id = ?`, [id]);
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
    deleteThreadline
};