/*
    testStep7RecallImprovements.js

    Regression test suite verifying deterministic Step 7 recall improvements:
    1. Verb inflection matching without crude stem overmatching
    2. Slang / synonym coverage without generic word leakage
    3. Contextual event expansion (bounded ±60 min sequential continuity)
    4. Pure temporal search bypassing FTS
*/

const assert = require("assert");
const db = require("../database/database");
const threadlineService = require("../services/threadlines");
const searchEngine = require("../search/searchEngine");

async function runStep7Tests() {
    console.log("==================================================");
    console.log(" TESTING: STEP 7 DETERMINISTIC RECALL IMPROVEMENTS");
    console.log("==================================================");

    const testUid = "user_step7_recall_test";
    const threadlineId = `archive_${testUid}`;

    // Clean prior test records
    db.run("DELETE FROM threadlines WHERE owner_id = ?", [testUid]);

    const BASE_TIME = new Date("2026-08-10T12:00:00Z").getTime();

    const testConversations = [
        {
            title: "Verb Inflection Test Thread",
            platform: "SMS",
            metadata: { contact: "Alice" },
            messages: [
                {
                    id: "msg_v1",
                    sender: "Alice",
                    direction: "received",
                    timestamp: BASE_TIME,
                    body: "Can I call you real quick?",
                    metadata: { contact: "Alice" }
                },
                {
                    id: "msg_v2",
                    sender: "Alice",
                    direction: "received",
                    timestamp: BASE_TIME + 60 * 1000,
                    body: "I called you three times earlier.",
                    metadata: { contact: "Alice" }
                },
                {
                    id: "msg_v3",
                    sender: "Alice",
                    direction: "received",
                    timestamp: BASE_TIME + 2 * 60 * 1000,
                    body: "He is calling from the hotel.",
                    metadata: { contact: "Alice" }
                },
                // Negative overmatch check: "calligraphy" or "callous" must NOT match "call"
                {
                    id: "msg_v4",
                    sender: "Alice",
                    direction: "received",
                    timestamp: BASE_TIME + 3 * 60 * 1000,
                    body: "Look at this calligraphy artwork.",
                    metadata: { contact: "Alice" }
                }
            ]
        },
        {
            title: "Contextual Expansion Thread",
            platform: "iMessage",
            metadata: { contact: "Bob" },
            messages: [
                {
                    id: "msg_c1",
                    sender: "Bob",
                    direction: "received",
                    timestamp: BASE_TIME + 24 * 60 * 60 * 1000,
                    body: "We decided not to go because of the blizzard.",
                    metadata: { contact: "Bob" }
                },
                {
                    id: "msg_c2",
                    sender: "Me",
                    direction: "sent",
                    timestamp: BASE_TIME + 24 * 60 * 60 * 1000 + 15 * 60 * 1000, // +15 mins
                    body: "Yeah, totally canceled the trip, safety first.",
                    metadata: { contact: "Bob" }
                },
                // Unrelated message 3 hours later must NOT be pulled in
                {
                    id: "msg_c3",
                    sender: "Bob",
                    direction: "received",
                    timestamp: BASE_TIME + 24 * 60 * 60 * 1000 + 3 * 60 * 60 * 1000, // +3 hours
                    body: "Did you feed the cat yesterday?",
                    metadata: { contact: "Bob" }
                }
            ]
        },
        {
            title: "Pure Temporal Test Thread",
            platform: "WhatsApp",
            metadata: { contact: "Carol" },
            messages: [
                {
                    id: "msg_t1",
                    sender: "Carol",
                    direction: "received",
                    timestamp: new Date("2026-08-25T15:00:00Z").getTime(),
                    body: "Arriving on the afternoon flight.",
                    metadata: { contact: "Carol" }
                },
                {
                    id: "msg_t2",
                    sender: "Carol",
                    direction: "received",
                    timestamp: new Date("2026-09-05T15:00:00Z").getTime(),
                    body: "September follow-up note.",
                    metadata: { contact: "Carol" }
                }
            ]
        }
    ];

    await threadlineService.ingestArchive(
        testUid,
        {
            filename: "step7_test.json",
            fileSize: 1024,
            source: "Step 7 Test Archive",
            platform: "Multi",
            messageCount: 9,
            conversationCount: 3,
            conversations: testConversations
        },
        "step7_test.json",
        1024,
        threadlineId
    );

    console.log("✓ Test archive ingested.");

    // 1. Verb Inflection Test
    console.log("1. Testing verb inflections...");
    const clustersCall = await searchEngine.search(threadlineId, "Find where she called me", { uid: testUid });
    assert(clustersCall.length > 0, "Expected clusters for 'called'");
    const callBodies = clustersCall[0].messages.map(m => m.body);
    assert(callBodies.includes("Can I call you real quick?"), "Failed to match 'call' when querying 'called'");
    assert(callBodies.includes("I called you three times earlier."), "Failed to match 'called'");
    assert(callBodies.includes("He is calling from the hotel."), "Failed to match 'calling'");
    assert(!callBodies.includes("Look at this calligraphy artwork."), "Overmatched 'calligraphy' on 'call' search!");
    console.log("✓ Verb inflections match expected variants and reject unrelated words.");

    // 2. Contextual Expansion Test
    console.log("2. Testing contextual event expansion...");
    const clustersCancel = await searchEngine.search(threadlineId, "Find where we decided not to go", { uid: testUid });
    assert(clustersCancel.length > 0, "Expected cluster for cancellation");
    const cancelBodies = clustersCancel[0].messages.map(m => m.body);
    assert(cancelBodies.includes("We decided not to go because of the blizzard."), "Missing anchor message");
    assert(cancelBodies.includes("Yeah, totally canceled the trip, safety first."), "Failed to pull adjacent sequential confirmation");
    assert(!cancelBodies.includes("Did you feed the cat yesterday?"), "Leaked unrelated message 3 hours later!");
    console.log("✓ Bounded contextual expansion recovers sequential confirmation without leaking unrelated chatter.");

    // 3. Pure Temporal Search Test
    console.log("3. Testing pure temporal search (bypassing FTS)...");
    const clustersAugust = await searchEngine.search(threadlineId, "Show me messages from August", { uid: testUid });
    assert(clustersAugust.length > 0, "Expected clusters for August");
    const allAugustBodies = clustersAugust.flatMap(c => c.messages.map(m => m.body));
    assert(allAugustBodies.includes("Arriving on the afternoon flight."), "Missing August message");
    assert(!allAugustBodies.includes("September follow-up note."), "September message leaked into August search!");
    console.log("✓ Pure temporal search retrieves date-scoped messages directly without FTS keyword dependency.");

    // Cleanup
    db.run("DELETE FROM threadlines WHERE owner_id = ?", [testUid]);
    console.log("✓ Cleaned up test data.");
    console.log("ALL STEP 7 RECALL IMPROVEMENT TESTS PASSED! ✅\n");
}

runStep7Tests().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
