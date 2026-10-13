/*======================================================
                        IMPORTS
======================================================*/

// Core
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");

// Engine
const { processImport, processImportText } = require("../engines/importEngine");

// Services
const { ingestArchive } = require("../services/threadlines");

/*======================================================
                        VARIABLES
======================================================*/

const router = express.Router();

/*======================================================
                        STORAGE
======================================================*/

const uploadDir = path.resolve(__dirname, "../uploads");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const storage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, uploadDir),
    filename: (request, file, callback) => {
        const uniqueSuffix = Date.now() + "_" + Math.random().toString(36).substring(2, 8);
        callback(null, uniqueSuffix + path.extname(file.originalname));
    }
});

const upload = multer({
    storage,
    limits: {
        fileSize: 500 * 1024 * 1024 // 500 MB limit
    }
});

/*======================================================
                        ROUTES
======================================================*/

router.get("/", async (request, response) => {
    try {
        if (!request.uid) {
            return response.status(401).json({ status: "error", message: "Unauthorized" });
        }
        const db = require("../database/database");
        const threadlineId = request.query.threadlineId;
        let sql = "";
        let params = [];
        
        if (threadlineId) {
            sql = `
                SELECT DISTINCT i.id, i.filename, i.source, i.platform, i.file_size AS fileSize, 
                       i.message_count AS messageCount, i.participant_count AS participantCount, 
                       i.thread_count AS threadCount, i.earliest_timestamp AS earliestTimestamp, 
                       i.latest_timestamp AS latestTimestamp, i.imported_at AS importedAt, i.status, i.errors
                FROM imports i
                JOIN message_imports mi ON i.id = mi.import_id
                JOIN messages m ON mi.message_id = m.id
                WHERE i.owner_id = ? AND m.threadline_id = ?
                ORDER BY i.imported_at DESC
            `;
            params = [request.uid, threadlineId];
        } else {
            sql = `
                SELECT id, filename, source, platform, file_size AS fileSize, 
                       message_count AS messageCount, participant_count AS participantCount, 
                       thread_count AS threadCount, earliest_timestamp AS earliestTimestamp, 
                       latest_timestamp AS latestTimestamp, imported_at AS importedAt, status, errors
                FROM imports
                WHERE owner_id = ?
                ORDER BY imported_at DESC
            `;
            params = [request.uid];
        }
        const rows = db.query(sql, params);
        response.json({ status: "success", imports: rows });
    } catch (error) {
        response.status(500).json({ status: "error", message: error.message });
    }
});

/*======================================================
                    FILE IMPORT
======================================================*/

router.post("/", upload.single("archive"), async (request, response) => {
    let uploadedFilePath = null;
    try {
        if (!request.file) {
            return response.status(400).json({
                status: "error",
                message: "No file uploaded."
            });
        }

        uploadedFilePath = request.file.path;

        console.log("==========================================");
        console.log("IMPORT REQUEST");
        console.log("File:", request.file.originalname);
        console.log("UID:", request.uid);

        if (!request.uid) {
            return response.status(401).json({
                status: "error",
                message: "Missing user id."
            });
        }

        console.log("Running Import Engine...");

        const archive = await processImport(uploadedFilePath);

        console.log("Archive created.");
        console.log("Messages:", archive.messageCount);
        console.log("Conversations:", archive.conversationCount);

        console.log("Ingesting into Workspace...");

        const targetThreadlineId = request.body.threadlineId || null;

        const result = await ingestArchive(
            request.uid,
            archive,
            request.file.originalname,
            request.file.size,
            targetThreadlineId
        );

        console.log("Archive Ingested successfully.");
        console.log("==========================================");

        archive.stats = result.stats;

        response.json({
            status: "success",
            threadlineId: result.threadlineId,
            archive
        });

    } catch (error) {
        console.error("");
        console.error("==========================================");
        console.error("IMPORT FAILED");
        console.error("==========================================");
        console.error(error);
        console.error(error.stack);
        console.error("==========================================");
        console.error("");

        response.status(500).json({
            status: "error",
            message: error.message
        });
    } finally {
        // Enforce cleanup: temporary files must not leak on disk
        if (uploadedFilePath && fs.existsSync(uploadedFilePath)) {
            try {
                fs.unlinkSync(uploadedFilePath);
                console.log("Cleaned up temporary upload file:", uploadedFilePath);
            } catch (cleanupErr) {
                console.warn("Failed to delete temp upload file:", cleanupErr.message);
            }
        }
    }
});

/*======================================================
                DIRECT TEXT PASTE IMPORT
======================================================*/

router.post("/paste", express.json({ limit: "50mb" }), async (request, response) => {
    try {
        const { text, title, threadlineId } = request.body;
        if (!text || !text.trim()) {
            return response.status(400).json({
                status: "error",
                message: "No text provided for import."
            });
        }

        if (!request.uid) {
            return response.status(401).json({
                status: "error",
                message: "Missing user id."
            });
        }

        console.log("==========================================");
        console.log("PASTED TEXT IMPORT REQUEST");
        console.log("UID:", request.uid);
        console.log("Text Length:", text.length);

        const archive = await processImportText(text, "Pasted Snippet");

        console.log("Archive created.");
        console.log("Messages:", archive.messageCount);
        console.log("Conversations:", archive.conversationCount);

        const filename = (title && title.trim()) ? `${title.trim()}.txt` : `Pasted_Chat_${Date.now()}.txt`;
        const sizeBytes = Buffer.byteLength(text, "utf8");

        const targetThreadlineId = threadlineId || null;

        const result = await ingestArchive(
            request.uid,
            archive,
            filename,
            sizeBytes,
            targetThreadlineId
        );

        console.log("Pasted Archive Ingested successfully.");
        console.log("==========================================");

        archive.stats = result.stats;

        response.json({
            status: "success",
            threadlineId: result.threadlineId,
            archive
        });
    } catch (error) {
        console.error("PASTED TEXT IMPORT FAILED:", error);
        response.status(500).json({
            status: "error",
            message: error.message
        });
    }
});

/*======================================================
                        EXPORTS
======================================================*/

module.exports = router;
