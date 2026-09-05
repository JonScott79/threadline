/*
    runSemanticBenchmark.js

    Diagnostic runner for Step 10 Semantic Benchmark:
    Three-way comparison:
    - BASELINE A: Deterministic only (THREADLINE_SEMANTIC_ENABLED=false)
    - BASELINE B: Deterministic + Semantic Re-ranking (EXPANSION=false, RE-RANK=true)
    - EXPERIMENT C: Deterministic + Semantic Query Expansion + Semantic Re-ranking (EXPANSION=true, RE-RANK=true)

    Tests across available small models (llama3.2:1b, llama3.2:3b) and reference (llama3:latest).
    Measures:
    - Latency (cold / warm, expansion, re-ranking, total)
    - Precision, Recall, F1
    - True Positives, False Positives (distractor resistance), False Negatives
    - Category-by-category breakdown for all Step 8/9 categories
*/

const db = require("../database/database");
const threadlineService = require("../services/threadlines");
const searchEngine = require("../search/searchEngine");
const semanticAdapter = require("../search/semantic/semanticAdapter");
const { semanticBenchmarkConversations, semanticBenchmarkQueries } = require("./semanticBenchmarkCorpus");

async function evaluateRun(threadlineId, testUid, bq) {
    const start = Date.now();
    const clusters = await searchEngine.search(threadlineId, bq.query, { uid: testUid });
    const elapsed = Date.now() - start;

    const returnedMessages = [];
    clusters.forEach(c => c.messages.forEach(m => returnedMessages.push(m)));

    const tp = bq.targetMessageIds.filter(id => returnedMessages.some(m => m.id === id)).length;
    const fn = bq.targetMessageIds.length - tp;
    const fp = returnedMessages.filter(m => bq.distractorMessageIds && bq.distractorMessageIds.includes(m.id)).length;

    const inferencesCount = returnedMessages.filter(m => m.semanticInference).length;
    const expansionsCount = returnedMessages.filter(m => m.semanticExpansion).length;

    return {
        id: bq.id,
        category: bq.category,
        query: bq.query,
        clustersCount: clusters.length,
        messageCount: returnedMessages.length,
        tp,
        fn,
        fp,
        elapsed,
        inferencesCount,
        expansionsCount,
        messages: returnedMessages
    };
}

function calculateSummaryMetrics(results, totalTarget) {
    let totalTP = 0, totalFN = 0, totalFP = 0, totalElapsed = 0;
    results.forEach(r => {
        totalTP += r.tp;
        totalFN += r.fn;
        totalFP += r.fp;
        totalElapsed += r.elapsed;
    });

    const precision = totalTP + totalFP > 0 ? (totalTP / (totalTP + totalFP)) * 100 : 100;
    const recall = totalTarget > 0 ? (totalTP / totalTarget) * 100 : 0;
    const f1 = precision + recall > 0 ? (2 * precision * recall) / (precision + recall) : 0;
    const avgLatency = (totalElapsed / results.length).toFixed(0);

    return {
        totalTP,
        totalFN,
        totalFP,
        totalTarget,
        precision: precision.toFixed(1),
        recall: recall.toFixed(1),
        f1: f1.toFixed(1),
        totalElapsed,
        avgLatency
    };
}

async function runSemanticBenchmark() {
    console.log("==================================================================");
    console.log(" STEP 10: SEMANTIC QUERY EXPANSION & SMALL-MODEL BENCHMARK");
    console.log("==================================================================");

    const testUid = "user_semantic_step10";
    const threadlineId = `archive_${testUid}`;

    db.run("DELETE FROM threadlines WHERE owner_id = ?", [testUid]);

    let totalMsgCount = 0;
    semanticBenchmarkConversations.forEach(c => totalMsgCount += c.messages.length);

    const archivePayload = {
        filename: "semantic_benchmark_archive.json",
        fileSize: 32768,
        source: "Step 10 Semantic Benchmark",
        platform: "Multi-Platform",
        messageCount: totalMsgCount,
        conversationCount: semanticBenchmarkConversations.length,
        conversations: semanticBenchmarkConversations
    };

    console.log(`1. Ingesting benchmark archive (${semanticBenchmarkConversations.length} conversations, ${totalMsgCount} messages)...`);
    await threadlineService.ingestArchive(
        testUid,
        archivePayload,
        archivePayload.filename,
        archivePayload.fileSize,
        threadlineId
    );
    console.log("✓ Benchmark archive ingested into SQLite database.\n");

    let totalTarget = 0;
    semanticBenchmarkQueries.forEach(q => totalTarget += q.targetMessageIds.length);

    // ================================================================
    // RUN 1: BASELINE A — DETERMINISTIC ONLY
    // ================================================================
    console.log("==================================================================");
    console.log(" RUN 1: BASELINE A — DETERMINISTIC ONLY");
    console.log("==================================================================");
    process.env.THREADLINE_SEMANTIC_ENABLED = "false";
    semanticAdapter.init();

    const baselineAResults = [];
    for (const bq of semanticBenchmarkQueries) {
        const res = await evaluateRun(threadlineId, testUid, bq);
        baselineAResults.push(res);
    }
    const metricsA = calculateSummaryMetrics(baselineAResults, totalTarget);
    console.log(`Baseline A (Deterministic): Precision: ${metricsA.precision}%, Recall: ${metricsA.recall}%, F1: ${metricsA.f1}% (TP: ${metricsA.totalTP}/${totalTarget}, FP: ${metricsA.totalFP}, FN: ${metricsA.totalFN}, Avg Latency: ${metricsA.avgLatency}ms)`);

    // Models to benchmark
    const modelsToTest = [
        { name: "llama3.2:3b", label: "3B Small Model (Balanced)" },
        { name: "llama3.2:1b", label: "1B Ultra-fast Small Model" },
        { name: "llama3:latest", label: "8B Reference Model" }
    ];

    const modelComparisonReports = [];

    for (const m of modelsToTest) {
        console.log(`\n==================================================================`);
        console.log(` EVALUATING MODEL: ${m.name} (${m.label})`);
        console.log(`==================================================================`);

        process.env.THREADLINE_SEMANTIC_ENABLED = "true";
        process.env.THREADLINE_OLLAMA_MODEL = m.name;
        process.env.THREADLINE_SEMANTIC_TIMEOUT_MS = "25000";

        // Condition B: Re-ranking Only (Expansion Disabled)
        console.log(`\n--- [Condition B: Re-ranking Only with ${m.name}] ---`);
        process.env.THREADLINE_SEMANTIC_EXPANSION_ENABLED = "false";
        semanticAdapter.init();

        const condBResults = [];
        for (const bq of semanticBenchmarkQueries) {
            const res = await evaluateRun(threadlineId, testUid, bq);
            condBResults.push(res);
        }
        const metricsB = calculateSummaryMetrics(condBResults, totalTarget);
        console.log(`Condition B (${m.name} Re-ranking): Precision: ${metricsB.precision}%, Recall: ${metricsB.recall}%, F1: ${metricsB.f1}% (Avg Latency: ${metricsB.avgLatency}ms)`);

        // Condition C: Query Expansion + Re-ranking
        console.log(`\n--- [Condition C: Expansion + Re-ranking with ${m.name}] ---`);
        process.env.THREADLINE_SEMANTIC_EXPANSION_ENABLED = "true";
        semanticAdapter.init();

        const condCResults = [];
        for (const bq of semanticBenchmarkQueries) {
            process.stdout.write(`  Query ${bq.id}... `);
            const res = await evaluateRun(threadlineId, testUid, bq);
            console.log(`[${res.elapsed}ms] TP: ${res.tp}/${bq.targetMessageIds.length}, FP: ${res.fp}, Exp: ${res.expansionsCount}, Inf: ${res.inferencesCount}`);
            if (res.expansionsCount > 0) {
                const sample = res.messages.find(msg => msg.semanticExpansion);
                if (sample && sample.semanticExpansion) {
                    console.log(`    ↳ Expanded term matched: "${sample.semanticExpansion.expandedTerm}" (conf: ${sample.semanticExpansion.confidence})`);
                }
            }
            condCResults.push(res);
        }
        const metricsC = calculateSummaryMetrics(condCResults, totalTarget);
        console.log(`Condition C (${m.name} Exp+Re-rank): Precision: ${metricsC.precision}%, Recall: ${metricsC.recall}%, F1: ${metricsC.f1}% (TP: ${metricsC.totalTP}/${totalTarget}, FP: ${metricsC.totalFP}, FN: ${metricsC.totalFN}, Avg Latency: ${metricsC.avgLatency}ms)`);

        modelComparisonReports.push({
            model: m.name,
            label: m.label,
            metricsB,
            metricsC,
            detailsC: condCResults
        });
    }

    // Reset environment
    process.env.THREADLINE_SEMANTIC_ENABLED = "false";
    process.env.THREADLINE_SEMANTIC_EXPANSION_ENABLED = "true";
    semanticAdapter.init();

    // ================================================================
    // THREE-WAY COMPARATIVE MATRIX REPORT
    // ================================================================
    console.log("\n==========================================================================================");
    console.log(" STEP 10 BENCHMARK SUMMARY: THREE-WAY ARCHITECTURAL COMPARISON");
    console.log("==========================================================================================");
    console.log(
        "Configuration".padEnd(36) +
        "Precision".padEnd(12) +
        "Recall".padEnd(12) +
        "F1 Score".padEnd(12) +
        "TP/Total".padEnd(12) +
        "FP".padEnd(8) +
        "Avg Latency"
    );
    console.log("-".repeat(95));
    console.log(
        "Baseline A: Deterministic Only".padEnd(36) +
        `${metricsA.precision}%`.padEnd(12) +
        `${metricsA.recall}%`.padEnd(12) +
        `${metricsA.f1}%`.padEnd(12) +
        `${metricsA.totalTP}/${totalTarget}`.padEnd(12) +
        `${metricsA.totalFP}`.padEnd(8) +
        `${metricsA.avgLatency}ms`
    );

    for (const report of modelComparisonReports) {
        console.log(
            `Baseline B: + Re-rank (${report.model})`.padEnd(36) +
            `${report.metricsB.precision}%`.padEnd(12) +
            `${report.metricsB.recall}%`.padEnd(12) +
            `${report.metricsB.f1}%`.padEnd(12) +
            `${report.metricsB.totalTP}/${totalTarget}`.padEnd(12) +
            `${report.metricsB.totalFP}`.padEnd(8) +
            `${report.metricsB.avgLatency}ms`
        );
        console.log(
            `Experiment C: + Exp + Re-rank (${report.model})`.padEnd(36) +
            `${report.metricsC.precision}%`.padEnd(12) +
            `${report.metricsC.recall}%`.padEnd(12) +
            `${report.metricsC.f1}%`.padEnd(12) +
            `${report.metricsC.totalTP}/${totalTarget}`.padEnd(12) +
            `${report.metricsC.totalFP}`.padEnd(8) +
            `${report.metricsC.avgLatency}ms`
        );
    }
    console.log("==========================================================================================\n");

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
