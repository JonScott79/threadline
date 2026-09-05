/*
    testEventClusterer.js

    Tests the EventClusterer model and conservative clustering behavior:
    1. Ingests three distinct conversations:
       - Leila ↔ User
       - Darcy ↔ User
       - John ↔ User
    2. Includes messages discussing a common event/topic (concert planning and coordination).
    3. Verifies they merge into ONE single Event Cluster.
    4. Verifies all constituent messages are chronologically ordered across conversations.
    5. Verifies 100% forensic source preservation (unaltered IDs, conversation IDs, timestamps, bodies).
    6. Verifies match reasons are present on each constituent message.
    7. Adds another conversation discussing the same concept (concert) but months later (separate event).
    8. Verifies it remains a SEPARATE cluster.
    9. Adds an unrelated message from one of the same participants (Darcy) during the same week.
    10. Verifies it is NOT automatically pulled into the concert cluster (conservative clustering invariant).
*/

const assert = require("assert");
const crypto = require("crypto");
const db = require("../database/database");
const threadlineService = require("../services/threadlines");
const searchEngine = require("../search/searchEngine");
const eventClusterer = require("../search/eventClusterer");

async function runTests() {
    console.log("==========================================");
    console.log(" TESTING: EVENT CLUSTERER (SMART SEARCH STEP 1)");
    console.log("==========================================");

    const testUid = "user_event_cluster_test";
    const threadlineId = `archive_${testUid}`;

    // Clean prior test state
    db.run("DELETE FROM threadlines WHERE owner_id = ?", [testUid]);

    // Construct mock archive with 4 conversations:
    // Conv 1: Leila (Concert planning on Oct 10, 2026)
    // Conv 2: Darcy (Concert tickets & ride on Oct 10, 2026 + an unrelated message Oct 11)
    // Conv 3: John (Concert meetup outside venue on Oct 10, 2026)
    // Conv 4: Alex (Separate concert discussion in May 2026, months earlier)
    const baseOctTime = new Date("2026-10-10T18:00:00Z").getTime();
    const mockPayload = {
        filename: "test_event_cluster.json",
        fileSize: 4096,
        source: "Event Cluster Test",
        platform: "SMS",
        messageCount: 6,
        conversationCount: 4,
        conversations: [
            {
                title: "Leila",
                platform: "SMS",
                metadata: { contact: "Leila" },
                messages: [
                    {
                        sender: "Leila",
                        direction: "received",
                        timestamp: baseOctTime, // 18:00
                        body: "Are you ready for the concert tonight?",
                        metadata: { contact: "Leila" }
                    }
                ]
            },
            {
                title: "Darcy",
                platform: "SMS",
                metadata: { contact: "Darcy" },
                messages: [
                    {
                        sender: "Darcy",
                        direction: "received",
                        timestamp: baseOctTime + (30 * 60 * 1000), // 18:30
                        body: "I got our concert tickets, picking you up soon!",
                        metadata: { contact: "Darcy" }
                    },
                    {
                        sender: "Darcy",
                        direction: "received",
                        timestamp: baseOctTime + (24 * 60 * 60 * 1000), // Next day: Oct 11 18:00
                        body: "Did you feed the cat?", // Unrelated message during same period
                        metadata: { contact: "Darcy" }
                    }
                ]
            },
            {
                title: "John",
                platform: "SMS",
                metadata: { contact: "John" },
                messages: [
                    {
                        sender: "John",
                        direction: "received",
                        timestamp: baseOctTime + (60 * 60 * 1000), // 19:00
                        body: "See you at the concert venue near the stage!",
                        metadata: { contact: "John" }
                    }
                ]
            },
            {
                title: "Alex",
                platform: "SMS",
                metadata: { contact: "Alex" },
                messages: [
                    {
                        sender: "Alex",
                        direction: "received",
                        timestamp: new Date("2026-05-15T20:00:00Z").getTime(), // 5 months earlier
                        body: "That jazz band concert back in May was amazing.",
                        metadata: { contact: "Alex" }
                    }
                ]
            }
        ]
    };

    console.log("1. Ingesting multi-conversation test archive...");
    const ingestResult = await threadlineService.ingestArchive(
        testUid,
        mockPayload,
        mockPayload.filename,
        mockPayload.fileSize,
        threadlineId
    );
    assert.ok(ingestResult.importId, "Archive must ingest successfully");
    console.log("✓ Archive ingested successfully.");

    // Execute Smart Search for "concert"
    console.log("\n2. Executing Smart Search for 'concert'...");
    const clusters = await searchEngine.search(threadlineId, "concert", { uid: testUid });
    console.log(`Received ${clusters.length} cluster result(s).`);

    assert.ok(clusters.length >= 2, "Should return at least 2 distinct clusters (October concert vs May jazz concert)");

    // Find the October concert cluster (should contain Leila, Darcy, John)
    const octoberCluster = clusters.find(c =>
        c.messages.some(m => m.body.includes("tonight"))
    );
    assert.ok(octoberCluster, "October concert cluster must exist");

    console.log("\n--- OCTOBER CONCERT CLUSTER INSPECTION ---");
    console.log(`Cluster Title: ${octoberCluster.title}`);
    console.log(`Cluster Relevance: ${octoberCluster.relevance} (${octoberCluster.relevanceScore})`);
    console.log(`Cluster Confidence: ${octoberCluster.clusterConfidence}`);
    console.log(`Constituent Messages Count: ${octoberCluster.messages.length}`);
    console.log(`Conversations involved: ${octoberCluster.conversations.map(c => c.title).join(", ")}`);
    console.log(`Participants involved: ${octoberCluster.participants.join(", ")}`);

    // Requirement 1-3: Verify 3 conversations (Leila, Darcy, John) became ONE Event Cluster
    const convTitles = octoberCluster.conversations.map(c => c.title);
    assert.ok(convTitles.includes("Leila"), "Cluster must include Leila conversation");
    assert.ok(convTitles.includes("Darcy"), "Cluster must include Darcy conversation");
    assert.ok(convTitles.includes("John"), "Cluster must include John conversation");
    assert.strictEqual(octoberCluster.conversations.length, 3, "October cluster must span exactly 3 conversations");

    // Requirement 4: Verify messages are chronologically ordered regardless of conversation
    const clusterMessages = octoberCluster.messages;
    for (let i = 0; i < clusterMessages.length - 1; i++) {
        assert.ok(
            clusterMessages[i].timestamp <= clusterMessages[i + 1].timestamp,
            `Messages must be strictly chronological: ${clusterMessages[i].timestamp} <= ${clusterMessages[i + 1].timestamp}`
        );
    }
    console.log("✓ Constituent messages are strictly ordered chronologically across threads.");

    // Requirement 5: Verify all original source IDs/conversation IDs/timestamps/bodies are preserved
    clusterMessages.forEach(cm => {
        assert.ok(cm.id, "Message ID must be preserved");
        assert.ok(cm.conversationId, "Conversation ID must be preserved");
        assert.ok(cm.timestamp, "Timestamp must be preserved");
        assert.ok(cm.body, "Original message body must be preserved");
        assert.ok(cm.sender, "Sender must be preserved");

        // Verify body matches unaltered database record
        const dbMsg = db.queryOne("SELECT body, timestamp, sender FROM messages WHERE id = ?", [cm.id]);
        assert.strictEqual(cm.body, dbMsg.body, "Message body in cluster must match unaltered SQLite body");
        assert.strictEqual(cm.timestamp, dbMsg.timestamp, "Message timestamp in cluster must match unaltered SQLite timestamp");
        assert.strictEqual(cm.sender, dbMsg.sender, "Message sender in cluster must match unaltered SQLite sender");
    });
    console.log("✓ 100% forensic fidelity verified against SQLite database.");

    // Requirement 6: Verify match reasons are present
    clusterMessages.forEach(cm => {
        assert.ok(cm.matchReason && cm.matchReason.length > 0, `Match reason must be recorded for message: ${cm.body}`);
        console.log(`  [Message] "${cm.body}" -> Match Reason: ${cm.matchReason}`);
    });
    console.log("✓ Forensic match reasons verified.");

    // Requirement 7-8: Add another conversation discussing the same concept (Alex in May) -> Verify it remains SEPARATE
    const mayCluster = clusters.find(c =>
        c.messages.some(m => m.body.includes("May"))
    );
    assert.ok(mayCluster, "May concert must exist as a separate cluster");
    assert.notStrictEqual(octoberCluster.id, mayCluster.id, "October and May events must not merge into the same cluster");
    console.log("✓ Distinct temporal event (May concert) remained a separate cluster.");

    // Requirement 9-10: Verify unrelated message from Darcy ("Did you feed the cat?") is NOT in the concert cluster
    const hasCatMsg = octoberCluster.messages.some(m => m.body.toLowerCase().includes("cat"));
    assert.strictEqual(hasCatMsg, false, "Conservative invariant: Unrelated message from Darcy must NOT be in the concert cluster");
    console.log("✓ Conservative clustering invariant passed: Darcy's unrelated cat message was excluded.");

    // Verify Step 2 API Event Cluster contract fields
    assert.ok(octoberCluster.id, "Event Cluster ID (id) must be present");
    assert.ok(octoberCluster.clusterId, "Event Cluster ID (clusterId) must be present");
    assert.ok(octoberCluster.title, "Event title must be present");
    assert.ok(octoberCluster.topic, "Event topic must be present");
    assert.ok(octoberCluster.relevance, "Event relevance must be present");
    assert.ok(octoberCluster.clusterConfidence, "Cluster confidence must be present");
    assert.strictEqual(typeof octoberCluster.earliestTimestamp, "number", "earliestTimestamp must be number");
    assert.strictEqual(typeof octoberCluster.latestTimestamp, "number", "latestTimestamp must be number");
    assert.ok(Array.isArray(octoberCluster.participants), "participants array must be present");
    assert.ok(Array.isArray(octoberCluster.conversations), "conversations array must be present");
    assert.ok(Array.isArray(octoberCluster.messages), "chronological source messages array must be present");
    console.log("✓ Step 2 API contract fields verified.");

    // Verify Backward Compatibility fields on the cluster object
    assert.ok(octoberCluster.conversationId, "Legacy conversationId field must exist");
    assert.ok(octoberCluster.conversationTitle, "Legacy conversationTitle field must exist");
    assert.ok(octoberCluster.platform, "Legacy platform field must exist");
    assert.ok(octoberCluster.representativeMessageId, "Legacy representativeMessageId must exist");
    assert.ok(octoberCluster.contextWindow, "Legacy contextWindow must exist");
    console.log("✓ Backward compatibility fields verified.");

    // Cleanup
    db.run("DELETE FROM threadlines WHERE owner_id = ?", [testUid]);
    console.log("\n==========================================");
    console.log(" ALL EVENT CLUSTERER TESTS PASSED! ✅");
    console.log("==========================================");
}

runTests().catch(err => {
    console.error("Test failed with error:", err);
    process.exit(1);
});
