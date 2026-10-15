/*
    admin.js

    Secure Administration & Migration API for Threadline.
    Enables remote verification and verified database restoration onto the persistent volume.
    Protected by authentication middleware.
*/

const express = require("express");
const multer = require("multer");
const fs = require("fs");
const path = require("path");
const os = require("os");
const Database = require("better-sqlite3");
const storageConfig = require("../config/storage");
const dbModule = require("../database/database");

const router = express.Router();

const upload = multer({
    dest: os.tmpdir(),
    limits: { fileSize: 2 * 1024 * 1024 * 1024 } // 2 GB limit
});

/**
 * GET /api/admin/storage-status
 * Returns detailed diagnostic information about storage volume and active database.
 */
router.get("/storage-status", (req, res) => {
    try {
        const dbExists = fs.existsSync(storageConfig.databasePath);
        let stat = null;
        let counts = null;
        let integrity = null;

        if (dbExists && !storageConfig.isPendingRestore()) {
            try {
                stat = fs.statSync(storageConfig.databasePath);
                const db = dbModule.getDb();
                integrity = db.pragma("integrity_check");
                counts = {
                    threadlines: db.prepare("SELECT COUNT(*) as c FROM threadlines").get().c,
                    messages: db.prepare("SELECT COUNT(*) as c FROM messages").get().c,
                    conversations: db.prepare("SELECT COUNT(*) as c FROM conversations").get().c,
                    chunks: db.prepare("SELECT COUNT(*) as c FROM conversation_chunks").get().c,
                    imports: db.prepare("SELECT COUNT(*) as c FROM imports").get().c
                };
            } catch (e) {
                counts = { error: e.message };
            }
        }

        res.json({
            status: "success",
            storage: {
                isProduction: storageConfig.isProduction,
                pendingRestore: storageConfig.isPendingRestore(),
                dataDir: storageConfig.dataDir,
                databasePath: storageConfig.databasePath,
                uploadsDir: storageConfig.uploadsDir,
                dbExists,
                dbSizeBytes: stat ? stat.size : 0,
                dbSizeMB: stat ? (stat.size / 1024 / 1024).toFixed(2) : 0,
                counts,
                integrity
            }
        });
    } catch (err) {
        res.status(500).json({ status: "error", message: err.message });
    }
});

/**
 * POST /api/admin/restore-database
 * Streams and safely swaps an authoritative SQLite database file onto the persistent volume.
 */
router.post("/restore-database", upload.single("database"), (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ status: "error", message: "No database file uploaded." });
        }

        const uploadedTmp = req.file.path;
        console.log(`[Admin Restore] Received database payload: ${req.file.size} bytes (${(req.file.size / 1024 / 1024).toFixed(2)} MB)`);

        // 1. Verify integrity of the uploaded file BEFORE placing it into production path
        const testDb = new Database(uploadedTmp, { readonly: true });
        const integrity = testDb.pragma("integrity_check");
        const fk = testDb.pragma("foreign_key_check");
        if (integrity[0]?.integrity_check !== "ok" || fk.length > 0) {
            testDb.close();
            try { fs.unlinkSync(uploadedTmp); } catch (e) {}
            return res.status(400).json({
                status: "error",
                message: "Uploaded database failed SQLite integrity or foreign key check."
            });
        }

        const getCount = (tbl) => testDb.prepare(`SELECT COUNT(*) as c FROM "${tbl}"`).get().c;
        const verifiedCounts = {
            threadlines: getCount("threadlines"),
            conversations: getCount("conversations"),
            messages: getCount("messages"),
            conversation_chunks: getCount("conversation_chunks"),
            messages_fts: getCount("messages_fts"),
            chunks_fts: getCount("chunks_fts"),
            imports: getCount("imports"),
            timeline_events: getCount("timeline_events")
        };
        testDb.close();

        // 2. Close active database connection cleanly with WAL truncate
        dbModule.closeDatabase();

        // 3. Ensure target directory exists
        const targetDir = path.dirname(storageConfig.databasePath);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        // Backup existing DB if present
        if (fs.existsSync(storageConfig.databasePath)) {
            try {
                fs.copyFileSync(storageConfig.databasePath, `${storageConfig.databasePath}.${Date.now()}.bak`);
            } catch (e) {}
        }

        // 4. Move uploaded file to target database path
        fs.copyFileSync(uploadedTmp, storageConfig.databasePath);
        try { fs.unlinkSync(uploadedTmp); } catch (e) {}

        // Remove old WAL and SHM if they exist to avoid cache collision
        const walPath = `${storageConfig.databasePath}-wal`;
        const shmPath = `${storageConfig.databasePath}-shm`;
        if (fs.existsSync(walPath)) { try { fs.unlinkSync(walPath); } catch (e) {} }
        if (fs.existsSync(shmPath)) { try { fs.unlinkSync(shmPath); } catch (e) {} }

        // Clear maintenance mode
        storageConfig.clearPendingRestore();

        // 5. Reopen database connection
        dbModule.initializeDatabase();
        const newDb = dbModule.getDb();
        const postIntegrity = newDb.pragma("integrity_check");

        console.log("[Admin Restore] Database restored, integrity verified, and active connection reopened.");
        res.json({
            status: "success",
            message: "Production database successfully restored and verified.",
            targetPath: storageConfig.databasePath,
            sizeBytes: fs.statSync(storageConfig.databasePath).size,
            verifiedCounts,
            integrityCheck: postIntegrity
        });

    } catch (err) {
        console.error("[Admin Restore] Failed:", err);
        res.status(500).json({ status: "error", message: err.message });
    }
});

module.exports = router;
