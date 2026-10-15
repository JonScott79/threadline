/*
    testPhase4UI.js

    Phase 4 Validation Test Suite: UI Presentation, Verifiable Provenance Links,
    Privacy Boundaries, Coverage Limitations, and AI-Disabled Resilience.

    Requirements Tested:
    1. Separate Simple Search and AI Contextual Search.
    2. Privacy Boundary Enforcement: No silent fallback from local to cloud; cloud requires explicit key.
    3. Verifiable Provenance: Full source message reconstruction, timestamps, speakers, quote grounding.
    4. Accurate Outcome Categories: 7 discrete labels supported without presenting inference as established fact.
    5. Expose Coverage Limitations: total, evaluated, remaining counts, accurate completeness flag.
    6. Graceful Failure & Fallback: Zero disruption to search when AI is offline or times out.
*/

const assert = require("assert");
const db = require("./database/database");
const searchEngine = require("./search/searchEngine");
const ExchangeRetriever = require("./search/exchangeRetriever");
const semanticAdapter = require("./search/semantic/semanticAdapter");

let passed = 0;
let failed = 0;

function testAssert(condition, message) {
    if (condition) {
        passed++;
        console.log(`✓ PASS: ${message}`);
    } else {
        failed++;
        console.error(`✗ FAIL: ${message}`);
    }
}

async function runPhase4Tests() {
    console.log("==================================================================");
    console.log("PHASE 4 TEST SUITE: UI PRESENTATION, PROVENANCE & PRIVACY BOUNDS");
    console.log("==================================================================");

    const testUid = "phase4_tester";
    const testThreadlineId = "tl_phase4_suite";
    const testConvId = "conv_phase4_1";
    const testConvId2 = "conv_phase4_2";
    const baseTime = 1715000000000;

    // --- SETUP SYNTHETIC FIXTURES ---
    db.run("INSERT OR REPLACE INTO threadlines (id, owner_id, name, source, platform, created_at, updated_at) VALUES (?, ?, ?, 'sms', 'ios', datetime('now'), datetime('now'))",
        [testThreadlineId, testUid, "Phase 4 Test Threadline"]);

    db.run("INSERT OR REPLACE INTO conversations (id, threadline_id, platform, title, start_date, end_date) VALUES (?, ?, 'sms', ?, 100000, 900000)",
        [testConvId, testThreadlineId, "Custody Coordination"]);

    db.run("INSERT OR REPLACE INTO conversations (id, threadline_id, platform, title, start_date, end_date) VALUES (?, ?, 'sms', ?, 100000, 900000)",
        [testConvId2, testThreadlineId, "Weekend Plans"]);

    // Conversation 1: Explicit Refusal exchange
    const ins = db.getDb().prepare("INSERT OR REPLACE INTO messages (id, conversation_id, threadline_id, sender, timestamp, body, direction, platform) VALUES (?, ?, ?, ?, ?, ?, ?, 'sms')");
    ins.run("p4_msg_1", testConvId, testThreadlineId, "Me", baseTime + 1000, "Can I pick up the kids tomorrow for soccer practice?", "sent");
    ins.run("p4_msg_2", testConvId, testThreadlineId, "Darcy Gilleo", baseTime + 60000, "No, absolutely not. You are not seeing them this weekend.", "received");
    ins.run("p4_msg_3", testConvId, testThreadlineId, "Me", baseTime + 120000, "Why? It is my scheduled Saturday.", "sent");
    ins.run("p4_msg_4", testConvId, testThreadlineId, "Darcy Gilleo", baseTime + 180000, "I said no and that is final.", "received");

    // Conversation 2: Conditional response exchange
    ins.run("p4_msg_5", testConvId2, testThreadlineId, "Me", baseTime + 500000, "Can we swap next Friday for Saturday?", "sent");
    ins.run("p4_msg_6", testConvId2, testThreadlineId, "Darcy Gilleo", baseTime + 560000, "Only if you pay the daycare bill first, unless you do that you cannot take them.", "received");

    // Chunks
    const rawDb = db.getDb();
    const dbWrapper = {
        query: (sql, params) => db.query(sql, params),
        queryOne: (sql, params) => db.queryOne(sql, params),
        run: (sql, params) => db.run(sql, params),
        transaction: (fn) => db.transaction(fn),
        prepare: (sql) => rawDb.prepare(sql)
    };
    const ChunkGenerator = require("./search/chunkGenerator");
    const generator = new ChunkGenerator(dbWrapper);
    generator.indexConversation(testConvId, { forceRebuild: true });
    generator.indexConversation(testConvId2, { forceRebuild: true });
    console.log("✓ Synthetic Phase 4 fixtures indexed.\n");

    const retriever = new ExchangeRetriever(db, searchEngine);

    // =========================================================================
    // 1. SEPARATE SIMPLE SEARCH AND AI CONTEXTUAL SEARCH
    // =========================================================================
    console.log("--- 1. Simple Search Independence & Determinism ---");
    // Ensure semantic adapter is disabled to guarantee zero AI reliance
    semanticAdapter.configureProvider("disabled");
    const simpleRes = await searchEngine.search(testThreadlineId, "soccer practice", { uid: testUid });
    testAssert(Array.isArray(simpleRes), "Simple search returns array of results");
    testAssert(simpleRes.length > 0, "Simple search finds keyword match");
    const hasSoccer = (simpleRes[0].messages && simpleRes[0].messages.some(m => m.body.includes("soccer practice"))) || (simpleRes[0].body && simpleRes[0].body.includes("soccer practice"));
    testAssert(hasSoccer, "Simple search returns exact matching message text");

    // =========================================================================
    // 2. PRIVACY BOUNDARY ENFORCEMENT
    // =========================================================================
    console.log("\n--- 2. Privacy Boundary Enforcement ---");
    // Invariant: Local Ollama MUST NEVER silently fallback to Groq
    semanticAdapter.configureProvider("ollama", { url: "http://localhost:11434" });
    const providerInfo = semanticAdapter.getProviderInfo();
    testAssert(providerInfo.isLocal === true, "Ollama is flagged as 100% local");
    testAssert(providerInfo.providerName === "ollama", "Active provider is strictly ollama");

    // Invariant: Groq Cloud cannot be configured without an explicit API key
    let caughtGroqError = false;
    try {
        delete process.env.GROQ_API_KEY;
        semanticAdapter.configureProvider("groq", { apiKey: "" });
    } catch (err) {
        caughtGroqError = true;
    }
    testAssert(caughtGroqError === true, "Groq Cloud rejected without explicit API key");

    // Invariant: Local failure falls back to deterministic heuristic, NOT cloud
    semanticAdapter.configureProvider("ollama", { url: "http://localhost:9999", timeoutMs: 500 }); // dead port
    const privacyRes = await retriever.retrieveExchanges(testThreadlineId, "refused soccer", {
        mode: "ai",
        timeoutMs: 500
    });
    testAssert(privacyRes.mode === "deterministic", "Dead local Ollama fell back to deterministic heuristic");
    testAssert(privacyRes.aiDiagnostics.fallback === "deterministic", "Diagnostic explicitly documents deterministic fallback");
    testAssert(privacyRes.aiDiagnostics.provider !== "groq", "Dead local Ollama NEVER transmitted to Groq");

    // =========================================================================
    // 3. VERIFIABLE PROVENANCE LINKS
    // =========================================================================
    console.log("\n--- 3. Verifiable Provenance Links & Grounding ---");
    const provRes = await retriever.retrieveExchanges(testThreadlineId, "refused seeing them", {
        mode: "ai",
        batchSize: 10
    });

    testAssert(provRes.results.length > 0, "Retrieved exchange candidates");
    const exchange = provRes.results[0];

    // Every exchange must have stable provenance
    testAssert(Boolean(exchange.conversationId), "Result contains conversationId link");
    testAssert(Boolean(exchange.conversationTitle), "Result contains conversationTitle");
    testAssert(Boolean(exchange.timeSpan?.start && exchange.timeSpan?.end), "Result contains verified timeSpan timestamps");
    testAssert(Array.isArray(exchange.messages) && exchange.messages.length >= 2, "Reconstructs full multi-message exchange");

    // Verify individual source messages contain speaker, timestamp, body
    const firstMsg = exchange.messages[0];
    testAssert(Boolean(firstMsg.sender), "Source message contains speaker name");
    testAssert(typeof firstMsg.timestamp === "number", "Source message contains numeric Unix timestamp");
    testAssert(Boolean(firstMsg.body), "Source message contains raw SQLite text body");

    // Check verifiable quote grounding
    const refusalMsg = exchange.messages.find(m => m.body.includes("not seeing them"));
    testAssert(refusalMsg !== undefined, "Raw SQLite refusal message exists in reconstructed provenance");

    // =========================================================================
    // 4. ACCURATE OUTCOME CATEGORIES
    // =========================================================================
    console.log("\n--- 4. Accurate Outcome Categories ---");
    const allowedCategories = new Set([
        "explicit_refusal",
        "conditional_response",
        "indirect_objection",
        "unanswered_request",
        "changed_response",
        "ambiguous_outcome",
        "unrelated"
    ]);

    testAssert(allowedCategories.has(exchange.finalCategory), `Result category "${exchange.finalCategory}" is one of 7 standard categories`);
    testAssert(exchange.finalCategory === "explicit_refusal", "Direct refusal correctly categorized as explicit_refusal");

    // Test conditional agreement outcome
    const condRes = await retriever.retrieveExchanges(testThreadlineId, "daycare bill swap", {
        mode: "ai",
        batchSize: 10
    });
    testAssert(condRes.results.length > 0, "Retrieved conditional exchange");
    const condExchange = condRes.results.find(r => r.messages.some(m => m.id === "p4_msg_6"));
    testAssert(condExchange !== undefined, "Found exchange with conditional constraint");
    testAssert(condExchange.finalCategory === "conditional_response", "Conditional response correctly categorized");

    // =========================================================================
    // 5. EXPOSE COVERAGE LIMITATIONS & BOUNDED BATCHES
    // =========================================================================
    console.log("\n--- 5. Archive Coverage Limitations ---");
    // With batchSize = 1, we must have more candidates remaining and complete evaluation = false
    const coverageRes = await retriever.retrieveExchanges(testThreadlineId, "Darcy Gilleo kids", {
        mode: "ai",
        batchSize: 1,
        page: 1
    });

    testAssert(coverageRes.archiveCoverage !== null, "Coverage metadata attached to response");
    testAssert(coverageRes.archiveCoverage.totalEligibleExchanges >= 2, "Reports total candidates in archive");
    testAssert(coverageRes.archiveCoverage.batchSize === 1, "Respects bounded batch size limit of 1");
    testAssert(coverageRes.archiveCoverage.hasMore === true, "hasMore is true when candidates remain");
    testAssert(coverageRes.archiveCoverage.isCompleteArchiveEvaluated === false, "isCompleteArchiveEvaluated is FALSE for partial batch");
    testAssert(coverageRes.archiveCoverage.remainingCount >= 1, "Reports exact count of remaining unevaluated candidates");

    // When all items fit in batch, complete evaluation = true
    const completeRes = await retriever.retrieveExchanges(testThreadlineId, "Darcy Gilleo kids", {
        mode: "ai",
        batchSize: 50,
        page: 1
    });
    testAssert(completeRes.archiveCoverage.isCompleteArchiveEvaluated === true, "isCompleteArchiveEvaluated is TRUE when all candidates evaluated");
    testAssert(completeRes.archiveCoverage.remainingCount === 0, "remainingCount is 0 for exhaustive evaluation");

    // =========================================================================
    // 6. RESILIENCE WHEN AI IS OFFLINE
    // =========================================================================
    console.log("\n--- 6. Graceful Degradation When AI Is Disabled ---");
    semanticAdapter.configureProvider("disabled");
    const offlineRes = await retriever.retrieveExchanges(testThreadlineId, "soccer practice", {
        mode: "ai",
        useAI: false
    });
    testAssert(offlineRes.status === "success", "Search succeeds when AI is disabled");
    testAssert(offlineRes.mode === "deterministic", "Reports deterministic mode");
    testAssert(offlineRes.results.length > 0, "Returns deterministic candidate exchanges");
    testAssert(offlineRes.results[0].aiClassification === null, "aiClassification is null without crashing");

    // --- CLEANUP ---
    db.run("DELETE FROM conversation_chunks WHERE conversation_id IN (?, ?)", [testConvId, testConvId2]);
    db.run("DELETE FROM chunks_fts WHERE chunk_id IN (SELECT id FROM conversation_chunks WHERE conversation_id IN (?, ?))", [testConvId, testConvId2]);
    db.run("DELETE FROM messages WHERE conversation_id IN (?, ?)", [testConvId, testConvId2]);
    db.run("DELETE FROM conversations WHERE id IN (?, ?)", [testConvId, testConvId2]);
    db.run("DELETE FROM threadlines WHERE id = ?", [testThreadlineId]);
    console.log("\n✓ Cleaned up synthetic test fixtures.");

    console.log("==================================================================");
    console.log(`PHASE 4 TEST SUITE COMPLETE: ${passed} passed, ${failed} failed`);
    console.log("==================================================================");

    if (failed > 0) {
        process.exit(1);
    }
}

runPhase4Tests().catch(err => {
    console.error("Test execution fatal error:", err);
    process.exit(1);
});
