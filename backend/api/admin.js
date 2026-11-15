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
const crypto = require("crypto");
const Database = require("better-sqlite3");
const storageConfig = require("../config/storage");
const dbModule = require("../database/database");

const router = express.Router();

const upload = multer({
    dest: os.tmpdir(),
    limits: { fileSize: 2 * 1024 * 1024 * 1024 } // 2 GB limit
});

/**
 * Issues a synchronous flush request (fsync) for a file descriptor.
 * On POSIX (Linux/macOS/Railway target), also requests a flush for the containing directory descriptor.
 *
 * Storage Synchronization Boundaries:
 * - fsync issues a synchronous flush request to the operating system to flush kernel
 *   page cache buffers and inode metadata to the underlying filesystem and storage driver.
 * - The application treats fsync as a best-effort synchronous flush request handled by
 *   the OS, filesystem, and storage stack. It makes no guarantees regarding physical
 *   persistence, underlying volume behavior, hardware write caches, or immunity to
 *   host power loss.
 * - On POSIX (Linux/Railway target), both file fsync and parent-directory fsync failures
 *   (including descriptor close errors) are treated as fatal storage failures to fail
 *   closed immediately if the operating system reports any synchronization error.
 * - On Windows (local development environment), directory fsync is safely bypassed
 *   because Win32 does not support FlushFileBuffers on directory handles.
 */
function syncFileAndDirectory(filePath, dirPath) {
    let fd = null;
    let syncError = null;
    try {
        fd = fs.openSync(filePath, "r+");
        fs.fsyncSync(fd);
    } catch (err) {
        syncError = err;
    } finally {
        if (fd !== null) {
            try {
                fs.closeSync(fd);
            } catch (closeErr) {
                if (!syncError) {
                    syncError = new Error(`Failed to close file descriptor for '${filePath}': ${closeErr.message}`);
                } else {
                    console.error(`Secondary error closing file descriptor for '${filePath}': ${closeErr.message}`);
                }
            }
        }
    }

    if (syncError) {
        throw new Error(`Storage synchronization failure for file '${filePath}': ${syncError.message}`);
    }

    if (process.platform !== "win32" && dirPath) {
        syncDirectory(dirPath);
    }
}

/**
 * Issues a synchronous flush request (fsync) for containing directory metadata on POSIX.
 * Fatal on POSIX (Linux/Railway target); safely bypassed on Windows.
 */
function syncDirectory(dirPath) {
    if (process.platform !== "win32" && dirPath) {
        let dirFd = null;
        let syncErr = null;
        try {
            dirFd = fs.openSync(dirPath, "r");
            fs.fsyncSync(dirFd);
        } catch (err) {
            syncErr = err;
        } finally {
            if (dirFd !== null) {
                try {
                    fs.closeSync(dirFd);
                } catch (closeErr) {
                    if (!syncErr) {
                        syncErr = new Error(`Failed to close directory descriptor for '${dirPath}': ${closeErr.message}`);
                    } else {
                        console.error(`Secondary error closing directory descriptor for '${dirPath}': ${closeErr.message}`);
                    }
                }
            }
        }

        if (syncErr) {
            throw new Error(`Storage synchronization failure for directory '${dirPath}': ${syncErr.message}`);
        }
    }
}

/**
 * GET /api/admin/storage-status
 * Returns detailed diagnostic information about storage volume, active database, and available backups.
 */
router.get("/storage-status", (req, res) => {
    try {
        if (req.tokenScope !== "database_restore" && !req.uid) {
            return res.status(403).json({
                status: "error",
                message: "Unauthorized access to storage status."
            });
        }

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

        // Enumerate validated timestamped backup files on the persistent volume
        let availableBackups = [];
        const targetDir = path.resolve(path.dirname(storageConfig.databasePath));
        const baseName = path.basename(storageConfig.databasePath);
        if (fs.existsSync(targetDir)) {
            const expectedPattern = new RegExp(`^${baseName.replace(".", "\\.")}\\.(\\d+)\\.bak$`);
            availableBackups = fs.readdirSync(targetDir)
                .filter(f => expectedPattern.test(f))
                .map(f => {
                    const match = f.match(expectedPattern);
                    const full = path.resolve(targetDir, f);
                    const s = fs.statSync(full);
                    return {
                        filename: f,
                        timestamp: Number(match[1]),
                        createdIso: new Date(Number(match[1])).toISOString(),
                        sizeBytes: s.size,
                        sizeMB: (s.size / 1024 / 1024).toFixed(2)
                    };
                })
                .sort((a, b) => b.timestamp - a.timestamp);
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
                integrity,
                availableBackups
            }
        });
    } catch (err) {
        res.status(500).json({ status: "error", message: err.message });
    }
});

/**
 * POST /api/admin/restore-database
 * Streams and safely swaps an authoritative SQLite database file onto the persistent volume.
 *
 * Safety & Maintenance Invariants:
 * 1. Non-destructive validation & staging occurs BEFORE establishing maintenance mode.
 *    Invalid uploads reject with HTTP 400 without taking the live database offline.
 * 2. Maintenance mode (.restore_pending marker) is established immediately BEFORE
 *    closing active connections, cleaning sidecars, or modifying live files.
 * 3. Every failure after marker creation is strictly fail-closed (HTTP 500 / 503).
 * 4. Staging files and containing directory entries issue synchronous fsync flush requests.
 * 5. Connection shutdown and WAL/SHM cleanup are strictly verified before file swap.
 * 6. Maintenance marker is cleared ONLY after all post-swap validations pass.
 */
router.post("/restore-database", upload.single("database"), (req, res) => {
    let backupPath = null;
    let uploadedTmp = req.file ? req.file.path : null;
    let stagingPath = null;
    try {
        if (req.tokenScope !== "database_restore") {
            if (uploadedTmp && fs.existsSync(uploadedTmp)) {
                try { fs.unlinkSync(uploadedTmp); } catch (_) {}
                uploadedTmp = null;
            }
            return res.status(403).json({
                status: "error",
                message: "Database restore requires an administrative credential with database_restore scope."
            });
        }

        if (!req.file) {
            return res.status(400).json({ status: "error", message: "No database file uploaded." });
        }

        console.log(`[Admin Restore] Received database payload: ${req.file.size} bytes (${(req.file.size / 1024 / 1024).toFixed(2)} MB)`);

        const targetDir = path.resolve(path.dirname(storageConfig.databasePath));
        const baseName = path.basename(storageConfig.databasePath);
        if (!fs.existsSync(targetDir)) {
            fs.mkdirSync(targetDir, { recursive: true });
        }

        // 1. Stage uploaded payload onto persistent volume directory (handling cross-device EXDEV cleanly)
        stagingPath = path.resolve(targetDir, `${baseName}.restore_staging.${Date.now()}_${crypto.randomBytes(4).toString("hex")}`);
        try {
            fs.renameSync(uploadedTmp, stagingPath);
        } catch (renameErr) {
            fs.copyFileSync(uploadedTmp, stagingPath);
            try { fs.unlinkSync(uploadedTmp); } catch (_) {}
        }
        uploadedTmp = null;

        // Issue synchronous fsync flush requests for staged file and directory before validation
        syncFileAndDirectory(stagingPath, targetDir);

        // 2. Validate staged database integrity, foreign keys, and required tables BEFORE touching live database or establishing maintenance
        let testDb = null;
        let expectedCounts = null;
        try {
            testDb = new Database(stagingPath, { readonly: true });
            const preIntegrity = testDb.pragma("integrity_check");
            const preFk = testDb.pragma("foreign_key_check");
            if (preIntegrity[0]?.integrity_check !== "ok" || preFk.length > 0) {
                testDb.close();
                try { fs.unlinkSync(stagingPath); } catch (_) {}
                return res.status(400).json({
                    status: "error",
                    message: "Uploaded database failed SQLite integrity or foreign key check.",
                    integrity: preIntegrity,
                    foreignKeyViolations: preFk
                });
            }

            const requiredTables = [
                "threadlines",
                "conversations",
                "messages",
                "conversation_chunks",
                "messages_fts",
                "chunks_fts",
                "imports",
                "timeline_events"
            ];

            for (const tbl of requiredTables) {
                const tableCheck = testDb.prepare(`SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?`).get(tbl);
                if (!tableCheck) {
                    testDb.close();
                    try { fs.unlinkSync(stagingPath); } catch (_) {}
                    return res.status(400).json({
                        status: "error",
                        message: `Uploaded database is missing required table '${tbl}'. Restore aborted.`
                    });
                }
            }

            const getCount = (tbl) => {
                const row = testDb.prepare(`SELECT COUNT(*) as c FROM "${tbl}"`).get();
                return row ? row.c : 0;
            };

            expectedCounts = {
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
        } catch (inspectErr) {
            if (testDb) try { testDb.close(); } catch (_) {}
            try { fs.unlinkSync(stagingPath); } catch (_) {}
            return res.status(400).json({
                status: "error",
                message: `Uploaded database validation failed: ${inspectErr.message}`
            });
        }

        // =========================================================================
        // DESTRUCTIVE PHASE: Establish persistent maintenance marker (.restore_pending)
        // Now that the payload is 100% verified, lock maintenance mode immediately
        // before connection shutdown, sidecar cleanup, or live database modification.
        // =========================================================================
        storageConfig.setPendingRestore();

        // 3. Clean active WAL and SHM sidecars before closing/swapping
        const walPath = `${storageConfig.databasePath}-wal`;
        const shmPath = `${storageConfig.databasePath}-shm`;

        // 4. Close active SQLite connection cleanly with WAL truncate (throws if checkpoint or close fails)
        dbModule.closeDatabase();

        // 5. Verify absence of existing WAL and SHM sidecars
        if (fs.existsSync(walPath)) {
            try {
                fs.unlinkSync(walPath);
            } catch (err) {
                throw new Error(`Failed to remove active WAL file before replacement: ${err.message}`);
            }
            if (fs.existsSync(walPath)) {
                throw new Error("Active WAL file still exists after unlink attempt.");
            }
        }
        if (fs.existsSync(shmPath)) {
            try {
                fs.unlinkSync(shmPath);
            } catch (err) {
                throw new Error(`Failed to remove active SHM file before replacement: ${err.message}`);
            }
            if (fs.existsSync(shmPath)) {
                throw new Error("Active SHM file still exists after unlink attempt.");
            }
        }

        // 6. Create timestamped backup of the existing production database (if present)
        if (fs.existsSync(storageConfig.databasePath)) {
            backupPath = path.resolve(targetDir, `${baseName}.${Date.now()}.bak`);
            try {
                fs.renameSync(storageConfig.databasePath, backupPath);
                console.log(`[Admin Restore] Created timestamped backup of existing database at: ${backupPath}`);
            } catch (e) {
                throw new Error(`Failed to create backup of existing production database: ${e.message}`);
            }
            // Issue synchronous directory fsync flush on POSIX after creating timestamped backup
            syncDirectory(targetDir);
        }

        // Final pre-swap verification: ensure zero WAL/SHM sidecars exist
        if (fs.existsSync(walPath) || fs.existsSync(shmPath)) {
            throw new Error("Stale WAL/SHM sidecars detected immediately before database replacement.");
        }

        // 7. Atomic replacement: rename validated staged file into live database path (strictly no copy fallback)
        try {
            fs.renameSync(stagingPath, storageConfig.databasePath);
        } catch (renameErr) {
            throw new Error(`Failed to place restored database into live path via atomic rename: ${renameErr.message}`);
        }

        // Issue synchronous fsync flush requests for replaced live database and directory
        syncFileAndDirectory(storageConfig.databasePath, targetDir);

        // Secondary cleanup: ensure no residual WAL/SHM artifacts were created during swap
        if (fs.existsSync(walPath)) {
            try { fs.unlinkSync(walPath); } catch (err) {
                throw new Error(`Failed to clean residual WAL after replacement: ${err.message}`);
            }
        }
        if (fs.existsSync(shmPath)) {
            try { fs.unlinkSync(shmPath); } catch (err) {
                throw new Error(`Failed to clean residual SHM after replacement: ${err.message}`);
            }
        }

        // 8. Reinitialize the database connection while KEEPING maintenance mode active
        dbModule.initializeDatabase(true);
        const newDb = dbModule.getDb(true);
        if (!newDb) {
            throw new Error("Failed to reinitialize database connection after file swap.");
        }

        // 9. Verify SQLite integrity and foreign keys on restored live database
        const postIntegrity = newDb.pragma("integrity_check");
        if (postIntegrity[0]?.integrity_check !== "ok") {
            throw new Error(`Restored database failed post-swap integrity check: ${JSON.stringify(postIntegrity)}`);
        }

        const postFk = newDb.pragma("foreign_key_check");
        if (postFk.length > 0) {
            throw new Error(`Restored database failed post-swap foreign key check: ${JSON.stringify(postFk)}`);
        }

        // 10. Independently verify expected record counts on restored live database
        const getLiveCount = (tbl) => newDb.prepare(`SELECT COUNT(*) as c FROM "${tbl}"`).get().c;
        const liveCounts = {
            threadlines: getLiveCount("threadlines"),
            conversations: getLiveCount("conversations"),
            messages: getLiveCount("messages"),
            conversation_chunks: getLiveCount("conversation_chunks"),
            messages_fts: getLiveCount("messages_fts"),
            chunks_fts: getLiveCount("chunks_fts"),
            imports: getLiveCount("imports"),
            timeline_events: getLiveCount("timeline_events")
        };

        const requiredTables = [
            "threadlines",
            "conversations",
            "messages",
            "conversation_chunks",
            "messages_fts",
            "chunks_fts",
            "imports",
            "timeline_events"
        ];

        for (const tbl of requiredTables) {
            if (liveCounts[tbl] !== expectedCounts[tbl]) {
                throw new Error(
                    `Post-swap record count mismatch for table '${tbl}'. Expected: ${expectedCounts[tbl]}, live: ${liveCounts[tbl]}`
                );
            }
        }

        // 11. Confirm database is operational
        newDb.prepare("SELECT id FROM threadlines LIMIT 1").get();

        // 12. ONLY THEN clear the pending restore marker (lift maintenance mode)
        storageConfig.clearPendingRestore();

        console.log("[Admin Restore] Database restored, fully verified, operational, and maintenance mode cleared.");
        res.json({
            status: "success",
            message: "Production database successfully restored, fully verified, and live.",
            targetPath: storageConfig.databasePath,
            sizeBytes: fs.statSync(storageConfig.databasePath).size,
            backupPath,
            verifiedCounts: liveCounts,
            integrityCheck: postIntegrity,
            foreignKeyCheck: "ok"
        });

    } catch (err) {
        console.error("[Admin Restore] Restore failed:", err.message);
        // CRITICAL INTERRUPT-SAFE PRESERVATION:
        // If existing database was already preserved away to backupPath, DO NOT delete stagingPath!
        // Preserve both diagnostic files on persistent volume for operator recovery.
        if (!backupPath) {
            if (stagingPath && fs.existsSync(stagingPath)) {
                try { fs.unlinkSync(stagingPath); } catch (_) {}
            }
            if (uploadedTmp && fs.existsSync(uploadedTmp)) {
                try { fs.unlinkSync(uploadedTmp); } catch (_) {}
            }
        } else {
            console.warn(`[Admin Restore] Retaining staged restore copy at '${stagingPath}' and existing backup at '${backupPath}' for diagnosis/recovery.`);
        }
        res.status(500).json({
            status: "error",
            message: err.message,
            maintenanceMode: storageConfig.isPendingRestore() ? "active" : "inactive",
            backupPath: backupPath || "none",
            stagingPreservedAt: (backupPath && stagingPath && fs.existsSync(stagingPath)) ? stagingPath : "none"
        });
    }
});

/**
 * POST /api/admin/rollback-database
 * Reverts to a validated timestamped backup on the persistent volume.
 *
 * Safety & Maintenance Invariants:
 * 1. Non-destructive backup validation occurs BEFORE establishing maintenance mode.
 *    Invalid requests, missing files, or corrupted backups reject with 400/404 without taking the live database offline.
 * 2. Maintenance mode (.restore_pending marker) is established immediately BEFORE
 *    closing active connections, preserving failed state, or replacing live files.
 * 3. Every failure after marker creation is strictly fail-closed (HTTP 500 / 503).
 * 4. Staging files and containing directory entries issue synchronous fsync flush requests.
 * 5. Connection shutdown and WAL/SHM preservation are strictly verified before file swap.
 * 6. Maintenance marker is cleared ONLY after all post-swap validations pass.
 */
router.post("/rollback-database", express.json(), (req, res) => {
    let failedPreservePath = null;
    let stagingPath = null;
    try {
        if (req.tokenScope !== "database_restore") {
            return res.status(403).json({
                status: "error",
                message: "Database rollback requires an administrative credential with database_restore scope."
            });
        }

        const targetDir = path.resolve(path.dirname(storageConfig.databasePath));
        const baseName = path.basename(storageConfig.databasePath);

        // 1. Strict, explicit backup file selection: require operator to specify exact backupFilename
        if (!req.body || !req.body.backupFilename || typeof req.body.backupFilename !== "string") {
            return res.status(400).json({
                status: "error",
                message: "Explicit 'backupFilename' is required for rollback. Available backups can be queried via GET /api/admin/storage-status."
            });
        }

        const rawFilename = req.body.backupFilename.trim();
        // Prevent path traversal: must be a bare filename without slashes or ..
        if (rawFilename.includes("/") || rawFilename.includes("\\") || rawFilename.includes("..")) {
            return res.status(400).json({
                status: "error",
                message: "Invalid backup filename: directory traversal or path separators not allowed."
            });
        }

        // Must strictly match expected backup pattern: <baseName>.<timestamp>.bak
        const expectedPattern = new RegExp(`^${baseName.replace(".", "\\.")}\\.\\d+\\.bak$`);
        if (!expectedPattern.test(rawFilename)) {
            return res.status(400).json({
                status: "error",
                message: `Invalid backup filename: must match pattern '${baseName}.<timestamp>.bak'.`
            });
        }

        const selectedBackupFile = path.resolve(targetDir, rawFilename);
        if (!fs.existsSync(selectedBackupFile)) {
            return res.status(404).json({
                status: "error",
                message: `Specified backup file '${rawFilename}' does not exist in data directory.`
            });
        }

        // Final sanity check: ensure resolved path is strictly inside targetDir
        if (path.resolve(path.dirname(selectedBackupFile)) !== targetDir) {
            return res.status(400).json({
                status: "error",
                message: "Resolved backup path escapes data directory boundary."
            });
        }

        // Compute checksum and size of selected backup for audit log
        const backupStat = fs.statSync(selectedBackupFile);
        const backupBuf = fs.readFileSync(selectedBackupFile);
        const backupSha256 = crypto.createHash("sha256").update(backupBuf).digest("hex");

        console.log(`[Admin Rollback] Initiating rollback to verified backup: ${rawFilename} (${backupStat.size} bytes, sha256: ${backupSha256})`);

        // 2. Interruption-safe temporary staging in same persistent volume directory
        stagingPath = path.resolve(
            targetDir,
            `${baseName}.rollback_staging.${Date.now()}_${crypto.randomBytes(4).toString("hex")}`
        );
        fs.copyFileSync(selectedBackupFile, stagingPath);

        // Issue synchronous fsync flush requests for staged backup copy and directory before validation
        syncFileAndDirectory(stagingPath, targetDir);

        // 3. Validate staged temporary copy BEFORE touching production live database or establishing maintenance
        let testDb = null;
        let expectedCounts = null;
        try {
            testDb = new Database(stagingPath, { readonly: true });
            const preIntegrity = testDb.pragma("integrity_check");
            const preFk = testDb.pragma("foreign_key_check");
            if (preIntegrity[0]?.integrity_check !== "ok" || preFk.length > 0) {
                testDb.close();
                try { fs.unlinkSync(stagingPath); } catch (_) {}
                return res.status(400).json({
                    status: "error",
                    message: "Target backup file failed SQLite integrity or foreign key check. Rollback aborted.",
                    integrity: preIntegrity,
                    foreignKeyViolations: preFk
                });
            }

            const requiredTables = [
                "threadlines",
                "conversations",
                "messages",
                "conversation_chunks",
                "messages_fts",
                "chunks_fts",
                "imports",
                "timeline_events"
            ];

            // Verify all required tables exist in the backup schema
            for (const tbl of requiredTables) {
                const tableCheck = testDb.prepare(`SELECT name FROM sqlite_master WHERE type IN ('table', 'view') AND name = ?`).get(tbl);
                if (!tableCheck) {
                    testDb.close();
                    try { fs.unlinkSync(stagingPath); } catch (_) {}
                    return res.status(400).json({
                        status: "error",
                        message: `Target backup is missing required table '${tbl}'. Rollback aborted.`
                    });
                }
            }

            const getCount = (tbl) => {
                const row = testDb.prepare(`SELECT COUNT(*) as c FROM "${tbl}"`).get();
                return row ? row.c : 0;
            };

            expectedCounts = {
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
        } catch (err) {
            if (testDb) try { testDb.close(); } catch (_) {}
            try { fs.unlinkSync(stagingPath); } catch (_) {}
            return res.status(400).json({
                status: "error",
                message: `Failed to inspect backup file: ${err.message}`
            });
        }

        // =========================================================================
        // DESTRUCTIVE PHASE: Establish persistent maintenance marker (.restore_pending)
        // Now that the backup is 100% verified, lock maintenance mode immediately
        // before connection shutdown, live database preservation, or file swap.
        // =========================================================================
        storageConfig.setPendingRestore();

        // 4. Close the ACTUAL application-owned SQLite connection cleanly with WAL truncate (throws if checkpoint or close fails)
        dbModule.closeDatabase();

        // 5. Preserve the current failed database and associated WAL/SHM files for diagnosis
        const failTs = Date.now();
        const walPath = `${storageConfig.databasePath}-wal`;
        const shmPath = `${storageConfig.databasePath}-shm`;

        if (fs.existsSync(storageConfig.databasePath)) {
            failedPreservePath = `${storageConfig.databasePath}.failed.${failTs}`;
            try {
                fs.renameSync(storageConfig.databasePath, failedPreservePath);
                console.log(`[Admin Rollback] Preserved failed database at: ${failedPreservePath}`);
            } catch (err) {
                throw new Error(`Failed to preserve existing database before replacement: ${err.message}`);
            }
        }
        if (fs.existsSync(walPath)) {
            try {
                fs.renameSync(walPath, `${walPath}.failed.${failTs}`);
            } catch (err) {
                throw new Error(`Failed to preserve active WAL file before replacement: ${err.message}`);
            }
            if (fs.existsSync(walPath)) {
                throw new Error("Active WAL file still exists after preservation rename.");
            }
        }
        if (fs.existsSync(shmPath)) {
            try {
                fs.renameSync(shmPath, `${shmPath}.failed.${failTs}`);
            } catch (err) {
                throw new Error(`Failed to preserve active SHM file before replacement: ${err.message}`);
            }
            if (fs.existsSync(shmPath)) {
                throw new Error("Active SHM file still exists after preservation rename.");
            }
        }

        // Issue synchronous directory fsync flush on POSIX after preserving failed database and sidecars
        syncDirectory(targetDir);

        // Final pre-swap verification: ensure zero WAL/SHM sidecars exist
        if (fs.existsSync(walPath) || fs.existsSync(shmPath)) {
            throw new Error("Stale WAL/SHM sidecars detected immediately before database replacement.");
        }

        // 6. Atomic replacement: rename validated staged file to live database path (strictly no copy fallback)
        try {
            fs.renameSync(stagingPath, storageConfig.databasePath);
        } catch (renameErr) {
            throw new Error(`Failed to place staged database into live path via atomic rename: ${renameErr.message}`);
        }

        // Issue synchronous fsync flush requests for replaced live database and directory
        syncFileAndDirectory(storageConfig.databasePath, targetDir);

        // Clean stale WAL/SHM files if any were created during replacement
        if (fs.existsSync(walPath)) {
            try { fs.unlinkSync(walPath); } catch (err) {
                throw new Error(`Failed to clean residual WAL after replacement: ${err.message}`);
            }
        }
        if (fs.existsSync(shmPath)) {
            try { fs.unlinkSync(shmPath); } catch (err) {
                throw new Error(`Failed to clean residual SHM after replacement: ${err.message}`);
            }
        }

        // 7. Reopen SQLite connection while keeping maintenance mode active
        dbModule.initializeDatabase(true);
        const newDb = dbModule.getDb(true);
        if (!newDb) {
            throw new Error("Failed to reinitialize database connection after rollback swap.");
        }

        // 8. Verify SQLite integrity and foreign keys on restored live database
        const postIntegrity = newDb.pragma("integrity_check");
        if (postIntegrity[0]?.integrity_check !== "ok") {
            throw new Error(`Rolled-back database failed post-swap integrity check: ${JSON.stringify(postIntegrity)}`);
        }

        const postFk = newDb.pragma("foreign_key_check");
        if (postFk.length > 0) {
            throw new Error(`Rolled-back database failed post-swap foreign key check: ${JSON.stringify(postFk)}`);
        }

        // 9. Independently verify expected record counts on live database for all 8 tables
        const getLiveCount = (tbl) => newDb.prepare(`SELECT COUNT(*) as c FROM "${tbl}"`).get().c;
        const liveCounts = {
            threadlines: getLiveCount("threadlines"),
            conversations: getLiveCount("conversations"),
            messages: getLiveCount("messages"),
            conversation_chunks: getLiveCount("conversation_chunks"),
            messages_fts: getLiveCount("messages_fts"),
            chunks_fts: getLiveCount("chunks_fts"),
            imports: getLiveCount("imports"),
            timeline_events: getLiveCount("timeline_events")
        };

        const requiredTables = [
            "threadlines",
            "conversations",
            "messages",
            "conversation_chunks",
            "messages_fts",
            "chunks_fts",
            "imports",
            "timeline_events"
        ];

        for (const tbl of requiredTables) {
            if (liveCounts[tbl] !== expectedCounts[tbl]) {
                throw new Error(
                    `Post-rollback record count mismatch for table '${tbl}'. Expected: ${expectedCounts[tbl]}, live: ${liveCounts[tbl]}`
                );
            }
        }

        // 10. Confirm database is operational
        newDb.prepare("SELECT id FROM threadlines LIMIT 1").get();

        // 11. ONLY THEN clear the pending restore marker (lift maintenance mode)
        storageConfig.clearPendingRestore();

        console.log("[Admin Rollback] Rollback completed, fully verified, operational, and maintenance mode cleared.");
        res.json({
            status: "success",
            message: "Production database successfully rolled back, fully verified, and live.",
            targetPath: storageConfig.databasePath,
            restoredFrom: rawFilename,
            backupSha256,
            backupSizeBytes: backupStat.size,
            failedDatabasePreservedAt: failedPreservePath || "none",
            verifiedCounts: liveCounts,
            integrityCheck: postIntegrity,
            foreignKeyCheck: "ok"
        });

    } catch (err) {
        console.error("[Admin Rollback] Rollback failed:", err.message);
        // CRITICAL INTERRUPT-SAFE PRESERVATION:
        // If live database was already preserved away (failedPreservePath is set),
        // DO NOT delete stagingPath! Preserving stagingPath ensures that operator/restart
        // has the intact staging file available alongside the preserved failed database.
        if (!failedPreservePath) {
            if (stagingPath && fs.existsSync(stagingPath)) {
                try { fs.unlinkSync(stagingPath); } catch (_) {}
            }
        } else {
            console.warn(`[Admin Rollback] Retaining staged backup copy at '${stagingPath}' and failed database at '${failedPreservePath}' for diagnosis/recovery.`);
        }
        res.status(500).json({
            status: "error",
            message: err.message,
            maintenanceMode: storageConfig.isPendingRestore() ? "active" : "inactive",
            failedDatabasePreservedAt: failedPreservePath || "none",
            stagingPreservedAt: (failedPreservePath && stagingPath && fs.existsSync(stagingPath)) ? stagingPath : "none"
        });
    }
});

module.exports = router;
