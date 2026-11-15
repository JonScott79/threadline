/*
    database.js

    Local-first SQLite database initialization and connection manager.

    Responsibilities:
    - Establish connection to local SQLite database or Railway persistent volume.
    - Run schema migrations on startup.
    - Enable WAL mode for high performance.
    - Provide query execution helper handles.
    - Provide clean shutdown with WAL checkpointing on container restart/exit.
*/

// =====================================
// Imports
// =====================================

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");
const storageConfig = require("../config/storage");

// =====================================
// Variables
// =====================================

const dbPath = storageConfig.databasePath;
let db = null;

// =====================================
// Initialization
// =====================================

function initializeDatabase(force = false) {
    try {
        // Ensure storage directory is initialized and safe
        storageConfig.ensureStorageReady();

        if (storageConfig.isPendingRestore() && !force) {
            console.warn("Database initialization deferred: Server is in RESTORE_READY maintenance mode.");
            return;
        }

        const activeDbPath = storageConfig.databasePath;
        console.log(`Connecting to SQLite database at: ${activeDbPath}`);
        
        // Open the SQLite database file
        db = new Database(activeDbPath, {
            // Can add verbose logging if helpful for debugging
            // verbose: console.log
        });

        // Set busy timeout to prevent immediate lock errors under concurrent operations
        db.pragma("busy_timeout = 5000");

        // Enable write-ahead logging (WAL) for faster writes and concurrent reads
        db.pragma("journal_mode = WAL");
        
        // Enforce foreign key constraints
        db.pragma("foreign_keys = ON");

        // Load and run the schema SQL file
        const schemaPath = path.join(__dirname, "schema.sql");
        if (fs.existsSync(schemaPath)) {
            const schemaSql = fs.readFileSync(schemaPath, "utf8");
            db.exec(schemaSql);
            console.log("✓ Database schema verified and updated successfully.");

            // Robust Automatic Migrations for all core tables
            const migrations = [
                "ALTER TABLE threadlines ADD COLUMN owner_id TEXT;",
                "ALTER TABLE imports ADD COLUMN sha256 TEXT;",
                "ALTER TABLE imports ADD COLUMN discovered_count INTEGER DEFAULT 0;",
                "ALTER TABLE imports ADD COLUMN skipped_count INTEGER DEFAULT 0;",
                "ALTER TABLE imports ADD COLUMN provenance_metadata TEXT;",
                "ALTER TABLE messages ADD COLUMN timestamp_precision TEXT DEFAULT 'ms';",
                "ALTER TABLE messages ADD COLUMN timezone_offset INTEGER DEFAULT 0;",
                "ALTER TABLE participants ADD COLUMN aliases TEXT DEFAULT '[]';",
                "ALTER TABLE participants ADD COLUMN metadata TEXT DEFAULT '{}';"
            ];

            for (const migration of migrations) {
                try {
                    db.exec(migration);
                } catch (e) {
                    // Column already exists or already up-to-date, safely ignore
                }
            }

            try {
                db.exec("UPDATE threadlines SET owner_id = 'local' WHERE owner_id IS NULL;");
            } catch (e) {}

            // Create FTS5 virtual table for message body full-text search
            db.exec(`
                CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
                    message_id UNINDEXED,
                    threadline_id UNINDEXED,
                    body
                );
            `);

            // Create FTS5 virtual table for conversation chunks
            db.exec(`
                CREATE VIRTUAL TABLE IF NOT EXISTS chunks_fts USING fts5(
                    chunk_id UNINDEXED,
                    threadline_id UNINDEXED,
                    chunk_text
                );
            `);

            // Create FTS triggers to keep index in sync
            db.exec(`
                CREATE TRIGGER IF NOT EXISTS trg_messages_ai AFTER INSERT ON messages BEGIN
                    INSERT INTO messages_fts (message_id, threadline_id, body)
                    VALUES (new.id, new.threadline_id, new.body);
                END;

                CREATE TRIGGER IF NOT EXISTS trg_messages_ad AFTER DELETE ON messages BEGIN
                    DELETE FROM messages_fts WHERE message_id = old.id;
                END;

                CREATE TRIGGER IF NOT EXISTS trg_chunks_ad AFTER DELETE ON conversation_chunks BEGIN
                    DELETE FROM chunks_fts WHERE chunk_id = old.id;
                END;

                CREATE TRIGGER IF NOT EXISTS trg_messages_au AFTER UPDATE ON messages BEGIN
                    UPDATE messages_fts SET body = new.body WHERE message_id = old.id;
                END;
            `);

            // Clean up any historical orphaned FTS chunks from deleted threadlines
            try {
                const pruned = db.prepare("DELETE FROM chunks_fts WHERE chunk_id NOT IN (SELECT id FROM conversation_chunks)").run();
                if (pruned.changes > 0) {
                    console.log(`✓ Cleaned up ${pruned.changes} orphaned chunks_fts index records.`);
                }
            } catch (e) {}

            // Backfill FTS5 index if empty
            const ftsCount = db.prepare("SELECT COUNT(*) AS count FROM messages_fts;").get().count;
            if (ftsCount === 0) {
                const msgCount = db.prepare("SELECT COUNT(*) AS count FROM messages;").get().count;
                if (msgCount > 0) {
                    db.exec(`
                        INSERT INTO messages_fts (message_id, threadline_id, body)
                        SELECT id, threadline_id, body FROM messages;
                    `);
                    console.log(`✓ Backfilled FTS5 index with ${msgCount} existing messages.`);
                }
            }
        } else {
            console.warn("⚠️ Warning: schema.sql not found. Table creation skipped.");
        }

    } catch (error) {
        console.error("❌ Failed to initialize SQLite database:", error);
        throw error;
    }
}

// Automatically initialize when required
initializeDatabase();

// =====================================
// Public Methods
// =====================================

/**
 * Cleanly closes the active SQLite database instance with a WAL checkpoint.
 * Fails closed: throws if WAL checkpointing or database closure fails,
 * and confirms the connection is closed before clearing reference.
 */
function closeDatabase() {
    if (db) {
        console.log("Checkpointing SQLite WAL before closing...");
        try {
            const checkpointResult = db.pragma("wal_checkpoint(TRUNCATE)");
            if (Array.isArray(checkpointResult) && checkpointResult.length > 0) {
                if (checkpointResult[0].busy === 1) {
                    throw new Error("SQLite WAL checkpoint busy: active database transactions prevented truncate.");
                }
            }
        } catch (e) {
            console.error("Critical failure during WAL checkpoint:", e.message);
            throw new Error(`Failed to checkpoint SQLite WAL: ${e.message}`);
        }

        try {
            db.close();
            console.log("SQLite database connection closed cleanly.");
        } catch (e) {
            console.error("Critical failure closing SQLite connection:", e.message);
            throw new Error(`Failed to close SQLite database connection: ${e.message}`);
        }

        // Verify the database connection is confirmed closed
        if (db.open) {
            throw new Error("SQLite database connection handle reports open === true after close() execution.");
        }

        db = null;
    }
}

// Clean shutdown handlers for container redeployments
process.on("SIGTERM", () => {
    console.log("Received SIGTERM. Cleaning up SQLite connection...");
    try {
        closeDatabase();
    } catch (e) {
        console.error("Error during SIGTERM database cleanup:", e.message);
    }
});

process.on("SIGINT", () => {
    console.log("Received SIGINT. Cleaning up SQLite connection...");
    try {
        closeDatabase();
    } catch (e) {
        console.error("Error during SIGINT database cleanup:", e.message);
    }
});

/**
 * Returns the active SQLite database instance.
 * @param {boolean} allowPendingRestore - If true, permits database access during administrative restore/verification
 */
function getDb(allowPendingRestore = false) {
    if (!db) {
        initializeDatabase(allowPendingRestore);
    }
    if ((storageConfig.isPendingRestore() && !allowPendingRestore) || !db) {
        const err = new Error("Database is currently uninitialized or awaiting restore onto persistent volume.");
        err.statusCode = 503;
        throw err;
    }
    return db;
}

/**
 * Runs a query that returns multiple rows.
 */
function query(sql, params = []) {
    const stmt = getDb().prepare(sql);
    return stmt.all(params);
}

/**
 * Runs a query that returns a single row.
 */
function queryOne(sql, params = []) {
    const stmt = getDb().prepare(sql);
    return stmt.get(params);
}

/**
 * Runs an INSERT, UPDATE, or DELETE query.
 */
function run(sql, params = []) {
    const stmt = getDb().prepare(sql);
    return stmt.run(params);
}

/**
 * Runs multiple operations in a database transaction.
 */
function transaction(callback) {
    const tx = getDb().transaction(callback);
    return tx();
}

// =====================================
// Exports
// =====================================

module.exports = {
    getDb,
    initializeDatabase,
    query,
    queryOne,
    run,
    transaction,
    closeDatabase,
    dbPath
};
