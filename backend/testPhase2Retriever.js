const db = require('./database/database');
const searchEngine = require('./search/searchEngine');
const ExchangeRetriever = require('./search/exchangeRetriever');
const ChunkGenerator = require('./search/chunkGenerator');

console.log('==================================================');
console.log('PHASE 2: TESTING VERIFIABLE EXCHANGE RETRIEVER');
console.log('==================================================');

const rawDb = db.getDb();
const dbWrapper = {
    query: (sql, params) => db.query(sql, params),
    queryOne: (sql, params) => db.queryOne(sql, params),
    run: (sql, params) => db.run(sql, params),
    transaction: (fn) => db.transaction(fn),
    prepare: (sql) => rawDb.prepare(sql)
};

const testThreadlineId = 'tl_test_phase2_' + Date.now();
const testConvId = 'conv_test_phase2_' + Date.now();
const testUid = 'user_test_phase2';

db.run("INSERT INTO threadlines (id, owner_id, name, source, platform, created_at, updated_at) VALUES (?, ?, ?, ?, ?, datetime('now'), datetime('now'))",
    [testThreadlineId, testUid, 'Phase 2 Test Threadline', 'synthetic', 'SMS']);

db.run("INSERT INTO conversations (id, threadline_id, platform, title, start_date, end_date) VALUES (?, ?, ?, ?, 100000, 900000)",
    [testConvId, testThreadlineId, 'SMS', 'Sarah Jenkins']);

const baseTime = 1775836800000;

const testMessages = [
    { id: 'p2_msg_1', conv: testConvId, tl: testThreadlineId, sender: 'Me', time: baseTime + 1000, body: 'Can I pick up the kids tomorrow at 5 for dinner?' },
    { id: 'p2_msg_2', conv: testConvId, tl: testThreadlineId, sender: 'Sarah', time: baseTime + 60000, body: 'No, you cannot. Talk to my lawyer.' },
    { id: 'p2_msg_3', conv: testConvId, tl: testThreadlineId, sender: 'Me', time: baseTime + 120000, body: 'We have court scheduled, why are you refusing?' },
    { id: 'p2_msg_4', conv: testConvId, tl: testThreadlineId, sender: 'Sarah', time: baseTime + 1500000, body: 'I am refusing because you did not give 48 hours notice.' },
    { id: 'p2_msg_5', conv: testConvId, tl: testThreadlineId, sender: 'Me', time: baseTime + 172800000, body: 'Could we do visitation this Sunday afternoon instead?' },
    { id: 'p2_msg_6', conv: testConvId, tl: testThreadlineId, sender: 'Sarah', time: baseTime + 172860000, body: 'Only if you drop them off by 6 PM sharp, otherwise no.' },
    { id: 'p2_msg_7', conv: testConvId, tl: testThreadlineId, sender: 'Me', time: baseTime + 432000000, body: 'Can I take the children camping next weekend?' },
    { id: 'p2_msg_8', conv: testConvId, tl: testThreadlineId, sender: 'Sarah', time: baseTime + 432060000, body: 'We already have plans and the weather looks terrible anyway.' },
    { id: 'p2_msg_9', conv: testConvId, tl: testThreadlineId, sender: 'Sarah', time: baseTime + 600000000, body: 'What time does the store close tonight?' },
    { id: 'p2_msg_10', conv: testConvId, tl: testThreadlineId, sender: 'Me', time: baseTime + 600060000, body: 'I think the store closes at 9 PM.' }
];

const insertMsg = db.getDb().prepare("INSERT INTO messages (id, conversation_id, threadline_id, sender, timestamp, body, direction, platform) VALUES (?, ?, ?, ?, ?, ?, 'received', 'SMS')");
testMessages.forEach(m => {
    insertMsg.run(m.id, m.conv, m.tl, m.sender, m.time, m.body);
});

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

    console.log('\n--- TEST 1: Retrieve Explicit Refusal Query ---');
    const start1 = Date.now();
    const res1 = await retriever.retrieveExchanges(testThreadlineId, 'Find times she refused parenting time or denied visitation', { batchSize: 5 });
    const latency1 = Date.now() - start1;

    console.log(`Latency: ${latency1}ms, Total Eligible Found: ${res1.archiveCoverage.totalEligibleExchanges}`);
    assert(res1.status === 'success', 'Status is success');
    assert(res1.archiveCoverage.totalEligibleExchanges >= 2, 'Found at least 2 relevant exchanges');
    assert(res1.archiveCoverage.isCompleteArchiveEvaluated === true, 'Archive coverage confirms complete evaluation');
    assert(res1.results.length > 0, 'Returned non-empty batch results');
    
    const topResult = res1.results[0];
    assert(topResult.detectedSignals.hasDirectRefusal === true, 'Top result detected direct refusal');
    assert(topResult.initialCategory === 'explicit_refusal', 'Top result classified as explicit_refusal');
    assert(topResult.messages.length >= 2, 'Top result contains reconstructed dialogue exchange');
    assert(topResult.messages.some(m => m.id === 'p2_msg_1'), 'Top result contains original request message ID');
    assert(topResult.messages.some(m => m.id === 'p2_msg_2'), 'Top result contains original refusal message ID');

    console.log('\n--- TEST 2: Overlapping Context & Delayed Replies ---');
    const mergedRefusalExchange = res1.results.find(r => r.messages.some(m => m.id === 'p2_msg_4'));
    assert(mergedRefusalExchange !== undefined, 'Delayed reply message was preserved in exchange');
    assert(mergedRefusalExchange.messages.some(m => m.id === 'p2_msg_1'), 'Initial request preserved in merged delayed exchange');

    console.log('\n--- TEST 3: Retrieve Conditional Agreement ---');
    const res3 = await retriever.retrieveExchanges(testThreadlineId, 'visitation agreement conditions', { batchSize: 5 });
    const conditionalResult = res3.results.find(r => r.messages.some(m => m.id === 'p2_msg_6'));
    assert(conditionalResult !== undefined, 'Conditional agreement retrieved');
    assert(conditionalResult.detectedSignals.hasConditional === true, 'Detected conditional constraint signal');
    assert(conditionalResult.initialCategory === 'conditional_response', 'Classified as conditional_response');

    console.log('\n--- TEST 4: Multi-Batch Pagination ---');
    const page1 = await retriever.retrieveExchanges(testThreadlineId, 'parenting time', { page: 1, batchSize: 1 });
    const page2 = await retriever.retrieveExchanges(testThreadlineId, 'parenting time', { page: 2, batchSize: 1 });

    assert(page1.archiveCoverage.totalEligibleExchanges >= 2, 'Total eligible reflects entire archive');
    assert(page1.archiveCoverage.batchIndex === 1, 'Batch index is 1');
    assert(page1.archiveCoverage.hasMore === true, 'Page 1 hasMore is true');
    assert(page2.archiveCoverage.batchIndex === 2, 'Batch index is 2');
    assert(page1.results[0].exchangeId !== page2.results[0].exchangeId, 'Page 1 and Page 2 return distinct exchanges');

    console.log('\n--- TEST 5: Unrelated Match Filtering ---');
    assert(!res1.results.some(r => r.messages.some(m => m.id === 'p2_msg_9')), 'Unrelated store conversation excluded from refusal search');

    // Clean up
    db.run("DELETE FROM conversation_chunks WHERE conversation_id = ?", [testConvId]);
    db.run("DELETE FROM chunks_fts WHERE chunk_id IN (SELECT id FROM conversation_chunks WHERE conversation_id = ?)", [testConvId]);
    db.run("DELETE FROM messages WHERE conversation_id = ?", [testConvId]);
    db.run("DELETE FROM conversations WHERE id = ?", [testConvId]);
    db.run("DELETE FROM threadlines WHERE id = ?", [testThreadlineId]);
    console.log('\n✓ Cleaned up synthetic test data.');

    console.log('==================================================');
    console.log(`RESULTS: ${passed} passed, ${failed} failed`);
    console.log('==================================================');

    if (failed > 0) process.exit(1);
}

runTests().catch(err => {
    console.error('Test execution error:', err);
    process.exit(1);
});
