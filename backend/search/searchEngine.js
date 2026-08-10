/*
    searchEngine.js

    Redesigned, layered search pipeline for Threadline messages.
    Implements FTS5 candidate retrieval, structural temporal filtering, 
    relative event timeframe resolvers, dynamic participant matching, 
    and token-aware relevance scoring.
*/

const db = require("../database/database");

class SearchEngine {
    constructor() {
        // Concept and topic mapping synonyms for semantic expansion (purged of generic terms like 'no', 'time', 'date')
        this.conceptSynonyms = {
            visitation: ["visit", "schedule", "pick up", "drop off", "custody", "child", "children", "overnight", "sleepover"],
            refused: ["refuse", "cancel", "deny", "not tonight", "withheld", "denied"],
            shopping: ["shop", "store", "buy", "mall", "grocery", "groceries", "bought", "purchased", "market"],
            concert: ["concert", "show", "band", "music", "ticket", "tickets", "stage", "venue", "live"],
            argument: ["argue", "argument", "fight", "dispute", "screaming", "angry", "yelling", "shouted", "mad", "upset", "shouting"],
            camping: ["camp", "camping", "tent", "outside", "nature", "woods", "forest", "gear", "sleeping bag"]
        };

        // Month indexing for mapping text terms in UTC operations
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
     * Replaces hardcoded people/locations lists with dynamic participant scanning.
     */
    parseQuery(queryText, threadlineIds) {
        const query = queryText.toLowerCase().trim();
        const info = {
            original: queryText,
            people: [],
            month: null,
            year: null,
            relativeOrder: null, // 'after' | 'before' | 'around' | 'following' | 'leading up to' | 'during' | 'that week' | 'that day' | 'the next day' | 'the previous day'
            relativeEvent: null, // event anchor keyword
            location: null,
            concepts: [],
            quotedPhrases: [],
            keywords: []
        };

        // 1. Extract quoted phrases
        const quoteRegex = /"([^"]+)"/g;
        let quoteMatch;
        let cleanedQuery = query;
        while ((quoteMatch = quoteRegex.exec(query)) !== null) {
            info.quotedPhrases.push(quoteMatch[1].trim());
            cleanedQuery = cleanedQuery.replace(quoteMatch[0], "");
        }

        // 2. Extract dynamic participants from the database
        if (threadlineIds && threadlineIds.length > 0) {
            const placeholders = threadlineIds.map(() => "?").join(",");
            const participants = db.query(
                `SELECT DISTINCT name, phone_number, email, aliases FROM participants WHERE threadline_id IN (${placeholders})`,
                threadlineIds
            );
            
            participants.forEach(p => {
                const namesToCheck = [];
                if (p.name) namesToCheck.push(p.name.toLowerCase());
                if (p.phone_number) namesToCheck.push(p.phone_number.toLowerCase());
                if (p.aliases) {
                    try {
                        const parsed = JSON.parse(p.aliases);
                        if (Array.isArray(parsed)) parsed.forEach(a => namesToCheck.push(a.toLowerCase()));
                    } catch (e) {}
                }

                for (const name of namesToCheck) {
                    if (name.length > 2 && new RegExp(`\\b${escapeRegExp(name)}\\b`, "i").test(cleanedQuery)) {
                        info.people.push(p.name);
                        cleanedQuery = cleanedQuery.replace(new RegExp(`\\b${escapeRegExp(name)}\\b`, "i"), "");
                        break;
                    }
                }
            });
        }

        // 3. Extract location anchors (e.g. "in Florida", "to Boston")
        const locRegex = /\b(?:in|at|to|from)\s+([a-zA-Z]+)\b/gi;
        let locMatch;
        while ((locMatch = locRegex.exec(cleanedQuery)) !== null) {
            const potentialLoc = locMatch[1].toLowerCase();
            const fillers = ["the", "a", "an", "this", "that", "my", "our", "your"];
            if (!fillers.includes(potentialLoc)) {
                info.location = potentialLoc;
                cleanedQuery = cleanedQuery.replace(locMatch[0], "");
            }
        }

        // 4. Extract month markers
        for (const [name, num] of Object.entries(this.months)) {
            const rx = new RegExp(`\\b${name}\\b`, "i");
            if (rx.test(cleanedQuery)) {
                info.month = num;
                cleanedQuery = cleanedQuery.replace(rx, "");
                break;
            }
        }

        // 5. Extract year digits
        const yearMatch = cleanedQuery.match(/\b(20\d{2}|19\d{2})\b/);
        if (yearMatch) {
            info.year = parseInt(yearMatch[1], 10);
            cleanedQuery = cleanedQuery.replace(yearMatch[0], "");
        }

        // 6. Extract relative indicators ("after the concert", "before the argument", "the next day after the concert")
        const relativeRegex = /\b(after|before|around|following|leading\s+up\s+to|during|that\s+week|that\s+day|the\s+next\s+day|the\s+previous\s+day)\b\s+(?:the\s+|we\s+had\s+the\s+|we\s+went\s+to\s+the\s+|our\s+)?([a-zA-Z0-9_-]+)/i;
        const relativeMatch = cleanedQuery.match(relativeRegex);
        if (relativeMatch) {
            info.relativeOrder = relativeMatch[1].toLowerCase();
            info.relativeEvent = relativeMatch[2].toLowerCase();
            cleanedQuery = cleanedQuery.replace(relativeMatch[0], "");
        }

        // 7. Match theme concepts
        for (const [concept, keywords] of Object.entries(this.conceptSynonyms)) {
            const rxConcept = new RegExp(`\\b${concept}\\b`, "i");
            if (rxConcept.test(cleanedQuery)) {
                info.concepts.push(concept);
            } else {
                for (const kw of keywords) {
                    if (new RegExp(`\\b${escapeRegExp(kw)}\\b`, "i").test(cleanedQuery)) {
                        info.concepts.push(concept);
                        break;
                    }
                }
            }
        }

        // 8. Extract remaining keywords (ignoring fillers)
        const fillers = new Set(["that", "time", "we", "went", "in", "when", "me", "the", "conversation", "about", "going", "where", "i", "told", "him", "couldn't", "make", "it", "what", "did", "talk", "to", "had", "our", "a", "for", "with", "around", "of", "and", "or", "on", "was", "were", "went"]);
        cleanedQuery
            .replace(/[^\w\s]/g, "")
            .split(/\s+/)
            .forEach(term => {
                const cleanTerm = term.trim().toLowerCase();
                if (cleanTerm.length > 2 && !fillers.has(cleanTerm)) {
                    info.keywords.push(cleanTerm);
                }
            });

        return info;
    }

    /**
     * Resolve the anchor timestamp for a relative time indicator.
     */
    async resolveEventTimestamp(threadlineIds, eventKeyword) {
        if (!threadlineIds || threadlineIds.length === 0) return null;

        const clauses = [];
        const params = [];
        threadlineIds.forEach(id => {
            clauses.push(" threadline_id = ? ");
            params.push(id);
        });
        const constraint = ` ( ${clauses.join(" OR ")} ) `;

        // Check messages table first
        const sqlMessage = `
            SELECT timestamp 
            FROM messages 
            WHERE ${constraint} AND body LIKE ? 
            ORDER BY timestamp ASC 
            LIMIT 1;
        `;
        const resMessage = db.queryOne(sqlMessage, [...params, `%${eventKeyword}%`]);
        if (resMessage) {
            return resMessage.timestamp;
        }

        // Check timeline events table
        const eventClauses = [];
        const eventParams = [];
        threadlineIds.forEach(id => {
            eventClauses.push(" threadline_id = ? ");
            eventParams.push(id);
        });
        const eventConstraint = ` ( ${eventClauses.join(" OR ")} ) `;

        const sqlEvent = `
            SELECT timestamp 
            FROM timeline_events 
            WHERE ${eventConstraint} AND (title LIKE ? OR description LIKE ?) 
            ORDER BY timestamp ASC 
            LIMIT 1;
        `;
        const resEvent = db.queryOne(sqlEvent, [...eventParams, `%${eventKeyword}%`, `%${eventKeyword}%`]);
        return resEvent ? resEvent.timestamp : null;
    }

    /**
     * Execute the layered search pipeline.
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

        // If comparison IDs are passed explicitly in filters, merge them
        if (filters.ids) {
            const extraIds = filters.ids.split(",").map(s => s.trim()).filter(Boolean);
            extraIds.forEach(id => {
                if (!ids.includes(id)) ids.push(id);
            });
        }

        if (ids.length === 0) {
            return [];
        }

        // --- LAYER 1: QUERY PARSING ---
        const intent = this.parseQuery(queryText, ids);

        // --- LAYER 2: STRUCTURAL FILTERS ---
        let timeFilterSql = "";
        const queryParams = [];
        let resolvedAnchorTime = null;

        if (intent.relativeOrder && intent.relativeEvent) {
            resolvedAnchorTime = await this.resolveEventTimestamp(ids, intent.relativeEvent);
            if (resolvedAnchorTime) {
                const dayMs = 24 * 60 * 60 * 1000;
                switch (intent.relativeOrder) {
                    case "after":
                    case "following":
                        timeFilterSql += " AND m.timestamp >= ? ";
                        queryParams.push(resolvedAnchorTime);
                        break;
                    case "before":
                    case "leading up to":
                        timeFilterSql += " AND m.timestamp <= ? ";
                        queryParams.push(resolvedAnchorTime);
                        break;
                    case "the next day":
                        timeFilterSql += " AND m.timestamp >= ? AND m.timestamp <= ? ";
                        queryParams.push(resolvedAnchorTime + dayMs, resolvedAnchorTime + 2 * dayMs);
                        break;
                    case "the previous day":
                        timeFilterSql += " AND m.timestamp >= ? AND m.timestamp <= ? ";
                        queryParams.push(resolvedAnchorTime - 2 * dayMs, resolvedAnchorTime - dayMs);
                        break;
                    case "around":
                    case "during":
                    case "that day":
                        const dayMargin = intent.relativeOrder === "that day" ? 1 : 3;
                        timeFilterSql += " AND m.timestamp >= ? AND m.timestamp <= ? ";
                        queryParams.push(resolvedAnchorTime - dayMargin * dayMs, resolvedAnchorTime + dayMargin * dayMs);
                        break;
                    case "that week":
                        timeFilterSql += " AND m.timestamp >= ? AND m.timestamp <= ? ";
                        queryParams.push(resolvedAnchorTime - 7 * dayMs, resolvedAnchorTime + 7 * dayMs);
                        break;
                }
            }
        }

        // UTC Calendar Filters
        if (intent.month) {
            timeFilterSql += " AND strftime('%m', datetime(m.timestamp / 1000, 'unixepoch')) = ? ";
            queryParams.push(String(intent.month).padStart(2, "0"));
        }
        if (intent.year) {
            timeFilterSql += " AND strftime('%Y', datetime(m.timestamp / 1000, 'unixepoch')) = ? ";
            queryParams.push(String(intent.year));
        }

        // Additional Request Context Filters
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

        // --- LAYER 3: CANDIDATE RETRIEVAL (SQLite FTS5) ---
        let candidateSql = "";
        const candidateParams = [];

        // Filter out general retrieval terms to allow broad structural queries (e.g., "everything with Sarah")
        const retrieveAllWords = new Set(["everything", "all", "messages", "chats", "texts", "conversations", "records", "entries", "show", "find", "get", "list"]);
        const searchKeywords = intent.keywords.filter(kw => !retrieveAllWords.has(kw));

        // Construct FTS MATCH expression
        const ftsTerms = [];
        intent.quotedPhrases.forEach(qp => {
            ftsTerms.push(`"${qp}"`);
        });
        searchKeywords.forEach(kw => {
            ftsTerms.push(`${kw}*`);
        });

        // Add matching synonyms if concepts are parsed
        intent.concepts.forEach(concept => {
            const synonyms = this.conceptSynonyms[concept] || [];
            synonyms.forEach(syn => {
                ftsTerms.push(`${syn}*`);
            });
        });

        if (ftsTerms.length > 0) {
            const ftsExpression = ftsTerms.join(" OR ");
            candidateSql = ` AND m.id IN (SELECT message_id FROM messages_fts WHERE body MATCH ?) `;
            candidateParams.push(ftsExpression);
        }

        // Build constraint for messages based on global archive or custom workspace segments
        const clauses = [];
        const scopeParams = [];
        ids.forEach(id => {
            clauses.push(" m.threadline_id = ? ");
            scopeParams.push(id);
        });
        const scopeClause = `WHERE ( ${clauses.join(" OR ")} )`;

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
            ${scopeClause} ${timeFilterSql} ${candidateSql}
            ORDER BY m.timestamp DESC
            LIMIT 300;
        `;

        const candidates = db.query(sql, [...scopeParams, ...queryParams, ...candidateParams]);

        // --- LAYER 4: RELEVANCE SCORING ---
        const scored = candidates.map(m => {
            let score = 0;
            const bodyLower = (m.body || "").toLowerCase();
            const titleLower = (m.conversationTitle || "").toLowerCase();

            // 1. Quoted phrase exact matches
            intent.quotedPhrases.forEach(qp => {
                if (bodyLower.includes(qp.toLowerCase())) {
                    score += 200;
                }
            });

            // 2. Token whole-word matching (distinguish substrings)
            intent.keywords.forEach(kw => {
                const rxWord = new RegExp(`\\b${escapeRegExp(kw)}\\b`, "i");
                if (rxWord.test(bodyLower)) {
                    score += 40; // Whole-word match
                } else if (bodyLower.includes(kw)) {
                    score += 5;  // Substring match
                }
            });

            // 3. Synonym whole-word matches
            intent.concepts.forEach(concept => {
                if (new RegExp(`\\b${escapeRegExp(concept)}\\b`, "i").test(bodyLower)) {
                    score += 45;
                }
                const synonyms = this.conceptSynonyms[concept] || [];
                synonyms.forEach(syn => {
                    const rxWord = new RegExp(`\\b${escapeRegExp(syn)}\\b`, "i");
                    if (rxWord.test(bodyLower)) {
                        score += 35;
                    }
                });
            });

            // 4. Participant matches
            intent.people.forEach(person => {
                const personClean = person.toLowerCase();
                const rxWord = new RegExp(`\\b${escapeRegExp(personClean)}\\b`, "i");
                if (rxWord.test(bodyLower)) {
                    score += 50; // Mentions person
                }
                if (titleLower.includes(personClean) || (m.sender && m.sender.toLowerCase().includes(personClean))) {
                    score += 80; // Sourced from or conversation with person
                }
            });

            // 5. Location matches
            if (intent.location) {
                const rxWord = new RegExp(`\\b${escapeRegExp(intent.location)}\\b`, "i");
                if (rxWord.test(bodyLower)) {
                    score += 80;
                }
            }

            // 6. Time Proximity Decay Curve (UTC)
            if (resolvedAnchorTime) {
                const diffMs = Math.abs(m.timestamp - resolvedAnchorTime);
                const dayMs = 24 * 60 * 60 * 1000;
                if (diffMs <= 14 * dayMs) {
                    // Score bonus: +100 max decaying to 0 at 14 days
                    score += Math.max(0, Math.round(100 * (1 - diffMs / (14 * dayMs))));
                }
            }

            // 7. Month/Year Match (UTC)
            if (intent.month || intent.year) {
                // Ensure month and year comparison is mapped to UTC calendar fields
                const mDate = new Date(m.timestamp);
                if (intent.month && mDate.getUTCMonth() + 1 === intent.month) {
                    score += 100;
                }
                if (intent.year && mDate.getUTCFullYear() === intent.year) {
                    score += 100;
                }
            }

            return { message: m, score };
        });

        // Filter and sort candidates
        const sorted = scored
            .filter(sm => sm.score > 0)
            .sort((a, b) => b.score - a.score);

        // --- LAYER 5: RESULT GROUPING ---
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

        // --- LAYER 6: CONTEXT EXPANSION ---
        const results = [];
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

            // Fetch preceding messages context
            const preceding = db.query(
                `SELECT id, sender, recipient, timestamp, body, direction, platform, metadata
                 FROM messages
                 WHERE conversation_id = ? AND timestamp < ?
                 ORDER BY timestamp DESC
                 LIMIT 2`,
                [group.conversationId, repMsg.timestamp]
            ).reverse();

            // Fetch succeeding messages context
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

            // Format displayed date using UTC representation
            const repDate = new Date(repMsg.timestamp);
            const dateOptions = { timeZone: "UTC", year: "numeric", month: "long", day: "numeric" };
            const dateStr = repDate.toLocaleDateString("en-US", dateOptions);

            results.push({
                conversationId: group.conversationId,
                conversationTitle: group.conversationTitle,
                platform: group.platform,
                relevance,
                relevanceScore: group.maxScore,
                reason,
                dateString: dateStr,
                timestamp: repMsg.timestamp,
                messageCount: group.matchedMessages.length,
                representativeMessageId: repMsg.id,
                contextWindow
            });
        }

        results.sort((a, b) => b.relevanceScore - a.relevanceScore);
        return results;
    }
}

function escapeRegExp(string) {
    return string.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

module.exports = new SearchEngine();
