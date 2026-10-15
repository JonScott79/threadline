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
const { getAuthorizedUids } = require("../services/threadlines");

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
        const start = request.query.start ? Number(request.query.start) : null;
        const end = request.query.end ? Number(request.query.end) : null;
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

        // Verify ownership of all threadline IDs with multi-alias authorization
        const authorizedUids = getAuthorizedUids(request.uid);
        for (const id of threadlineIds) {
            const isArchive = id.startsWith("archive_") && authorizedUids.some(u => id === `archive_${u}`);
            const row = db.queryOne("SELECT owner_id FROM threadlines WHERE id = ?", [id]);
            if (!isArchive && (!row || !authorizedUids.includes(row.owner_id))) {
                return response.status(403).json({
                    status: "error",
                    message: "Access denied."
                });
            }
        }

        // Mode dispatch: 'simple' (Fast, 100% offline, keyword/metadata) vs 'ai' (Contextual exchange retriever)
        const searchMode = request.query.mode || "simple";
        const page = parseInt(request.query.page || "1", 10);
        const batchSize = parseInt(request.query.batchSize || "10", 10);
        const aiProvider = request.query.aiProvider || null; // 'ollama' | 'groq'
        const groqApiKey = request.headers["x-groq-api-key"] || null;

        // If Cloud AI is explicitly chosen, strictly verify API key at provider boundary
        if (searchMode === "ai" && aiProvider === "groq") {
            if (!groqApiKey || typeof groqApiKey !== "string" || !groqApiKey.trim().startsWith("gsk_")) {
                return response.status(400).json({
                    status: "error",
                    message: "Groq Cloud AI requires a valid API key in x-groq-api-key header (starting with 'gsk_')."
                });
            }
            const semanticAdapter = require("../search/semantic/semanticAdapter");
            semanticAdapter.configureProvider("groq", { apiKey: groqApiKey });
        } else if (searchMode === "ai" && aiProvider === "ollama") {
            const semanticAdapter = require("../search/semantic/semanticAdapter");
            semanticAdapter.configureProvider("ollama");
        }

        if (searchMode === "ai") {
            const ExchangeRetriever = require("../search/exchangeRetriever");
            const retriever = new ExchangeRetriever(db, searchEngine);

            const exchangeResults = await retriever.retrieveExchanges(threadlineIds, queryText, {
                page,
                batchSize,
                mode: "ai",
                useAI: true,
                uid: request.uid,
                filters: {
                    day,
                    start,
                    end,
                    conversations: conversationsParam
                }
            });

            return response.json({
                status: "success",
                mode: "ai",
                query: queryText,
                day,
                archiveCoverage: exchangeResults.archiveCoverage,
                aiDiagnostics: exchangeResults.aiDiagnostics,
                results: exchangeResults.results
            });
        }

        // Mode: 'simple' (Local, Deterministic, 0 AI calls, 0 network)
        const results = await searchEngine.search(threadlineId, queryText, {
            day,
            start,
            end,
            conversations: conversationsParam,
            ids: request.query.ids || null,
            uid: request.uid
        });

        response.json({
            status: "success",
            mode: "simple",
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
