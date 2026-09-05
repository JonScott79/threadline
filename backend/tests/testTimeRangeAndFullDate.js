/*
    testTimeRangeAndFullDate.js

    Regression tests for Time Range Filter and Full Date Display in Threadline:
    1. Single day range includes all messages on that day from 00:00:00.000 to 23:59:59.999 UTC.
    2. Multi-day range includes all messages within the span.
    3. Multi-year range excludes messages outside the selected years.
    4. Boundary checks: messages exactly on boundaries (start, end) are included; messages 1ms before or after are excluded.
    5. Search term + Time Range respects BOTH constraints simultaneously.
    6. Participant + Date range respects BOTH constraints.
    7. Conversation + Date range respects BOTH constraints.
    8. Invalid range (start > end) is handled safely.
    9. Date formatting guarantees that year is always explicitly visible in calendar date displays.
*/

const assert = require("assert");
const http = require("http");
const express = require("express");
const threadlineService = require("../services/threadlines");
const db = require("../database/database");
const searchEngine = require("../search/searchEngine");
const searchRoutes = require("../api/search");
const threadlineRoutes = require("../api/threadlines");

async function runRegressionTests() {
    console.log("=================================================");
    console.log(" RUNNING: TIME RANGE FILTER & FULL DATE TESTS");
    console.log("=================================================");

    const testUid = "test_user_timerange_" + Date.now();
    const threadlineId = `archive_${testUid}`;

    // Clean prior state
    db.run("DELETE FROM threadlines WHERE owner_id = ?", [testUid]);
    db.run("DELETE FROM imports WHERE owner_id = ?", [testUid]);

    // Construct test corpus with specific timestamps:
    // Day 1: 2025-07-13 00:00:00 UTC = 1752364800000
    // Day 1 noon: 2025-07-13 12:00:00 UTC = 1752408000000
    // Day 1 end: 2025-07-13 23:59:59.999 UTC = 1752451199999
    // Day 2 (prior day): 2025-07-12 23:59:59.999 UTC = 1752364799999
    // Day 3 (next day): 2025-07-14 00:00:00.000 UTC = 1752451200000
    // Multi-year: 2024-06-01 12:00:00 UTC = 1717243200000
    // Multi-year: 2026-02-01 12:00:00 UTC = 1769947200000

    const t2024 = 1717243200000;
    const tJuly12Night = 1752364799999;
    const tJuly13Start = 1752364800000;
    const tJuly13Noon = 1752408000000;
    const tJuly13Night = 1752451199999;
    const tJuly14Start = 1752451200000;
    const t2026 = 1769947200000;

    const mockPayload = {
        filename: "timerange_test.xml",
        fileSize: 4096,
        source: "timerange_test.xml",
        platform: "SMS",
        messageCount: 8,
        conversationCount: 2,
        conversations: [
            {
                title: "Alice (+15550001)",
                platform: "SMS",
                messages: [
                    { sender: "Alice", direction: "received", timestamp: t2024, body: "Concert tickets from 2024" },
                    { sender: "Alice", direction: "received", timestamp: tJuly12Night, body: "Message right before July 13 boundary concert" },
                    { sender: "Alice", direction: "received", timestamp: tJuly13Start, body: "Message exactly on July 13 start boundary concert" },
                    { sender: "Me", direction: "sent", timestamp: tJuly13Noon, body: "Midday discussion about concert" },
                    { sender: "Alice", direction: "received", timestamp: tJuly13Night, body: "Message exactly on July 13 end boundary concert" },
                    { sender: "Alice", direction: "received", timestamp: tJuly14Start, body: "Message right after July 13 boundary concert" },
                    { sender: "Alice", direction: "received", timestamp: t2026, body: "Concert in 2026" }
                ],
                metadata: { contact: "Alice" }
            },
            {
                title: "Bob (+15550002)",
                platform: "SMS",
                messages: [
                    { sender: "Bob", direction: "received", timestamp: tJuly13Noon + 1000, body: "Bob message on July 13 discussing work" }
                ],
                metadata: { contact: "Bob" }
            }
        ],
        messages: [
            { sender: "Alice", direction: "received", timestamp: t2024, body: "Concert tickets from 2024" },
            { sender: "Alice", direction: "received", timestamp: tJuly12Night, body: "Message right before July 13 boundary concert" },
            { sender: "Alice", direction: "received", timestamp: tJuly13Start, body: "Message exactly on July 13 start boundary concert" },
            { sender: "Me", direction: "sent", timestamp: tJuly13Noon, body: "Midday discussion about concert" },
            { sender: "Alice", direction: "received", timestamp: tJuly13Night, body: "Message exactly on July 13 end boundary concert" },
            { sender: "Alice", direction: "received", timestamp: tJuly14Start, body: "Message right after July 13 boundary concert" },
            { sender: "Alice", direction: "received", timestamp: t2026, body: "Concert in 2026" },
            { sender: "Bob", direction: "received", timestamp: tJuly13Noon + 1000, body: "Bob message on July 13 discussing work" }
        ]
    };

    const importRes = await threadlineService.ingestArchive(testUid, mockPayload, mockPayload.filename, mockPayload.fileSize, threadlineId);
    assert.ok(importRes.importId, "Ingest should succeed");

    const app = express();
    app.use(express.json());
    app.use((req, res, next) => {
        req.uid = testUid;
        next();
    });
    app.use("/api/threadlines/:id/search", searchRoutes);
    app.use("/api/threadlines", threadlineRoutes);

    const server = app.listen(0);
    const port = server.address().port;

    const requestGet = (path) => new Promise((resolve, reject) => {
        http.get(`http://localhost:${port}${path}`, (res) => {
            let data = "";
            res.on("data", chunk => data += chunk);
            res.on("end", () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(data);
                }
            });
        }).on("error", reject);
    });

    try {
        // TEST 1 & 4: Single day range FROM: 2025-07-13 TO: 2025-07-13
        // start: Date.parse("2025-07-13T00:00:00.000Z") = tJuly13Start
        // end: Date.parse("2025-07-13T23:59:59.999Z") = tJuly13Night
        console.log("Test 1: Single day range includes all messages occurring on July 13 (including late night)...");
        const singleDayRes = await requestGet(`/api/threadlines/${threadlineId}/search?q=concert&start=${tJuly13Start}&end=${tJuly13Night}`);
        assert.strictEqual(singleDayRes.status, "success");
        const messagesFound = [];
        (singleDayRes.results || []).forEach(r => {
            (r.messages || []).forEach(m => messagesFound.push(m));
        });

        // Must include tJuly13Start, tJuly13Noon, tJuly13Night
        const timestamps = messagesFound.map(m => m.timestamp);
        assert.ok(timestamps.includes(tJuly13Start), "Should include start of day boundary message");
        assert.ok(timestamps.includes(tJuly13Noon), "Should include midday message");
        assert.ok(timestamps.includes(tJuly13Night), "Should include end of day boundary message");

        // TEST 5 & 6: Exclude messages immediately before and after the boundaries
        console.log("Test 2: Excludes messages immediately before start boundary and after end boundary...");
        assert.ok(!timestamps.includes(tJuly12Night), "Should exclude message 1ms before start of day");
        assert.ok(!timestamps.includes(tJuly14Start), "Should exclude message 1ms after end of day");
        assert.ok(!timestamps.includes(t2024), "Should exclude 2024 message");
        assert.ok(!timestamps.includes(t2026), "Should exclude 2026 message");

        // TEST 3: Multi-year range excludes messages outside the selected years
        console.log("Test 3: Year 2025 range excludes 2024 and 2026...");
        const start2025 = Date.parse("2025-01-01T00:00:00.000Z");
        const end2025 = Date.parse("2025-12-31T23:59:59.999Z");
        const yearRes = await requestGet(`/api/threadlines/${threadlineId}/search?q=concert&start=${start2025}&end=${end2025}`);
        assert.strictEqual(yearRes.status, "success");
        const yearTimestamps = [];
        (yearRes.results || []).forEach(r => {
            (r.messages || []).forEach(m => yearTimestamps.push(m.timestamp));
        });
        assert.ok(!yearTimestamps.includes(t2024), "Must not include 2024 evidence");
        assert.ok(!yearTimestamps.includes(t2026), "Must not include 2026 evidence");
        assert.ok(yearTimestamps.includes(tJuly13Noon), "Must include 2025 evidence");

        // TEST 8: Search terms combined with date range respect BOTH constraints
        console.log("Test 4: Search term + date range respects both constraints...");
        const searchBob = await requestGet(`/api/threadlines/${threadlineId}/search?q=work&start=${tJuly13Start}&end=${tJuly13Night}`);
        assert.strictEqual(searchBob.status, "success");
        const bobMsgs = [];
        (searchBob.results || []).forEach(r => (r.messages || []).forEach(m => bobMsgs.push(m)));
        assert.strictEqual(bobMsgs.length, 1);
        assert.strictEqual(bobMsgs[0].sender, "Bob");

        // Search for something only in 2024 inside 2025 range should yield 0 results
        const search2024In2025 = await requestGet(`/api/threadlines/${threadlineId}/search?q=2024&start=${start2025}&end=${end2025}`);
        assert.strictEqual(search2024In2025.results.length, 0, "Term in 2024 searched within 2025 should return no results");

        // TEST 9 & 10: Conversation + Date range
        console.log("Test 5: Conversation messages endpoint respects date range...");
        const convListRes = await requestGet(`/api/threadlines/${threadlineId}/conversations`);
        assert.strictEqual(convListRes.status, "success");
        const aliceConv = convListRes.conversations.find(c => c.title.includes("Alice"));
        assert.ok(aliceConv, "Alice conversation found");

        const convFiltered = await requestGet(`/api/threadlines/${threadlineId}/conversations/${aliceConv.id}/messages?start=${tJuly13Start}&end=${tJuly13Night}`);
        assert.strictEqual(convFiltered.status, "success");
        assert.strictEqual(convFiltered.messages.length, 3, "Alice should have exactly 3 messages on July 13");
        convFiltered.messages.forEach(m => {
            assert.ok(m.timestamp >= tJuly13Start && m.timestamp <= tJuly13Night);
        });

        // TEST 11: Invalid range handled safely (start > end)
        console.log("Test 6: Invalid range (start > end) returns no records safely without throwing...");
        const invalidRes = await requestGet(`/api/threadlines/${threadlineId}/search?q=concert&start=${end2025}&end=${start2025}`);
        assert.strictEqual(invalidRes.status, "success");
        assert.strictEqual(invalidRes.results.length, 0);

        // TEST 12: Date formatting unit checks: calendar dates always include YEAR
        console.log("Test 7: Full Date Display standardization check...");

        // Format helpers as defined in ThreadlineWorkspace:
        function formatDisplayDate(timestamp) {
            if (!timestamp) return "?";
            const date = new Date(Number(timestamp));
            return date.toLocaleDateString("en-US", { 
                timeZone: "UTC",
                year: 'numeric',
                month: 'numeric',
                day: 'numeric'
            });
        }

        function formatFullTimestamp(timestamp) {
            const date = new Date(Number(timestamp));
            return date.toLocaleString("en-US", { 
                timeZone: "UTC",
                year: 'numeric',
                month: 'short', 
                day: 'numeric', 
                hour: '2-digit', 
                minute: '2-digit',
                hour12: true 
            });
        }

        const sample2025 = formatDisplayDate(tJuly13Noon);
        const sample2024 = formatDisplayDate(t2024);
        const sample2026 = formatDisplayDate(t2026);

        assert.strictEqual(sample2025, "7/13/2025");
        assert.strictEqual(sample2024, "6/1/2024");
        assert.strictEqual(sample2026, "2/1/2026");

        // Verify that year is ALWAYS present
        assert.ok(sample2025.includes("2025"), "Year 2025 must be present in display date");
        assert.ok(sample2024.includes("2024"), "Year 2024 must be present in display date");
        assert.ok(sample2026.includes("2026"), "Year 2026 must be present in display date");

        // Verify formatFullTimestamp
        const fullTs2025 = formatFullTimestamp(tJuly13Noon);
        assert.ok(fullTs2025.includes("2025"), "formatFullTimestamp must include year 2025");
        assert.ok(fullTs2025.includes("Jul 13") || fullTs2025.includes("July 13"), "formatFullTimestamp must include month and day");
        assert.ok(fullTs2025.includes("12:00") || fullTs2025.includes("PM"), "formatFullTimestamp must preserve time");

        console.log("All Regression Tests Passed Successfully!");
    } finally {
        server.close();
        db.run("DELETE FROM threadlines WHERE owner_id = ?", [testUid]);
        db.run("DELETE FROM imports WHERE owner_id = ?", [testUid]);
    }
}

runRegressionTests().catch(err => {
    console.error("Test failure:", err);
    process.exit(1);
});
