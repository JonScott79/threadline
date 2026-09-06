/*
    testTimelineNavigationAndRange.js
    Tests:
    1. GET /api/threadlines/:id/timeline/messages with start and end boundaries
    2. Boundary inclusivity (start <= timestamp <= end)
    3. Cross-conversation chronological ordering across multiple conversations
    4. Accurate summary metadata (message count, conversation count, participant count)
    5. Conversation layer filtering (only return messages from visible conversations)
    6. Non-existent range returns empty results gracefully
    7. Database integrity preserved (no mutations on query)
*/

const http = require('http');
const assert = require('assert');
const express = require('express');
const threadlineService = require('../services/threadlines');
const db = require('../database/database');
const timelineRoutes = require('../api/timeline');

async function runTest() {
    try {
        console.log('Starting Timeline Navigation and Range Selection tests...');
        const testUid = 'test_nav_range_uid';
        const threadlineId = require('crypto').randomUUID();

        // Clean any prior state
        db.run('DELETE FROM threadlines WHERE owner_id = ?', [testUid]);
        db.run('DELETE FROM imports WHERE owner_id = ?', [testUid]);

        // Multi-conversation, multi-participant scenario across time:
        // Conv 1 (Darcy & Me): 
        //   t1: 1770000000000 (Darcy: "Meet me at the station")
        //   t3: 1770002000000 (Me: "On my way")
        // Conv 2 (Leila & Me):
        //   t2: 1770001000000 (Leila: "Did you talk to Darcy?")
        //   t4: 1770003000000 (Leila: "Call me later")
        // Conv 3 (John & Me):
        //   t5: 1770004000000 (John: "Financial report attached")
        //   t6: 1770010000000 (Outside target range)

        const mockPayload = {
            filename: 'range_nav_test.xml',
            fileSize: 2048,
            source: 'range_nav_test.xml',
            platform: 'SMS',
            messageCount: 6,
            conversationCount: 3,
            conversations: [
                {
                    title: 'Darcy',
                    platform: 'SMS',
                    messages: [
                        { sender: 'Darcy', recipient: 'Me', direction: 'received', timestamp: 1770000000000, body: 'Meet me at the station' },
                        { sender: 'Me', recipient: 'Darcy', direction: 'sent', timestamp: 1770002000000, body: 'On my way' }
                    ],
                    metadata: { contact: 'Darcy' }
                },
                {
                    title: 'Leila',
                    platform: 'SMS',
                    messages: [
                        { sender: 'Leila', recipient: 'Me', direction: 'received', timestamp: 1770001000000, body: 'Did you talk to Darcy?' },
                        { sender: 'Leila', recipient: 'Me', direction: 'received', timestamp: 1770003000000, body: 'Call me later' }
                    ],
                    metadata: { contact: 'Leila' }
                },
                {
                    title: 'John',
                    platform: 'Signal',
                    messages: [
                        { sender: 'John', recipient: 'Me', direction: 'received', timestamp: 1770004000000, body: 'Financial report attached' },
                        { sender: 'John', recipient: 'Me', direction: 'received', timestamp: 1770010000000, body: 'Out of bounds message' }
                    ],
                    metadata: { contact: 'John' }
                }
            ],
            messages: [
                { sender: 'Darcy', recipient: 'Me', direction: 'received', timestamp: 1770000000000, body: 'Meet me at the station' },
                { sender: 'Leila', recipient: 'Me', direction: 'received', timestamp: 1770001000000, body: 'Did you talk to Darcy?' },
                { sender: 'Me', recipient: 'Darcy', direction: 'sent', timestamp: 1770002000000, body: 'On my way' },
                { sender: 'Leila', recipient: 'Me', direction: 'received', timestamp: 1770003000000, body: 'Call me later' },
                { sender: 'John', recipient: 'Me', direction: 'received', timestamp: 1770004000000, body: 'Financial report attached' },
                { sender: 'John', recipient: 'Me', direction: 'received', timestamp: 1770010000000, body: 'Out of bounds message' }
            ]
        };

        const result = await threadlineService.ingestArchive(testUid, mockPayload, mockPayload.filename, mockPayload.fileSize, threadlineId);
        assert.ok(result.importId, 'Import ID should be created');

        // Mount test express app
        const app = express();
        app.use(express.json());
        app.use((req, res, next) => {
            req.uid = testUid;
            next();
        });
        app.use('/api/threadlines/:id/timeline', timelineRoutes);

        const server = app.listen(0);
        const port = server.address().port;

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
            // Test 1: Fetch exact temporal range covering the first 5 messages (1770000000000 to 1770004000000)
            const rangePath = `/api/threadlines/${threadlineId}/timeline/messages?start=1770000000000&end=1770004000000`;
            const rangeRes = await httpGet(rangePath);
            assert.strictEqual(rangeRes.status, 'success', 'Response status should be success');
            assert.strictEqual(rangeRes.messages.length, 5, 'Should return exactly 5 messages within interval');

            // Test 2: Verify exact chronological ordering across conversations
            const timestamps = rangeRes.messages.map(m => Number(m.timestamp));
            for (let i = 1; i < timestamps.length; i++) {
                assert.ok(timestamps[i] >= timestamps[i - 1], `Messages must be sorted chronologically: ${timestamps[i]} >= ${timestamps[i-1]}`);
            }

            // Test 3: Verify boundary inclusivity (both start and end exact timestamps included)
            assert.strictEqual(timestamps[0], 1770000000000, 'Start boundary must be inclusively included');
            assert.strictEqual(timestamps[timestamps.length - 1], 1770004000000, 'End boundary must be inclusively included');

            // Test 4: Verify summary metadata
            assert.strictEqual(rangeRes.summary.count, 5, 'Summary count should match');
            assert.strictEqual(rangeRes.summary.conversationCount, 3, 'Summary should show 3 distinct conversations');
            assert.ok(rangeRes.summary.participantCount >= 3, 'Summary should count distinct participants');

            // Test 5: Verify conversation layer filtering
            // Filter to only Darcy and John conversations (exclude Leila)
            const convDarcy = rangeRes.messages.find(m => m.sender === 'Darcy').conversationId;
            const convJohn = rangeRes.messages.find(m => m.sender === 'John').conversationId;
            const filteredPath = `/api/threadlines/${threadlineId}/timeline/messages?start=1770000000000&end=1770004000000&conversations=${convDarcy},${convJohn}`;
            const filteredRes = await httpGet(filteredPath);
            assert.strictEqual(filteredRes.status, 'success');
            assert.strictEqual(filteredRes.messages.length, 3, 'Should only return Darcy and John messages (3 total)');
            assert.ok(!filteredRes.messages.some(m => m.sender === 'Leila'), 'Leila messages must be excluded by layer filter');

            // Test 6: Verify empty range behavior (no events in range)
            const emptyPath = `/api/threadlines/${threadlineId}/timeline/messages?start=1800000000000&end=1800001000000`;
            const emptyRes = await httpGet(emptyPath);
            assert.strictEqual(emptyRes.status, 'success');
            assert.strictEqual(emptyRes.messages.length, 0, 'No messages should be returned for out-of-range interval');
            assert.strictEqual(emptyRes.summary.count, 0);

            // Test 7: Verify database integrity - no messages were deleted or modified
            const metaRes = await httpGet(`/api/threadlines/${threadlineId}/timeline/metadata`);
            assert.strictEqual(metaRes.totalEvents, 6, 'Total database events must remain 6');

            console.log('✅ All Timeline Navigation and Range Selection tests passed!');
            server.close();
            process.exit(0);
        } catch (innerErr) {
            server.close();
            throw innerErr;
        }
    } catch (err) {
        console.error('❌ Test failed:', err);
        process.exit(1);
    }
}

runTest();
