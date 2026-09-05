/*
    runAdversarialBenchmark.js

    Diagnostic runner for Step 6 Adversarial Evaluation.
    Runs the 12 adversarial benchmark queries against the real searchEngine and eventClusterer pipeline,
    recording detailed True Positives, False Positives, False Negatives, Precision, Recall, F1,
    and Event Reconstruction grouping accuracy.
*/

const db = require("../database/database");
const threadlineService = require("../services/threadlines");
const searchEngine = require("../search/searchEngine");
const { adversarialConversations } = require("./adversarialCorpus");
const benchmarkQueries = require("./adversarialQueries");

async function runBenchmark() {
    console.log("==================================================================");
    console.log(" STEP 6: SMART SEARCH ADVERSARIAL EVALUATION");
    console.log("==================================================================");

    const testUid = "user_adversarial_step6";
    const threadlineId = `archive_${testUid}`;

    // Clean any prior run
    db.run("DELETE FROM threadlines WHERE owner_id = ?", [testUid]);

    let totalMsgCount = 0;
    adversarialConversations.forEach(c => totalMsgCount += c.messages.length);

    const archivePayload = {
        filename: "adversarial_archive.json",
        fileSize: 65536,
        source: "Step 6 Forensic Benchmark Archive",
        platform: "Multi-Platform",
        messageCount: totalMsgCount,
        conversationCount: adversarialConversations.length,
        conversations: adversarialConversations
    };

    console.log(`1. Ingesting benchmark archive: ${adversarialConversations.length} conversations, ${totalMsgCount} messages...`);
    await threadlineService.ingestArchive(
        testUid,
        archivePayload,
        archivePayload.filename,
        archivePayload.fileSize,
        threadlineId
    );
    console.log("✓ Benchmark archive ingested successfully into SQLite database.\n");

    let totalTP = 0;
    let totalFP = 0;
    let totalFN = 0;
    let totalGroupingErrors = 0;
    let totalOrderingErrors = 0;

    const queryReports = [];

    console.log("2. Executing 12 Adversarial Benchmark Queries...\n");

    for (const bq of benchmarkQueries) {
        console.log(`------------------------------------------------------------------`);
        console.log(`[${bq.id}] Category: ${bq.category}`);
        console.log(`QUERY: "${bq.query}"`);

        const parsed = searchEngine.parseQuery(bq.query, [threadlineId]);
        console.log("Parsed Intent:", {
            people: parsed.people,
            concepts: parsed.concepts,
            keywords: parsed.keywords,
            relativeOrder: parsed.relativeOrder,
            relativeEvent: parsed.relativeEvent,
            month: parsed.month
        });

        const clusters = await searchEngine.search(threadlineId, bq.query, { uid: testUid });
        console.log(`Returned ${clusters.length} cluster(s):`);

        const returnedMessages = [];
        clusters.forEach((c, idx) => {
            console.log(`  Cluster ${idx + 1} [${c.relevanceScore} pts - ${c.relevance}] "${c.title}" (${c.messages.length} msgs, ${c.conversations.length} convs: [${c.conversations.map(cnv => cnv.title).join(", ")}])`);
            c.messages.forEach(m => {
                returnedMessages.push(m);
                console.log(`    - (${m.sender} in ${m.conversationTitle}): "${m.body}"`);
            });
        });

        // Evaluate message-level precision and recall
        let qTP = 0;
        let qFP = 0;
        let qFN = 0;

        // Check expected snippets (True Positives vs False Negatives)
        for (const exp of bq.expectedMessageSnippets) {
            const found = returnedMessages.some(m => m.body.includes(exp));
            if (found) {
                qTP++;
            } else {
                qFN++;
                console.log(`  ❌ Missing Expected Evidence (FN): "${exp}"`);
            }
        }

        // Check forbidden snippets (False Positives)
        for (const forb of bq.forbiddenSnippets) {
            const found = returnedMessages.some(m => m.body.includes(forb));
            if (found) {
                qFP++;
                console.log(`  ❌ Erroneous Evidence Included (FP): "${forb}"`);
            }
        }

        // Check Event Reconstruction quality
        // 1. Chronological order check within each cluster
        let qOrderingOk = true;
        clusters.forEach(c => {
            for (let i = 1; i < c.messages.length; i++) {
                if (c.messages[i].timestamp < c.messages[i - 1].timestamp) {
                    qOrderingOk = false;
                    totalOrderingErrors++;
                    console.log(`  ❌ Chronological ordering inverted in cluster "${c.title}"`);
                }
            }
        });

        // 2. Expected multi-event separation (e.g. repeated events)
        let qGroupingOk = true;
        if (bq.expectedEvents.length > 1 && clusters.length < bq.expectedEvents.length) {
            // Check if distinct events were improperly merged into a single cluster
            qGroupingOk = false;
            totalGroupingErrors++;
            console.log(`  ❌ Incorrect Event Merging: Expected ${bq.expectedEvents.length} distinct event clusters, got ${clusters.length}`);
        }

        const qPrecision = (qTP + qFP > 0) ? (qTP / (qTP + qFP)) : 0;
        const qRecall = (qTP + qFN > 0) ? (qTP / (qTP + qFN)) : 0;
        const qF1 = (qPrecision + qRecall > 0) ? (2 * qPrecision * qRecall / (qPrecision + qRecall)) : 0;

        totalTP += qTP;
        totalFP += qFP;
        totalFN += qFN;

        queryReports.push({
            id: bq.id,
            category: bq.category,
            query: bq.query,
            tp: qTP,
            fp: qFP,
            fn: qFN,
            precision: qPrecision,
            recall: qRecall,
            f1: qF1,
            groupingOk: qGroupingOk,
            orderingOk: qOrderingOk,
            clusterCount: clusters.length
        });
    }

    const overallPrecision = (totalTP + totalFP > 0) ? (totalTP / (totalTP + totalFP)) : 0;
    const overallRecall = (totalTP + totalFN > 0) ? (totalTP / (totalTP + totalFN)) : 0;
    const overallF1 = (overallPrecision + overallRecall > 0) ? (2 * overallPrecision * overallRecall / (overallPrecision + overallRecall)) : 0;

    console.log("\n==================================================================");
    console.log(" ADVERSARIAL BENCHMARK RESULTS SUMMARY");
    console.log("==================================================================");
    console.log(`Total Benchmark Queries: ${benchmarkQueries.length}`);
    console.log(`True Positives (TP):     ${totalTP}`);
    console.log(`False Positives (FP):    ${totalFP}`);
    console.log(`False Negatives (FN):    ${totalFN}`);
    console.log(`Precision:               ${(overallPrecision * 100).toFixed(1)}%`);
    console.log(`Recall:                  ${(overallRecall * 100).toFixed(1)}%`);
    console.log(`F1 Score:                ${(overallF1 * 100).toFixed(1)}%`);
    console.log(`Chronological Inversions: ${totalOrderingErrors}`);
    console.log(`Event Grouping Mismatches: ${totalGroupingErrors}`);
    console.log("==================================================================\n");

    // Clean up
    db.run("DELETE FROM threadlines WHERE owner_id = ?", [testUid]);
    console.log("✓ Test data cleaned up.\n");

    return {
        queryReports,
        metrics: {
            totalTP,
            totalFP,
            totalFN,
            overallPrecision,
            overallRecall,
            overallF1,
            totalGroupingErrors,
            totalOrderingErrors
        }
    };
}

if (require.main === module) {
    runBenchmark().catch(err => {
        console.error(err);
        process.exit(1);
    });
}

module.exports = runBenchmark;
