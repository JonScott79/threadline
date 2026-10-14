/*
    timeline.js

    Timeline aggregation API endpoint.
    Aggregates communication events into chronological buckets
    (years, months, weeks, days, hours, minutes, seconds)
    for high-performance rendering of the Temporal Explorer visualization.

    Multi-track support:
    - trackMode: 'log' (default: parallel swimlanes per uploaded log file / extraction)
    - trackMode: 'conversation' (parallel swimlanes per conversation thread)
    - trackMode: 'unified' (single consolidated timeline stream)

    Responsibilities:
    - Query events for a specific threadline.
    - Support date/time filtering (start and end timestamps).
    - Support filtering by specific conversation IDs via JOIN on messages table.
    - Group events by temporal buckets using SQLite date functions and track groups.
    - Auto-select the appropriate bucket granularity based on visible range (autoZoom).
    - Return a lightweight list of bucket periods, counts, and group associations.
    - Provide metadata (earliest/latest timestamps) for initial range calculation.
*/

// =====================================
// Imports
// =====================================

const express = require("express");
const db = require("../database/database");

// =====================================
// Variables
// =====================================

const router = express.Router({ mergeParams: true });

// =====================================
// Constants
// =====================================

/**
 * Maximum number of buckets per response.
 * The auto-zoom logic picks the coarsest bucket that yields <= this many rows.
 */
const MAX_BUCKETS = 500;

/**
 * Zoom levels ordered from coarsest to finest.
 */
const ZOOM_LEVELS = [
    { name: "year",   format: "%Y",              approxMs: 365.25 * 24 * 60 * 60 * 1000 },
    { name: "month",  format: "%Y-%m",           approxMs: 30.44 * 24 * 60 * 60 * 1000  },
    { name: "week",   format: null,              approxMs: 7 * 24 * 60 * 60 * 1000       }, // special handling
    { name: "day",    format: "%Y-%m-%d",        approxMs: 24 * 60 * 60 * 1000           },
    { name: "hour",   format: "%Y-%m-%d %H:00",  approxMs: 60 * 60 * 1000                },
    { name: "minute", format: "%Y-%m-%d %H:%M",  approxMs: 60 * 1000                     },
    { name: "second", format: "%Y-%m-%d %H:%M:%S", approxMs: 1000                        }
];

const TRACK_PALETTE = [
    "#00D0FF", // Electric Cyan
    "#FF9500", // Amber Gold
    "#A855F7", // Purple / Violet
    "#10B981", // Emerald Green
    "#EC4899", // Neon Rose / Pink
    "#06B6D4", // Sky Blue
    "#F59E0B", // Bright Amber
    "#8B5CF6", // Lavender
];

// =====================================
// Helpers
// =====================================

/**
 * Returns the SQLite strftime expression for a given zoom level.
 */
function getStrftimeExpr(zoomName) {
    if (zoomName === "week") {
        return "strftime('%Y', datetime(t.timestamp / 1000, 'unixepoch')) || '-W' || strftime('%W', datetime(t.timestamp / 1000, 'unixepoch'))";
    }
    const level = ZOOM_LEVELS.find(z => z.name === zoomName);
    if (!level || !level.format) {
        return `strftime('%Y-%m-%d', datetime(t.timestamp / 1000, 'unixepoch'))`;
    }
    return `strftime('${level.format}', datetime(t.timestamp / 1000, 'unixepoch'))`;
}

/**
 * Given a time range (in ms), pick the finest zoom level that would produce
 * at most MAX_BUCKETS buckets.
 */
function selectAutoZoom(rangeMs) {
    if (!rangeMs || rangeMs <= 0) return "day";

    for (let i = ZOOM_LEVELS.length - 1; i >= 0; i--) {
        const level = ZOOM_LEVELS[i];
        const estimatedBuckets = Math.ceil(rangeMs / level.approxMs);
        if (estimatedBuckets <= MAX_BUCKETS) {
            return level.name;
        }
    }
    return "year";
}

/**
 * Build the common WHERE clause and query params for threadline+filter constraints.
 */
function buildQueryConstraints(request, threadlineIds) {
    const clauses = [];
    const queryParams = [];

    threadlineIds.forEach(id => {
        clauses.push(" t.threadline_id = ? ");
        queryParams.push(id);
    });
    const inClause = `WHERE ( ${clauses.join(" OR ")} )`;

    let filterSql = "";
    let hasJoin = false;

    const start = request.query.start ? Number(request.query.start) : null;
    const end = request.query.end ? Number(request.query.end) : null;

    if (start) {
        filterSql += " AND t.timestamp >= ? ";
        queryParams.push(start);
    }
    if (end) {
        filterSql += " AND t.timestamp <= ? ";
        queryParams.push(end);
    }

    const conversationsParam = request.query.conversations;
    if (conversationsParam) {
        const convIds = conversationsParam.split(",").filter(Boolean);
        if (convIds.length > 0) {
            filterSql += ` AND m.conversation_id IN (${convIds.map(() => '?').join(',')}) `;
            queryParams.push(...convIds);
            hasJoin = true;
        }
    }

    const fromClause = hasJoin
        ? "FROM timeline_events t LEFT JOIN messages m ON t.source_id = m.id"
        : "FROM timeline_events t";

    return { inClause, filterSql, fromClause, queryParams };
}

/**
 * Resolve and validate threadline IDs from the request.
 */
function resolveThreadlineIds(request) {
    const idParam = request.params.id;
    let threadlineIds = [];

    if (idParam === "compare" || idParam === "multi") {
        const idsStr = request.query.ids || "";
        threadlineIds = idsStr.split(",").filter(Boolean);
    } else {
        threadlineIds = [idParam];
    }

    if (threadlineIds.length === 0) {
        return { threadlineIds: [], error: "No threadline IDs specified." };
    }

    const nonArchiveIds = threadlineIds.filter(id => id !== `archive_${request.uid}`);
    if (nonArchiveIds.length > 0) {
        const placeholders = nonArchiveIds.map(() => "?").join(",");
        const existing = db.query(
            `SELECT id FROM threadlines WHERE id IN (${placeholders}) AND owner_id = ?`,
            [...nonArchiveIds, request.uid]
        );
        if (existing.length !== nonArchiveIds.length) {
            return { threadlineIds: [], error: "Access denied: One or more threadlines are missing or not owned by you." };
        }
    }

    return { threadlineIds, error: null };
}

// =====================================
// Routes
// =====================================

/**
 * GET /api/threadlines/:id/timeline/metadata
 */
router.get("/metadata", (request, response) => {
    try {
        const { threadlineIds, error } = resolveThreadlineIds(request);
        if (error) {
            return response.status(threadlineIds.length === 0 && error.includes("Access") ? 403 : 400).json({
                status: "error",
                message: error
            });
        }

        const { inClause, filterSql, fromClause, queryParams } = buildQueryConstraints(request, threadlineIds);

        const row = db.queryOne(
            `SELECT MIN(t.timestamp) AS earliest, MAX(t.timestamp) AS latest, COUNT(*) AS totalEvents
             ${fromClause}
             ${inClause} ${filterSql}`,
            queryParams
        );

        response.json({
            status: "success",
            earliest: row ? row.earliest : null,
            latest: row ? row.latest : null,
            totalEvents: row ? row.totalEvents : 0
        });
    } catch (error) {
        console.error("Timeline metadata failed:", error);
        response.status(500).json({
            status: "error",
            message: error.message
        });
    }
});

/**
 * GET /api/threadlines/:id/timeline
 * Query parameters:
 *   - trackMode: 'log' | 'conversation' | 'unified' (default: 'log')
 *   - zoom: 'year' | 'month' | 'week' | 'day' | 'hour' | 'minute' | 'second' (default: 'day')
 *   - autoZoom: 'true' — server auto-selects zoom based on visible range
 *   - start: unix timestamp ms
 *   - end: unix timestamp ms
 *   - conversations: comma-separated list of conversation IDs
 *   - ids: comma-separated threadline IDs
 */
router.get("/", (request, response) => {
    try {
        const { threadlineIds, error } = resolveThreadlineIds(request);
        if (error) {
            return response.status(threadlineIds.length === 0 && error.includes("Access") ? 403 : 400).json({
                status: "error",
                message: error
            });
        }

        const start = request.query.start ? Number(request.query.start) : null;
        const end = request.query.end ? Number(request.query.end) : null;
        const autoZoom = request.query.autoZoom === "true";
        const trackMode = request.query.trackMode || "log"; // 'log' | 'conversation' | 'unified'

        // Determine zoom level
        let zoom;
        if (autoZoom && start && end) {
            zoom = selectAutoZoom(end - start);
        } else {
            zoom = request.query.zoom || "day";
        }

        const validZooms = ZOOM_LEVELS.map(z => z.name);
        if (!validZooms.includes(zoom)) {
            zoom = "day";
        }

        const { inClause, filterSql, fromClause, queryParams } = buildQueryConstraints(request, threadlineIds);

        // 1. Resolve distinct groups (swimlanes) for this scope
        let rawGroups = [];
        if (trackMode === "conversation") {
            const groupsSql = `
                SELECT COALESCE(c.id, 'default_conv') AS groupId,
                       COALESCE(c.title, 'General') AS title,
                       COUNT(t.id) AS count
                FROM timeline_events t
                LEFT JOIN messages m ON t.source_id = m.id
                LEFT JOIN conversations c ON m.conversation_id = c.id
                ${inClause} ${filterSql}
                GROUP BY 1, 2
                ORDER BY count DESC;
            `;
            rawGroups = db.query(groupsSql, queryParams);
        } else if (trackMode === "log") {
            const groupsSql = `
                SELECT COALESCE(imp.id, 'default_log') AS groupId,
                       COALESCE(imp.filename, 'Direct / Manual Entry') AS title,
                       COUNT(t.id) AS count
                FROM timeline_events t
                LEFT JOIN messages m ON t.source_id = m.id
                LEFT JOIN (SELECT message_id, MIN(import_id) AS import_id FROM message_imports GROUP BY message_id) mi ON m.id = mi.message_id
                LEFT JOIN imports imp ON mi.import_id = imp.id
                ${inClause} ${filterSql}
                GROUP BY 1, 2
                ORDER BY count DESC;
            `;
            rawGroups = db.query(groupsSql, queryParams);
        } else {
            // Unified mode
            rawGroups = [{ groupId: "unified", title: "Unified Stream", count: 0 }];
        }

        const groups = rawGroups.map((g, idx) => ({
            id: String(g.groupId),
            title: g.title,
            count: g.count,
            color: TRACK_PALETTE[idx % TRACK_PALETTE.length]
        }));

        const groupColorMap = {};
        groups.forEach(g => { groupColorMap[g.id] = g.color; });

        // 2. Individual events query (seconds or narrow range <= 5 min)
        if (zoom === "second" || (start && end && (end - start) <= 300000)) {
            const eventSql = `
                SELECT t.id,
                       t.timestamp,
                       t.type,
                       t.source_id AS sourceId,
                       t.title,
                       t.description,
                       t.sender,
                       m.conversation_id AS conversationId,
                       m.body,
                       m.direction,
                       m.platform,
                       c.title AS conversationTitle,
                       COALESCE(imp.id, 'default_log') AS importId,
                       COALESCE(imp.filename, 'Direct / Manual Entry') AS importFilename,
                       p.name AS participantName,
                       p.metadata AS participantMetadata
                FROM timeline_events t
                LEFT JOIN messages m ON t.source_id = m.id
                LEFT JOIN conversations c ON m.conversation_id = c.id
                LEFT JOIN (SELECT message_id, MIN(import_id) AS import_id FROM message_imports GROUP BY message_id) mi ON m.id = mi.message_id
                LEFT JOIN imports imp ON mi.import_id = imp.id
                LEFT JOIN participants p ON p.threadline_id = t.threadline_id AND (p.phone_number = t.sender OR p.name = t.sender)
                ${inClause} ${filterSql}
                ORDER BY t.timestamp ASC
                LIMIT 600;
            `;

            const rawEvents = db.query(eventSql, queryParams);

            const events = rawEvents.map(ev => {
                let groupId = "unified";
                let groupTitle = "Unified";

                if (trackMode === "log") {
                    groupId = String(ev.importId || "default_log");
                    groupTitle = ev.importFilename || "Direct Entry";
                } else if (trackMode === "conversation") {
                    groupId = String(ev.conversationId || "default_conv");
                    groupTitle = ev.conversationTitle || "General";
                }

                let meta = {};
                try {
                    meta = typeof ev.participantMetadata === "string" ? JSON.parse(ev.participantMetadata || "{}") : (ev.participantMetadata || {});
                } catch (e) {
                    meta = {};
                }

                return {
                    ...ev,
                    groupId,
                    groupTitle,
                    color: groupColorMap[groupId] || TRACK_PALETTE[0],
                    roleTag: meta.tag || meta.role || null,
                    participantNotes: meta.notes || null
                };
            });

            return response.json({
                status: "success",
                zoom: "second",
                trackMode,
                isIndividualEvents: true,
                threadlineId: request.params.id,
                groups,
                events,
                buckets: []
            });
        }

        // 3. Aggregated Buckets Query
        const strftimeExpr = getStrftimeExpr(zoom);

        let aggSql = "";
        if (trackMode === "conversation") {
            aggSql = `
                SELECT ${strftimeExpr} AS period,
                       COUNT(*) AS count,
                       MIN(t.timestamp) AS minTimestamp,
                       MAX(t.timestamp) AS maxTimestamp,
                       COALESCE(c.id, 'default_conv') AS groupId,
                       COALESCE(c.title, 'General') AS groupTitle
                FROM timeline_events t
                LEFT JOIN messages m ON t.source_id = m.id
                LEFT JOIN conversations c ON m.conversation_id = c.id
                ${inClause} ${filterSql}
                GROUP BY 1, 5
                ORDER BY period ASC;
            `;
        } else if (trackMode === "log") {
            aggSql = `
                SELECT ${strftimeExpr} AS period,
                       COUNT(*) AS count,
                       MIN(t.timestamp) AS minTimestamp,
                       MAX(t.timestamp) AS maxTimestamp,
                       COALESCE(imp.id, 'default_log') AS groupId,
                       COALESCE(imp.filename, 'Direct / Manual Entry') AS groupTitle
                FROM timeline_events t
                LEFT JOIN messages m ON t.source_id = m.id
                LEFT JOIN (SELECT message_id, MIN(import_id) AS import_id FROM message_imports GROUP BY message_id) mi ON m.id = mi.message_id
                LEFT JOIN imports imp ON mi.import_id = imp.id
                ${inClause} ${filterSql}
                GROUP BY 1, 5
                ORDER BY period ASC;
            `;
        } else {
            aggSql = `
                SELECT ${strftimeExpr} AS period,
                       COUNT(*) AS count,
                       MIN(t.timestamp) AS minTimestamp,
                       MAX(t.timestamp) AS maxTimestamp,
                       'unified' AS groupId,
                       'Unified Stream' AS groupTitle
                ${fromClause}
                ${inClause} ${filterSql}
                GROUP BY period
                ORDER BY period ASC;
            `;
        }

        const data = db.query(aggSql, queryParams);

        const buckets = data.map(b => ({
            ...b,
            groupId: String(b.groupId),
            color: groupColorMap[String(b.groupId)] || TRACK_PALETTE[0]
        }));

        response.json({
            status: "success",
            zoom,
            trackMode,
            isIndividualEvents: false,
            threadlineId: request.params.id,
            groups,
            buckets
        });

    } catch (error) {
        console.error("Timeline aggregation failed:", error);
        response.status(500).json({
            status: "error",
            message: error.message
        });
    }
});

/**
 * GET /api/threadlines/:id/timeline/messages
 */
router.get("/messages", (request, response) => {
    try {
        const { threadlineIds, error } = resolveThreadlineIds(request);
        if (error) {
            return response.status(threadlineIds.length === 0 && error.includes("Access") ? 403 : 400).json({
                status: "error",
                message: error
            });
        }

        const start = request.query.start ? Number(request.query.start) : null;
        const end = request.query.end ? Number(request.query.end) : null;
        const conversationsParam = request.query.conversations;

        const scopeClauses = [];
        const queryParams = [];

        threadlineIds.forEach(id => {
            if (id.startsWith("archive_")) {
                scopeClauses.push(" m.threadline_id = ? ");
                queryParams.push(id);
            } else {
                const archiveId = `archive_${request.uid}`;
                scopeClauses.push(` (m.threadline_id = ? OR (m.threadline_id = ? AND m.id IN (SELECT ssm.message_id FROM saved_segment_messages ssm JOIN threadline_segments ts ON ssm.saved_segment_id = ts.saved_segment_id WHERE ts.threadline_id = ?))) `);
                queryParams.push(id, archiveId, id);
            }
        });

        const scopeClause = `( ${scopeClauses.join(" OR ")} )`;
        let filterSql = "";

        if (start != null && !isNaN(start)) {
            filterSql += " AND m.timestamp >= ? ";
            queryParams.push(start);
        }
        if (end != null && !isNaN(end)) {
            filterSql += " AND m.timestamp <= ? ";
            queryParams.push(end);
        }

        if (conversationsParam) {
            const convIds = conversationsParam.split(",").filter(Boolean);
            if (convIds.length > 0) {
                filterSql += ` AND m.conversation_id IN (${convIds.map(() => '?').join(',')}) `;
                queryParams.push(...convIds);
            }
        }

        const sql = `
            SELECT m.id,
                   m.conversation_id AS conversationId,
                   c.title AS conversationTitle,
                   m.sender,
                   m.recipient,
                   m.timestamp,
                   m.body,
                   m.attachments,
                   m.direction,
                   m.platform,
                   m.metadata
            FROM messages m
            JOIN conversations c ON m.conversation_id = c.id
            WHERE ${scopeClause} ${filterSql}
            ORDER BY m.timestamp ASC
            LIMIT 1000;
        `;

        const messages = db.query(sql, queryParams);

        const formatted = messages.map(m => ({
            ...m,
            attachments: typeof m.attachments === "string" ? JSON.parse(m.attachments || "[]") : (m.attachments || []),
            metadata: typeof m.metadata === "string" ? JSON.parse(m.metadata || "{}") : (m.metadata || {})
        }));

        const distinctConvs = new Set(formatted.map(m => m.conversationId));
        const distinctParticipants = new Set();
        formatted.forEach(m => {
            if (m.sender && m.direction !== "sent") distinctParticipants.add(m.sender);
            if (m.recipient && m.direction === "sent") distinctParticipants.add(m.recipient);
        });

        response.json({
            status: "success",
            messages: formatted,
            summary: {
                count: formatted.length,
                conversationCount: distinctConvs.size,
                participantCount: distinctParticipants.size,
                start,
                end
            }
        });
    } catch (error) {
        console.error("Timeline messages retrieval failed:", error);
        response.status(500).json({
            status: "error",
            message: error.message
        });
    }
});

/**
 * GET /api/threadlines/:id/timeline/correlate
 * Contemporaneous Activity Finder & Cross-Conversation Co-occurrence Scanner.
 * Queries all messages across devices/conversations within a +/- deltaSeconds window around a pivot message or timestamp.
 * 
 * Query parameters:
 *   - messageId: ID of pivot message (optional if timestamp provided)
 *   - timestamp: Unix timestamp ms (optional if messageId provided)
 *   - deltaSeconds: window radius in seconds (default: 60, e.g. 15, 30, 60, 120, 300, 900)
 *   - excludeSameConversation: 'true' to only show cross-conversation activity
 */
router.get("/correlate", (request, response) => {
    try {
        const { threadlineIds, error } = resolveThreadlineIds(request);
        if (error) {
            return response.status(threadlineIds.length === 0 && error.includes("Access") ? 403 : 400).json({
                status: "error",
                message: error
            });
        }

        const messageId = request.query.messageId;
        let pivotTimestamp = request.query.timestamp ? Number(request.query.timestamp) : null;
        let pivotMessage = null;

        if (messageId) {
            const pivotSql = `
                SELECT m.id,
                       m.conversation_id AS conversationId,
                       c.title AS conversationTitle,
                       m.sender,
                       m.recipient,
                       m.timestamp,
                       m.body,
                       m.direction,
                       m.platform,
                       COALESCE(imp.id, 'default_log') AS importId,
                       COALESCE(imp.filename, 'Direct Entry') AS importFilename,
                       p.name AS participantName,
                       p.metadata AS participantMetadata
                FROM messages m
                LEFT JOIN conversations c ON m.conversation_id = c.id
                LEFT JOIN (SELECT message_id, MIN(import_id) AS import_id FROM message_imports GROUP BY message_id) mi ON m.id = mi.message_id
                LEFT JOIN imports imp ON mi.import_id = imp.id
                LEFT JOIN participants p ON p.threadline_id = m.threadline_id AND (p.phone_number = m.sender OR p.name = m.sender)
                WHERE m.id = ?;
            `;
            pivotMessage = db.queryOne(pivotSql, [messageId]);
            if (pivotMessage) {
                pivotTimestamp = Number(pivotMessage.timestamp);
                let meta = {};
                try {
                    meta = typeof pivotMessage.participantMetadata === "string" ? JSON.parse(pivotMessage.participantMetadata || "{}") : (pivotMessage.participantMetadata || {});
                } catch (e) {
                    meta = {};
                }
                pivotMessage.roleTag = meta.tag || meta.role || null;
                pivotMessage.participantNotes = meta.notes || null;
            }
        }

        if (!pivotTimestamp || isNaN(pivotTimestamp)) {
            return response.status(400).json({
                status: "error",
                message: "A valid messageId or timestamp is required for correlation."
            });
        }

        const deltaSeconds = Math.max(5, Math.min(3600, Number(request.query.deltaSeconds) || 60));
        const deltaMs = deltaSeconds * 1000;
        const windowStart = pivotTimestamp - deltaMs;
        const windowEnd = pivotTimestamp + deltaMs;
        const excludeSameConv = request.query.excludeSameConversation === "true";

        // Build scope clauses across threadlineIds
        const scopeClauses = [];
        const queryParams = [];

        threadlineIds.forEach(id => {
            if (id.startsWith("archive_")) {
                scopeClauses.push(" m.threadline_id = ? ");
                queryParams.push(id);
            } else {
                const archiveId = `archive_${request.uid}`;
                scopeClauses.push(` (m.threadline_id = ? OR (m.threadline_id = ? AND m.id IN (SELECT ssm.message_id FROM saved_segment_messages ssm JOIN threadline_segments ts ON ssm.saved_segment_id = ts.saved_segment_id WHERE ts.threadline_id = ?))) `);
                queryParams.push(id, archiveId, id);
            }
        });

        const scopeClause = `( ${scopeClauses.join(" OR ")} )`;
        let extraFilter = "";

        queryParams.push(windowStart, windowEnd);

        if (excludeSameConv && pivotMessage && pivotMessage.conversationId) {
            extraFilter += " AND m.conversation_id != ? ";
            queryParams.push(pivotMessage.conversationId);
        }

        const correlateSql = `
            SELECT m.id,
                   m.conversation_id AS conversationId,
                   c.title AS conversationTitle,
                   m.sender,
                   m.recipient,
                   m.timestamp,
                   m.body,
                   m.direction,
                   m.platform,
                   COALESCE(imp.id, 'default_log') AS importId,
                   COALESCE(imp.filename, 'Direct Entry') AS importFilename,
                   p.name AS participantName,
                   p.metadata AS participantMetadata
            FROM messages m
            JOIN conversations c ON m.conversation_id = c.id
            LEFT JOIN (SELECT message_id, MIN(import_id) AS import_id FROM message_imports GROUP BY message_id) mi ON m.id = mi.message_id
            LEFT JOIN imports imp ON mi.import_id = imp.id
            LEFT JOIN participants p ON p.threadline_id = m.threadline_id AND (p.phone_number = m.sender OR p.name = m.sender)
            WHERE ${scopeClause}
              AND m.timestamp >= ? AND m.timestamp <= ?
              ${extraFilter}
            ORDER BY m.timestamp ASC
            LIMIT 500;
        `;

        const rows = db.query(correlateSql, queryParams);

        const distinctConvs = new Set();
        const distinctDevices = new Set();
        const distinctParticipants = new Set();
        const roleBreakdown = {};
        let prePivotCount = 0;
        let postPivotCount = 0;

        const contemporaneous = rows.map(row => {
            const rowTime = Number(row.timestamp);
            const offsetMs = rowTime - pivotTimestamp;
            const offsetSec = (offsetMs / 1000).toFixed(1);

            if (offsetMs < 0) prePivotCount++;
            else if (offsetMs > 0) postPivotCount++;

            let meta = {};
            try {
                meta = typeof row.participantMetadata === "string" ? JSON.parse(row.participantMetadata || "{}") : (row.participantMetadata || {});
            } catch (e) {
                meta = {};
            }

            const role = meta.tag || meta.role || null;
            if (role) {
                roleBreakdown[role] = (roleBreakdown[role] || 0) + 1;
            }

            distinctConvs.add(row.conversationId);
            distinctDevices.add(row.importFilename);
            if (row.participantName) distinctParticipants.add(row.participantName);
            else if (row.sender) distinctParticipants.add(row.sender);

            return {
                id: row.id,
                conversationId: row.conversationId,
                conversationTitle: row.conversationTitle,
                importId: row.importId,
                importFilename: row.importFilename,
                sender: row.sender,
                recipient: row.recipient,
                participantName: row.participantName,
                roleTag: role,
                direction: row.direction,
                platform: row.platform,
                body: row.body,
                timestamp: rowTime,
                offsetSeconds: Number(offsetSec),
                isPivot: Boolean(pivotMessage && row.id === pivotMessage.id)
            };
        });

        response.json({
            status: "success",
            pivotMessage,
            pivotTimestamp,
            deltaSeconds,
            windowStart,
            windowEnd,
            contemporaneous,
            summary: {
                totalCount: contemporaneous.length,
                prePivotCount,
                postPivotCount,
                conversationCount: distinctConvs.size,
                deviceCount: distinctDevices.size,
                participantCount: distinctParticipants.size,
                roleBreakdown
            }
        });
    } catch (error) {
        console.error("Contemporaneous activity correlation failed:", error);
        response.status(500).json({
            status: "error",
            message: error.message
        });
    }
});

// =====================================
// Exports
// =====================================

module.exports = router;
