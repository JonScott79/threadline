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
