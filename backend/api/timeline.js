/*
    timeline.js

    Timeline aggregation API endpoint.
    Aggregates communication events into chronological buckets
    (years, months, weeks, days, hours, minutes, seconds)
    for high-performance rendering of the Temporal Explorer visualization.

    Responsibilities:
    - Query events for a specific threadline.
    - Support date/time filtering (start and end timestamps).
    - Support filtering by specific conversation IDs via JOIN on messages table.
    - Group events by temporal buckets using SQLite date functions.
    - Auto-select the appropriate bucket granularity based on visible range (autoZoom).
    - Return a lightweight list of bucket periods and counts.
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
 * Each entry contains the SQLite strftime format and an approximate
 * duration in milliseconds used for estimating bucket count.
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

// =====================================
// Helpers
// =====================================

/**
 * Returns the SQLite strftime expression for a given zoom level.
 * "week" requires special handling using strftime('%Y-W%W').
 */
function getStrftimeExpr(zoomName) {
    if (zoomName === "week") {
        return "strftime('%Y', datetime(t.timestamp / 1000, 'unixepoch')) || '-W' || strftime('%W', datetime(t.timestamp / 1000, 'unixepoch'))";
    }
    const level = ZOOM_LEVELS.find(z => z.name === zoomName);
    if (!level || !level.format) {
        // Fallback to day
        return `strftime('%Y-%m-%d', datetime(t.timestamp / 1000, 'unixepoch'))`;
    }
    return `strftime('${level.format}', datetime(t.timestamp / 1000, 'unixepoch'))`;
}

/**
 * Given a time range (in ms), pick the finest zoom level that would produce
 * at most MAX_BUCKETS buckets. Falls back to "year" if all are too fine.
 */
function selectAutoZoom(rangeMs) {
    if (!rangeMs || rangeMs <= 0) return "day";

    // Check from finest to coarsest so the user gets optimal resolution without exceeding MAX_BUCKETS
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
 * Returns { inClause, filterSql, fromClause, queryParams }.
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
 * Returns { threadlineIds, error }.
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

    // Validate threadlines exist and belong to the user
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
 *
 * Returns the earliest and latest timestamps for the threadline's data span.
 * Used by the frontend to set the initial visible range.
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
 *   - zoom: 'year' | 'month' | 'week' | 'day' | 'hour' | 'minute' | 'second' (default: 'day')
 *   - autoZoom: 'true' — server auto-selects zoom based on visible range
 *   - start: unix timestamp ms
 *   - end: unix timestamp ms
 *   - conversations: comma-separated list of conversation IDs
 *   - ids: comma-separated threadline IDs (when :id is "compare" or "multi")
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

        // Determine zoom level
        let zoom;
        if (autoZoom && start && end) {
            zoom = selectAutoZoom(end - start);
        } else {
            zoom = request.query.zoom || "day";
        }

        // Validate zoom level
        const validZooms = ZOOM_LEVELS.map(z => z.name);
        if (!validZooms.includes(zoom)) {
            zoom = "day";
        }

        const { inClause, filterSql, fromClause, queryParams } = buildQueryConstraints(request, threadlineIds);

        // If zoom is at finest level ("second") or range is narrow (<= 5 minutes),
        // return individual events with source message details so they are directly actionable
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
                       c.title AS conversationTitle
                FROM timeline_events t
                LEFT JOIN messages m ON t.source_id = m.id
                LEFT JOIN conversations c ON m.conversation_id = c.id
                ${inClause} ${filterSql}
                ORDER BY t.timestamp ASC
                LIMIT 500;
            `;

            const events = db.query(eventSql, queryParams);

            return response.json({
                status: "success",
                zoom: "second",
                isIndividualEvents: true,
                threadlineId: request.params.id,
                events,
                buckets: []
            });
        }

        // Build the aggregation query
        const strftimeExpr = getStrftimeExpr(zoom);

        const sql = `
            SELECT ${strftimeExpr} AS period,
                   COUNT(*) AS count,
                   MIN(t.timestamp) AS minTimestamp,
                   MAX(t.timestamp) AS maxTimestamp
            ${fromClause}
            ${inClause} ${filterSql}
            GROUP BY period
            ORDER BY period ASC;
        `;

        const data = db.query(sql, queryParams);

        response.json({
            status: "success",
            zoom,
            isIndividualEvents: false,
            threadlineId: request.params.id,
            buckets: data
        });

    } catch (error) {
        console.error("Timeline aggregation failed:", error);
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
