/*
    testDeleteThreadline.js

    Verification test suite for Threadline Deletion and Cascade Integrity:
    1. Ingest a standalone threadline with conversations, messages, participants,
       events, and linked segments.
    2. Ingest a separate archive/workspace to ensure cross-threadline data isolation.
    3. Verify all initial child records exist in SQLite.
    4. Call deleteThreadline for the target threadline.
    5. Verify target threadline is completely removed from threadlines table.
    6. Verify all child records (conversations, messages, participants, timeline_events, threadline_segments)
       for that threadline are purged (no orphaned records).
    7. Verify FTS5 virtual table (messages_fts) has purged the corresponding message rows.
    8. Verify separate archive and its messages remain completely intact and unaffected.
    9. Verify attempting to delete or access the deleted threadline returns not found / fails safely.
*/

const assert = require("assert");
const db = require("../database/database");
const threadlineService = require("../services/threadlines");

async function runDeleteTests() {
    console.log("==================================================");
    console.log(" TESTING: THREADLINE DELETION & CASCADE INTEGRITY");
    console.log("==================================================");

    const testUid = "user_delete_test_" + Date.now();
    const otherUid = "user_other_test_" + Date.now();

    // 1. Create a curated threadline
    const targetId = require("crypto").randomUUID();
    const now = new Date().toISOString();
    db.run(
        `INSERT INTO threadlines (id, owner_id, name, source, platform, created_at, updated_at, message_count, conversation_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [targetId, testUid, "Investigation Alpha", "Manual Creation", "Custom", now, now, 0, 0]
    );

    // 2. Create another threadline that should NOT be affected
    const otherId = require("crypto").randomUUID();
    db.run(
        `INSERT INTO threadlines (id, owner_id, name, source, platform, created_at, updated_at, message_count, conversation_count)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [otherId, otherUid, "Preserved Investigation Beta", "Manual Creation", "Custom", now, now, 0, 0]
    );

    console.log(`[Setup] Target threadline ID: ${targetId}`);
    console.log(`[Setup] Other threadline ID: ${otherId}`);

    // 3. Populate target threadline with child records
    const convId = "conv_target_" + require("crypto").randomUUID();
    db.run(
        `INSERT INTO conversations (id, threadline_id, platform, title, start_date, end_date, message_count, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [convId, targetId, "SMS", "+15551234567", 1000, 2000, 2, "{}"]
    );

    const partId = "part_target_" + require("crypto").randomUUID();
    db.run(
        `INSERT INTO participants (id, threadline_id, name, phone_number, email, platform_identifiers, aliases, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [partId, targetId, "John Doe", "+15551234567", null, "[]", "[]", "{}"]
    );

    db.run(
        `INSERT INTO conversation_participants (conversation_id, participant_id) VALUES (?, ?)`,
        [convId, partId]
    );

    const msgId1 = "msg_target_1_" + require("crypto").randomUUID();
    const msgId2 = "msg_target_2_" + require("crypto").randomUUID();
    db.run(
        `INSERT INTO messages (id, conversation_id, threadline_id, sender, recipient, timestamp, body, platform, direction)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [msgId1, convId, targetId, "+15551234567", "Me", 1000, "Secret meeting at 5", "SMS", "received"]
    );
    db.run(
        `INSERT INTO messages (id, conversation_id, threadline_id, sender, recipient, timestamp, body, platform, direction)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [msgId2, convId, targetId, "Me", "+15551234567", 2000, "Understood, see you there", "SMS", "sent"]
    );

    const eventId = "event_target_" + require("crypto").randomUUID();
    db.run(
        `INSERT INTO timeline_events (id, threadline_id, timestamp, type, title, description)
         VALUES (?, ?, ?, ?, ?, ?)`,
        [eventId, targetId, 1000, "message", "Meeting planned", "Secret meeting at 5"]
    );

    // Segment
    const segId = "seg_target_" + require("crypto").randomUUID();
    db.run(
        `INSERT INTO saved_segments (id, owner_id, conversation_id, title, description, start_time, end_time, created_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [segId, testUid, convId, "Important snippet", "Test segment", 1000, 2000, new Date().toISOString()]
    );
    db.run(
        `INSERT INTO threadline_segments (threadline_id, saved_segment_id) VALUES (?, ?)`,
        [targetId, segId]
    );

    // 4. Populate other threadline
    const otherConvId = "conv_other_" + require("crypto").randomUUID();
    db.run(
        `INSERT INTO conversations (id, threadline_id, platform, title, start_date, end_date, message_count, metadata)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [otherConvId, otherId, "SMS", "+15559876543", 3000, 4000, 1, "{}"]
    );
    const otherMsgId = "msg_other_" + require("crypto").randomUUID();
    db.run(
        `INSERT INTO messages (id, conversation_id, threadline_id, sender, recipient, timestamp, body, platform, direction)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [otherMsgId, otherConvId, otherId, "Alice", "Bob", 3500, "This must never be deleted", "SMS", "sent"]
    );

    // Verify initial counts
    const ftsBefore = db.query("SELECT * FROM messages_fts WHERE threadline_id = ?", [targetId]);
    assert.strictEqual(ftsBefore.length, 2, "FTS5 should have indexed target messages before deletion");
    console.log("✓ Pre-condition: FTS5 index contains target messages.");

    const msgsBefore = db.query("SELECT * FROM messages WHERE threadline_id = ?", [targetId]);
    assert.strictEqual(msgsBefore.length, 2, "Messages should exist before deletion");

    // 5. Execute deletion
    console.log("\n[Action] Executing threadlineService.deleteThreadline...");
    await threadlineService.deleteThreadline(testUid, targetId);
    console.log("✓ Deletion call returned successfully.");

    // 6. Verify target threadline is gone
    const targetRow = db.queryOne("SELECT * FROM threadlines WHERE id = ?", [targetId]);
    assert.strictEqual(targetRow, undefined, "Target threadline record must be deleted");
    console.log("✓ Target threadline row removed from threadlines table.");

    // 7. Verify all cascaded child records are gone
    const convsAfter = db.query("SELECT * FROM conversations WHERE threadline_id = ?", [targetId]);
    assert.strictEqual(convsAfter.length, 0, "All conversations of deleted threadline must be cascade-deleted");

    const msgsAfter = db.query("SELECT * FROM messages WHERE threadline_id = ?", [targetId]);
    assert.strictEqual(msgsAfter.length, 0, "All messages of deleted threadline must be cascade-deleted");

    const partsAfter = db.query("SELECT * FROM participants WHERE threadline_id = ?", [targetId]);
    assert.strictEqual(partsAfter.length, 0, "All participants of deleted threadline must be cascade-deleted");

    const eventsAfter = db.query("SELECT * FROM timeline_events WHERE threadline_id = ?", [targetId]);
    assert.strictEqual(eventsAfter.length, 0, "All timeline events of deleted threadline must be cascade-deleted");

    const segmentsAfter = db.query("SELECT * FROM threadline_segments WHERE threadline_id = ?", [targetId]);
    assert.strictEqual(segmentsAfter.length, 0, "All threadline_segments links must be cascade-deleted");
    console.log("✓ All dependent tables cascaded cleanly with 0 orphaned records.");

    // 8. Verify FTS5 trigger cleanup
    const ftsAfter = db.query("SELECT * FROM messages_fts WHERE threadline_id = ?", [targetId]);
    assert.strictEqual(ftsAfter.length, 0, "FTS5 table must have 0 rows for deleted threadline messages");
    console.log("✓ FTS5 virtual table synchronized and purged.");

    // 9. Verify other threadline is completely unharmed
    const otherRow = db.queryOne("SELECT * FROM threadlines WHERE id = ?", [otherId]);
    assert.ok(otherRow, "Other threadline must remain intact");

    const otherMsgs = db.query("SELECT * FROM messages WHERE threadline_id = ?", [otherId]);
    assert.strictEqual(otherMsgs.length, 1, "Other threadline messages must remain completely untouched");

    const otherFts = db.query("SELECT * FROM messages_fts WHERE threadline_id = ?", [otherId]);
    assert.strictEqual(otherFts.length, 1, "Other threadline FTS5 entries must remain intact");
    console.log("✓ Other threadlines and messages preserved without side-effects.");

    // 10. Verify deleting non-existent or foreign threadline throws safely
    let threwError = false;
    try {
        await threadlineService.deleteThreadline(testUid, targetId);
    } catch (e) {
        threwError = true;
    }
    assert.strictEqual(threwError, true, "Deleting non-existent threadline must throw an error");

    let foreignThrew = false;
    try {
        await threadlineService.deleteThreadline(testUid, otherId);
    } catch (e) {
        foreignThrew = true;
    }
    assert.strictEqual(foreignThrew, true, "Deleting threadline owned by another user must throw an error");
    console.log("✓ Security and authorization constraints enforced on deletion.");

    // Cleanup other test record
    await threadlineService.deleteThreadline(otherUid, otherId);

    console.log("\n==================================================");
    console.log(" ALL THREADLINE DELETION TESTS PASSED SUCCESSFULLY");
    console.log("==================================================");
}

runDeleteTests().catch(err => {
    console.error("Test failed with error:", err);
    process.exit(1);
});
