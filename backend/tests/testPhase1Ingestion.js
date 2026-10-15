const assert = require("assert");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const { parseSMSBackup } = require("../parsers/smsbackup");
const { buildConversations } = require("../engines/conversationBuilder");
const { processImport } = require("../engines/importEngine");
const { ingestArchive } = require("../services/threadlines");
const db = require("../database/database");

async function runAllTests() {
    console.log("==================================================");
    console.log(" RUNNING: PHASE 1 INGESTION & DATA MODEL TESTS");
    console.log("==================================================");

    // ----------------------------------------------------
    // TEST 1: SMS Backup XML Parsing & Sender Identification
    // ----------------------------------------------------
    console.log("1. Testing sample.xml parsing and sender/recipient mapping...");
    const samplePath = path.resolve(__dirname, "../../../sample.xml");
    const sampleResult = await parseSMSBackup(samplePath);

    assert.strictEqual(sampleResult.discoveredCount, 3, "Should discover 3 messages in sample.xml");
    assert.strictEqual(sampleResult.messages.length, 3, "Should parse 3 messages");

    const msg1 = sampleResult.messages[0]; // Alice (received)
    assert.strictEqual(msg1.direction, "received");
    assert.strictEqual(msg1.sender, "+15551234567");
    assert.strictEqual(msg1.recipient, "Me");
    assert.strictEqual(msg1.metadata.contact, "Alice");

    const msg2 = sampleResult.messages[1]; // Bob (sent)
    assert.strictEqual(msg2.direction, "sent");
    assert.strictEqual(msg2.sender, "Me");
    assert.strictEqual(msg2.recipient, "+15557654321");
    assert.strictEqual(msg2.metadata.contact, "Bob");

    console.log("✓ Test 1 Passed: Sent and received messages correctly distinguish 'Me' from counterparty.");

    // ----------------------------------------------------
    // TEST 2: Two-Way Conversation Continuity (No Fracturing)
    // ----------------------------------------------------
    console.log("2. Testing two-way dialogue conversation continuity...");

    const twoWayXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<smses count="4" backup_set="Two-Way Test" backup_date="1752430000000">
    <sms address="+15551234567" date="1752420000000" type="1" body="Are you coming to the meeting?" contact_name="Alice" />
    <sms address="+15551234567" date="1752420060000" type="2" body="Yes, on my way now." contact_name="Alice" />
    <sms address="+15551234567" date="1752420120000" type="1" body="Great, see you in room 3." contact_name="Alice" />
    <sms address="+15551234567" date="1752420180000" type="2" body="Perfect." contact_name="Alice" />
</smses>`;

    const tempTwoWayPath = path.resolve(__dirname, "temp_two_way.xml");
    fs.writeFileSync(tempTwoWayPath, twoWayXml, "utf8");

    try {
        const twoWayParsed = await parseSMSBackup(tempTwoWayPath);
        assert.strictEqual(twoWayParsed.messages.length, 4, "Should parse 4 messages");

        const convs = buildConversations(twoWayParsed.messages);
        assert.strictEqual(convs.length, 1, `Two-way dialogue must NOT be fractured into multiple threads! Expected 1 conversation, got ${convs.length}`);

        const aliceConv = convs[0];
        assert.strictEqual(aliceConv.messages.length, 4, "All 4 messages must reside in the single conversation");
        assert.strictEqual(aliceConv.messages[0].direction, "received");
        assert.strictEqual(aliceConv.messages[1].direction, "sent");
        assert.strictEqual(aliceConv.messages[2].direction, "received");
        assert.strictEqual(aliceConv.messages[3].direction, "sent");

        for (let i = 1; i < aliceConv.messages.length; i++) {
            assert(aliceConv.messages[i].timestamp >= aliceConv.messages[i - 1].timestamp, "Messages must be in chronological order");
        }

        console.log("✓ Test 2 Passed: Two-way conversation preserved in a single coherent thread without fracturing.");
    } finally {
        if (fs.existsSync(tempTwoWayPath)) fs.unlinkSync(tempTwoWayPath);
    }

    // ----------------------------------------------------
    // TEST 3: MMS and Group Message Extraction
    // ----------------------------------------------------
    console.log("3. Testing MMS multimedia and group message parsing...");

    const mmsXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<smses count="2">
    <sms address="+15551111111" date="1752420000000" type="1" body="Hey group planning starting soon" contact_name="Charlie" />
    <mms date="1752420060000" msg_box="1" contact_name="Project Team" address="+15551111111~+15552222222~+15553333333">
        <parts>
            <part ct="text/plain" text="Here is the itinerary for the weekend!" />
            <part ct="image/png" name="map.png" cl="map.png" data="iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==" />
        </parts>
        <addrs>
            <addr address="+15551111111" type="137" />
            <addr address="+15552222222" type="151" />
            <addr address="+15553333333" type="151" />
            <addr address="insert-address-token" type="151" />
        </addrs>
    </mms>
</smses>`;

    const tempMmsPath = path.resolve(__dirname, "temp_mms.xml");
    fs.writeFileSync(tempMmsPath, mmsXml, "utf8");

    try {
        const mmsParsed = await parseSMSBackup(tempMmsPath);
        assert.strictEqual(mmsParsed.messages.length, 2, "Should parse 1 SMS and 1 MMS");

        const mmsMsg = mmsParsed.messages[1];
        assert.strictEqual(mmsMsg.platform, "MMS", "Platform should be MMS");
        assert.strictEqual(mmsMsg.direction, "received", "Direction should be received");
        assert.strictEqual(mmsMsg.sender, "+15551111111", "MMS sender should be +15551111111");
        assert.strictEqual(mmsMsg.body, "Here is the itinerary for the weekend!", "Text part extracted");
        assert.strictEqual(mmsMsg.attachments.length, 1, "Should extract 1 media attachment");
        assert.strictEqual(mmsMsg.attachments[0].mimeType, "image/png");
        assert.strictEqual(mmsMsg.attachments[0].fileName, "map.png");
        assert.strictEqual(mmsMsg.metadata.isGroup, true, "Should identify as group conversation");

        const convs = buildConversations(mmsParsed.messages);
        assert.strictEqual(convs.length, 2, "Should create 1 SMS conversation and 1 MMS group conversation");

        const groupConv = convs.find(c => c.platform === "MMS");
        assert(groupConv, "MMS group conversation must exist");
        assert(groupConv.participants.includes("+15551111111"), "Group includes sender");
        assert(groupConv.participants.includes("+15552222222"), "Group includes recipient 1");
        assert(groupConv.participants.includes("+15553333333"), "Group includes recipient 2");

        console.log("✓ Test 3 Passed: MMS messages, text parts, image attachments, and group participants successfully extracted.");
    } finally {
        if (fs.existsSync(tempMmsPath)) fs.unlinkSync(tempMmsPath);
    }

    // ----------------------------------------------------
    // TEST 4: SQLite Database Ingestion & Participant Mapping
    // ----------------------------------------------------
    console.log("4. Testing database ingestion and participant relationships...");

    const testUid = `phase1_test_${Date.now()}`;
    const archive = await processImport(samplePath);

    const result = await ingestArchive(testUid, archive, "sample.xml", 958);
    assert(result.threadlineId, "Ingestion must return threadlineId");
    assert.strictEqual(result.stats.imported, 3, "Must import 3 messages");

    const participants = db.query("SELECT * FROM participants WHERE threadline_id = ?", [result.threadlineId]);
    assert(participants.length >= 4, "Should have Me, Alice, Bob, Sarah participants");
    const mePart = participants.find(p => p.name === "Me");
    assert(mePart, "'Me' participant record must exist");

    const cpMappings = db.query(
        `SELECT cp.conversation_id, p.name 
         FROM conversation_participants cp 
         JOIN participants p ON cp.participant_id = p.id
         WHERE p.threadline_id = ?`,
        [result.threadlineId]
    );
    assert(cpMappings.length >= 6, "Each conversation must map to 'Me' and its respective counterparty");

    const dbMsgs = db.query("SELECT * FROM messages WHERE threadline_id = ? ORDER BY timestamp ASC", [result.threadlineId]);
    assert.strictEqual(dbMsgs.length, 3, "Database must store all 3 messages");

    const sentMsg = dbMsgs.find(m => m.direction === "sent");
    assert.strictEqual(sentMsg.sender, "Me", "Sent message sender in DB must be 'Me'");
    assert.strictEqual(sentMsg.recipient, "+15557654321", "Sent message recipient in DB must be Bob");

    // Verify deduplication on re-import
    const reimportResult = await ingestArchive(testUid, archive, "sample.xml", 958, result.threadlineId);
    assert.strictEqual(reimportResult.stats.imported, 0, "Re-import should import 0 new messages");
    assert.strictEqual(reimportResult.stats.skipped, 3, "Re-import should skip 3 duplicate messages");

    // Clean up test threadline
    db.run("DELETE FROM threadlines WHERE id = ?", [result.threadlineId]);
    console.log("✓ Test 4 Passed: Database ingestion, participant relationships, and deduplication verified.");

    console.log("==================================================");
    console.log(" ALL PHASE 1 INGESTION TESTS PASSED! ✅");
    console.log("==================================================");
}

runAllTests().catch(err => {
    console.error("Test execution failed:", err);
    process.exit(1);
});
