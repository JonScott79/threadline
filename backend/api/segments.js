/*======================================================
                     SAVED SEGMENTS API
======================================================*/

const express = require("express");
const crypto = require("crypto");
const db = require("../database/database");

const router = express.Router();

// 1. Create a Saved Segment from selected message IDs
router.post("/saved-segments", async (request, response) => {
    try {
        const { conversationId, title, description, messageIds } = request.body;

        if (!conversationId) {
            return response.status(400).json({ status: "error", message: "conversationId is required." });
        }
        if (!title || !title.trim()) {
            return response.status(400).json({ status: "error", message: "Segment title is required." });
        }
        if (!messageIds || !Array.isArray(messageIds) || messageIds.length === 0) {
            return response.status(400).json({ status: "error", message: "At least one messageId must be selected." });
        }

        // Verify the conversation belongs to the user
        const checkConv = db.queryOne(
            `SELECT c.id FROM conversations c 
             JOIN threadlines t ON c.threadline_id = t.id 
             WHERE c.id = ? AND t.owner_id = ?`,
            [conversationId, request.uid]
        );
        if (!checkConv) {
            return response.status(403).json({ status: "error", message: "Conversation not found or access denied." });
        }

        // Calculate segment date boundaries from selected messages
        const placeholders = messageIds.map(() => "?").join(",");
        const timeBounds = db.queryOne(
            `SELECT MIN(timestamp) AS minTime, MAX(timestamp) AS maxTime 
             FROM messages 
             WHERE id IN (${placeholders})`,
            messageIds
        );

        const startTime = timeBounds.minTime || Date.now();
        const endTime = timeBounds.maxTime || Date.now();
        const segmentId = crypto.randomUUID();
        const now = new Date().toISOString();

        db.transaction(() => {
            // Insert saved segment metadata
            db.run(
                `INSERT INTO saved_segments (id, owner_id, conversation_id, title, description, start_time, end_time, created_at)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [segmentId, request.uid, conversationId, title.trim(), description || "", startTime, endTime, now]
            );

            // Link messages to the segment
            messageIds.forEach(msgId => {
                db.run(
                    `INSERT INTO saved_segment_messages (saved_segment_id, message_id)
                     VALUES (?, ?)`,
                    [segmentId, msgId]
                );
            });
        })();

        response.json({
            status: "success",
            segmentId,
            message: "Segment saved successfully."
        });
    } catch (error) {
        response.status(500).json({ status: "error", message: error.message });
    }
});

// 2. Retrieve all saved segments for the authenticated user
router.get("/saved-segments", async (request, response) => {
    try {
        const sql = `
            SELECT s.id, s.conversation_id AS conversationId, c.title AS conversationTitle, 
                   s.title, s.description, s.start_time AS startTime, s.end_time AS endTime, 
                   s.created_at AS createdAt, COUNT(ssm.message_id) AS messageCount
            FROM saved_segments s
            JOIN conversations c ON s.conversation_id = c.id
            LEFT JOIN saved_segment_messages ssm ON s.id = ssm.saved_segment_id
            WHERE s.owner_id = ?
            GROUP BY s.id
            ORDER BY s.created_at DESC;
        `;
        const rows = db.query(sql, [request.uid]);
        response.json({ status: "success", segments: rows });
    } catch (error) {
        response.status(500).json({ status: "error", message: error.message });
    }
});

// 3. Retrieve all segments linked to a specific Threadline workspace
router.get("/threadlines/:id/segments", async (request, response) => {
    try {
        const { id } = request.params;
        // Verify ownership
        const checkOwner = db.queryOne("SELECT id FROM threadlines WHERE id = ? AND owner_id = ?", [id, request.uid]);
        if (!checkOwner) {
            return response.status(403).json({ status: "error", message: "Access denied." });
        }
        
        const sql = `
            SELECT s.id, s.conversation_id AS conversationId, c.title AS conversationTitle, 
                   s.title, s.description, s.start_time AS startTime, s.end_time AS endTime, 
                   s.created_at AS createdAt, COUNT(ssm.message_id) AS messageCount
            FROM saved_segments s
            JOIN conversations c ON s.conversation_id = c.id
            JOIN threadline_segments ts ON s.id = ts.saved_segment_id
            LEFT JOIN saved_segment_messages ssm ON s.id = ssm.saved_segment_id
            WHERE ts.threadline_id = ?
            GROUP BY s.id
            ORDER BY s.created_at DESC;
        `;
        const rows = db.query(sql, [id]);
        response.json({ status: "success", segments: rows });
    } catch (error) {
        response.status(500).json({ status: "error", message: error.message });
    }
});

// 4. Link a saved segment to a curated Threadline workspace
router.post("/threadlines/:id/segments", async (request, response) => {
    try {
        const { id } = request.params; // Threadline ID
        const { segmentId } = request.body;

        if (!segmentId) {
            return response.status(400).json({ status: "error", message: "segmentId is required." });
        }

        // Verify threadline ownership
        const checkOwner = db.queryOne(
            `SELECT id FROM threadlines WHERE id = ? AND owner_id = ?`,
            [id, request.uid]
        );
        if (!checkOwner) {
            return response.status(403).json({ status: "error", message: "Threadline workspace not found or access denied." });
        }

        // Verify saved segment ownership
        const checkSeg = db.queryOne(
            `SELECT id FROM saved_segments WHERE id = ? AND owner_id = ?`,
            [segmentId, request.uid]
        );
        if (!checkSeg) {
            return response.status(403).json({ status: "error", message: "Saved segment not found or access denied." });
        }

        // Map segment to Threadline
        db.run(
            `INSERT OR IGNORE INTO threadline_segments (threadline_id, saved_segment_id)
             VALUES (?, ?)`,
            [id, segmentId]
        );

        // Update updated_at of the threadline
        db.run(
            `UPDATE threadlines SET updated_at = ? WHERE id = ?`,
            [new Date().toISOString(), id]
        );

        response.json({ status: "success", message: "Segment added to workspace successfully." });
    } catch (error) {
        response.status(500).json({ status: "error", message: error.message });
    }
});

// 4. Remove a linked segment from a curated Threadline workspace
router.delete("/threadlines/:id/segments/:segmentId", async (request, response) => {
    try {
        const { id, segmentId } = request.params;

        // Verify threadline ownership
        const checkOwner = db.queryOne(
            `SELECT id FROM threadlines WHERE id = ? AND owner_id = ?`,
            [id, request.uid]
        );
        if (!checkOwner) {
            return response.status(403).json({ status: "error", message: "Access denied." });
        }

        db.run(
            `DELETE FROM threadline_segments WHERE threadline_id = ? AND saved_segment_id = ?`,
            [id, segmentId]
        );

        response.json({ status: "success", message: "Segment removed from workspace." });
    } catch (error) {
        response.status(500).json({ status: "error", message: error.message });
    }
});

module.exports = router;
