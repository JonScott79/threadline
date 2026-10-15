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

// 4. Validate and initialize directories safely
function ensureStorageReady() {
    const dbDir = path.dirname(databasePath);

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
    // If in production and a persistent dataDir or custom DATABASE_PATH is configured:
    // If the database does not exist, enter pendingRestore mode unless ALLOW_EMPTY_DB === "true"
    if (isProduction && (dataDir || process.env.DATABASE_PATH)) {
        const dbExists = fs.existsSync(databasePath);
        const allowEmpty = process.env.ALLOW_EMPTY_DB === "true";
        if (!dbExists && !allowEmpty) {
            pendingRestore = true;
            console.warn("");
            console.warn("================================================================================");
            console.warn(`[STORAGE NOTICE] Production database not found at '${databasePath}'.`);
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
    return pendingRestore;
}

function clearPendingRestore() {
    pendingRestore = false;
}

module.exports = {
    isProduction,
    dataDir,
    databasePath,
    uploadsDir,
    ensureStorageReady,
    isPendingRestore,
    clearPendingRestore
};
