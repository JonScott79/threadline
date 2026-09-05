/*
    runSemanticBenchmark.js

    Diagnostic runner for Step 9 Local Semantic Intelligence Prototype.
    Executes the semantic benchmark queries under two conditions:
    1. Deterministic baseline (THREADLINE_SEMANTIC_ENABLED=false)
    2. Semantic Intelligence enabled (THREADLINE_SEMANTIC_ENABLED=true, Ollama local inference)

    Measures and reports:
    - Deterministic vs Semantic True Positives, False Positives, False Negatives
    - Precision, Recall, F1 comparison
    - Semantic inference latency per query and overall
    - False-positive semantic associations
    - Structured confidence scores and explanations
*/

const db = require("../database/database");
const threadlineService = require("../services/threadlines");
const searchEngine = require("../search/searchEngine");
const semanticAdapter = require("../search/semantic/semanticAdapter");
const { semanticBenchmarkConversations, semanticBenchmarkQueries } = require("./semanticBenchmarkCorpus");

async function runSemanticBenchmark() {
    console.log("==================================================================");
    console.log(" STEP 9: LOCAL SEMANTIC INTELLIGENCE BENCHMARK");
    console.log("==================================================================");

    const testUid = "user_semantic_benchmark_step9";
    const threadlineId = `archive_${testUid}`;

    // Clean any prior run
    db.run("DELETE FROM threadlines WHERE owner_id = ?", [testUid]);

    let totalMsgCount = 0;
    semanticBenchmarkConversations.forEach(c => totalMsgCount += c.messages.length);

    const archivePayload = {
        filename: "semantic_benchmark_archive.json",
        fileSize: 32768,
        source: "Step 9 Local Semantic Forensic Benchmark",
        platform: "Multi-Platform",
        messageCount: totalMsgCount,
        conversationCount: semanticBenchmarkConversations.length,
        conversations: semanticBenchmarkConversations
    };

    console.log(`\n1. Ingesting semantic benchmark archive (${semanticBenchmarkConversations.length} conversations, ${totalMsgCount} messages)...`);
    await threadlineService.ingestArchive(
        testUid,
        archivePayload,
        archivePayload.filename,
        archivePayload.fileSize,
        threadlineId
    );
    console.log("✓ Benchmark archive ingested into SQLite database.\n");

    // Phase 1: Run Deterministic Baseline
    console.log("==================================================================");
    console.log(" PHASE 1: DETERMINISTIC RETRIEVAL BASELINE (Semantic Disabled)");
    console.log("==================================================================");
    process.env.THREADLINE_SEMANTIC_ENABLED = "false";
    semanticAdapter.init();

    const deterministicResults = [];
    for (const bq of semanticBenchmarkQueries) {
        const start = Date.now();
        const clusters = await searchEngine.search(threadlineId, bq.query, { uid: testUid });
        const elapsed = Date.now() - start;

        const returnedMessages = [];
        clusters.forEach(c => c.messages.forEach(m => returnedMessages.push(m)));

        const tp = bq.targetMessageIds.filter(id => returnedMessages.some(m => m.id === id)).length;
        const fn = bq.targetMessageIds.length - tp;
        const fp = returnedMessages.filter(m => bq.distractorMessageIds && bq.distractorMessageIds.includes(m.id)).length;

        deterministicResults.push({
            id: bq.id,
            category: bq.category,
            query: bq.query,
            clustersCount: clusters.length,
            messageCount: returnedMessages.length,
            tp,
            fn,
            fp,
            elapsed
        });
    }

    // Phase 2: Run Semantic Intelligence Layer
    console.log("\n==================================================================");
    console.log(" PHASE 2: LOCAL SEMANTIC INTELLIGENCE (Semantic Enabled with Ollama)");
    console.log(` Model: ${process.env.THREADLINE_OLLAMA_MODEL || "llama3:latest"}`);
    console.log(` Endpoint: ${process.env.THREADLINE_OLLAMA_URL || "http://localhost:11434"}`);
    console.log("==================================================================");
    process.env.THREADLINE_SEMANTIC_ENABLED = "true";
    process.env.THREADLINE_SEMANTIC_TIMEOUT_MS = "15000";
    semanticAdapter.init();

    const semanticResults = [];
    for (const bq of semanticBenchmarkQueries) {
        console.log(`\n--- Running [${bq.id}]: "${bq.query}" ---`);
        const start = Date.now();
        const clusters = await searchEngine.search(threadlineId, bq.query, { uid: testUid });
        const elapsed = Date.now() - start;

        const returnedMessages = [];
        clusters.forEach(c => {
            c.messages.forEach(m => {
                returnedMessages.push(m);
            });
        });

        const tp = bq.targetMessageIds.filter(id => returnedMessages.some(m => m.id === id)).length;
        const fn = bq.targetMessageIds.length - tp;
        const fp = returnedMessages.filter(m => bq.distractorMessageIds && bq.distractorMessageIds.includes(m.id)).length;

        const semanticInferences = returnedMessages.filter(m => m.semanticInference);

        console.log(`  Elapsed: ${elapsed}ms | Clusters: ${clusters.length} | Returned Msgs: ${returnedMessages.length}`);
        console.log(`  TP: ${tp}/${bq.targetMessageIds.length} | FN: ${fn} | Distractor FP: ${fp}`);
        console.log(`  Semantic Inferences Attached: ${semanticInferences.length}`);
        semanticInferences.forEach(m => {
            console.log(`    - [${m.id}] Score: ${m.semanticInference.relevanceScore} | Reason: ${m.semanticInference.reason}`);
        });

        semanticResults.push({
            id: bq.id,
            category: bq.category,
            query: bq.query,
            clustersCount: clusters.length,
            messageCount: returnedMessages.length,
            tp,
            fn,
            fp,
            elapsed,
            inferencesCount: semanticInferences.length
        });
    }

    // Reset feature flag to false
    process.env.THREADLINE_SEMANTIC_ENABLED = "false";
    semanticAdapter.init();

    // Comparative Analysis & Reporting
    console.log("\n==================================================================");
    console.log(" COMPARATIVE SUMMARY & BENCHMARK METRICS");
    console.log("==================================================================");
    console.log(
        "ID".padEnd(8) +
        "Category".padEnd(32) +
        "Det TP/Target".padEnd(16) +
        "Sem TP/Target".padEnd(16) +
        "Sem FP".padEnd(10) +
        "Sem Latency"
    );
    console.log("-".repeat(90));

    let detTotalTP = 0, detTotalFN = 0, detTotalFP = 0;
    let semTotalTP = 0, semTotalFN = 0, semTotalFP = 0;
    let totalTarget = 0;
    let semTotalLatency = 0;

    for (let i = 0; i < semanticBenchmarkQueries.length; i++) {
        const q = semanticBenchmarkQueries[i];
        const det = deterministicResults[i];
        const sem = semanticResults[i];

        totalTarget += q.targetMessageIds.length;
        detTotalTP += det.tp;
        detTotalFN += det.fn;
        detTotalFP += det.fp;

        semTotalTP += sem.tp;
        semTotalFN += sem.fn;
        semTotalFP += sem.fp;
        semTotalLatency += sem.elapsed;

        console.log(
            q.id.padEnd(8) +
            q.category.slice(0, 30).padEnd(32) +
            `${det.tp}/${q.targetMessageIds.length}`.padEnd(16) +
            `${sem.tp}/${q.targetMessageIds.length}`.padEnd(16) +
            `${sem.fp}`.padEnd(10) +
            `${sem.elapsed}ms`
        );
    }

    const detPrecision = detTotalTP + detTotalFP > 0 ? (detTotalTP / (detTotalTP + detTotalFP)) * 100 : 100;
    const detRecall = totalTarget > 0 ? (detTotalTP / totalTarget) * 100 : 0;
    const detF1 = detPrecision + detRecall > 0 ? (2 * detPrecision * detRecall) / (detPrecision + detRecall) : 0;

    const semPrecision = semTotalTP + semTotalFP > 0 ? (semTotalTP / (semTotalTP + semTotalFP)) * 100 : 100;
    const semRecall = totalTarget > 0 ? (semTotalTP / totalTarget) * 100 : 0;
    const semF1 = semPrecision + semRecall > 0 ? (2 * semPrecision * semRecall) / (semPrecision + semRecall) : 0;

    console.log("=".repeat(90));
    console.log(`DETERMINISTIC RETRIEVAL:`);
    console.log(`  Precision: ${detPrecision.toFixed(1)}% | Recall: ${detRecall.toFixed(1)}% | F1: ${detF1.toFixed(1)}%`);
    console.log(`  TP: ${detTotalTP}/${totalTarget} | FN: ${detTotalFN} | FP: ${detTotalFP}`);

    console.log(`\nSEMANTIC INTELLIGENCE RETRIEVAL:`);
    console.log(`  Precision: ${semPrecision.toFixed(1)}% | Recall: ${semRecall.toFixed(1)}% | F1: ${semF1.toFixed(1)}%`);
    console.log(`  TP: ${semTotalTP}/${totalTarget} | FN: ${semTotalFN} | FP: ${semTotalFP}`);
    console.log(`  Average Semantic Inference Latency: ${(semTotalLatency / semanticBenchmarkQueries.length).toFixed(0)}ms per query`);
    console.log(`  Total Semantic Inference Time: ${(semTotalLatency / 1000).toFixed(2)}s`);
    console.log("==================================================================\n");

    // Clean up test data
    db.run("DELETE FROM threadlines WHERE owner_id = ?", [testUid]);
}

if (require.main === module) {
    runSemanticBenchmark().then(() => {
        process.exit(0);
    }).catch(err => {
        console.error("Semantic benchmark failed:", err);
        process.exit(1);
    });
}

module.exports = { runSemanticBenchmark };
