/*
    testSmartSearchIntelligence.js

    Step 5 Test Suite: Smart Search / Event Reconstruction Intelligence.
    Validates natural-language query understanding, concept/synonym resolution,
    cross-conversation evidence clustering, and precision/recall metrics (false positives and false negatives).
*/

const assert = require("assert");
const db = require("../database/database");
const threadlineService = require("../services/threadlines");
const searchEngine = require("../search/searchEngine");

async function runStep5Tests() {
    console.log("==================================================");
    console.log(" TESTING: SMART SEARCH & EVENT RECONSTRUCTION INTELLIGENCE");
    console.log("==================================================");

    const testUid = "user_smart_search_step5";
    const threadlineId = `archive_${testUid}`;

    db.run("DELETE FROM threadlines WHERE owner_id = ?", [testUid]);

    // Dedicated multi-conversation test corpus:
    // Event A (October 10, 2026): The Rock Concert & Transportation
    // - Conv 1: Leila ↔ User ("Are you ready for the concert tonight?", "Can't wait to see the band live!")
    // - Conv 2: Darcy ↔ User ("I got our concert tickets, picking you up soon!")
    // - Conv 3: John ↔ User ("We are figuring out transportation for everyone to get there.", "See you at the concert venue near the stage!")
    //
    // Noise / Negatives (Deliberately similar or unrelated):
    // - Conv 2 (Darcy): "Did you feed the cat yesterday?" (Same participant, unrelated date & topic)
    // - Conv 4 (Work): "Please review the quarterly budget spreadsheet." (Unrelated participant & topic)
    //
    // Distinct Events sharing topics/actions:
    // Event B (May 15, 2026): Jazz Concert months earlier
    // - Conv 5: Alex ↔ User ("That jazz band concert back in May was amazing.")
    // Event C (August 20, 2026): Airport Pickup (same action "pick up", different event & date)
    // - Conv 2: Darcy ↔ User ("I can pick you up from the airport when your flight lands.")

    const octTime = new Date("2026-10-10T18:00:00Z").getTime();
    const mayTime = new Date("2026-05-15T20:00:00Z").getTime();
    const augTime = new Date("2026-08-20T14:00:00Z").getTime();

    const mockPayload = {
        filename: "step5_corpus.json",
        fileSize: 8192,
        source: "Step 5 Benchmark Corpus",
        platform: "SMS",
        messageCount: 9,
        conversationCount: 5,
        conversations: [
            {
                title: "Leila",
                platform: "SMS",
                metadata: { contact: "Leila" },
                messages: [
                    {
                        sender: "Leila",
                        direction: "received",
                        timestamp: octTime,
                        body: "Are you ready for the concert tonight?",
                        metadata: { contact: "Leila" }
                    },
                    {
                        sender: "Me",
                        direction: "sent",
                        timestamp: octTime + 5 * 60 * 1000,
                        body: "Can't wait to see the band live!",
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
                        timestamp: augTime,
                        body: "I can pick you up from the airport when your flight lands.",
                        metadata: { contact: "Darcy" }
                    },
                    {
                        sender: "Darcy",
                        direction: "received",
                        timestamp: octTime + 30 * 60 * 1000,
                        body: "I got our concert tickets, picking you up soon!",
                        metadata: { contact: "Darcy" }
                    },
                    {
                        sender: "Darcy",
                        direction: "received",
                        timestamp: octTime + 24 * 60 * 60 * 1000,
                        body: "Did you feed the cat yesterday?",
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
                        timestamp: octTime + 45 * 60 * 1000,
                        body: "We are figuring out transportation for everyone to get there.",
                        metadata: { contact: "John" }
                    },
                    {
                        sender: "John",
                        direction: "received",
                        timestamp: octTime + 60 * 60 * 1000,
                        body: "See you at the concert venue near the stage!",
                        metadata: { contact: "John" }
                    }
                ]
            },
            {
                title: "Work Group",
                platform: "SMS",
                metadata: { contact: "Work" },
                messages: [
                    {
                        sender: "Boss",
                        direction: "received",
                        timestamp: octTime + 10 * 60 * 1000,
                        body: "Please review the quarterly budget spreadsheet.",
                        metadata: { contact: "Work" }
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
                        timestamp: mayTime,
                        body: "That jazz band concert back in May was amazing.",
                        metadata: { contact: "Alex" }
                    }
                ]
            }
        ]
    };

    console.log("1. Ingesting multi-conversation benchmark corpus...");
    await threadlineService.ingestArchive(
        testUid,
        mockPayload,
        mockPayload.filename,
        mockPayload.fileSize,
        threadlineId
    );
    console.log("✓ Corpus ingested successfully.\n");

    let totalQueries = 0;
    let falsePositives = 0;
    let falseNegatives = 0;

    // Helper evaluation function
    function evaluateResults(qName, clusters, expectedMatches, forbiddenMatches) {
        totalQueries++;
        const returnedBodies = [];
        clusters.forEach(c => {
            c.messages.forEach(m => returnedBodies.push(m.body));
        });

        // Check false negatives (expected messages that were missed)
        for (const exp of expectedMatches) {
            const found = returnedBodies.some(b => b.includes(exp));
            if (!found) {
                console.error(`❌ [${qName}] False Negative: expected message not found: "${exp}"`);
                falseNegatives++;
            }
        }

        // Check false positives (forbidden messages that were erroneously included)
        for (const forb of forbiddenMatches) {
            const found = returnedBodies.some(b => b.includes(forb));
            if (found) {
                console.error(`❌ [${qName}] False Positive: forbidden message was returned: "${forb}"`);
                falsePositives++;
            }
        }
    }

    console.log("2. Running Benchmark Queries & Measuring Precision/Recall...\n");

    // Benchmark Query 1: "Find the time Darcy said she would pick me up."
    {
        const q = "Find the time Darcy said she would pick me up.";
        const parsed = searchEngine.parseQuery(q, [threadlineId]);
        assert(parsed.people.includes("Darcy"), "Should identify Darcy as participant");
        assert(parsed.concepts.includes("transportation"), "Should map separable phrasal verb 'pick me up' to transportation concept");
        assert(!parsed.keywords.includes("find"), "Should not include filler 'find'");
        assert(!parsed.keywords.includes("said"), "Should not include filler 'said'");
        assert(!parsed.keywords.includes("would"), "Should not include filler 'would'");

        const clusters = await searchEngine.search(threadlineId, q, { uid: testUid });
        assert(clusters.length >= 2, "Should return airport ride and concert ride as distinct event clusters");
        evaluateResults(
            "Query 1: Darcy pick me up",
            clusters,
            ["I can pick you up from the airport when your flight lands.", "I got our concert tickets, picking you up soon!"],
            ["Did you feed the cat yesterday?", "Please review the quarterly budget spreadsheet."]
        );
        console.log("✓ Query 1 passed: Separates airport pickup from concert pickup and correctly maps 'pick me up' action.");
    }

    // Benchmark Query 2: "Find the time Leila and I were talking about the concert."
    {
        const q = "Find the time Leila and I were talking about the concert.";
        const clusters = await searchEngine.search(threadlineId, q, { uid: testUid });
        assert(clusters.length >= 2, "Should return October concert and May jazz concert as distinct event clusters");
        const octCluster = clusters.find(c => c.conversations.some(conv => conv.title === "Leila"));
        assert(octCluster, "October concert cluster with Leila should be returned");
        assert(octCluster.conversations.length >= 3, "October concert should group Leila, Darcy, and John across threads");
        evaluateResults(
            "Query 2: Leila concert",
            clusters,
            ["Are you ready for the concert tonight?", "Can't wait to see the band live!", "That jazz band concert back in May was amazing."],
            ["Did you feed the cat yesterday?", "Please review the quarterly budget spreadsheet."]
        );
        console.log("✓ Query 2 passed: Reconstructs coordinated concert event across threads without mixing dates or noise.");
    }

    // Benchmark Query 3: "Show me the conversations where Darcy talked about picking her up."
    {
        const q = "Show me the conversations where Darcy talked about picking her up.";
        const parsed = searchEngine.parseQuery(q, [threadlineId]);
        assert(parsed.people.includes("Darcy"), "Should identify Darcy");
        assert(parsed.concepts.includes("transportation"), "Should map 'picking her up' to transportation");
        assert(!parsed.keywords.includes("show"), "Should filter out 'show'");
        assert(!parsed.keywords.includes("conversations"), "Should filter out 'conversations'");

        const clusters = await searchEngine.search(threadlineId, q, { uid: testUid });
        evaluateResults(
            "Query 3: Darcy picking her up",
            clusters,
            ["I can pick you up from the airport when your flight lands.", "I got our concert tickets, picking you up soon!"],
            ["Did you feed the cat yesterday?", "Please review the quarterly budget spreadsheet."]
        );
        console.log("✓ Query 3 passed: Correctly targets pickup conversations while excluding filler words.");
    }

    // Benchmark Query 4: "Find the conversation about the concert where we were figuring out transportation."
    {
        const q = "Find the conversation about the concert where we were figuring out transportation.";
        const clusters = await searchEngine.search(threadlineId, q, { uid: testUid });
        const concertCluster = clusters[0];
        assert(concertCluster.conversations.some(c => c.title === "John"), "Concert cluster should include John's transportation planning");
        assert(concertCluster.messages.some(m => m.body.includes("figuring out transportation")), "Should include John's transportation message");
        evaluateResults(
            "Query 4: Concert transportation",
            clusters,
            ["We are figuring out transportation for everyone to get there.", "Are you ready for the concert tonight?"],
            ["Did you feed the cat yesterday?", "Please review the quarterly budget spreadsheet."]
        );
        console.log("✓ Query 4 passed: Merged cross-thread transportation coordination into the active concert event cluster.");
    }

    // Benchmark Query 5: "When were Leila, Darcy and John all talking about the concert?"
    {
        const q = "When were Leila, Darcy and John all talking about the concert?";
        const parsed = searchEngine.parseQuery(q, [threadlineId]);
        assert(parsed.people.includes("Leila"), "Should extract Leila");
        assert(parsed.people.includes("Darcy"), "Should extract Darcy");
        assert(parsed.people.includes("John"), "Should extract John");

        const clusters = await searchEngine.search(threadlineId, q, { uid: testUid });
        const topCluster = clusters[0];
        assert.strictEqual(topCluster.conversations.length, 3, "Top cluster must merge all 3 requested participants' conversations");
        evaluateResults(
            "Query 5: Multi-participant concert coordination",
            clusters,
            ["Are you ready for the concert tonight?", "I got our concert tickets, picking you up soon!", "See you at the concert venue near the stage!"],
            ["Did you feed the cat yesterday?", "Please review the quarterly budget spreadsheet."]
        );
        console.log("✓ Query 5 passed: Multi-participant coordination correctly resolved across 3 threads.");
    }

    console.log("\n==================================================");
    console.log(" METRICS SUMMARY:");
    console.log(` Queries Tested: ${totalQueries}`);
    console.log(` False Positives: ${falsePositives} (Target: 0)`);
    console.log(` False Negatives: ${falseNegatives} (Target: 0)`);
    console.log("==================================================");

    assert.strictEqual(falsePositives, 0, "False positive count must be zero");
    assert.strictEqual(falseNegatives, 0, "False negative count must be zero");

    // Clean up
    db.run("DELETE FROM threadlines WHERE owner_id = ?", [testUid]);
    console.log("✓ Cleaned up test data.\n");
    console.log("ALL STEP 5 SMART SEARCH TESTS PASSED! ✅\n");
}

runStep5Tests().catch(err => {
    console.error("Test execution failed:", err);
    process.exit(1);
});
