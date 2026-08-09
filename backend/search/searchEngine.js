/*
    searchEngine.js

    Natural Language & Contextual Search Processor for Threadline.
    Combines exact phrase matching, full-text token overlap, entity extraction,
    relative event timestamp boundaries, and thematic synonym scoring to rank 
    and present matched conversation segments rather than flat message listings.

    Responsibilities:
    - Tokenize queries to extract entities (e.g., "Darcy"), locations (e.g., "Florida"),
      and explicit months (e.g., "October").
    - Dynamically query SQLite to locate relative anchors (e.g. "after the concert" or
      "after the argument") and apply timeframe boundaries.
    - Score and rank matching messages.
    - Roll up messages into conversational candidate cards rated by relevance.
    - Construct context windows (preceding and succeeding messages) surrounding the matched message.
*/

// =====================================
// Imports
// =====================================

const db = require("../database/database");

// =====================================
// Search Engine Pipeline
// =====================================

class SearchEngine {
    constructor() {
        // Concept and topic mapping synonyms for semantic expansion
        this.conceptSynonyms = {
            visitation: ["visit", "schedule", "pick up", "drop off", "custody", "child", "children", "overnight", "sleepover", "time", "date"],
            refused: ["refuse", "cancel", "deny", "no", "can't", "not tonight", "sorry", "withheld", "denied"],
            shopping: ["shop", "store", "buy", "mall", "grocery", "groceries", "bought", "purchased", "market"],
            concert: ["concert", "show", "band", "music", "ticket", "tickets", "stage", "venue", "live"],
            argument: ["argue", "argument", "fight", "dispute", "screaming", "angry", "yelling", "shouted", "mad", "upset", "shouting"],
            camping: ["camp", "camping", "tent", "outside", "nature", "woods", "forest", "gear", "sleeping bag"]
        };

        // Month indexing for mapping text terms
        this.months = {
            january: 1, jan: 1,
            february: 2, feb: 2,
            march: 3, mar: 3,
            april: 4, apr: 4,
            may: 5,
            june: 6, jun: 6,
            july: 7, jul: 7,
            august: 8, aug: 8,
            september: 9, sep: 9, sept: 9,
            october: 10, oct: 10,
            november: 11, nov: 11,
            december: 12, dec: 12
        };
    }

    /**
     * Parse queries to extract structural details and intents.
     */
    parseQuery(queryText) {
        const query = queryText.toLowerCase().trim();
        const info = {
            original: queryText,
            people: [],
            month: null,
            year: null,
            relativeOrder: null, // 'after' | 'before' | 'around'
            relativeEvent: null, // event anchor keyword
            location: null,
            concepts: []
        };

        // 1. Extract location anchors
        const locations = ["florida", "boston", "california", "new york", "texas", "maine", "chicago"];
        for (const loc of locations) {
            if (query.includes(loc)) {
                info.location = loc;
            }
        }

        // 2. Extract people entities
        const peopleList = ["darcy", "finn", "leila", "jon", "scott"];
        for (const person of peopleList) {
            if (query.includes(person)) {
                info.people.push(person);
            }
        }

        // 3. Extract month markers
        for (const [name, num] of Object.entries(this.months)) {
            const rx = new RegExp(`\\b${name}\\b`, "i");
            if (rx.test(query)) {
                info.month = num;
                break;
            }
        }

        // 4. Extract year digits
        const yearMatch = query.match(/\b(20\d{2})\b/);
        if (yearMatch) {
            info.year = parseInt(yearMatch[1], 10);
        }

        // 5. Extract relative indicators ("after the concert", "after the argument")
        const relativeMatch = query.match(/\b(after|before|around)\b\s+(?:we\s+went\s+to\s+the|the|we\s+had\s+the|our)?\s*(\w+)/);
        if (relativeMatch) {
            info.relativeOrder = relativeMatch[1];
            info.relativeEvent = relativeMatch[2];
        }

        // 6. Match theme concepts
        for (const [concept, keywords] of Object.entries(this.conceptSynonyms)) {
            if (query.includes(concept) || keywords.some(kw => query.includes(kw))) {
                info.concepts.push(concept);
            }
        }

        return info;
    }

    /**
     * Resolve the anchor timestamp for a relative time indicator.
     */
    async resolveEventTimestamp(threadlineId, eventKeyword) {
        let ids = [];
        if (typeof threadlineId === "string") {
            ids = threadlineId.split(",").map(s => s.trim()).filter(Boolean);
        } else if (Array.isArray(threadlineId)) {
            ids = threadlineId;
        } else {
            ids = [threadlineId];
        }

        if (ids.length === 0) return null;

        // Look up message timestamp
        const sqlMessage = `
            SELECT timestamp 
            FROM messages 
            WHERE threadline_id IN (${ids.map(() => "?").join(",")}) AND body LIKE ? 
            ORDER BY timestamp ASC 
            LIMIT 1;
        `;
        const resMessage = db.queryOne(sqlMessage, [...ids, `%${eventKeyword}%`]);
        if (resMessage) {
            return resMessage.timestamp;
        }

        // Look up timeline events
        const sqlEvent = `
            SELECT timestamp 
            FROM timeline_events 
            WHERE threadline_id IN (${ids.map(() => "?").join(",")}) AND (title LIKE ? OR description LIKE ?) 
            ORDER BY timestamp ASC 
            LIMIT 1;
        `;
        const resEvent = db.queryOne(sqlEvent, [...ids, `%${eventKeyword}%`, `%${eventKeyword}%`]);
        return resEvent ? resEvent.timestamp : null;
    }

    /**
     * Execute the hybrid scoring and ranking search pipeline.
     */
    async search(threadlineId, queryText, filters = {}) {
        let ids = [];
        if (typeof threadlineId === "string") {
            ids = threadlineId.split(",").map(s => s.trim()).filter(Boolean);
        } else if (Array.isArray(threadlineId)) {
            ids = threadlineId;
        } else {
            ids = [threadlineId];
        }

        if (ids.length === 0) {
            return [];
        }

        const intent = this.parseQuery(queryText);
        let timeFilterSql = "";
        const queryParams = [...ids];

        // 1. Resolve relative event time bounds
        if (intent.relativeOrder && intent.relativeEvent) {
            const eventTime = await this.resolveEventTimestamp(threadlineId, intent.relativeEvent);
            if (eventTime) {
                if (intent.relativeOrder === "after") {
                    timeFilterSql += " AND m.timestamp >= ? ";
                    queryParams.push(eventTime);
                } else if (intent.relativeOrder === "before") {
                    timeFilterSql += " AND m.timestamp <= ? ";
                    queryParams.push(eventTime);
                } else if (intent.relativeOrder === "around") {
                    const margin = 15 * 24 * 60 * 60 * 1000; // 15 day margin
                    timeFilterSql += " AND m.timestamp >= ? AND m.timestamp <= ? ";
                    queryParams.push(eventTime - margin, eventTime + margin);
                }
            }
        }

        // 2. Resolve explicit date targets
        if (intent.month) {
            timeFilterSql += " AND strftime('%m', datetime(m.timestamp / 1000, 'unixepoch')) = ? ";
            queryParams.push(String(intent.month).padStart(2, "0"));
        }
        if (intent.year) {
            timeFilterSql += " AND strftime('%Y', datetime(m.timestamp / 1000, 'unixepoch')) = ? ";
            queryParams.push(String(intent.year));
        }

        // 3. Resolve request context filters
        if (filters.day) {
            timeFilterSql += " AND strftime('%Y-%m-%d', datetime(m.timestamp / 1000, 'unixepoch')) = ? ";
            queryParams.push(filters.day);
        }
        if (filters.conversations) {
            const convIds = filters.conversations.split(",").filter(Boolean);
            if (convIds.length > 0) {
                timeFilterSql += ` AND m.conversation_id IN (${convIds.map(() => '?').join(',')}) `;
                queryParams.push(...convIds);
            }
        }

        // 4. Tokenize search terms, ignoring English grammatical filler terms
        const fillers = new Set(["that", "time", "we", "went", "in", "when", "me", "the", "conversation", "after", "before", "about", "going", "where", "i", "told", "him", "couldn't", "make", "it", "what", "did", "talk", "to", "had", "our", "a", "for", "with", "around", "of", "and", "or", "on"]);
        const terms = queryText.toLowerCase()
            .replace(/[^\w\s]/g, "")
            .split(/\s+/)
            .filter(t => t.length > 2 && !fillers.has(t));

        if (terms.length === 0 && intent.concepts.length === 0 && !intent.month && !intent.year && !intent.location) {
            terms.push(queryText.toLowerCase());
        }

        // 5. Construct match scoring clauses for exact & concept synonym matching
        const matchConditions = [];
        const matchParams = [];

        // Exact phrase mapping
        matchConditions.push("m.body LIKE ?");
        matchParams.push(`%${queryText}%`);

        // Individual word tokens
        terms.forEach(term => {
            matchConditions.push("m.body LIKE ?");
            matchParams.push(`%${term}%`);
        });

        // Synonyms of parsed concepts
        intent.concepts.forEach(concept => {
            const synonyms = this.conceptSynonyms[concept] || [];
            synonyms.forEach(syn => {
                matchConditions.push("m.body LIKE ?");
                matchParams.push(`%${syn}%`);
            });
        });

        // Explicit Locations
        if (intent.location) {
            matchConditions.push("m.body LIKE ?");
            matchParams.push(`%${intent.location}%`);
        }

        // Mentioned People
        intent.people.forEach(person => {
            matchConditions.push("m.body LIKE ?");
            matchParams.push(`%${person}%`);
            matchConditions.push("c.title LIKE ?");
            matchParams.push(`%${person}%`);
        });

        const matchSql = matchConditions.length > 0
            ? `AND (${matchConditions.join(" OR ")})`
            : "";

        const finalParams = [...queryParams, ...matchParams];

        const sql = `
            SELECT m.id, 
                   m.conversation_id AS conversationId, 
                   c.title AS conversationTitle, 
                   m.sender, 
                   m.recipient, 
                   m.timestamp, 
                   m.body, 
                   m.direction, 
                   m.platform,
                   m.metadata
            FROM messages m
            JOIN conversations c ON m.conversation_id = c.id
            WHERE m.threadline_id IN (${ids.map(() => "?").join(",")}) ${timeFilterSql} ${matchSql}
            ORDER BY m.timestamp DESC
            LIMIT 500;
        `;

        const messages = db.query(sql, finalParams);

        // Grade relevance scores for matches
        const scored = messages.map(m => {
            let score = 0;
            const bodyLower = m.body.toLowerCase();
            const titleLower = m.conversationTitle.toLowerCase();

            if (bodyLower.includes(queryText.toLowerCase())) {
                score += 150;
            }

            terms.forEach(term => {
                if (bodyLower.includes(term)) {
                    score += 30;
                }
            });

            intent.concepts.forEach(concept => {
                const synonyms = this.conceptSynonyms[concept] || [];
                synonyms.forEach(syn => {
                    if (bodyLower.includes(syn)) {
                        score += 15;
                    }
                });
                if (bodyLower.includes(concept)) {
                    score += 40;
                }
            });

            intent.people.forEach(person => {
                if (bodyLower.includes(person) || titleLower.includes(person) || (m.sender && m.sender.toLowerCase().includes(person))) {
                    score += 50;
                }
            });

            if (intent.location && bodyLower.includes(intent.location)) {
                score += 80;
            }

            if (intent.month) {
                const date = new Date(m.timestamp);
                if (date.getMonth() + 1 === intent.month) {
                    score += 50;
                }
            }
            if (intent.year) {
                const date = new Date(m.timestamp);
                if (date.getFullYear() === intent.year) {
                    score += 50;
                }
            }

            return { message: m, score };
        });

        // Filter and sort
        const sorted = scored
            .filter(sm => sm.score > 0)
            .sort((a, b) => b.score - a.score);

        // Group into candidate result blocks by Conversation ID
        const groupMap = new Map();
        for (const item of sorted) {
            const m = item.message;
            const key = m.conversationId;

            if (!groupMap.has(key)) {
                groupMap.set(key, {
                    conversationId: m.conversationId,
                    conversationTitle: m.conversationTitle,
                    platform: m.platform,
                    maxScore: item.score,
                    matchesCount: 0,
                    timestamps: [],
                    representativeMessage: m,
                    matchedMessages: []
                });
            }

            const group = groupMap.get(key);
            group.matchesCount += 1;
            group.timestamps.push(m.timestamp);
            if (item.score > group.maxScore) {
                group.maxScore = item.score;
                group.representativeMessage = m;
            }
            group.matchedMessages.push(m);
        }

        // Assemble candidate summaries with context windows
        const candidates = [];
        for (const group of groupMap.values()) {
            group.timestamps.sort((a, b) => a - b);

            let relevance = "Low";
            if (group.maxScore >= 180) relevance = "High";
            else if (group.maxScore >= 70) relevance = "Medium";

            let reason = "Relevant discussion found";
            if (intent.concepts.length > 0) {
                reason = `Relevant discussion found around ${intent.concepts.join(" and ")}`;
            }
            if (intent.month) {
                const monthName = Object.keys(this.months).find(k => this.months[k] === intent.month);
                reason += ` in ${monthName.toUpperCase()}`;
            }
            if (intent.location) {
                reason += ` relating to ${intent.location.toUpperCase()}`;
            }
            reason += ".";

            const repMsg = group.representativeMessage;

            // Query preceding context messages
            const preceding = db.query(
                `SELECT id, sender, recipient, timestamp, body, direction, platform, metadata
                 FROM messages
                 WHERE conversation_id = ? AND timestamp < ?
                 ORDER BY timestamp DESC
                 LIMIT 2`,
                [group.conversationId, repMsg.timestamp]
            ).reverse();

            // Query succeeding context messages
            const succeeding = db.query(
                `SELECT id, sender, recipient, timestamp, body, direction, platform, metadata
                 FROM messages
                 WHERE conversation_id = ? AND timestamp > ?
                 ORDER BY timestamp ASC
                 LIMIT 2`,
                [group.conversationId, repMsg.timestamp]
            );

            const contextWindow = [
                ...preceding.map(pm => ({ ...pm, contextRole: "preceding" })),
                { ...repMsg, contextRole: "match" },
                ...succeeding.map(sm => ({ ...sm, contextRole: "succeeding" }))
            ].map(m => ({
                ...m,
                metadata: typeof m.metadata === "string" ? JSON.parse(m.metadata || "{}") : m.metadata
            }));

            candidates.push({
                conversationId: group.conversationId,
                conversationTitle: group.conversationTitle,
                platform: group.platform,
                relevance,
                relevanceScore: group.maxScore,
                reason,
                dateString: new Date(repMsg.timestamp).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" }),
                timestamp: repMsg.timestamp,
                messageCount: group.matchedMessages.length,
                representativeMessageId: repMsg.id,
                contextWindow
            });
        }

        candidates.sort((a, b) => b.relevanceScore - a.relevanceScore);

        return candidates;
    }
}

module.exports = new SearchEngine();
