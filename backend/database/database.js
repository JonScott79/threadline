/*
    database.js

    Local-first SQLite database initialization and connection manager.

    Responsibilities:
    - Establish connection to local SQLite database.
    - Run schema migrations on startup.
    - Enable WAL mode for high performance.
    - Provide query execution helper handles.
*/

// =====================================
// Imports
// =====================================

const Database = require("better-sqlite3");
const path = require("path");
const fs = require("fs");

// =====================================
// Variables
// =====================================

const dbPath = path.join(__dirname, "threadline.db");
let db = null;

// =====================================
// Initialization
// =====================================

function initializeDatabase() {
    try {
        console.log(`Connecting to SQLite database at: ${dbPath}`);
        
        // Open the SQLite database file
        db = new Database(dbPath, {
            // Can add verbose logging if helpful for debugging
            // verbose: console.log
        });

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

            // Migration: Add owner_id to threadlines if it doesn't exist
            try {
                db.exec("ALTER TABLE threadlines ADD COLUMN owner_id TEXT;");
                db.exec("UPDATE threadlines SET owner_id = 'local' WHERE owner_id IS NULL;");
                console.log("✓ Migration: Added owner_id column to threadlines table.");
            } catch (e) {
                // Column already exists, ignore
            }

            // Create FTS5 virtual table for message body full-text search
            db.exec(`
                CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
                    message_id UNINDEXED,
                    threadline_id UNINDEXED,
                    body
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

                CREATE TRIGGER IF NOT EXISTS trg_messages_au AFTER UPDATE ON messages BEGIN
                    UPDATE messages_fts SET body = new.body WHERE message_id = old.id;
                END;
            `);

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
 * Returns the active SQLite database instance.
 */
function getDb() {
    if (!db) {
        initializeDatabase();
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
    query,
    queryOne,
    run,
    transaction
};
