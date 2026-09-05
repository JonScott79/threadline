/*
    auditSmartSearchQueries.js

    Diagnostic script to test natural-language Event Reconstruction queries against
    the existing deterministic searchEngine & eventClusterer pipeline.
*/

const db = require("../database/database");
const threadlineService = require("../services/threadlines");
const searchEngine = require("../search/searchEngine");

async function runAudit() {
    console.log("==================================================");
    console.log(" AUDIT: DETERMINISTIC SMART SEARCH & EVENT CLUSTERING");
    console.log("==================================================");

    const testUid = "user_smart_search_audit";
    const threadlineId = `archive_${testUid}`;

    db.run("DELETE FROM threadlines WHERE owner_id = ?", [testUid]);

    // Construct a rich multi-conversation test corpus:
    // Event A (October 10, 2026): The Rock Concert & Ride
    // - Conv 1: Leila ↔ User ("Are you ready for the concert tonight?", "Can't wait to see the band live!")
    // - Conv 2: Darcy ↔ User ("I got our concert tickets, picking you up soon!", "Leaving my place now to pick you up.")
    // - Conv 3: John ↔ User ("See you at the concert venue near the stage!", "We are figuring out transportation for everyone.")
    // - Unrelated noise in Conv 2 (Darcy): "Did you feed the cat yesterday?"
    // - Noise in Conv 4 (Work): "Please review the quarterly budget spreadsheet."
    //
    // Event B (May 15, 2026): Jazz Concert months earlier
    // - Conv 5: Alex ↔ User ("That jazz band concert back in May was amazing.")
    //
    // Event C (August 20, 2026): Airport Pickup (different event with 'picking up' action)
    // - Conv 2: Darcy ↔ User ("I can pick you up from the airport when your flight lands.")

    const octTime = new Date("2026-10-10T18:00:00Z").getTime();
    const mayTime = new Date("2026-05-15T20:00:00Z").getTime();
    const augTime = new Date("2026-08-20T14:00:00Z").getTime();

    const mockPayload = {
        filename: "audit_corpus.json",
        fileSize: 8192,
        source: "Audit Corpus",
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

    console.log("Ingesting audit corpus...");
    await threadlineService.ingestArchive(
        testUid,
        mockPayload,
        mockPayload.filename,
        mockPayload.fileSize,
        threadlineId
    );
    console.log("Corpus ingested.\n");

    const testQueries = [
        "Find the time Darcy said she would pick me up.",
        "Find the time Leila and I were talking about the concert.",
        "Show me the conversations where Darcy talked about picking her up.",
        "Find the conversation about the concert where we were figuring out transportation.",
        "When were Leila, Darcy and John all talking about the concert?"
    ];

    for (const q of testQueries) {
        console.log("--------------------------------------------------");
        console.log(`QUERY: "${q}"`);
        const parsed = searchEngine.parseQuery(q, [threadlineId]);
        console.log("Parsed Intent:", {
            people: parsed.people,
            concepts: parsed.concepts,
            keywords: parsed.keywords,
            relativeOrder: parsed.relativeOrder,
            relativeEvent: parsed.relativeEvent
        });

        const clusters = await searchEngine.search(threadlineId, q, { uid: testUid });
        console.log(`Returned ${clusters.length} cluster(s):`);
        clusters.forEach((c, idx) => {
            console.log(`  [Cluster ${idx + 1}] Title: "${c.title}" | Score: ${c.relevanceScore} | Convs: [${c.conversations.map(conv => conv.title).join(", ")}] | MsgCount: ${c.messages.length}`);
            c.messages.forEach(m => {
                console.log(`    - (${m.sender} in ${m.conversationTitle}): "${m.body}"`);
            });
        });
    }

    // Clean up
    db.run("DELETE FROM threadlines WHERE owner_id = ?", [testUid]);
}

runAudit().catch(err => {
    console.error(err);
    process.exit(1);
});
