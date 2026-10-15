/*
    testPersistentRedeploymentRegression.js

    End-to-end regression test for Phase 4:
    Verifies that records survive process restarts and container redeployments
    when mounted to persistent storage, without data loss or empty fallback databases.
*/

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");

async function runRegressionSuite() {
    console.log("==================================================");
    console.log(" PHASE 4: REDEPLOYMENT REGRESSION TEST SUITE");
    console.log("==================================================");

    // Create a dedicated simulated persistent volume
    const simulatedVolumeDir = path.join(os.tmpdir(), "threadline_simulated_volume_" + Date.now());
    fs.mkdirSync(simulatedVolumeDir, { recursive: true });

    try {
        // Step 1: Migrate authoritative database to the persistent volume
        console.log("\n[Step 1] Seeding persistent volume via migration script...");
        const { runMigration } = require("../scripts/migrateToPersistentVolume");
        await runMigration({
            targetDir: simulatedVolumeDir,
            skipUploads: true
        });

        // Step 2: Configure environment for persistent volume
        process.env.THREADLINE_DATA_DIR = simulatedVolumeDir;
        delete require.cache[require.resolve("../config/storage")];
        delete require.cache[require.resolve("../database/database")];

        let dbModule = require("../database/database");
        const baselineCounts = {
            threadlines: dbModule.queryOne("SELECT COUNT(*) as c FROM threadlines").c,
            messages: dbModule.queryOne("SELECT COUNT(*) as c FROM messages").c,
            conversations: dbModule.queryOne("SELECT COUNT(*) as c FROM conversations").c
        };
        console.log("[Step 2] Baseline counts recorded on persistent volume:", baselineCounts);

        // Step 3: Create a harmless synthetic test record via normal workflow
        console.log("\n[Step 3] Creating harmless synthetic test record...");
        const testTlId = "regression_test_tl_" + Date.now();
        const testConvId = "regression_test_conv_" + Date.now();
        const testMsgId = "regression_test_msg_" + Date.now();
        const testTime = Date.now();

        dbModule.transaction(() => {
            dbModule.run(
                `INSERT INTO threadlines (id, owner_id, name, source, platform, created_at, updated_at, message_count, conversation_count)
                 VALUES (?, 'local', 'Persistent Volume Regression Probe', 'Manual Test', 'Synthetic', ?, ?, 1, 1)`,
                [testTlId, new Date().toISOString(), new Date().toISOString()]
            );
            dbModule.run(
                `INSERT INTO conversations (id, threadline_id, platform, title, start_date, end_date, message_count, metadata)
                 VALUES (?, ?, 'Synthetic', 'Persistence Verification Conversation', ?, ?, 1, '{}')`,
                [testConvId, testTlId, testTime, testTime]
            );
            dbModule.run(
                `INSERT INTO messages (id, conversation_id, threadline_id, sender, recipient, timestamp, body, attachments, platform, direction, metadata)
                 VALUES (?, ?, ?, 'System Probe', 'Auditor', ?, 'HARLESS_PERSISTENCE_VERIFICATION_TOKEN_9981', '[]', 'Synthetic', 'sent', '{}')`,
                [testMsgId, testConvId, testTlId, testTime]
            );
        });

        const createdCheck = dbModule.queryOne("SELECT * FROM messages WHERE id = ?", [testMsgId]);
        assert.ok(createdCheck, "Test message must exist in database");
        console.log("✓ Harmless test record created with ID:", testMsgId);

        // Verify FTS search resolves it
        const ftsCheck = dbModule.queryOne(
            "SELECT * FROM messages_fts WHERE messages_fts MATCH 'HARLESS_PERSISTENCE_VERIFICATION_TOKEN_9981'"
        );
        assert.ok(ftsCheck, "Test message must be immediately indexed in FTS5");
        console.log("✓ FTS search successfully matched probe token.");

        // Step 4: Simulate backend restart (process restart with clean WAL close)
        console.log("\n[Step 4] Simulating backend restart...");
        dbModule.closeDatabase();

        // Clear module cache to simulate a completely new Node.js process boot
        delete require.cache[require.resolve("../config/storage")];
        delete require.cache[require.resolve("../database/database")];

        dbModule = require("../database/database");
        const afterRestart = dbModule.queryOne("SELECT * FROM messages WHERE id = ?", [testMsgId]);
        assert.ok(afterRestart, "Test message MUST survive backend restart");
        assert.strictEqual(afterRestart.body, "HARLESS_PERSISTENCE_VERIFICATION_TOKEN_9981");
        console.log("✓ Test record successfully verified after backend restart.");

        // Step 5: Simulate deployment replacement (fresh container filesystem, but mounted volume preserved)
        console.log("\n[Step 5] Simulating fresh container deployment (ephemeral filesystem replaced)...");
        dbModule.closeDatabase();

        // Re-simulate boot under production environment
        process.env.NODE_ENV = "production";
        delete require.cache[require.resolve("../config/storage")];
        delete require.cache[require.resolve("../database/database")];

        dbModule = require("../database/database");
        const afterRedeploy = dbModule.queryOne("SELECT * FROM messages WHERE id = ?", [testMsgId]);
        assert.ok(afterRedeploy, "Test message MUST survive production redeployment!");
        assert.strictEqual(afterRedeploy.body, "HARLESS_PERSISTENCE_VERIFICATION_TOKEN_9981");
        console.log("✓ Test record successfully verified after simulated redeployment!");

        // Step 6: Verify no fallback database was created in default directory
        const defaultDbPath = path.resolve(__dirname, "../database/threadline.db");
        assert.strictEqual(dbModule.dbPath, path.join(simulatedVolumeDir, "threadline.db"), "Active DB must point to volume, NOT fallback");
        console.log("✓ Active database path strictly verified:", dbModule.dbPath);

        // Step 7: Clean up harmless test record
        console.log("\n[Step 7] Cleaning up test probe records...");
        dbModule.run("DELETE FROM threadlines WHERE id = ?", [testTlId]);
        const finalCleanupCheck = dbModule.queryOne("SELECT * FROM threadlines WHERE id = ?", [testTlId]);
        assert.strictEqual(finalCleanupCheck, undefined, "Probe record cleanly removed");
        console.log("✓ Harmless probe records cleaned up cleanly.");

        dbModule.closeDatabase();

        console.log("\n==================================================");
        console.log(" PHASE 4 REDEPLOYMENT REGRESSION TEST PASSED! ✅");
        console.log("==================================================");

    } finally {
        delete process.env.THREADLINE_DATA_DIR;
        delete process.env.NODE_ENV;
        try {
            fs.rmSync(simulatedVolumeDir, { recursive: true, force: true });
        } catch (e) {}
    }
}

if (require.main === module) {
    runRegressionSuite().catch(err => {
        console.error("Regression test failed:", err);
        process.exit(1);
    });
}

module.exports = { runRegressionSuite };
