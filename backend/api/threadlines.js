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

const fs = require("fs");
const path = require("path");
const multer = require("multer");
const caseManager = require("../services/caseManager");

const caseUploadDir = path.resolve(__dirname, "../uploads");
if (!fs.existsSync(caseUploadDir)) fs.mkdirSync(caseUploadDir, { recursive: true });

const caseUpload = multer({
    dest: caseUploadDir,
    limits: { fileSize: 500 * 1024 * 1024 }
});


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
 * GET /api/threadlines/:id/participants
 * Lists all participants involved in a workspace or archive.
 */
router.get("/:id/participants", (request, response) => {
    try {
        const { id } = request.params;
        // Verify ownership
        const isArchive = id === `archive_${request.uid}`;
        const row = db.queryOne("SELECT owner_id FROM threadlines WHERE id = ?", [id]);
        if (!isArchive && (!row || row.owner_id !== request.uid)) {
            return response.status(403).json({ status: "error", message: "Access denied." });
        }
        const rows = db.query(
            `SELECT id, name, phone_number AS phoneNumber, email, platform_identifiers AS platformIdentifiers, aliases, metadata
             FROM participants
             WHERE threadline_id = ?
             ORDER BY name ASC`,
            [id]
        );
        // Parse JSON fields
        const parsedRows = rows.map(r => ({
            ...r,
            platformIdentifiers: JSON.parse(r.platformIdentifiers || "[]"),
            aliases: JSON.parse(r.aliases || "[]"),
            metadata: JSON.parse(r.metadata || "{}")
        }));
        response.json({ status: "success", participants: parsedRows });
    } catch (error) {
        response.status(500).json({ status: "error", message: error.message });
    }
});

/**
 * PUT /api/threadlines/:id/participants/:participantId
 * Updates participant name, phone number, forensic role tag, aliases, and notes.
 */
router.put("/:id/participants/:participantId", (request, response) => {
    try {
        const { id, participantId } = request.params;
        const { name, phoneNumber, role, aliases, notes } = request.body;

        if (!name || !name.trim()) {
            return response.status(400).json({ status: "error", message: "Name cannot be empty." });
        }

        // Verify ownership
        const isArchive = id === `archive_${request.uid}`;
        const row = db.queryOne("SELECT owner_id FROM threadlines WHERE id = ?", [id]);
        if (!isArchive && (!row || row.owner_id !== request.uid)) {
            return response.status(403).json({ status: "error", message: "Access denied." });
        }

        const existing = db.queryOne("SELECT * FROM participants WHERE id = ? AND threadline_id = ?", [participantId, id]);
        if (!existing) {
            return response.status(404).json({ status: "error", message: "Participant not found." });
        }

        const oldName = existing.name;
        const oldPhone = existing.phone_number;
        const newName = name.trim();
        const newPhone = phoneNumber ? phoneNumber.trim() : oldPhone;

        const currentMeta = JSON.parse(existing.metadata || "{}");
        const updatedMeta = {
            ...currentMeta,
            role: role || currentMeta.role || null,
            notes: notes !== undefined ? notes : currentMeta.notes,
            taggedAt: new Date().toISOString(),
            taggedBy: request.uid
        };

        const currentAliases = JSON.parse(existing.aliases || "[]");
        const updatedAliases = Array.isArray(aliases) 
            ? aliases 
            : (aliases ? [aliases] : currentAliases);
        if (oldName && oldName !== newName && !updatedAliases.includes(oldName)) {
            updatedAliases.push(oldName);
        }

        db.run(
            `UPDATE participants 
             SET name = ?, phone_number = ?, aliases = ?, metadata = ?
             WHERE id = ? AND threadline_id = ?`,
            [
                newName,
                newPhone,
                JSON.stringify(updatedAliases),
                JSON.stringify(updatedMeta),
                participantId,
                id
            ]
        );

        // Cascade forensic tag to conversations named after the old identifier
        if (oldPhone) {
            db.run(
                `UPDATE conversations SET title = ? WHERE threadline_id = ? AND (title = ? OR title = ?)`,
                [newName, id, oldPhone, `Conversation with ${oldPhone}`]
            );
        }
        if (oldName && oldName !== newName) {
            db.run(
                `UPDATE conversations SET title = ? WHERE threadline_id = ? AND (title = ? OR title = ?)`,
                [newName, id, oldName, `Conversation with ${oldName}`]
            );
        }

        response.json({
            status: "success",
            message: "Participant tagged successfully.",
            participant: {
                id: participantId,
                name: newName,
                phoneNumber: newPhone,
                aliases: updatedAliases,
                metadata: updatedMeta
            }
        });
    } catch (error) {
        response.status(500).json({ status: "error", message: error.message });
    }
});

/**
 * POST /api/threadlines/:id/participants/tag
 * Forensic tagging: assign a name, role, and notes to a phone number or raw identifier.
 */
router.post("/:id/participants/tag", (request, response) => {
    try {
        const { id } = request.params;
        const { identifier, name, role, aliases, notes } = request.body;

        if (!identifier || !name || !name.trim()) {
            return response.status(400).json({ status: "error", message: "Identifier and Name are required." });
        }

        const isArchive = id === `archive_${request.uid}`;
        const row = db.queryOne("SELECT owner_id FROM threadlines WHERE id = ?", [id]);
        if (!isArchive && (!row || row.owner_id !== request.uid)) {
            return response.status(403).json({ status: "error", message: "Access denied." });
        }

        const cleanIdent = identifier.trim();
        const cleanName = name.trim();

        // Check if participant exists with this identifier
        let part = db.queryOne(
            `SELECT * FROM participants 
             WHERE threadline_id = ? AND (phone_number = ? OR name = ?)`,
            [id, cleanIdent, cleanIdent]
        );

        let partId;
        let updatedMeta;
        let updatedAliases;

        if (part) {
            partId = part.id;
            const currentMeta = JSON.parse(part.metadata || "{}");
            updatedMeta = {
                ...currentMeta,
                role: role || currentMeta.role || null,
                notes: notes !== undefined ? notes : currentMeta.notes,
                taggedAt: new Date().toISOString(),
                taggedBy: request.uid
            };
            const currentAliases = JSON.parse(part.aliases || "[]");
            updatedAliases = Array.isArray(aliases) ? aliases : (aliases ? [aliases] : currentAliases);
            if (cleanIdent !== cleanName && !updatedAliases.includes(cleanIdent)) {
                updatedAliases.push(cleanIdent);
            }

            db.run(
                `UPDATE participants 
                 SET name = ?, aliases = ?, metadata = ?
                 WHERE id = ? AND threadline_id = ?`,
                [cleanName, JSON.stringify(updatedAliases), JSON.stringify(updatedMeta), partId, id]
            );
        } else {
            partId = crypto.randomUUID();
            updatedMeta = {
                role: role || null,
                notes: notes || null,
                taggedAt: new Date().toISOString(),
                taggedBy: request.uid
            };
            updatedAliases = [cleanIdent];
            db.run(
                `INSERT INTO participants (id, threadline_id, name, phone_number, email, platform_identifiers, aliases, metadata)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    partId,
                    id,
                    cleanName,
                    cleanIdent,
                    null,
                    JSON.stringify([cleanIdent]),
                    JSON.stringify(updatedAliases),
                    JSON.stringify(updatedMeta)
                ]
            );
        }

        // Cascade name to conversations titled with this phone number or identifier
        db.run(
            `UPDATE conversations SET title = ? WHERE threadline_id = ? AND (title = ? OR title = ?)`,
            [cleanName, id, cleanIdent, `Conversation with ${cleanIdent}`]
        );

        response.json({
            status: "success",
            message: "Phone number / participant successfully tagged.",
            participant: {
                id: partId,
                name: cleanName,
                phoneNumber: cleanIdent,
                aliases: updatedAliases,
                metadata: updatedMeta
            }
        });
    } catch (error) {
        response.status(500).json({ status: "error", message: error.message });
    }
});

/**
 * PUT /api/threadlines/:id/conversations/:convId
 * Renames a conversation thread.
 */
router.put("/:id/conversations/:convId", (request, response) => {
    try {
        const { id, convId } = request.params;
        const { title } = request.body;

        if (!title || !title.trim()) {
            return response.status(400).json({ status: "error", message: "Conversation title cannot be empty." });
        }

        const isArchive = id === `archive_${request.uid}`;
        const row = db.queryOne("SELECT owner_id FROM threadlines WHERE id = ?", [id]);
        if (!isArchive && (!row || row.owner_id !== request.uid)) {
            return response.status(403).json({ status: "error", message: "Access denied." });
        }

        db.run(
            `UPDATE conversations SET title = ? WHERE id = ? AND threadline_id = ?`,
            [title.trim(), convId, id]
        );

        response.json({
            status: "success",
            message: "Conversation renamed successfully."
        });
    } catch (error) {
        response.status(500).json({ status: "error", message: error.message });
    }
});

// Helper to constrain queries by threadline
function buildMessageConstraint(threadlineIds, paramsArray) {
    const clauses = [];
    threadlineIds.forEach(id => {
        clauses.push(" m.threadline_id = ? ");
        paramsArray.push(id);
    });
    return ` ( ${clauses.join(" OR ")} ) `;
}

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
            const isArchive = id === `archive_${request.uid}`;
            const row = db.queryOne("SELECT owner_id FROM threadlines WHERE id = ?", [id]);
            if (!isArchive && (!row || row.owner_id !== request.uid)) {
                return response.status(403).json({ status: "error", message: "Access denied." });
            }
        }

        const start = request.query.start ? Number(request.query.start) : null;
        const end = request.query.end ? Number(request.query.end) : null;
        const isCustom = threadlineIds.some(id => !id.startsWith("archive_"));
        
        let sql = "";
        const params = [];
        
        if (start || end || isCustom) {
            let filterSql = "";
            if (start) {
                filterSql += " AND m.timestamp >= ? ";
            }
            if (end) {
                filterSql += " AND m.timestamp <= ? ";
            }
            
            const constraint = buildMessageConstraint(threadlineIds, params);
            if (start) params.push(start);
            if (end) params.push(end);
            
            sql = `
                SELECT c.id, c.platform, c.title, 
                       MIN(m.timestamp) AS startDate, 
                       MAX(m.timestamp) AS endDate, 
                       COUNT(m.id) AS messageCount, 
                       c.metadata
                FROM conversations c
                JOIN messages m ON c.id = m.conversation_id
                WHERE ${constraint} ${filterSql}
                GROUP BY c.id
                ORDER BY messageCount DESC;
            `;
        } else {
            const placeholders = threadlineIds.map(() => "?").join(",");
            params.push(...threadlineIds);
            sql = `
                SELECT c.id, c.platform, c.title, c.start_date AS startDate, c.end_date AS endDate, c.message_count AS messageCount, c.metadata
                FROM conversations c
                WHERE c.threadline_id IN (${placeholders})
                ORDER BY c.message_count DESC;
            `;
        }
        
        const conversations = db.query(sql, params);

        // For each conversation, fetch its participants and import sources
        const conversationsWithParticipants = conversations.map(c => {
            const participantsSql = `
                SELECT p.id, p.name, p.phone_number AS phoneNumber, p.email
                FROM participants p
                JOIN conversation_participants cp ON p.id = cp.participant_id
                WHERE cp.conversation_id = ?;
            `;
            const participants = db.query(participantsSql, [c.id]);

            // Query unique import sources for this conversation
            const sourcesSql = `
                SELECT DISTINCT i.filename, i.imported_at AS importedAt, i.source
                FROM imports i
                JOIN message_imports mi ON i.id = mi.import_id
                JOIN messages m ON mi.message_id = m.id
                WHERE m.conversation_id = ?;
            `;
            const sources = db.query(sourcesSql, [c.id]);

            // Find last imported date
            let lastImported = null;
            if (sources.length > 0) {
                const dates = sources.map(s => s.importedAt).filter(Boolean);
                if (dates.length > 0) {
                    lastImported = dates.sort().pop();
                }
            }
            
            return {
                ...c,
                metadata: JSON.parse(c.metadata || "{}"),
                participants,
                sources,
                lastImported
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

        // Verify conversation ownership.
        const isArchive = id === `archive_${request.uid}`;
        let checkOwner;
        if (isArchive) {
            checkOwner = db.queryOne(
                `SELECT id FROM conversations WHERE threadline_id = ? AND id = ?`,
                [id, convId]
            );
        } else {
            checkOwner = db.queryOne(
                `SELECT c.id FROM conversations c 
                 JOIN threadlines t ON c.threadline_id = t.id 
                 WHERE t.id = ? AND t.owner_id = ? AND c.id = ?`,
                [id, request.uid, convId]
            );
        }
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
            const isArchive = id === `archive_${request.uid}`;
            const row = db.queryOne("SELECT owner_id FROM threadlines WHERE id = ?", [id]);
            if (!isArchive && (!row || row.owner_id !== request.uid)) {
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
        const params = [];
        
        // Build constraint for events (supporting both archives and custom workspace segments)
        const clauses = [];
        threadlineIds.forEach(id => {
            if (id.startsWith("archive_")) {
                clauses.push(" t.threadline_id = ? ");
                params.push(id);
            } else {
                const archiveId = `archive_${request.uid}`;
                clauses.push(` (t.threadline_id = ? OR (t.threadline_id = ? AND m.id IN (SELECT ssm.message_id FROM saved_segment_messages ssm JOIN threadline_segments ts ON ssm.saved_segment_id = ts.saved_segment_id WHERE ts.threadline_id = ?))) `);
                params.push(id, archiveId, id);
            }
        });
        const constraint = ` ( ${clauses.join(" OR ")} ) `;
        
        params.push(dateString);
        
        if (convIds.length > 0) {
            filterSql += ` AND m.conversation_id IN (${convIds.map(() => '?').join(',')}) `;
            params.push(...convIds);
        }

        // Query timeline events matching the UTC day
        const sql = `
            SELECT t.id,
                   t.timestamp,
                   t.type,
                   t.source_id AS sourceId,
                   t.title,
                   t.description,
                   t.sender,
                   t.metadata,
                   m.conversation_id AS conversationId,
                   m.body,
                   m.platform,
                   c.title AS conversationTitle
            FROM timeline_events t
            LEFT JOIN messages m ON t.source_id = m.id
            LEFT JOIN conversations c ON m.conversation_id = c.id
            WHERE ${constraint} AND strftime('%Y-%m-%d', datetime(t.timestamp / 1000, 'unixepoch')) = ? ${filterSql}
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


/**
 * GET /api/threadlines/:id/casefile
 * Exports and downloads a standalone portable .tl SQLite case file.
 */
router.get("/:id/casefile", (request, response) => {
    try {
        const threadlineId = request.params.id;
        const result = caseManager.exportCaseToFile(threadlineId, request.uid);
        
        response.setHeader("Content-Type", "application/x-sqlite3");
        response.setHeader("Content-Disposition", `attachment; filename="${result.filename}"`);
        
        const fileStream = fs.createReadStream(result.filePath);
        fileStream.pipe(response);
        fileStream.on("end", () => {
            if (fs.existsSync(result.filePath)) {
                try { fs.unlinkSync(result.filePath); } catch (e) {}
            }
        });
    } catch (error) {
        console.error("Export case file failed:", error);
        response.status(error.statusCode || 500).json({ status: "error", message: error.message });
    }
});

/**
 * POST /api/threadlines/casefile
 * Uploads and imports a standalone portable .tl SQLite case file into workspace.
 */
router.post("/casefile", caseUpload.single("casefile"), (request, response) => {
    let uploadedPath = null;
    try {
        if (!request.file) {
            return response.status(400).json({ status: "error", message: "No .tl case file uploaded." });
        }
        uploadedPath = request.file.path;
        const imported = caseManager.importCaseFromFile(uploadedPath, request.uid);
        response.json({
            status: "success",
            message: "Case file imported successfully.",
            case: imported
        });
    } catch (error) {
        console.error("Import case file failed:", error);
        response.status(500).json({ status: "error", message: error.message });
    } finally {
        if (uploadedPath && fs.existsSync(uploadedPath)) {
            try { fs.unlinkSync(uploadedPath); } catch (e) {}
        }
    }
});

module.exports = router;
