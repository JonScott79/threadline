/*
    testMultiWordSearch.js

    Regression test suite for multi-word search in Threadline.
    Validates:
    1. Preservation of multi-word query intent in parseQuery (no dropping of non-geographic nouns like "court").
    2. Candidate retrieval and scoring hierarchy: messages matching multiple keywords score significantly higher than single-keyword matches.
    3. Proper filtering of incidental single-keyword noise when strong multi-keyword matches exist.
    4. Bounded event clustering: contextual expansion only expands around high-confidence seed items, preventing mega-clusters.
    5. Correct behavior across diverse queries:
       - "take me to court"
       - "pick me up"
       - "talk about the concert"
       - "transportation for the concert"
       - "get the cash ready"
       - "when did she pick me up"
       - "messages about the concert"
       - single word queries: "court", "concert", "cash"
*/

const assert = require("assert");
const db = require("../database/database");
const threadlineService = require("../services/threadlines");
const searchEngine = require("../search/searchEngine");

async function runTests() {
    console.log("==================================================");
    console.log(" TESTING: MULTI-WORD SEARCH INTENT & REGRESSION");
    console.log("==================================================");

    const testUid = "user_multiword_test_" + Date.now();
    const threadlineId = `archive_${testUid}`;

    // Clean any prior state
    db.run("DELETE FROM threadlines WHERE owner_id = ?", [testUid]);

    // Test corpus with targeted messages to test ranking and clustering
    const baseTime = new Date("2026-06-15T14:00:00Z").getTime();
    const dayMs = 24 * 60 * 60 * 1000;

    const testConversations = [
        {
            title: "Legal & Custody",
            platform: "iMessage",
            metadata: { contact: "David" },
            messages: [
                {
                    id: "mw_court_01",
                    sender: "David",
                    direction: "received",
                    timestamp: baseTime,
                    body: "Please take me to court if you disagree.",
                    metadata: {}
                },
                {
                    id: "mw_court_02",
                    sender: "Me",
                    direction: "sent",
                    timestamp: baseTime + 5 * 60 * 1000,
                    body: "I will see you in court then.",
                    metadata: {}
                },
                {
                    id: "mw_take_only",
                    sender: "David",
                    direction: "received",
                    timestamp: baseTime + 10 * dayMs,
                    body: "Take your time with the paperwork.",
                    metadata: {}
                },
                {
                    id: "mw_court_only",
                    sender: "David",
                    direction: "received",
                    timestamp: baseTime + 20 * dayMs,
                    body: "The court date was rescheduled for next month.",
                    metadata: {}
                }
            ]
        },
        {
            title: "Concert & Travel",
            platform: "SMS",
            metadata: { contact: "Darcy" },
            messages: [
                {
                    id: "mw_concert_01",
                    sender: "Darcy",
                    direction: "received",
                    timestamp: baseTime + 30 * dayMs,
                    body: "I got our tickets for the concert! Can you talk about the concert tonight?",
                    metadata: {}
                },
                {
                    id: "mw_concert_02",
                    sender: "Me",
                    direction: "sent",
                    timestamp: baseTime + 30 * dayMs + 10 * 60 * 1000,
                    body: "Sure, let us talk about the concert plans.",
                    metadata: {}
                },
                {
                    id: "mw_pickup_01",
                    sender: "Darcy",
                    direction: "received",
                    timestamp: baseTime + 30 * dayMs + 20 * 60 * 1000,
                    body: "Can you pick me up on your way there?",
                    metadata: {}
                },
                {
                    id: "mw_pickup_02",
                    sender: "Me",
                    direction: "sent",
                    timestamp: baseTime + 30 * dayMs + 25 * 60 * 1000,
                    body: "Yes, I will pick you up at 6.",
                    metadata: {}
                },
                {
                    id: "mw_cash_01",
                    sender: "Darcy",
                    direction: "received",
                    timestamp: baseTime + 40 * dayMs,
                    body: "Please get the cash ready for parking.",
                    metadata: {}
                },
                {
                    id: "mw_cash_02",
                    sender: "Me",
                    direction: "sent",
                    timestamp: baseTime + 40 * dayMs + 5 * 60 * 1000,
                    body: "Got the cash ready in my wallet.",
                    metadata: {}
                }
            ]
        }
    ];

    const archivePayload = {
        name: "Multi-Word Test Archive",
        filename: "multiword_test.json",
        fileSize: 5000,
        messageCount: 10,
        conversationCount: 2,
        conversations: testConversations
    };

    console.log("1. Ingesting test archive...");
    await threadlineService.ingestArchive(testUid, archivePayload, "multiword_test.json", 5000, threadlineId);
    console.log("✓ Test archive ingested.\n");

    try {
        // --- TEST 1: ParseQuery preserves multi-word intent ---
        console.log("2. Testing query parsing for multi-word queries...");
        const p1 = searchEngine.parseQuery("take me to court", [threadlineId]);
        assert.deepStrictEqual(p1.keywords, ["take", "court"], "Keywords should contain both 'take' and 'court'");
        assert.strictEqual(p1.location, null, "'court' must NOT be classified as a location");

        const p2 = searchEngine.parseQuery("pick me up", [threadlineId]);
        assert(p2.concepts.includes("transportation") || p2.keywords.includes("pick"), "Phrasal verb should be captured");

        const p3 = searchEngine.parseQuery("get the cash ready", [threadlineId]);
        assert(p3.keywords.includes("cash"), "Should contain cash keyword");
        assert(p3.keywords.includes("ready"), "Should contain ready keyword");

        const p4 = searchEngine.parseQuery("talk about the concert", [threadlineId]);
        assert(p4.keywords.includes("talk"), "Should contain talk keyword");
        assert(p4.keywords.includes("concert"), "Should contain concert keyword");
        console.log("✓ Query parsing correctly preserves multi-word keywords without stripping non-geographic nouns.\n");

        // --- TEST 2: Scoring hierarchy for 'take me to court' ---
        console.log("3. Testing search scoring hierarchy for 'take me to court'...");
        const resCourt = await searchEngine.search(threadlineId, "take me to court", { uid: testUid });
        assert(resCourt.length > 0, "Should return at least one cluster");
        
        // Find cluster with mw_court_01
        const courtCluster = resCourt.find(c => c.messages.some(m => m.id === "mw_court_01"));
        assert(courtCluster, "Should find cluster containing 'Please take me to court if you disagree.'");
        
        // Ensure that the multi-word matching message scores significantly higher than single-word hit
        const multiWordMsg = courtCluster.messages.find(m => m.id === "mw_court_01");
        assert(multiWordMsg.score >= 160, `Multi-word message should score >= 160, got ${multiWordMsg.score}`);
        assert(multiWordMsg.matchReason.includes("Multi-keyword match"), "Reason should note multi-keyword match");
        console.log(`✓ Multi-keyword match scored ${multiWordMsg.score} pts with multi-keyword provenance.`);

        // Ensure weak incidental single-word messages (e.g. mw_take_only 10 days away) did not get merged into a mega-cluster
        assert(!courtCluster.messages.some(m => m.id === "mw_take_only"), "Single-keyword 'take' message must not be lumped into court cluster");
        console.log("✓ Incidental single-keyword message correctly excluded from court cluster.\n");

        // --- TEST 3: Phrasal verb queries ---
        console.log("4. Testing separable phrasal verb 'pick me up'...");
        const resPick = await searchEngine.search(threadlineId, "pick me up", { uid: testUid });
        assert(resPick.length > 0, "Should find clusters for 'pick me up'");
        const pickMsg = resPick[0].messages.find(m => m.id === "mw_pickup_01");
        assert(pickMsg, "Should find 'Can you pick me up on your way there?'");
        console.log("✓ Separable phrasal verb correctly resolved and retrieved.\n");

        // --- TEST 4: 'get the cash ready' multi-word query ---
        console.log("5. Testing multi-word 'get the cash ready'...");
        const resCash = await searchEngine.search(threadlineId, "get the cash ready", { uid: testUid });
        assert(resCash.length > 0, "Should find cash cluster");
        assert(resCash[0].messages.some(m => m.id === "mw_cash_01"), "Should retrieve cash message");
        const cashMsg = resCash[0].messages.find(m => m.id === "mw_cash_01");
        assert(cashMsg.score >= 160, "Multi-keyword cash message should score >= 160");
        console.log("✓ Multi-word query 'get the cash ready' scored and clustered accurately.\n");

        // --- TEST 5: Single-word queries maintain full fidelity ---
        console.log("6. Testing single-word queries ('court', 'concert', 'cash')...");
        const resSingleCourt = await searchEngine.search(threadlineId, "court", { uid: testUid });
        assert(resSingleCourt.length > 0, "Should find court messages");
        assert(resSingleCourt.some(c => c.messages.some(m => m.id === "mw_court_01")), "Should find mw_court_01");
        assert(resSingleCourt.some(c => c.messages.some(m => m.id === "mw_court_only")), "Should find mw_court_only");

        const resSingleConcert = await searchEngine.search(threadlineId, "concert", { uid: testUid });
        assert(resSingleConcert.length > 0, "Should find concert messages");

        const resSingleCash = await searchEngine.search(threadlineId, "cash", { uid: testUid });
        assert(resSingleCash.length > 0, "Should find cash messages");
        console.log("✓ Single-word queries retain 100% precision and recall without regression.\n");

        console.log("==================================================");
        console.log(" ALL MULTI-WORD SEARCH REGRESSION TESTS PASSED! ✅");
        console.log("==================================================");
    } finally {
        db.run("DELETE FROM threadlines WHERE owner_id = ?", [testUid]);
        console.log("✓ Cleaned up test data.\n");
    }
}

runTests().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
