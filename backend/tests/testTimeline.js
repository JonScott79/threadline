/*
    testTimeline.js
    Integration test for /api/timeline and /api/timeline/metadata endpoints.
    Uses the existing ingestion service to create a threadline, then queries the API.
*/

const http = require('http');
const assert = require('assert');
const express = require('express');
const threadlineService = require('../services/threadlines');
const db = require('../database/database');
const timelineRoutes = require('../api/timeline');

async function runTest() {
    try {
        console.log('Starting timeline integration test...');
        const testUid = 'test_timeline_uid';
        const threadlineId = require('crypto').randomUUID();

        // Clean any prior state
        db.run('DELETE FROM threadlines WHERE owner_id = ?', [testUid]);
        db.run('DELETE FROM imports WHERE owner_id = ?', [testUid]);

        // Mock payload with two messages spanning ~17 minutes
        const mockPayload = {
            filename: 'timeline_test.xml',
            fileSize: 1024,
            source: 'timeline_test.xml',
            platform: 'SMS',
            messageCount: 2,
            conversationCount: 1,
            conversations: [{
                title: '+15551111',
                platform: 'SMS',
                messages: [
                    { sender: '+15551111', direction: 'received', timestamp: 1770000000000, body: 'First message' },
                    { sender: '+15551111', direction: 'sent', timestamp: 1770001000000, body: 'Second message' }
                ],
                metadata: { contact: 'Test Contact' }
            }],
            messages: [
                { sender: '+15551111', direction: 'received', timestamp: 1770000000000, body: 'First message' },
                { sender: '+15551111', direction: 'sent', timestamp: 1770001000000, body: 'Second message' }
            ]
        };

        // Ingest archive
        const result = await threadlineService.ingestArchive(testUid, mockPayload, mockPayload.filename, mockPayload.fileSize, threadlineId);
        assert.ok(result.importId, 'Import ID should be returned');
        // Mount test app
        const app = express();
        app.use(express.json());
        app.use((req, res, next) => {
            req.uid = testUid;
            next();
        });
        app.use('/api/threadlines/:id/timeline', timelineRoutes);

        const server = app.listen(0);
        const port = server.address().port;

        // Helper to perform GET request and parse JSON
        function httpGet(path) {
            return new Promise((resolve, reject) => {
                http.get({ hostname: 'localhost', port, path, headers: { 'x-user-uid': testUid }, agent: false }, res => {
                    let data = '';
                    res.on('data', chunk => data += chunk);
                    res.on('end', () => {
                        try { resolve(JSON.parse(data)); } catch (e) { reject(e); }
                    });
                }).on('error', reject);
            });
        }

        try {
            // 1. Verify metadata endpoint
            const metaPath = `/api/threadlines/${threadlineId}/timeline/metadata`;
            const meta = await httpGet(metaPath);
            assert.strictEqual(meta.status, 'success', 'Metadata response should be success');
            assert.ok(meta.earliest, 'Earliest timestamp present');
            assert.ok(meta.latest, 'Latest timestamp present');
            assert.strictEqual(meta.totalEvents, 2, 'Total events should be 2');

            // 2. Verify timeline aggregation with autoZoom
            const timelinePath = `/api/threadlines/${threadlineId}/timeline?autoZoom=true&start=${mockPayload.messages[0].timestamp}&end=${mockPayload.messages[1].timestamp}`;
            const timeline = await httpGet(timelinePath);
            assert.strictEqual(timeline.status, 'success', 'Timeline response should be success');
            assert.ok(['minute', 'hour'].includes(timeline.zoom), `Expected fine zoom, got ${timeline.zoom}`);
            assert.ok(Array.isArray(timeline.buckets), 'Buckets array present');
            const totalCount = timeline.buckets.reduce((acc, b) => acc + b.count, 0);
            assert.strictEqual(totalCount, 2, 'Total aggregated count should be 2');

            // 3. Verify specific zoom (hour)
            const hourPath = `/api/threadlines/${threadlineId}/timeline?zoom=hour`;
            const hourTimeline = await httpGet(hourPath);
            assert.strictEqual(hourTimeline.status, 'success');
            assert.strictEqual(hourTimeline.zoom, 'hour');
            assert.strictEqual(hourTimeline.buckets.length, 1, 'Expected single hour bucket');
            assert.strictEqual(hourTimeline.buckets[0].count, 2);

            // 4. Verify fine zoom returns individual actionable events
            const secondPath = `/api/threadlines/${threadlineId}/timeline?zoom=second`;
            const secondTimeline = await httpGet(secondPath);
            assert.strictEqual(secondTimeline.status, 'success');
            assert.strictEqual(secondTimeline.zoom, 'second');
            assert.strictEqual(secondTimeline.isIndividualEvents, true, 'isIndividualEvents should be true');
            assert.ok(Array.isArray(secondTimeline.events), 'Events array should be present');
            assert.strictEqual(secondTimeline.events.length, 2, 'Should return 2 individual events');
            assert.ok(secondTimeline.events[0].body, 'Event should contain message body');
            assert.ok(secondTimeline.events[0].sender, 'Event should contain sender');
            assert.ok(secondTimeline.events[0].conversationId, 'Event should contain conversationId');

            // 5. Verify conversation visibility filtering
            const testConvId = secondTimeline.events[0].conversationId;
            const filterConvPath = `/api/threadlines/${threadlineId}/timeline?conversations=${testConvId}`;
            const filteredTimeline = await httpGet(filterConvPath);
            assert.strictEqual(filteredTimeline.status, 'success');
            const filteredCount = filteredTimeline.buckets.reduce((acc, b) => acc + b.count, 0);
            assert.strictEqual(filteredCount, 2, 'Should match events for that conversation');

            // 6. Verify non-existent / none_selected conversation filter returns 0 events (Deselect All)
            const nonePath = `/api/threadlines/${threadlineId}/timeline?conversations=none_selected`;
            const noneTimeline = await httpGet(nonePath);
            assert.strictEqual(noneTimeline.status, 'success');
            assert.strictEqual(noneTimeline.buckets.length, 0, 'Should return 0 buckets when all conversations are deselected');

            // 7. Verify hiding conversations does NOT mutate or delete data from the database
            const metaAfterHide = await httpGet(metaPath);
            assert.strictEqual(metaAfterHide.totalEvents, 2, 'Total events in database must remain intact after timeline visibility filtering');

            console.log('✅ Timeline backend integration test passed (aggregation, individual events, conversation layers & visibility)');
            server.close();
            process.exit(0);
        } catch (innerErr) {
            server.close();
            throw innerErr;
        }
    } catch (err) {
        console.error('❌ Timeline test failed:', err);
        process.exit(1);
    }
}

runTest();
