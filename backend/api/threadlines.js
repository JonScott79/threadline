/*
    threadlines.js

    Threadlines, Conversations, and Messages API router.
    Implements all CRUD endpoints for Threadlines, and fetches related 
    Conversations and Messages from the SQLite database.

    Responsibilities:
    - List available threadlines.
    - Fetch individual threadline metadata.
    - Delete threadlines.
    - List conversations within a threadline.
    - Fetch messages for a specific conversation.
    - Fetch messages and events for a specific calendar day.
*/

// =====================================
// Imports
// =====================================

const express = require("express");
const db = require("../database/database");
const threadlineService = require("../services/threadlines");

// =====================================
// Variables
// =====================================

const router = express.Router();

// =====================================
// Routes
// =====================================

/**
 * GET /api/threadlines
 * Lists all threadlines.
 */
router.get("/", async (request, response) => {
    try {
        const list = await threadlineService.getThreadlines(request.uid);
        response.json({
            status: "success",
            threadlines: list
        });
    } catch (error) {
        response.status(500).json({ status: "error", message: error.message });
    }
});

/**
 * POST /api/threadlines
 * Creates a new manual threadline.
 */
router.post("/", async (request, response) => {
    try {
        const { title, person, description } = request.body;
        let finalTitle = title ? title.trim() : "";

        if (!finalTitle) {
            // Find next sequential default name in SQLite (scoped to owner)
            const existing = db.query(
                `SELECT name FROM threadlines WHERE name LIKE 'Threadline %' AND owner_id = ? ORDER BY name ASC`,
                [request.uid]
            );
            
            let nextNum = 1;
            if (existing && existing.length > 0) {
                const numbers = existing.map(row => {
                    const match = row.name.match(/^Threadline (\d+)$/);
                    return match ? parseInt(match[1], 10) : 0;
                }).filter(n => n > 0);
                
                while (numbers.includes(nextNum)) {
                    nextNum++;
                }
            }
            finalTitle = `Threadline ${String(nextNum).padStart(3, '0')}`;
        }
        
        const threadlineId = require("crypto").randomUUID();
        const now = new Date().toISOString();
        
        db.run(
            `INSERT INTO threadlines (id, owner_id, name, source, platform, created_at, updated_at, message_count, conversation_count)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
            [threadlineId, request.uid, finalTitle, "Manual Creation", "Custom", now, now, 0, 0]
        );
        
        response.json({
            status: "success",
            threadline: {
                firestoreId: threadlineId,
                id: threadlineId,
                title: finalTitle,
                source: "Manual Creation",
                platform: "Custom",
                created: now,
                updated: now,
                messageCount: 0,
                conversationCount: 0
            }
        });
    } catch (error) {
        response.status(500).json({ status: "error", message: error.message });
    }
});

/**
 * GET /api/threadlines/:id
 * Gets individual threadline metadata.
 */
router.get("/:id", async (request, response) => {
    try {
        const id = request.params.id;
        const threadline = await threadlineService.getThreadline(request.uid, id);
        if (!threadline) {
            return response.status(404).json({ status: "error", message: "Threadline not found or access denied." });
        }
        response.json({
            status: "success",
            threadline
        });
    } catch (error) {
        response.status(500).json({ status: "error", message: error.message });
    }
});

/**
 * PUT /api/threadlines/:id
 * Renames a threadline.
 */
router.put("/:id", async (request, response) => {
    try {
        const id = request.params.id;
        const { title } = request.body;
        if (!title || !title.trim()) {
            return response.status(400).json({ status: "error", message: "Name cannot be empty." });
        }

        // Verify ownership
        const existing = db.queryOne("SELECT owner_id FROM threadlines WHERE id = ?", [id]);
        if (!existing || existing.owner_id !== request.uid) {
            return response.status(403).json({ status: "error", message: "Access denied." });
        }
        
        db.run(
            `UPDATE threadlines SET name = ?, updated_at = ? WHERE id = ?`,
            [title.trim(), new Date().toISOString(), id]
        );
        
        response.json({
            status: "success",
            message: "Threadline renamed successfully."
        });
    } catch (error) {
        response.status(500).json({ status: "error", message: error.message });
    }
});

/**
 * DELETE /api/threadlines/:id
 * Deletes a threadline (cascades database deletes).
 */
router.delete("/:id", async (request, response) => {
    try {
        const id = request.params.id;
        await threadlineService.deleteThreadline(request.uid, id);
        response.json({
            status: "success",
            message: "Threadline deleted successfully."
        });
    } catch (error) {
        response.status(500).json({ status: "error", message: error.message });
    }
});

/**
 * GET /api/threadlines/:id/conversations
 * Lists all conversations inside a threadline, sorted by message count or date.
 */
router.get("/:id/conversations", (request, response) => {
    try {
        const idParam = request.params.id;
        let threadlineIds = [];
        if (idParam === "compare" || idParam === "multi") {
            const idsStr = request.query.ids || "";
            threadlineIds = idsStr.split(",").filter(Boolean);
        } else {
            threadlineIds = [idParam];
        }

        if (threadlineIds.length === 0) {
            return response.status(400).json({
                status: "error",
                message: "No threadline IDs specified."
            });
        }

        // Verify ownership for all requested threadlines
        for (const id of threadlineIds) {
            const row = db.queryOne("SELECT owner_id FROM threadlines WHERE id = ?", [id]);
            if (!row || row.owner_id !== request.uid) {
                return response.status(403).json({ status: "error", message: "Access denied." });
            }
        }

        const start = request.query.start ? Number(request.query.start) : null;
        const end = request.query.end ? Number(request.query.end) : null;
        
        let sql = "";
        const placeholders = threadlineIds.map(() => "?").join(",");
        const params = [...threadlineIds];
        
        if (start || end) {
            let filterSql = "";
            if (start) {
                filterSql += " AND m.timestamp >= ? ";
                params.push(start);
            }
            if (end) {
                filterSql += " AND m.timestamp <= ? ";
                params.push(end);
            }
            
            sql = `
                SELECT c.id, c.platform, c.title, 
                       MIN(m.timestamp) AS startDate, 
                       MAX(m.timestamp) AS endDate, 
                       COUNT(m.id) AS messageCount, 
                       c.metadata
                FROM conversations c
                JOIN messages m ON c.id = m.conversation_id
                WHERE c.threadline_id IN (${placeholders}) ${filterSql}
                GROUP BY c.id
                ORDER BY messageCount DESC;
            `;
        } else {
            sql = `
                SELECT c.id, c.platform, c.title, c.start_date AS startDate, c.end_date AS endDate, c.message_count AS messageCount, c.metadata
                FROM conversations c
                WHERE c.threadline_id IN (${placeholders})
                ORDER BY c.message_count DESC;
            `;
        }
        
        const conversations = db.query(sql, params);

        // For each conversation, fetch its participants
        const conversationsWithParticipants = conversations.map(c => {
            const participantsSql = `
                SELECT p.id, p.name, p.phone_number AS phoneNumber, p.email
                FROM participants p
                JOIN conversation_participants cp ON p.id = cp.participant_id
                WHERE cp.conversation_id = ?;
            `;
            const participants = db.query(participantsSql, [c.id]);
            
            return {
                ...c,
                metadata: JSON.parse(c.metadata || "{}"),
                participants
            };
        });

        response.json({
            status: "success",
            conversations: conversationsWithParticipants
        });
    } catch (error) {
        response.status(500).json({ status: "error", message: error.message });
    }
});

/**
 * GET /api/threadlines/:id/conversations/:convId/messages
 * Returns all messages within a conversation, sorted chronologically.
 */
router.get("/:id/conversations/:convId/messages", (request, response) => {
    try {
        const convId = request.params.convId;
        const id = request.params.id;
        const start = request.query.start ? Number(request.query.start) : null;
        const end = request.query.end ? Number(request.query.end) : null;

        // Verify that user owns the threadline and the conversation belongs to it
        const checkOwner = db.queryOne(
            `SELECT c.id FROM conversations c 
             JOIN threadlines t ON c.threadline_id = t.id 
             WHERE t.id = ? AND t.owner_id = ? AND c.id = ?`,
            [id, request.uid, convId]
        );
        if (!checkOwner) {
            return response.status(403).json({ status: "error", message: "Access denied." });
        }
        
        let sql = `
            SELECT id, sender, recipient, timestamp, body, attachments, platform, direction, metadata
            FROM messages
            WHERE conversation_id = ?
        `;
        const params = [convId];
        
        if (start) {
            sql += " AND timestamp >= ? ";
            params.push(start);
        }
        if (end) {
            sql += " AND timestamp <= ? ";
            params.push(end);
        }
        
        sql += " ORDER BY timestamp ASC; ";
        
        const messages = db.query(sql, params);

        const formatted = messages.map(m => ({
            ...m,
            attachments: JSON.parse(m.attachments || "[]"),
            metadata: JSON.parse(m.metadata || "{}")
        }));

        response.json({
            status: "success",
            messages: formatted
        });
    } catch (error) {
        response.status(500).json({ status: "error", message: error.message });
    }
});

/**
 * GET /api/threadlines/:id/days/:dateString
 * Returns all messages/events occurring on a specific day (dateString format: YYYY-MM-DD).
 */
router.get("/:id/days/:dateString", (request, response) => {
    try {
        const idParam = request.params.id;
        let threadlineIds = [];
        if (idParam === "compare" || idParam === "multi") {
            const idsStr = request.query.ids || "";
            threadlineIds = idsStr.split(",").filter(Boolean);
        } else {
            threadlineIds = [idParam];
        }

        if (threadlineIds.length === 0) {
            return response.status(400).json({
                status: "error",
                message: "No threadline IDs specified."
            });
        }

        // Verify ownership for all requested threadline IDs
        for (const id of threadlineIds) {
            const row = db.queryOne("SELECT owner_id FROM threadlines WHERE id = ?", [id]);
            if (!row || row.owner_id !== request.uid) {
                return response.status(403).json({ status: "error", message: "Access denied." });
            }
        }

        const dateString = request.params.dateString; // e.g. "2026-07-13"
        const conversationsParam = request.query.conversations;
        
        let convIds = [];
        if (conversationsParam) {
            convIds = conversationsParam.split(",").filter(Boolean);
        }

        let filterSql = "";
        const placeholders = threadlineIds.map(() => "?").join(",");
        const params = [...threadlineIds, dateString];
        let hasJoin = false;
        
        if (convIds.length > 0) {
            filterSql += ` AND m.conversation_id IN (${convIds.map(() => '?').join(',')}) `;
            params.push(...convIds);
            hasJoin = true;
        }

        // Query timeline events matching the UTC day
        const fromClause = hasJoin
            ? "FROM timeline_events t LEFT JOIN messages m ON t.source_id = m.id"
            : "FROM timeline_events t";

        const sql = `
            SELECT t.id, t.timestamp, t.type, t.source_id AS sourceId, t.title, t.description, t.sender, t.metadata
            ${fromClause}
            WHERE t.threadline_id IN (${placeholders}) AND strftime('%Y-%m-%d', datetime(t.timestamp / 1000, 'unixepoch')) = ? ${filterSql}
            ORDER BY t.timestamp ASC;
        `;
        
        const events = db.query(sql, params);
        
        const formatted = events.map(e => ({
            ...e,
            metadata: JSON.parse(e.metadata || "{}")
        }));

        response.json({
            status: "success",
            date: dateString,
            events: formatted
        });
    } catch (error) {
        response.status(500).json({ status: "error", message: error.message });
    }
});

// =====================================
// Exports
// =====================================

module.exports = router;
