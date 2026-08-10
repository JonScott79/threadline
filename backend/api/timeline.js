/*
    timeline.js

    Timeline aggregation API endpoint.
    Aggregates communication events into chronological buckets (years, months, days, hours)
    for high-performance rendering of the heartbeat activity graph.

    Responsibilities:
    - Query events for a specific threadline.
    - Support date/time filtering (start and end timestamps).
    - Support filtering by specific conversation IDs via JOIN on messages table.
    - Group events by temporal buckets using SQLite date functions.
    - Return a lightweight list of bucket periods and counts.
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
// Routes
// =====================================

/**
 * GET /api/threadlines/:id/timeline
 * Query parameters:
 *   - zoom: 'year' | 'month' | 'day' | 'hour' (default: 'day')
 *   - start: unix timestamp ms
 *   - end: unix timestamp ms
 *   - conversations: comma-separated list of conversation IDs
 */
router.get("/", (request, response) => {
    try {
        const idParam = request.params.id;
        let threadlineIds = [];
        if (idParam === "compare" || idParam === "multi") {
            const idsStr = request.query.ids || "";
            threadlineIds = idsStr.split(",").filter(Boolean);
        } else {
            threadlineIds = [idParam];
        }

        if (threadlineIds.length === 0) {
            return response.status(400).json({
                status: "error",
                message: "No threadline IDs specified."
            });
        }

        // Validate threadlines exist and belong to the user
        const placeholders = threadlineIds.map(() => "?").join(",");
        const existing = db.query(
            `SELECT id FROM threadlines WHERE id IN (${placeholders}) AND owner_id = ?`, 
            [...threadlineIds, request.uid]
        );
        if (existing.length !== threadlineIds.length) {
            return response.status(403).json({
                status: "error",
                message: "Access denied: One or more threadlines are missing or not owned by you."
            });
        }

        const zoom = request.query.zoom || "day";
        const start = request.query.start ? Number(request.query.start) : null;
        const end = request.query.end ? Number(request.query.end) : null;

        // Build constraint for events based on threadlines
        const clauses = [];
        const queryParams = [];
        threadlineIds.forEach(id => {
            clauses.push(" t.threadline_id = ? ");
            queryParams.push(id);
        });
        const inClause = `WHERE ( ${clauses.join(" OR ")} )`;

        // Build dynamic filter clauses
        let filterSql = "";
        let hasJoin = false;
        
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

        // Build SQL query depending on whether we need to filter by conversation or not
        const fromClause = hasJoin 
            ? "FROM timeline_events t LEFT JOIN messages m ON t.source_id = m.id"
            : "FROM timeline_events t";

        let sql = "";
        
        // Define groupings depending on zoom level
        switch (zoom) {
            case "year":
                sql = `
                    SELECT strftime('%Y', datetime(t.timestamp / 1000, 'unixepoch')) AS period, 
                           COUNT(*) AS count,
                           MIN(t.timestamp) AS minTimestamp,
                           MAX(t.timestamp) AS maxTimestamp
                    ${fromClause}
                    ${inClause} ${filterSql}
                    GROUP BY period
                    ORDER BY period ASC;
                `;
                break;
                
            case "month":
                sql = `
                    SELECT strftime('%Y-%m', datetime(t.timestamp / 1000, 'unixepoch')) AS period, 
                           COUNT(*) AS count,
                           MIN(t.timestamp) AS minTimestamp,
                           MAX(t.timestamp) AS maxTimestamp
                    ${fromClause}
                    ${inClause} ${filterSql}
                    GROUP BY period
                    ORDER BY period ASC;
                `;
                break;
                
            case "hour":
                sql = `
                    SELECT strftime('%Y-%m-%d %H:00:00', datetime(t.timestamp / 1000, 'unixepoch')) AS period, 
                           COUNT(*) AS count,
                           MIN(t.timestamp) AS minTimestamp,
                           MAX(t.timestamp) AS maxTimestamp
                    ${fromClause}
                    ${inClause} ${filterSql}
                    GROUP BY period
                    ORDER BY period ASC;
                `;
                break;
                
            case "day":
            default:
                sql = `
                    SELECT strftime('%Y-%m-%d', datetime(t.timestamp / 1000, 'unixepoch')) AS period, 
                           COUNT(*) AS count,
                           MIN(t.timestamp) AS minTimestamp,
                           MAX(t.timestamp) AS maxTimestamp
                    ${fromClause}
                    ${inClause} ${filterSql}
                    GROUP BY period
                    ORDER BY period ASC;
                `;
                break;
        }

        const data = db.query(sql, queryParams);
        
        response.json({
            status: "success",
            zoom,
            threadlineId: idParam,
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
