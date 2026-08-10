/*
    search.js

    Search API endpoint for Threadline messages.
    Searches message text inside a specific threadline and returns matches
    joined with conversation details. Supports filtering matches to a specific day.

    Responsibilities:
    - Perform text search query using SQLite LIKE operator.
    - Support optional day filtering (format YYYY-MM-DD).
    - Return list of matches with timestamps for navigating back into the timeline.
*/

// =====================================
// Imports
// =====================================

const express = require("express");
const db = require("../database/database");

const searchEngine = require("../search/searchEngine");

// =====================================
// Variables
// =====================================

const router = express.Router({ mergeParams: true });

// =====================================
// Routes
// =====================================

/**
 * GET /api/threadlines/:id/search
 * Query parameters:
 *   - q: search keyword / query
 *   - day: 'YYYY-MM-DD' (optional day filter)
 *   - conversations: comma-separated list of conversation IDs
 */
router.get("/", async (request, response) => {
    try {
        const threadlineId = request.params.id;
        const queryText = request.query.q || "";
        const day = request.query.day || null;
        const conversationsParam = request.query.conversations || null;

        if (!queryText.trim()) {
            return response.json({
                status: "success",
                results: []
            });
        }

        let threadlineIds = [];
        if (threadlineId === "compare" || threadlineId === "multi") {
            const idsStr = request.query.ids || "";
            threadlineIds = idsStr.split(",").filter(Boolean);
        } else {
            threadlineIds = [threadlineId];
        }

        if (threadlineIds.length === 0) {
            return response.status(400).json({
                status: "error",
                message: "No threadline IDs specified."
            });
        }

        // Verify ownership of all threadline IDs
        for (const id of threadlineIds) {
            const row = db.queryOne("SELECT owner_id FROM threadlines WHERE id = ?", [id]);
            if (!row || row.owner_id !== request.uid) {
                return response.status(403).json({
                    status: "error",
                    message: "Access denied."
                });
            }
        }

        // Execute hybrid search engine
        const results = await searchEngine.search(threadlineId, queryText, {
            day,
            conversations: conversationsParam,
            ids: request.query.ids || null
        });

        response.json({
            status: "success",
            query: queryText,
            day,
            results
        });

    } catch (error) {
        console.error("Search query failed:", error);
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
