const assert = require("assert");
const db = require("./database");
const threadlineService = require("../services/threadlines");
const searchEngine = require("../search/searchEngine");
const crypto = require("crypto");

async function runIngestionTests() {
    try {
        console.log("Starting Threadline Ingestion & Direct Workspace Test Suite...");

        const testUid = "test_ingestion_uid";
        const threadlineId = crypto.randomUUID();

        // 1. Clean up any previous test state
        db.run("DELETE FROM threadlines WHERE owner_id = ?", [testUid]);
        db.run("DELETE FROM imports WHERE owner_id = ?", [testUid]);

        // 2. Prepare mock archive 1 (single message)
        const mockPayload1 = {
            filename: "sms_backup_part1.xml",
            fileSize: 1024,
            source: "sms_backup_part1.xml",
            platform: "SMS",
            messageCount: 1,
            conversationCount: 1,
            conversations: [{
                title: "+15559999",
                platform: "SMS",
                messages: [
                    { sender: "+15559999", direction: "received", timestamp: 1770000000000, body: "Unique test message body" }
                ],
                metadata: { contact: "Sarah Test" }
            }],
            messages: [
                { sender: "+15559999", direction: "received", timestamp: 1770000000000, body: "Unique test message body" }
            ]
        };

        // Ingest Archive 1 directly into the threadline workspace
        console.log("Ingesting archive 1...");
        const result1 = await threadlineService.ingestArchive(testUid, mockPayload1, mockPayload1.filename, mockPayload1.fileSize, threadlineId);
        assert.ok(result1.importId, "Should return an import ID");
        assert.strictEqual(result1.threadlineId, threadlineId, "Should ingest into the targeted threadline ID");

        // Verify message insertion
        const messagesCount1 = db.queryOne("SELECT COUNT(*) AS count FROM messages WHERE threadline_id = ?", [threadlineId]);
        assert.strictEqual(messagesCount1.count, 1, "Exactly one message should be inserted");

        const msgRecord = db.queryOne("SELECT * FROM messages WHERE threadline_id = ?", [threadlineId]);
        assert.strictEqual(msgRecord.body, "Unique test message body");

        // Verify message_imports provenance record
        const mappingsCount1 = db.queryOne("SELECT COUNT(*) AS count FROM message_imports WHERE message_id = ?", [msgRecord.id]);
        assert.strictEqual(mappingsCount1.count, 1, "Provenance mapping should link to the first import");

        console.log("[PASS] Ingested first archive successfully. Message count and provenance matches.");

        // 3. Prepare mock archive 2 (contains the duplicate message, plus one new message)
        const mockPayload2 = {
            filename: "sms_backup_part2.xml",
            fileSize: 2048,
            source: "sms_backup_part2.xml",
            platform: "SMS",
            messageCount: 2,
            conversationCount: 1,
            conversations: [{
                title: "+15559999",
                platform: "SMS",
                messages: [
                    { sender: "+15559999", direction: "received", timestamp: 1770000000000, body: "Unique test message body" },
                    { sender: "+15559999", direction: "sent", timestamp: 1770001000000, body: "New different test message body" }
                ],
                metadata: { contact: "Sarah Test" }
            }],
            messages: [
                { sender: "+15559999", direction: "received", timestamp: 1770000000000, body: "Unique test message body" },
                { sender: "+15559999", direction: "sent", timestamp: 1770001000000, body: "New different test message body" }
            ]
        };

        // Ingest Archive 2 into the same threadline workspace
        console.log("Ingesting archive 2 (containing duplicate)...");
        const result2 = await threadlineService.ingestArchive(testUid, mockPayload2, mockPayload2.filename, mockPayload2.fileSize, threadlineId);
        assert.ok(result2.importId, "Should return a second import ID");
        assert.strictEqual(result2.threadlineId, threadlineId, "Should ingest into the same threadline ID");

        // Verify deduplication
        const messagesCount2 = db.queryOne("SELECT COUNT(*) AS count FROM messages WHERE threadline_id = ?", [threadlineId]);
        assert.strictEqual(messagesCount2.count, 2, "Duplicate message was skipped; total workspace messages should be 2");

        // Verify multi-source mappings
        const mappingsCount2 = db.queryOne("SELECT COUNT(*) AS count FROM message_imports WHERE message_id = ?", [msgRecord.id]);
        assert.strictEqual(mappingsCount2.count, 2, "Duplicate message should now have two parent import sources in join table");

        console.log("[PASS] Ingested second archive with deduplication. Mapped 1 duplicate, inserted 1 new. Provenance is preserved.");

        // 4. Test FTS5 Search boundaries using searchEngine
        console.log("Testing search engine boundaries...");
        
        // Query search on this threadline
        const customResults = await searchEngine.search([threadlineId], "test", {});
        assert.strictEqual(customResults.length, 1, "Should find 1 conversation match group");
        assert.strictEqual(customResults[0].messageCount, 2, "Search on threadline should find both matching messages in group");

        // Clean up
        db.run("DELETE FROM threadlines WHERE owner_id = ?", [testUid]);
        db.run("DELETE FROM imports WHERE owner_id = ?", [testUid]);

        console.log("\nALL INGESTION & SEARCH CONSTRAINT TESTS PASSED!");
        process.exit(0);

    } catch (error) {
        console.error("Test failed with error:", error);
        process.exit(1);
    }
}

runIngestionTests();
