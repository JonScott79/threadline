const db = require('./database/database');
const searchEngine = require('./search/searchEngine');
const ExchangeRetriever = require('./search/exchangeRetriever');
const ChunkGenerator = require('./search/chunkGenerator');
const semanticAdapter = require('./search/semantic/semanticAdapter');
const SemanticSchemaValidator = require('./search/semantic/semanticSchema');

console.log('================================================================');
console.log('PHASE 3: TESTING BOUNDED LLM CLASSIFIER & STRUCTURED SCHEMAS');
console.log('================================================================');

const rawDb = db.getDb();
const dbWrapper = {
    query: (sql, params) => db.query(sql, params),
    queryOne: (sql, params) => db.queryOne(sql, params),
    run: (sql, params) => db.run(sql, params),
    transaction: (fn) => db.transaction(fn),
    prepare: (sql) => rawDb.prepare(sql)
};

const testThreadlineId = 'tl_test_phase3_' + Date.now();
const testConvId = 'conv_test_phase3_' + Date.now();
const testUid = 'user_test_phase3';

db.run("INSERT INTO threadlines (id, owner_id, name, source, platform, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
    [testThreadlineId, testUid, 'Phase 3 Test Threadline', 'synthetic', 'SMS']);

db.run("INSERT INTO conversations (id, threadline_id, platform, title, start_date, end_date) VALUES (?, ?, ?, ?, 100000, 900000)",
    [testConvId, testThreadlineId, 'SMS', 'Sarah Jenkins']);

const baseTime = 1775836800000;

const testMessages = [
    // 1. Explicit Refusal:
    { id: 'p3_msg_1', conv: testConvId, tl: testThreadlineId, sender: 'Me', time: baseTime + 1000, body: 'Can I pick up the kids tomorrow at 5 for dinner?' },
    { id: 'p3_msg_2', conv: testConvId, tl: testThreadlineId, sender: 'Sarah', time: baseTime + 60000, body: 'No, you cannot. Talk to my lawyer.' },

    // 2. Conditional Response (2 days later):
    { id: 'p3_msg_3', conv: testConvId, tl: testThreadlineId, sender: 'Me', time: baseTime + 172800000, body: 'Could we do visitation this Sunday afternoon instead?' },
    { id: 'p3_msg_4', conv: testConvId, tl: testThreadlineId, sender: 'Sarah', time: baseTime + 172860000, body: 'Only if you drop them off by 6 PM sharp, otherwise no.' },

    // 3. Indirect Objection (5 days later):
    { id: 'p3_msg_5', conv: testConvId, tl: testThreadlineId, sender: 'Me', time: baseTime + 432000000, body: 'Can I take the children camping next weekend?' },
    { id: 'p3_msg_6', conv: testConvId, tl: testThreadlineId, sender: 'Sarah', time: baseTime + 432060000, body: 'We already have plans and the weather looks terrible anyway.' },

    // 4. Changed Response (Agreement followed by withdrawal) (8 days later):
    { id: 'p3_msg_7', conv: testConvId, tl: testThreadlineId, sender: 'Me', time: baseTime + 691200000, body: 'Can I have the kids for Thanksgiving dinner?' },
    { id: 'p3_msg_8', conv: testConvId, tl: testThreadlineId, sender: 'Sarah', time: baseTime + 691260000, body: 'Yes, that works.' },
    { id: 'p3_msg_9', conv: testConvId, tl: testThreadlineId, sender: 'Sarah', time: baseTime + 691860000, body: 'Actually I changed my mind, my family is coming into town so you cannot take them.' },

    // 5. Ambiguous Exchange (11 days later):
    { id: 'p3_msg_10', conv: testConvId, tl: testThreadlineId, sender: 'Me', time: baseTime + 950400000, body: 'Are we still meeting at the park?' },
    { id: 'p3_msg_11', conv: testConvId, tl: testThreadlineId, sender: 'Sarah', time: baseTime + 950460000, body: 'I need to check something first.' }
];

const insertMsg = db.getDb().prepare("INSERT INTO messages (id, conversation_id, threadline_id, sender, timestamp, body, direction, platform) VALUES (?, ?, ?, ?, ?, ?, 'received', 'SMS')");
testMessages.forEach(m => insertMsg.run(m.id, m.conv, m.tl, m.sender, m.time, m.body));

const generator = new ChunkGenerator(dbWrapper);
generator.indexConversation(testConvId, { forceRebuild: true });
console.log('✓ Synthetic test dataset created and indexed.');

const retriever = new ExchangeRetriever(db, searchEngine);

async function runTests() {
    let passed = 0;
    let failed = 0;

    function assert(cond, desc) {
        if (cond) {
            console.log('✓ PASS:', desc);
            passed++;
        } else {
            console.error('✗ FAIL:', desc);
            failed++;
        }
    }

    console.log('\n--- TEST 1: Schema Validator Strict Invariant Enforcement ---');
    const validIds = ['chk_valid_1', 'chk_valid_2'];
    
    const malformedRaw = {
        evaluations: [
            { exchangeId: 'chk_valid_1', outcomeCategory: 'explicit_refusal', confidence: 0.95, explanation: 'Direct denial', keyQuote: 'No' },
            { exchangeId: 'chk_hallucinated_999', outcomeCategory: 'explicit_refusal', confidence: 0.99 },
            { exchangeId: 'chk_valid_2', outcomeCategory: 'UNKNOWN_INVALID_CAT', confidence: 'not-a-number' }
        ]
    };

    const validated = SemanticSchemaValidator.validateExchangeOutcomeOutput(malformedRaw, validIds);
    assert(validated.schemaVersion === '1.0.0', 'Schema version 1.0.0 stamped');
    assert(validated.evaluatedCount === 2, 'Only 2 valid exchanges accepted');
    assert(validated.unmatchedCount === 1, 'Hallucinated ID detected and rejected');
    assert(validated.evaluations[0].exchangeId === 'chk_valid_1', 'Valid ID 1 preserved');
    assert(validated.evaluations[0].outcomeCategory === 'explicit_refusal', 'Explicit refusal enum recognized');
    assert(validated.evaluations[1].outcomeCategory === 'ambiguous_outcome', 'Invalid category safely defaulted to ambiguous_outcome');
    assert(validated.evaluations[1].confidence === 0.5, 'Invalid confidence safely defaulted to 0.5');

    const duplicateRaw = {
        evaluations: [
            { exchangeId: 'chk_valid_1', outcomeCategory: 'explicit_refusal' },
            { exchangeId: 'chk_valid_1', outcomeCategory: 'conditional_response' }
        ]
    };
    const deduplicated = SemanticSchemaValidator.validateExchangeOutcomeOutput(duplicateRaw, validIds);
    assert(deduplicated.evaluatedCount === 1, 'Duplicate exchange ID rejected');

    console.log('\n--- TEST 2: Deterministic Simple Search Invariant (Without AI) ---');
    semanticAdapter.configureProvider('disabled');
    const simpleRes = await retriever.retrieveExchanges(testThreadlineId, 'visitation', { mode: 'simple' });
    assert(simpleRes.status === 'success', 'Simple search succeeded');
    assert(simpleRes.mode === 'deterministic', 'Reported deterministic mode');
    assert(simpleRes.aiDiagnostics === null, 'No AI diagnostics attached');
    assert(simpleRes.results.length > 0, 'Simple search returned results');
    assert(simpleRes.results.every(r => r.aiClassification === null), 'Every result has null aiClassification');

    console.log('\n--- TEST 3: Bounded AI Classification with Local Ollama ---');
    semanticAdapter.configureProvider('ollama', { timeoutMs: 35000 });
    const info = semanticAdapter.getProviderInfo();
    console.log(`Provider configured: ${info.providerName} (${info.model}), Local: ${info.isLocal}`);

    const startAi = Date.now();
    const aiRes = await retriever.retrieveExchanges(testThreadlineId, 'Find times she refused or said no to taking the kids', {
        mode: 'ai',
        batchSize: 2,
        timeoutMs: 60000
    });
    const aiLatency = Date.now() - startAi;
    console.log(`AI Retrieval & Classification Latency: ${aiLatency}ms`);

    assert(aiRes.status === 'success', 'AI search succeeded');
    assert(aiRes.mode === 'ai', 'Result mode indicates AI classification applied');
    assert(aiRes.aiDiagnostics !== null, 'AI diagnostics attached');
    assert(aiRes.aiDiagnostics.candidatesSubmitted <= 5, 'Candidate batch strictly bounded (<= 5)');

    console.log('\nInspecting Classified Exchanges:');
    aiRes.results.forEach((r, idx) => {
        console.log(`[Result ${idx + 1}] ID: ${r.exchangeId}, Score: ${r.relevanceScore}, Initial: ${r.initialCategory}, AI: ${r.finalCategory}`);
        if (r.aiClassification) {
            console.log(`  Confidence: ${r.aiClassification.confidence}`);
            console.log(`  Explanation: ${r.aiClassification.explanation}`);
            console.log(`  Key Quote: "${r.aiClassification.keyQuote}"`);
        }
    });

    const refusalMatch = aiRes.results.find(r => r.messages.some(m => m.id === 'p3_msg_2'));
    assert(refusalMatch !== undefined, 'Explicit refusal exchange retrieved');
    assert(refusalMatch.finalCategory === 'explicit_refusal', 'Explicit refusal correctly classified');

    console.log('\n--- TEST 4: Provider Failure & Timeout Isolation ---');
    semanticAdapter.configureProvider('ollama', { url: 'http://localhost:9999', timeoutMs: 1000 });
    const fallbackRes = await retriever.retrieveExchanges(testThreadlineId, 'visitation refusal', {
        mode: 'ai',
        timeoutMs: 1000
    });

    assert(fallbackRes.status === 'success', 'Fallback search succeeded without throwing');
    assert(fallbackRes.mode === 'deterministic', 'Cleanly fell back to deterministic mode');
    assert(fallbackRes.aiDiagnostics.fallback === 'deterministic', 'Diagnostic recorded deterministic fallback');
    assert(fallbackRes.results.length > 0, 'Returned valid results using deterministic classification');

    // Clean up
    db.run("DELETE FROM conversation_chunks WHERE conversation_id = ?", [testConvId]);
    db.run("DELETE FROM chunks_fts WHERE chunk_id IN (SELECT id FROM conversation_chunks WHERE conversation_id = ?)", [testConvId]);
    db.run("DELETE FROM messages WHERE conversation_id = ?", [testConvId]);
    db.run("DELETE FROM conversations WHERE id = ?", [testConvId]);
    db.run("DELETE FROM threadlines WHERE id = ?", [testThreadlineId]);
    console.log('\n✓ Cleaned up synthetic test data.');

    console.log('================================================================');
    console.log(`PHASE 3 RESULTS: ${passed} passed, ${failed} failed`);
    console.log('================================================================');

    if (failed > 0) process.exit(1);
}

runTests().catch(err => {
    console.error('Test execution error:', err);
    process.exit(1);
});
