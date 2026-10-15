/*
    caseManager.js

    Authoritative Case File (.tl) Management Service for Threadline.
    Implements export and import of standalone portable SQLite .tl case files
    with cryptographic integrity manifests and schema versioning.
*/

const Database = require("better-sqlite3");
const crypto = require("crypto");
const fs = require("fs");
const path = require("path");
const mainDb = require("../database/database");

const TL_SPEC_VERSION = "1.0.0";

/**
 * Computes deterministic SHA-256 digest of messages in a threadline.
 */
function computeCaseChecksum(messages) {
    const hash = crypto.createHash("sha256");
    messages.forEach(m => {
        hash.update(`${m.timestamp}:${m.sender}:${m.body}`);
    });
    return hash.digest("hex");
}

/**
 * Exports a Threadline case from the main workspace database into a standalone portable .tl file.
 */
function exportCaseToFile(threadlineId, uid, destinationPath = null) {
    const { getAuthorizedUids } = require("./threadlines");
    const authorizedUids = getAuthorizedUids(uid);
    const tlRow = mainDb.queryOne("SELECT * FROM threadlines WHERE id = ?", [threadlineId]);
    const isArchive = threadlineId.startsWith("archive_") && authorizedUids.some(u => threadlineId === `archive_${u}`);
    if (!tlRow || (!isArchive && !authorizedUids.includes(tlRow.owner_id))) {
        const err = new Error("Threadline not found or access denied.");
        err.statusCode = 403;
        throw err;
    }

    const safeTitle = (tlRow.name || "case").replace(/[^a-z0-9_-]/gi, "_");
    const filename = `${safeTitle}_${Date.now()}.tl`;
    const targetPath = destinationPath || path.resolve(__dirname, `../uploads/${filename}`);

    const targetDir = path.dirname(targetPath);
    if (!fs.existsSync(targetDir)) fs.mkdirSync(targetDir, { recursive: true });

    if (fs.existsSync(targetPath)) fs.unlinkSync(targetPath);

    const tlDb = new Database(targetPath);
    try {
        tlDb.pragma("journal_mode = WAL");
        tlDb.pragma("foreign_keys = ON");

        // Initialize schema in the standalone .tl database
        const schemaPath = path.resolve(__dirname, "../database/schema.sql");
        const schemaSql = fs.readFileSync(schemaPath, "utf8");
        tlDb.exec(schemaSql);

        // Add case_manifest table
        tlDb.exec(`
            CREATE TABLE IF NOT EXISTS case_manifest (
                case_id TEXT PRIMARY KEY,
                case_name TEXT NOT NULL,
                spec_version TEXT NOT NULL,
                created_at TEXT NOT NULL,
                exported_at TEXT NOT NULL,
                exported_by TEXT NOT NULL,
                message_count INTEGER NOT NULL,
                conversation_count INTEGER NOT NULL,
                integrity_hash TEXT NOT NULL
            );
        `);

        // Create FTS5 virtual table
        tlDb.exec(`
            CREATE VIRTUAL TABLE IF NOT EXISTS messages_fts USING fts5(
                message_id UNINDEXED,
                threadline_id UNINDEXED,
                body
            );
        `);

        // Fetch authoritative records from main database
        const convs = mainDb.query("SELECT * FROM conversations WHERE threadline_id = ?", [threadlineId]);
        const parts = mainDb.query("SELECT * FROM participants WHERE threadline_id = ?", [threadlineId]);
        const convParts = mainDb.query(
            `SELECT cp.* FROM conversation_participants cp
             JOIN conversations c ON cp.conversation_id = c.id
             WHERE c.threadline_id = ?`,
            [threadlineId]
        );
        const msgs = mainDb.query("SELECT * FROM messages WHERE threadline_id = ? ORDER BY timestamp ASC", [threadlineId]);
        const events = mainDb.query("SELECT * FROM timeline_events WHERE threadline_id = ? ORDER BY timestamp ASC", [threadlineId]);
        const imports = mainDb.query(
            `SELECT DISTINCT i.* FROM imports i
             JOIN message_imports mi ON i.id = mi.import_id
             JOIN messages m ON mi.message_id = m.id
             WHERE m.threadline_id = ?`,
            [threadlineId]
        );
        const msgImports = mainDb.query(
            `SELECT mi.* FROM message_imports mi
             JOIN messages m ON mi.message_id = m.id
             WHERE m.threadline_id = ?`,
            [threadlineId]
        );

        // Compute checksum
        const integrityHash = computeCaseChecksum(msgs);
        const now = new Date().toISOString();

        // Transactionally insert into .tl database
        const tx = tlDb.transaction(() => {
            tlDb.prepare(
                `INSERT INTO threadlines (id, owner_id, name, source, platform, created_at, updated_at, message_count, conversation_count)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
                tlRow.id,
                tlRow.owner_id,
                tlRow.name,
                tlRow.source,
                tlRow.platform,
                tlRow.created_at,
                tlRow.updated_at,
                msgs.length,
                convs.length
            );

            const insertPart = tlDb.prepare(
                `INSERT INTO participants (id, threadline_id, name, phone_number, email, platform_identifiers, aliases, metadata)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            );
            parts.forEach(p => {
                insertPart.run(p.id, p.threadline_id, p.name, p.phone_number, p.email, p.platform_identifiers, p.aliases, p.metadata);
            });

            const insertConv = tlDb.prepare(
                `INSERT INTO conversations (id, threadline_id, platform, title, start_date, end_date, message_count, metadata)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
            );
            convs.forEach(c => {
                insertConv.run(c.id, c.threadline_id, c.platform, c.title, c.start_date, c.end_date, c.message_count, c.metadata);
            });

            const insertCp = tlDb.prepare(
                `INSERT OR IGNORE INTO conversation_participants (conversation_id, participant_id) VALUES (?, ?)`
            );
            convParts.forEach(cp => {
                insertCp.run(cp.conversation_id, cp.participant_id);
            });

            const insertMsg = tlDb.prepare(
                `INSERT INTO messages (id, conversation_id, threadline_id, sender, recipient, timestamp, body, attachments, platform, direction, metadata)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            );
            const insertFts = tlDb.prepare(
                `INSERT INTO messages_fts (message_id, threadline_id, body) VALUES (?, ?, ?)`
            );
            msgs.forEach(m => {
                insertMsg.run(m.id, m.conversation_id, m.threadline_id, m.sender, m.recipient, m.timestamp, m.body, m.attachments, m.platform, m.direction, m.metadata);
                insertFts.run(m.id, m.threadline_id, m.body || "");
            });

            const insertEvent = tlDb.prepare(
                `INSERT INTO timeline_events (id, threadline_id, timestamp, type, source_id, title, description, sender, metadata)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            );
            events.forEach(e => {
                insertEvent.run(e.id, e.threadline_id, e.timestamp, e.type, e.source_id, e.title, e.description, e.sender, e.metadata);
            });

            const insertImp = tlDb.prepare(
                `INSERT OR IGNORE INTO imports (id, owner_id, filename, source, platform, file_size, message_count, participant_count, thread_count, earliest_timestamp, latest_timestamp, imported_at, status, errors)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
            );
            imports.forEach(i => {
                insertImp.run(i.id, i.owner_id, i.filename, i.source, i.platform, i.file_size, i.message_count, i.participant_count, i.thread_count, i.earliest_timestamp, i.latest_timestamp, i.imported_at, i.status, i.errors);
            });

            const insertMi = tlDb.prepare(
                `INSERT OR IGNORE INTO message_imports (message_id, import_id) VALUES (?, ?)`
            );
            msgImports.forEach(mi => {
                insertMi.run(mi.message_id, mi.import_id);
            });

            tlDb.prepare(
                `INSERT INTO case_manifest (case_id, case_name, spec_version, created_at, exported_at, exported_by, message_count, conversation_count, integrity_hash)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
            ).run(
                threadlineId,
                tlRow.name,
                TL_SPEC_VERSION,
                tlRow.created_at,
                now,
                uid,
                msgs.length,
                convs.length,
                integrityHash
            );
        });

        tx();

        const manifest = {
            caseId: threadlineId,
            caseName: tlRow.name,
            specVersion: TL_SPEC_VERSION,
            exportedAt: now,
            messageCount: msgs.length,
            conversationCount: convs.length,
            integrityHash
        };

        return {
            filePath: targetPath,
            filename,
            manifest
        };

    } finally {
        tlDb.close();
    }
}

/**
 * Imports a standalone portable .tl case file into the workspace database.
 */
function importCaseFromFile(tlFilePath, ownerId) {
    if (!fs.existsSync(tlFilePath)) {
        throw new Error("Specified .tl case file does not exist.");
    }

    const tlDb = new Database(tlFilePath, { readonly: true });
    try {
        const manifestTable = tlDb.prepare(
            `SELECT name FROM sqlite_master WHERE type='table' AND name='case_manifest'`
        ).get();

        if (!manifestTable) {
            throw new Error("Invalid .tl case file: Missing case_manifest table.");
        }

        const rawManifest = tlDb.prepare("SELECT * FROM case_manifest LIMIT 1").get();
        if (!rawManifest) {
            throw new Error("Invalid .tl case file: Empty case_manifest.");
        }

        // Verify message checksum integrity
        const msgs = tlDb.prepare("SELECT * FROM messages ORDER BY timestamp ASC").all();
        const calculatedHash = computeCaseChecksum(msgs);
        if (calculatedHash !== rawManifest.integrity_hash) {
            throw new Error("Case file integrity verification failed: Checksum mismatch. The file may be corrupt or tampered with.");
        }

        let targetThreadlineId = rawManifest.case_id;
        const existing = mainDb.queryOne("SELECT id FROM threadlines WHERE id = ?", [targetThreadlineId]);
        const needsRemap = Boolean(existing);
        if (needsRemap) {
            targetThreadlineId = crypto.randomUUID();
        }

        const tlRow = tlDb.prepare("SELECT * FROM threadlines LIMIT 1").get();
        const convs = tlDb.prepare("SELECT * FROM conversations").all();
        const parts = tlDb.prepare("SELECT * FROM participants").all();
        const convParts = tlDb.prepare("SELECT * FROM conversation_participants").all();
        const events = tlDb.prepare("SELECT * FROM timeline_events").all();
        const imports = tlDb.prepare("SELECT * FROM imports").all();
        const msgImports = tlDb.prepare("SELECT * FROM message_imports").all();

        // Create ID remap map if cloning into same DB
        const idMap = new Map();
        if (needsRemap) {
            convs.forEach(c => idMap.set(c.id, crypto.randomUUID()));
            parts.forEach(p => idMap.set(p.id, crypto.randomUUID()));
            msgs.forEach(m => idMap.set(m.id, crypto.randomUUID()));
            events.forEach(e => idMap.set(e.id, crypto.randomUUID()));
        }

        mainDb.transaction(() => {
            const now = new Date().toISOString();

            mainDb.run(
                `INSERT INTO threadlines (id, owner_id, name, source, platform, created_at, updated_at, message_count, conversation_count)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET updated_at = ?`,
                [
                    targetThreadlineId,
                    ownerId,
                    tlRow ? tlRow.name : rawManifest.case_name,
                    tlRow ? tlRow.source : "Imported .tl Case",
                    tlRow ? tlRow.platform : "Threadline Case",
                    rawManifest.created_at || now,
                    now,
                    msgs.length,
                    convs.length,
                    now
                ]
            );

            const insertPart = `INSERT OR IGNORE INTO participants (id, threadline_id, name, phone_number, email, platform_identifiers, aliases, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
            parts.forEach(p => {
                const partId = idMap.get(p.id) || p.id;
                mainDb.run(insertPart, [partId, targetThreadlineId, p.name, p.phone_number, p.email, p.platform_identifiers, p.aliases, p.metadata]);
            });

            const insertConv = `INSERT OR IGNORE INTO conversations (id, threadline_id, platform, title, start_date, end_date, message_count, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`;
            convs.forEach(c => {
                const convId = idMap.get(c.id) || c.id;
                mainDb.run(insertConv, [convId, targetThreadlineId, c.platform, c.title, c.start_date, c.end_date, c.message_count, c.metadata]);
            });

            const insertCp = `INSERT OR IGNORE INTO conversation_participants (conversation_id, participant_id) VALUES (?, ?)`;
            convParts.forEach(cp => {
                const convId = idMap.get(cp.conversation_id) || cp.conversation_id;
                const partId = idMap.get(cp.participant_id) || cp.participant_id;
                mainDb.run(insertCp, [convId, partId]);
            });

            const insertMsg = `INSERT OR IGNORE INTO messages (id, conversation_id, threadline_id, sender, recipient, timestamp, body, attachments, platform, direction, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            msgs.forEach(m => {
                const msgId = idMap.get(m.id) || m.id;
                const convId = idMap.get(m.conversation_id) || m.conversation_id;
                mainDb.run(insertMsg, [msgId, convId, targetThreadlineId, m.sender, m.recipient, m.timestamp, m.body, m.attachments, m.platform, m.direction, m.metadata]);
            });

            const insertEvent = `INSERT OR IGNORE INTO timeline_events (id, threadline_id, timestamp, type, source_id, title, description, sender, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            events.forEach(e => {
                const eventId = idMap.get(e.id) || e.id;
                const sourceMsgId = idMap.get(e.source_id) || e.source_id;
                mainDb.run(insertEvent, [eventId, targetThreadlineId, e.timestamp, e.type, sourceMsgId, e.title, e.description, e.sender, e.metadata]);
            });

            const insertImp = `INSERT OR IGNORE INTO imports (id, owner_id, filename, source, platform, file_size, message_count, participant_count, thread_count, earliest_timestamp, latest_timestamp, imported_at, status, errors) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`;
            imports.forEach(i => {
                mainDb.run(insertImp, [i.id, ownerId, i.filename, i.source, i.platform, i.file_size, i.message_count, i.participant_count, i.thread_count, i.earliest_timestamp, i.latest_timestamp, i.imported_at, i.status, i.errors]);
            });

            const insertMi = `INSERT OR IGNORE INTO message_imports (message_id, import_id) VALUES (?, ?)`;
            msgImports.forEach(mi => {
                const msgId = idMap.get(mi.message_id) || mi.message_id;
                mainDb.run(insertMi, [msgId, mi.import_id]);
            });
        });

        const manifest = {
            caseId: targetThreadlineId,
            caseName: tlRow ? tlRow.name : rawManifest.case_name,
            specVersion: rawManifest.spec_version,
            exportedAt: rawManifest.exported_at,
            messageCount: msgs.length,
            conversationCount: convs.length,
            integrityHash: rawManifest.integrity_hash
        };

        return {
            threadlineId: targetThreadlineId,
            name: tlRow ? tlRow.name : rawManifest.case_name,
            messageCount: msgs.length,
            conversationCount: convs.length,
            manifest
        };

    } finally {
        tlDb.close();
    }
}

module.exports = {
    exportCaseToFile,
    importCaseFromFile
};
