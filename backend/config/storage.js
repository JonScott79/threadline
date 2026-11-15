/*
    storage.js

    Authoritative Storage Configuration for Threadline.
    Resolves persistent paths for SQLite database and uploaded archives.

    Persistent Storage Strategy:
    - Railway Volume / Docker: Mount a persistent volume (e.g., /data).
      Configure THREADLINE_DATA_DIR=/data (or DATA_DIR or RAILWAY_VOLUME_MOUNT_PATH).
      - Database: path.join(dataDir, "threadline.db") or explicit DATABASE_PATH
      - Uploads: path.join(dataDir, "uploads") or explicit UPLOADS_DIR

    - Local Development:
      Falls back to relative paths inside the project repository:
      - Database: path.resolve(__dirname, "../database/threadline.db")
      - Uploads: path.resolve(__dirname, "../uploads")

    Production Safety & Maintenance Mode:
    - If in production (NODE_ENV === 'production' or RAILWAY_ENVIRONMENT),
      verifies that the persistent volume directory exists.
    - If the configured production database file is missing and ALLOW_EMPTY_DB !== 'true',
      enters pendingRestore mode: starts Express to allow health checks and admin database
      restoration without crashing, while guarding user endpoints with 503.
*/

const path = require("path");
const fs = require("fs");

const isProduction = process.env.NODE_ENV === "production" || !!process.env.RAILWAY_ENVIRONMENT;

// 1. Resolve base data directory if persistent volume attached
const dataDir = process.env.THREADLINE_DATA_DIR || 
                process.env.DATA_DIR || 
                process.env.RAILWAY_VOLUME_MOUNT_PATH || 
                null;

// 2. Resolve database path
let databasePath = process.env.DATABASE_PATH;
if (!databasePath) {
    if (dataDir) {
        databasePath = path.join(dataDir, "threadline.db");
    } else {
        databasePath = path.resolve(__dirname, "../database/threadline.db");
    }
}

// 3. Resolve uploads directory
let uploadsDir = process.env.UPLOADS_DIR;
if (!uploadsDir) {
    if (dataDir) {
        uploadsDir = path.join(dataDir, "uploads");
    } else {
        uploadsDir = path.resolve(__dirname, "../uploads");
    }
}

let pendingRestore = false;

function getMarkerPath() {
    const currentDbPath = (module.exports && module.exports.databasePath) || databasePath;
    return path.join(path.dirname(currentDbPath), ".restore_pending");
}

// 4. Validate and initialize directories safely
function ensureStorageReady() {
    const currentDbPath = (module.exports && module.exports.databasePath) || databasePath;
    const dbDir = path.dirname(currentDbPath);

    if (dataDir && !fs.existsSync(dbDir)) {
        try {
            fs.mkdirSync(dbDir, { recursive: true });
        } catch (err) {
            console.error(`[CRITICAL STORAGE ERROR] Failed to create database directory at '${dbDir}': ${err.message}`);
        }
    }

    if (!fs.existsSync(uploadsDir)) {
        try {
            fs.mkdirSync(uploadsDir, { recursive: true });
        } catch (err) {
            console.error(`[CRITICAL STORAGE ERROR] Failed to create uploads directory at '${uploadsDir}': ${err.message}`);
        }
    }

    // Safety check against silent data loss:
    // 1. Check if persistent .restore_pending marker exists on disk
    if (fs.existsSync(getMarkerPath())) {
        pendingRestore = true;
        console.warn("");
        console.warn("================================================================================");
        console.warn(`[STORAGE NOTICE] Active .restore_pending marker found at '${getMarkerPath()}'.`);
        console.warn(`Server starting in RESTORE_READY maintenance mode.`);
        console.warn(`User endpoints will return 503 until database restore/verification completes.`);
        console.warn("================================================================================");
        console.warn("");
        return;
    }

    // 2. If in production and a persistent dataDir or custom DATABASE_PATH is configured:
    // If the database does not exist, enter pendingRestore mode unless ALLOW_EMPTY_DB === "true"
    if (isProduction && (dataDir || process.env.DATABASE_PATH)) {
        const dbExists = fs.existsSync(currentDbPath);
        const allowEmpty = process.env.ALLOW_EMPTY_DB === "true";
        if (!dbExists && !allowEmpty) {
            pendingRestore = true;
            console.warn("");
            console.warn("================================================================================");
            console.warn(`[STORAGE NOTICE] Production database not found at '${currentDbPath}'.`);
            console.warn(`Server starting in RESTORE_READY maintenance mode to accept database restoration.`);
            console.warn(`User endpoints will return 503 until /api/admin/restore-database completes.`);
            console.warn("================================================================================");
            console.warn("");
            return;
        }
    }
    pendingRestore = false;
}

function isPendingRestore() {
    try {
        if (fs.existsSync(getMarkerPath())) {
            return true;
        }
    } catch (_) {}
    return pendingRestore;
}

function setPendingRestore() {
    // 1. Immediately lock in-memory maintenance mode flag so current process fails closed
    pendingRestore = true;

    try {
        const mp = getMarkerPath();
        const dir = path.dirname(mp);

        // 2. Ensure marker directory exists
        if (!fs.existsSync(dir)) {
            fs.mkdirSync(dir, { recursive: true });
        }
        if (!fs.existsSync(dir)) {
            throw new Error(`Marker directory '${dir}' could not be verified.`);
        }

        // 3. Write persistent marker file
        const payload = JSON.stringify({
            pendingSince: new Date().toISOString(),
            pid: process.pid
        });
        fs.writeFileSync(mp, payload, "utf8");

        // 4. Verify marker exists on disk and contains valid data
        if (!fs.existsSync(mp)) {
            throw new Error(`Persistent marker '${mp}' was not found after write.`);
        }

        const readBack = fs.readFileSync(mp, "utf8");
        const parsed = JSON.parse(readBack);
        if (!parsed || !parsed.pendingSince) {
            throw new Error(`Persistent marker '${mp}' contains invalid payload: ${readBack}`);
        }
    } catch (err) {
        // Application remains in maintenance mode (pendingRestore = true)
        console.error(`[CRITICAL STORAGE ERROR] Failed to establish persistent maintenance marker: ${err.message}`);
        throw new Error(`Failed to establish persistent maintenance marker: ${err.message}`);
    }
}

function clearPendingRestore() {
    try {
        const mp = getMarkerPath();
        if (fs.existsSync(mp)) {
            fs.unlinkSync(mp);
        }

        // 1. Verify marker is strictly absent
        if (fs.existsSync(mp)) {
            throw new Error(`Persistent marker '${mp}' still exists on disk after unlink attempt.`);
        }

        // 2. Only after confirmed disk removal do we clear the in-memory flag
        pendingRestore = false;
    } catch (err) {
        // Marker removal failed: retain maintenance mode (fail-closed)
        pendingRestore = true;
        console.error(`[CRITICAL STORAGE ERROR] Failed to clear persistent maintenance marker: ${err.message}`);
        throw new Error(`Failed to clear persistent maintenance marker: ${err.message}`);
    }
}

module.exports = {
    isProduction,
    dataDir,
    databasePath,
    uploadsDir,
    ensureStorageReady,
    isPendingRestore,
    setPendingRestore,
    clearPendingRestore
};
