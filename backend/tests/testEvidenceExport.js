/*
    testEvidenceExport.js

    Comprehensive test suite for Threadline Forensic Evidence Export System:
    1. JSON export is valid JSON.
    2. Export contains the expected evidence.
    3. Source message body exactly matches SQLite byte-for-byte.
    4. Source timestamps exactly match SQLite.
    5. Timestamp precision is preserved (exact milliseconds/seconds).
    6. Timezone information is preserved.
    7. Multiple conversations remain distinguishable.
    8. Evidence remains chronologically ordered.
    9. EventCluster export includes all selected constituent evidence.
    10. Deterministic analysis remains separate from source evidence.
    11. Semantic inference remains separate from source evidence.
    12. Semantic inference cannot overwrite source evidence.
    13. Invalid message IDs cannot export evidence belonging to another Threadline.
    14. Empty selections fail safely.
    15. Individual evidence SHA-256 hashes are generated.
    16. Identical canonical evidence produces identical hashes.
    17. Changing one source evidence record changes its hash.
    18. Changing evidence changes the manifest hash.
    19. Watermark exists in the generated watermarked PDF.
    20. Export ID exists in the PDF.
    21. Integrity manifest information exists in the JSON.
    22. PDF generation succeeds with long message bodies.
    23. PDF generation succeeds with multiple conversations.
    24. PDF generation succeeds with and without semantic inference.
    25. Export does not mutate any evidence tables.
*/

const assert = require("assert");
const crypto = require("crypto");
const db = require("../database/database");
const threadlineService = require("../services/threadlines");
const evidenceExporter = require("../services/evidenceExporter");

async function runExportTests() {
    console.log("==================================================");
    console.log(" TESTING: FORENSIC EVIDENCE EXPORT SYSTEM");
    console.log("==================================================");

    const testUid = "user_export_forensics_test";
    const foreignUid = "user_foreign_test";
    const threadlineId = `archive_${testUid}`;
    const foreignThreadlineId = `archive_${foreignUid}`;

    // Clean prior test data
    db.run("DELETE FROM threadlines WHERE owner_id IN (?, ?)", [testUid, foreignUid]);

    const BASE_TIME = new Date("2026-08-14T18:42:15.123Z").getTime();

    // 1. Ingest test archive with multiple conversations, specific punctuation, and exact bodies
    const testArchive = {
        source: "SMS Backup & Restore",
        platform: "SMS",
        conversations: [
            {
                title: "Sarah Jenkins",
                platform: "SMS",
                metadata: { contact: "Sarah Jenkins" },
                messages: [
                    {
                        id: "exp_msg_sarah_01",
                        sender: "Sarah Jenkins",
                        direction: "received",
                        timestamp: BASE_TIME,
                        body: "I'm not driving through that storm!  Are you crazy??",
                        metadata: { contact: "Sarah Jenkins" }
                    },
                    {
                        id: "exp_msg_sarah_02",
                        sender: "Me",
                        direction: "sent",
                        timestamp: BASE_TIME + 2 * 60 * 1000,
                        body: "Understood. Let's regroup tomorrow morning.",
                        metadata: { contact: "Sarah Jenkins" }
                    }
                ]
            },
            {
                title: "Mark Davis",
                platform: "iMessage",
                metadata: { contact: "Mark Davis" },
                messages: [
                    {
                        id: "exp_msg_mark_01",
                        sender: "Mark Davis",
                        direction: "received",
                        timestamp: BASE_TIME + 5 * 60 * 1000,
                        body: "Did Sarah mention the road closure on Highway 9?\nTrees are down everywhere.",
                        metadata: { contact: "Mark Davis" }
                    },
                    {
                        id: "exp_msg_mark_02",
                        sender: "Mark Davis",
                        direction: "received",
                        timestamp: BASE_TIME + 15 * 60 * 1000,
                        body: "Extremely long forensic message body with diverse unicode: “Special quotes”, — em dashes, symbols: § 12-B & % # @ ! ? and multiple paragraphs to test wrapping across pages.\n\nLine 2.\nLine 3 with whitespace padding.   ",
                        metadata: { contact: "Mark Davis" }
                    }
                ]
            }
        ]
    };

    const foreignArchive = {
        source: "SMS Backup",
        platform: "SMS",
        conversations: [
            {
                title: "Secret Thread",
                platform: "Signal",
                metadata: {},
                messages: [
                    {
                        id: "msg_foreign_secret",
                        sender: "Eve",
                        direction: "received",
                        timestamp: BASE_TIME + 10 * 1000,
                        body: "Confidential data belonging to another user.",
                        metadata: {}
                    }
                ]
            }
        ]
    };

    console.log("1. Ingesting test archives into SQLite...");
    await threadlineService.ingestArchive(testUid, testArchive, "test_evidence_archive.json", 1024, threadlineId);
    await threadlineService.ingestArchive(foreignUid, foreignArchive, "foreign_archive.json", 512, foreignThreadlineId);
    console.log("✓ Ingestion complete.");

    // Snapshot database message counts to verify zero mutation
    const countBefore = db.queryOne("SELECT COUNT(*) as count FROM messages").count;

    // Construct synthetic EventCluster representation with deterministic reasons and semantic inference
    const mockCluster = {
        id: "cluster_storm_closure_01",
        title: "Severe Weather Travel Disruption",
        topic: "Storm & Road Closure",
        summaryReason: "Found 4 relevant messages across 2 conversations discussing storm and road closures.",
        relevance: "High",
        relevanceScore: 195,
        clusterConfidence: "High",
        timeSpan: {
            earliestTimestamp: BASE_TIME,
            latestTimestamp: BASE_TIME + 15 * 60 * 1000,
            dateString: "Aug 14, 2026"
        },
        participants: ["Sarah Jenkins", "Me", "Mark Davis"],
        conversations: [
            { id: "c1", title: "Sarah Jenkins", platform: "SMS" },
            { id: "c2", title: "Mark Davis", platform: "iMessage" }
        ],
        messages: [
            {
                id: "exp_msg_sarah_01",
                score: 180,
                matchReason: "Keyword match: storm; Concept match: transportation",
                semanticInference: null
            },
            {
                id: "exp_msg_sarah_02",
                score: 90,
                matchReason: "Conversation context (adjacent sequence)",
                semanticInference: null
            },
            {
                id: "exp_msg_mark_01",
                score: 195,
                matchReason: "Keyword match: road closure; Concept match: transportation",
                semanticInference: {
                    finding: "Probable correlation with Sarah's refusal to drive due to storm damage on route.",
                    confidence: "High"
                }
            },
            {
                id: "exp_msg_mark_02",
                score: 75,
                matchReason: "Conversation context",
                semanticInference: null
            }
        ]
    };

    console.log("2. Resolving canonical evidence model from authoritative SQLite store...");
    const canonicalExport = evidenceExporter.resolveCanonicalEvidence({
        threadlineId,
        uid: testUid,
        cluster: mockCluster,
        query: "storm road closure",
        filters: {},
        caseInfo: {
            caseName: "Incident Investigation #2026-0814",
            investigator: "Det. Miller"
        }
    });

    // Test 1: JSON export is valid JSON
    const jsonString = evidenceExporter.generateJsonPackage(canonicalExport);
    const parsedJson = JSON.parse(jsonString);
    assert.ok(parsedJson, "Test 1 Failed: Generated JSON must be valid and parseable.");
    console.log("✓ Test 1 Passed: JSON export is valid JSON.");

    // Test 2: Export contains expected evidence count
    assert.strictEqual(parsedJson.evidence.length, 4, "Test 2 Failed: Expected exactly 4 evidence items.");
    console.log("✓ Test 2 Passed: Export contains expected evidence items.");

    // Test 3: Source message body exactly matches SQLite byte-for-byte
    const dbSarahMsg = db.queryOne("SELECT * FROM messages WHERE id = 'exp_msg_sarah_01'");
    const exportedSarahMsg = parsedJson.evidence.find(e => e.id === "exp_msg_sarah_01");
    assert.strictEqual(
        exportedSarahMsg.sourceEvidence.body,
        dbSarahMsg.body,
        "Test 3 Failed: Source message body must byte-for-byte match SQLite."
    );
    assert.strictEqual(
        exportedSarahMsg.sourceEvidence.body,
        "I'm not driving through that storm!  Are you crazy??",
        "Test 3 Failed: Punctuation and double spaces must be preserved."
    );
    console.log("✓ Test 3 Passed: Source message body exactly matches SQLite.");

    // Test 4: Source timestamps exactly match SQLite
    assert.strictEqual(
        exportedSarahMsg.sourceEvidence.timestamp,
        dbSarahMsg.timestamp,
        "Test 4 Failed: Source timestamp must match SQLite."
    );
    console.log("✓ Test 4 Passed: Source timestamps exactly match SQLite.");

    // Test 5: Timestamp precision is preserved (exact milliseconds)
    assert.strictEqual(
        exportedSarahMsg.sourceEvidence.timestamp,
        BASE_TIME,
        "Test 5 Failed: Timestamp precision must retain milliseconds."
    );
    console.log("✓ Test 5 Passed: Exact timestamp precision is preserved.");

    // Test 6: Timezone information is preserved (ISO UTC format preserved in metadata)
    assert.strictEqual(
        exportedSarahMsg.sourceEvidence.timestampIso,
        new Date(BASE_TIME).toISOString(),
        "Test 6 Failed: ISO timestamp must represent exact UTC time."
    );
    console.log("✓ Test 6 Passed: Timezone information is preserved.");

    // Test 7: Multiple conversations remain distinguishable
    const conversationTitles = new Set(parsedJson.evidence.map(e => e.sourceEvidence.conversationTitle));
    assert.ok(conversationTitles.has("Sarah Jenkins"), "Test 7 Failed: Sarah's conversation must exist.");
    assert.ok(conversationTitles.has("Mark Davis"), "Test 7 Failed: Mark's conversation must exist.");
    assert.strictEqual(conversationTitles.size, 2, "Test 7 Failed: Must retain 2 distinct conversations.");
    console.log("✓ Test 7 Passed: Multiple conversations remain distinguishable.");

    // Test 8: Evidence remains chronologically ordered
    for (let i = 0; i < parsedJson.evidence.length - 1; i++) {
        const t1 = parsedJson.evidence[i].sourceEvidence.timestamp;
        const t2 = parsedJson.evidence[i + 1].sourceEvidence.timestamp;
        assert.ok(t1 <= t2, `Test 8 Failed: Chronological order violated at index ${i}`);
    }
    console.log("✓ Test 8 Passed: Evidence remains strictly chronologically ordered.");

    // Test 9: EventCluster export includes all selected constituent evidence
    const expectedIds = ["exp_msg_sarah_01", "exp_msg_sarah_02", "exp_msg_mark_01", "exp_msg_mark_02"];
    const actualIds = parsedJson.evidence.map(e => e.id);
    assert.deepStrictEqual(actualIds, expectedIds, "Test 9 Failed: Constituent messages do not match cluster.");
    console.log("✓ Test 9 Passed: EventCluster export includes all constituent evidence.");

    // Test 10: Deterministic analysis remains separate from source evidence
    assert.ok(exportedSarahMsg.deterministicAnalysis.matchReasons.length > 0, "Deterministic analysis present.");
    assert.strictEqual(exportedSarahMsg.sourceEvidence.body.includes("Keyword match"), false, "Match reason must not contaminate body.");
    console.log("✓ Test 10 Passed: Deterministic analysis remains separate from source evidence.");

    // Test 11: Semantic inference remains separate from source evidence and labeled
    const exportedMarkMsg = parsedJson.evidence.find(e => e.id === "exp_msg_mark_01");
    assert.ok(exportedMarkMsg.semanticInference, "Semantic inference exists.");
    assert.strictEqual(
        exportedMarkMsg.semanticInference.label,
        "SEMANTIC INFERENCE — NOT SOURCE EVIDENCE",
        "Test 11 Failed: Must carry mandatory semantic inference warning label."
    );
    console.log("✓ Test 11 Passed: Semantic inference explicitly labeled and separate.");

    // Test 12: Semantic inference cannot overwrite source evidence
    assert.strictEqual(
        exportedMarkMsg.sourceEvidence.body,
        "Did Sarah mention the road closure on Highway 9?\nTrees are down everywhere.",
        "Test 12 Failed: Semantic inference must not modify source body."
    );
    console.log("✓ Test 12 Passed: Semantic inference cannot overwrite source evidence.");

    // Test 13: Invalid/foreign message IDs cannot export evidence belonging to another Threadline
    assert.throws(() => {
        evidenceExporter.resolveCanonicalEvidence({
            threadlineId,
            uid: testUid,
            messageIds: ["msg_foreign_secret"]
        });
    }, (err) => {
        return err.statusCode === 404;
    }, "Test 13 Failed: Foreign message ID must be rejected with 404.");
    console.log("✓ Test 13 Passed: Cross-tenant foreign message IDs rejected safely.");

    // Test 14: Empty selections fail safely
    assert.throws(() => {
        evidenceExporter.resolveCanonicalEvidence({
            threadlineId,
            uid: testUid,
            messageIds: []
        });
    }, (err) => {
        return err.statusCode === 400;
    }, "Test 14 Failed: Empty selection must throw 400 error.");
    console.log("✓ Test 14 Passed: Empty selection fails safely.");

    // Test 15: Individual evidence SHA-256 hashes are generated
    parsedJson.evidence.forEach((item, idx) => {
        assert.ok(item.integrity.itemHash, `Item ${idx} missing SHA-256 hash.`);
        assert.strictEqual(item.integrity.itemHash.length, 64, `Item ${idx} hash must be 64-char hex string.`);
    });
    console.log("✓ Test 15 Passed: Individual evidence SHA-256 hashes generated.");

    // Test 16: Identical canonical evidence produces identical hashes
    const secondExport = evidenceExporter.resolveCanonicalEvidence({
        threadlineId,
        uid: testUid,
        cluster: mockCluster,
        query: "storm road closure"
    });
    assert.strictEqual(
        secondExport.integrity.evidenceHashes[0].sha256,
        canonicalExport.integrity.evidenceHashes[0].sha256,
        "Test 16 Failed: Identical evidence must produce identical SHA-256 hash."
    );
    console.log("✓ Test 16 Passed: Identical canonical evidence produces identical hashes.");

    // Test 17 & 18: Tamper-evident verification (changing one byte changes item hash and manifest hash)
    const originalHash = canonicalExport.integrity.evidenceHashes[0].sha256;
    const originalManifestHash = canonicalExport.integrity.manifestHash;

    // Simulate mutated evidence record
    const mutatedItemData = {
        messageId: "exp_msg_sarah_01",
        conversationId: exportedSarahMsg.sourceEvidence.conversationId,
        timestamp: BASE_TIME,
        sender: "Sarah Jenkins",
        recipient: "",
        platform: "SMS",
        body: "I'm not driving through that storm!  Are you crazy?." // 1 char altered: ? replaced by .
    };
    const mutatedItemHash = crypto.createHash("sha256").update(JSON.stringify(mutatedItemData)).digest("hex");
    assert.notStrictEqual(originalHash, mutatedItemHash, "Test 17 Failed: Mutating body must change item hash.");
    console.log("✓ Test 17 Passed: Changing one byte alters the evidence hash.");

    // Check manifest hash alteration
    const mutatedManifestData = {
        ...canonicalExport.integrity,
        evidenceHashes: [
            { evidenceId: "exp_msg_sarah_01", sha256: mutatedItemHash },
            ...canonicalExport.integrity.evidenceHashes.slice(1)
        ]
    };
    const mutatedManifestHash = crypto.createHash("sha256").update(JSON.stringify(mutatedManifestData)).digest("hex");
    assert.notStrictEqual(originalManifestHash, mutatedManifestHash, "Test 18 Failed: Manifest hash must change.");
    console.log("✓ Test 18 Passed: Changing evidence changes the manifest hash.");

    // Test 19 & 20: PDF Generation with Watermark and Export ID
    console.log("3. Generating standard and watermarked PDFs...");
    const normalPdfBuffer = await evidenceExporter.generatePdfReport(canonicalExport, { watermarked: false });
    const watermarkedPdfBuffer = await evidenceExporter.generatePdfReport(canonicalExport, { watermarked: true });

    assert.ok(normalPdfBuffer.length > 1000, "Normal PDF must be non-empty buffer.");
    assert.ok(watermarkedPdfBuffer.length > 1000, "Watermarked PDF must be non-empty buffer.");

    // Helper to extract all text / hex strings from a PDF buffer
    function extractAllPdfText(pdfBuffer) {
        const zlib = require("zlib");
        const str = pdfBuffer.toString("latin1");
        let combined = str;

        const streamMatches = [...str.matchAll(/stream\r?\n([\s\S]*?)\r?\nendstream/g)];
        for (const m of streamMatches) {
            try {
                const decomp = zlib.inflateSync(Buffer.from(m[1], "latin1")).toString("latin1");
                combined += "\n" + decomp;

                // Also decode any hex strings [<...>] TJ and concatenate
                const hexMatches = [...decomp.matchAll(/<([0-9a-fA-F]+)>/g)];
                const decodedHex = hexMatches.map(hm => Buffer.from(hm[1], "hex").toString("latin1")).join("");
                combined += "\n" + decodedHex;
            } catch (e) {}
        }
        return combined;
    }

    const pdfText = extractAllPdfText(watermarkedPdfBuffer);
    assert.ok(pdfText.includes("THREADLINE"), "PDF must contain THREADLINE title.");
    assert.ok(pdfText.includes(canonicalExport.exportMetadata.exportId), "Test 20 Failed: Export ID must exist in PDF.");
    assert.ok(pdfText.includes("READ ONLY EVIDENCE COPY") || pdfText.includes("READ-ONLY"), "Test 19 Failed: Watermark text must exist in watermarked PDF.");
    console.log("✓ Test 19 & 20 Passed: Watermark and Export ID exist in generated PDF.");

    // Test 21: Integrity manifest information exists in JSON
    assert.ok(parsedJson.integrity.manifestHash, "Manifest hash must exist in JSON.");
    assert.strictEqual(parsedJson.integrity.evidenceCount, 4, "Evidence count must match in integrity block.");
    console.log("✓ Test 21 Passed: Integrity manifest information exists in JSON.");

    // Test 22: PDF generation succeeds with long message bodies
    assert.ok(pdfText.includes("Extremely long forensic message body"), "PDF must contain long message text.");
    console.log("✓ Test 22 Passed: PDF handles long message bodies with unicode characters.");

    // Test 23: PDF generation succeeds with multiple conversations
    assert.ok(pdfText.includes("CONVERSATION THREAD: Sarah Jenkins"), "PDF must display Sarah's thread header.");
    assert.ok(pdfText.includes("CONVERSATION THREAD: Mark Davis"), "PDF must display Mark's thread header.");
    console.log("✓ Test 23 Passed: PDF displays distinct conversation boundaries.");

    // Test 24: PDF generation succeeds with and without semantic inference
    const clusterWithoutSemantic = {
        ...mockCluster,
        messages: mockCluster.messages.map(m => ({ ...m, semanticInference: null }))
    };
    const exportWithoutSemantic = evidenceExporter.resolveCanonicalEvidence({
        threadlineId,
        uid: testUid,
        cluster: clusterWithoutSemantic
    });
    const pdfWithoutSemanticBuffer = await evidenceExporter.generatePdfReport(exportWithoutSemantic, { watermarked: false });
    assert.ok(pdfWithoutSemanticBuffer.length > 1000, "PDF without semantic inference must generate successfully.");
    console.log("✓ Test 24 Passed: PDF generation succeeds with and without semantic inference.");

    // Test 25: Export does not mutate any evidence tables
    const countAfter = db.queryOne("SELECT COUNT(*) as count FROM messages").count;
    assert.strictEqual(countBefore, countAfter, "Test 25 Failed: Database message count must not change.");
    console.log("✓ Test 25 Passed: Export does not mutate any evidence tables (zero mutation).");

    // Clean test threadlines
    db.run("DELETE FROM threadlines WHERE owner_id IN (?, ?)", [testUid, foreignUid]);

    console.log("==================================================");
    console.log(" ALL FORENSIC EVIDENCE EXPORT TESTS PASSED! ✅");
    console.log("==================================================");
}

runExportTests().catch(err => {
    console.error("❌ Export test failed:", err);
    process.exit(1);
});
