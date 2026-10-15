/*
    chunkGenerator.js

    Deterministic, idempotent Conversation Chunk Generator and Indexer for Threadline.
    Builds multi-turn dialogue exchange chunks across communication histories.

    Key Requirements:
    1. Zero-Disruption & Idempotence: Original messages and conversations are untouched.
    2. Overlapping Context Heuristics: Uses dynamic inactivity windows (60-120 mins)
       with sliding overlap so delayed replies and sequential thoughts are preserved.
    3. Structural Signals: Computes turn alternation, question/request presence, and
       direct objection/negation indicators.
    4. Synchronized FTS5: Indexes chunk_text into chunks_fts for fast candidate retrieval.
*/

const crypto = require("crypto");

class ChunkGenerator {
    constructor(db) {
        this.db = db;
        
        // RegEx patterns for early structural indicators (0-token local parsing)
        this.requestPattern = /\b(can\s+(?:i|we|you)|could\s+(?:i|we|you)|would\s+you|please|is\s+it\s+ok|may\s+i|let\s+me|pick\s+up|dropping\s+off|take\s+(?:the\s+)?kids|see\s+(?:the\s+)?kids|visitation|parenting\s+time|schedule|tomorrow|tonight|weekend|agree)\b|\?/i;
        this.objectionPattern = /\b(no|nope|not\s+happening|can't|cant|won't|wont|not\s+allowed|refuse|refusing|refused|denied|deny|denying|never|talk\s+to\s+my\s+lawyer|court|attorney|not\s+my\s+problem|forget\s+it)\b/i;
    }

    /**
     * Generate chunks for a specific conversation or threadline.
     * 
     * @param {Object} options - { conversationId, threadlineId, forceRebuild }
     * @returns {Object} { generatedCount, messageCount }
     */
    indexConversation(conversationId, options = {}) {
        const forceRebuild = options.forceRebuild || false;

        // Fetch conversation details
        const conv = this.db.queryOne("SELECT id, threadline_id, title FROM conversations WHERE id = ?", [conversationId]);
        if (!conv) return { generatedCount: 0, messageCount: 0 };

        // Fetch all messages in strict chronological order
        const messages = this.db.query(
            "SELECT id, conversation_id, threadline_id, sender, recipient, timestamp, body, direction FROM messages WHERE conversation_id = ? ORDER BY timestamp ASC",
            [conversationId]
        );

        if (!messages || messages.length === 0) return { generatedCount: 0, messageCount: 0 };

        if (forceRebuild) {
            // Delete existing chunks for this conversation
            const existingChunks = this.db.query("SELECT id FROM conversation_chunks WHERE conversation_id = ?", [conversationId]);
            const chunkIds = existingChunks.map(c => c.id);
            if (chunkIds.length > 0) {
                const placeholders = chunkIds.map(() => "?").join(",");
                this.db.run(`DELETE FROM chunks_fts WHERE chunk_id IN (${placeholders})`, chunkIds);
                this.db.run(`DELETE FROM conversation_chunks WHERE conversation_id = ?`, [conversationId]);
            }
        }

        const chunks = this.buildChunksFromMessages(messages, conv);

        // Batch insert chunks in a transaction
        const insertChunkStmt = this.db.prepare(`
            INSERT OR REPLACE INTO conversation_chunks (
                id, conversation_id, threadline_id, start_timestamp, end_timestamp,
                message_count, participant_ids, message_ids, chunk_text,
                has_turn_alternation, has_request, has_response, metadata
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `);

        const insertFtsStmt = this.db.prepare(`
            INSERT INTO chunks_fts (chunk_id, threadline_id, chunk_text)
            VALUES (?, ?, ?)
        `);

        const deleteExistingFtsStmt = this.db.prepare(`
            DELETE FROM chunks_fts WHERE chunk_id = ?
        `);

        this.db.transaction(() => {
            for (const chunk of chunks) {
                insertChunkStmt.run(
                    chunk.id,
                    chunk.conversation_id,
                    chunk.threadline_id,
                    chunk.start_timestamp,
                    chunk.end_timestamp,
                    chunk.message_count,
                    JSON.stringify(chunk.participant_ids),
                    JSON.stringify(chunk.message_ids),
                    chunk.chunk_text,
                    chunk.has_turn_alternation ? 1 : 0,
                    chunk.has_request ? 1 : 0,
                    chunk.has_response ? 1 : 0,
                    JSON.stringify(chunk.metadata || {})
                );

                // Ensure FTS is synced
                deleteExistingFtsStmt.run(chunk.id);
                insertFtsStmt.run(chunk.id, chunk.threadline_id, chunk.chunk_text);
            }
        });

        return {
            generatedCount: chunks.length,
            messageCount: messages.length
        };
    }

    /**
     * Slice an array of chronological messages into coherent conversation exchange chunks.
     */
    buildChunksFromMessages(messages, conv) {
        if (!messages || messages.length === 0) return [];

        const chunks = [];
        const INACTIVITY_GAP_MS = 90 * 60 * 1000; // 90 minutes inactivity threshold
        const MAX_CHUNK_MESSAGES = 15;
        const CHUNK_OVERLAP = 3;

        let currentBatch = [];

        for (let i = 0; i < messages.length; i++) {
            const currentMsg = messages[i];
            const prevMsg = currentBatch.length > 0 ? currentBatch[currentBatch.length - 1] : null;

            const timeGap = prevMsg ? (currentMsg.timestamp - prevMsg.timestamp) : 0;
            const reachedMax = currentBatch.length >= MAX_CHUNK_MESSAGES;
            const reachedGap = prevMsg && (timeGap > INACTIVITY_GAP_MS);

            if (reachedGap || reachedMax) {
                // Finalize current batch into a chunk
                if (currentBatch.length >= 1) {
                    chunks.push(this.formatChunk(currentBatch, conv));
                }

                if (reachedGap) {
                    // Start fresh batch across the major gap
                    currentBatch = [currentMsg];
                } else if (reachedMax) {
                    // Slide with overlap so context is never severed mid-thought
                    const overlapMessages = currentBatch.slice(-CHUNK_OVERLAP);
                    currentBatch = [...overlapMessages, currentMsg];
                }
            } else {
                currentBatch.push(currentMsg);
            }
        }

        // Add final batch
        if (currentBatch.length >= 1) {
            chunks.push(this.formatChunk(currentBatch, conv));
        }

        return chunks;
    }

    /**
     * Formats a slice of messages into a structured chunk record with deterministic ID.
     */
    formatChunk(msgSlice, conv) {
        const firstMsg = msgSlice[0];
        const lastMsg = msgSlice[msgSlice.length - 1];

        const participantSet = new Set();
        let hasRequest = false;
        let hasResponse = false;
        const textLines = [];
        const messageIds = [];

        msgSlice.forEach(m => {
            messageIds.push(m.id);
            const senderName = m.sender || (m.direction === "sent" ? "Me" : "Other");
            participantSet.add(senderName);

            const body = (m.body || "").trim();
            if (this.requestPattern.test(body)) hasRequest = true;
            if (this.objectionPattern.test(body)) hasResponse = true;

            textLines.push(`[${senderName}]: ${body}`);
        });

        const participantIds = Array.from(participantSet);
        const hasTurnAlternation = participantIds.length > 1;

        // Deterministic Chunk ID: hash of conversation ID + first msg ID + last msg ID
        const hash = crypto.createHash("sha1")
            .update(`${conv.id}_${firstMsg.id}_${lastMsg.id}_${msgSlice.length}`)
            .digest("hex")
            .substring(0, 16);
        const chunkId = `chk_${hash}`;

        return {
            id: chunkId,
            conversation_id: conv.id,
            threadline_id: conv.threadline_id,
            start_timestamp: firstMsg.timestamp,
            end_timestamp: lastMsg.timestamp,
            message_count: msgSlice.length,
            participant_ids: participantIds,
            message_ids: messageIds,
            chunk_text: textLines.join("\n"),
            has_turn_alternation: hasTurnAlternation,
            has_request: hasRequest,
            has_response: hasResponse,
            metadata: {
                conversationTitle: conv.title || "Direct Message"
            }
        };
    }

    /**
     * Index all conversations in the entire database idempotently.
     */
    indexAll(options = {}) {
        const conversations = this.db.query("SELECT id, threadline_id, title FROM conversations");
        let totalChunks = 0;
        let totalMessages = 0;

        for (const conv of conversations) {
            const res = this.indexConversation(conv.id, options);
            totalChunks += res.generatedCount;
            totalMessages += res.messageCount;
        }

        return {
            conversationsProcessed: conversations.length,
            totalChunks,
            totalMessages
        };
    }
}

module.exports = ChunkGenerator;
