/*======================================================
                        IMPORTS
======================================================*/

// Core
const express = require("express");
const multer = require("multer");
const path = require("path");
const fs = require("fs");
const crypto = require("crypto");

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
        fileSize: 10 * 1024 * 1024 * 1024 // 10 GB limit
    }
});

const chunkUpload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 100 * 1024 * 1024 // 100 MB per chunk limit
    }
});

function computeFileSha256(filePath) {
    return new Promise((resolve, reject) => {
        const hash = crypto.createHash("sha256");
        const stream = fs.createReadStream(filePath);
        stream.on("data", chunk => hash.update(chunk));
        stream.on("end", () => resolve(hash.digest("hex")));
        stream.on("error", reject);
    });
}

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
                       i.latest_timestamp AS latestTimestamp, i.imported_at AS importedAt, i.status, i.errors,
                       i.sha256, i.discovered_count AS discoveredCount, i.skipped_count AS skippedCount,
                       i.provenance_metadata AS provenanceMetadata
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
                       latest_timestamp AS latestTimestamp, imported_at AS importedAt, status, errors,
                       sha256, discovered_count AS discoveredCount, skipped_count AS skippedCount,
                       provenance_metadata AS provenanceMetadata
                FROM imports
                WHERE owner_id = ?
                ORDER BY imported_at DESC
            `;
            params = [request.uid];
        }
        let rows;
        try {
            rows = db.query(sql, params);
        } catch (queryErr) {
            if (queryErr.message && queryErr.message.includes("no such column")) {
                console.warn("⚠️ imports query failed on missing columns, executing inline migration and fallback:", queryErr.message);
                try {
                    db.run("ALTER TABLE imports ADD COLUMN sha256 TEXT;");
                    db.run("ALTER TABLE imports ADD COLUMN discovered_count INTEGER DEFAULT 0;");
                    db.run("ALTER TABLE imports ADD COLUMN skipped_count INTEGER DEFAULT 0;");
                    db.run("ALTER TABLE imports ADD COLUMN provenance_metadata TEXT;");
                    rows = db.query(sql, params);
                } catch (_fallbackErr) {
                    const legacySql = sql
                        .replace(/i\.sha256, i\.discovered_count AS discoveredCount, i\.skipped_count AS skippedCount,\s*i\.provenance_metadata AS provenanceMetadata/g, "NULL AS sha256, 0 AS discoveredCount, 0 AS skippedCount, NULL AS provenanceMetadata")
                        .replace(/sha256, discovered_count AS discoveredCount, skipped_count AS skippedCount,\s*provenance_metadata AS provenanceMetadata/g, "NULL AS sha256, 0 AS discoveredCount, 0 AS skippedCount, NULL AS provenanceMetadata");
                    rows = db.query(legacySql, params);
                }
            } else {
                throw queryErr;
            }
        }
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

        const fileSha256 = await computeFileSha256(uploadedFilePath);

        const result = await ingestArchive(
            request.uid,
            archive,
            request.file.originalname,
            request.file.size,
            targetThreadlineId,
            fileSha256
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
                CHUNKED FILE IMPORT
======================================================*/

router.post("/chunk", chunkUpload.single("chunk"), async (request, response) => {
    let partFilePath = null;
    let finalFilePath = null;
    try {
        if (!request.file) {
            return response.status(400).json({
                status: "error",
                message: "No chunk buffer uploaded."
            });
        }

        if (!request.uid) {
            return response.status(401).json({
                status: "error",
                message: "Missing user id."
            });
        }

        const { uploadId, chunkIndex, totalChunks, fileName, fileSize, threadlineId } = request.body;
        if (!uploadId) {
            return response.status(400).json({
                status: "error",
                message: "Missing uploadId parameter."
            });
        }

        const safeUploadId = String(uploadId).replace(/[^a-zA-Z0-9_-]/g, "");
        const chunkIdx = parseInt(chunkIndex, 10);
        const total = parseInt(totalChunks, 10);

        if (isNaN(chunkIdx) || isNaN(total) || total <= 0 || chunkIdx < 0) {
            return response.status(400).json({
                status: "error",
                message: "Invalid chunkIndex or totalChunks."
            });
        }

        partFilePath = path.join(uploadDir, `temp_chunk_${safeUploadId}.part`);

        // If chunkIndex is 0 and part file exists from a previous aborted attempt, remove it
        if (chunkIdx === 0 && fs.existsSync(partFilePath)) {
            try { fs.unlinkSync(partFilePath); } catch (_) {}
        }

        // Append the received slice to the part file
        fs.appendFileSync(partFilePath, request.file.buffer);

        // If this is not the final chunk, acknowledge receipt
        if (chunkIdx < total - 1) {
            return response.json({
                status: "success",
                chunkIndex: chunkIdx,
                totalChunks: total,
                received: true
            });
        }

        // Final chunk received! Move/rename to final assembly file
        console.log("==========================================");
        console.log("ALL CHUNKS RECEIVED FOR:", fileName || safeUploadId);
        console.log(`Chunks: ${total}, Upload ID: ${safeUploadId}`);
        console.log("UID:", request.uid);

        const ext = path.extname(fileName || ".xml") || ".xml";
        const uniqueSuffix = Date.now() + "_" + Math.random().toString(36).substring(2, 8);
        finalFilePath = path.join(uploadDir, `chunk_assembled_${uniqueSuffix}${ext}`);

        fs.renameSync(partFilePath, finalFilePath);
        partFilePath = null; // No longer points to an active part file

        console.log("Running Import Engine on assembled file...");
        const archive = await processImport(finalFilePath);

        console.log("Archive created.");
        console.log("Messages:", archive.messageCount);
        console.log("Conversations:", archive.conversationCount);

        const targetThreadlineId = threadlineId || null;
        const originalName = fileName || `Import_${safeUploadId}${ext}`;
        const totalSize = parseInt(fileSize, 10) || fs.statSync(finalFilePath).size;

        console.log("Computing SHA-256 via stream...");
        const fileSha256 = await computeFileSha256(finalFilePath);

        console.log("Ingesting into Workspace...");
        const result = await ingestArchive(
            request.uid,
            archive,
            originalName,
            totalSize,
            targetThreadlineId,
            fileSha256
        );

        console.log("Chunked Archive Ingested successfully.");
        console.log("==========================================");

        archive.stats = result.stats;

        response.json({
            status: "success",
            threadlineId: result.threadlineId,
            archive
        });

    } catch (error) {
        console.error("CHUNKED IMPORT FAILED:", error);
        response.status(500).json({
            status: "error",
            message: error.message
        });
    } finally {
        if (finalFilePath && fs.existsSync(finalFilePath)) {
            try {
                fs.unlinkSync(finalFilePath);
                console.log("Cleaned up assembled temp file:", finalFilePath);
            } catch (_) {}
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
