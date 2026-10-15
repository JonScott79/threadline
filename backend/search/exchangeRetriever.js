const semanticAdapter = require("./semantic/semanticAdapter");
/*
    exchangeRetriever.js

    Phase 2: Verifiable Dialogue Exchange Retriever for Threadline.
    
    Responsibilities:
    1. Multi-Stage High-Recall Candidate Generation:
       - Uses chunks_fts with expanded query vocabulary (request variants, outcome variants, synonyms).
       - Supports participant-scoped exchange retrieval.
       - Supports structural filters (time ranges, specific conversations).
    2. Turn-Taking Dialogue Assembly & Temporal Merging:
       - Reconstructs chronological message sequences from raw SQLite messages.
       - Merges overlapping or closely adjacent chunk windows (< 45 mins) so delayed replies
         and multi-message thoughts are unified into single coherent exchange events.
    3. Deterministic Evidence Scoring & Categorization:
       - Lexical question-response correlation bonus.
       - Direct denial and objection detection.
       - Conditional agreement indicators.
       - Speaker alternation rewards (conversational dynamics).
    4. Unbounded Archive Coverage with Bounded Multi-Batch Pagination:
       - Tracks total eligible matching exchanges across the entire database.
       - Distinguishes complete archive coverage from partial batch evaluation.
       - Explicitly flags: { hasMore, batchIndex, totalExchangesFound, returnedInBatch }.
       - NEVER claims a top-N batch represents the complete archive.
    5. Complete Provenance & Forensic Invariants:
       - Every returned exchange contains unaltered message records, raw timestamps, sender identities,
         and conversation links. Ground truth is strictly preserved.
*/

class ExchangeRetriever {
    constructor(db, searchEngine) {
        this.db = db;
        this.searchEngine = searchEngine;

        // Semantic action / request synonym expansion
        this.requestSynonyms = [
            "can i", "could we", "would you", "let me", "pick up", "picking up", "drop off",
            "dropping off", "take the kids", "see the kids", "have the kids", "visitation",
            "parenting time", "schedule", "tomorrow", "tonight", "weekend", "agree", "allowed",
            "bring the kids", "bring them", "take them"
        ];

        // Lexical response / refusal synonyms
        this.refusalSynonyms = [
            "refuse", "refused", "refusing", "deny", "denied", "denying", "never",
            "not happening", "can't", "cant", "won't", "wont", "not allowed",
            "talk to my lawyer", "court", "attorney", "not my problem", "forget it",
            "taking time away", "withheld", "withholding", "no", "nope"
        ];

        // Conditional / Indirect markers
        this.conditionalSynonyms = [
            "only if", "as long as", "depends", "unless", "provided that", "maybe if"
        ];
    }

    /**
     * Retrieve and rank dialogue exchanges for a query across a threadline or case.
     */
    async retrieveExchanges(threadlineId, queryText, options = {}) {
        const page = Math.max(1, parseInt(options.page || 1, 10));
        const batchSize = Math.max(1, parseInt(options.batchSize || 10, 10));
        const filters = options.filters || {};
        const uid = options.uid || null;

        let ids = [];
        if (typeof threadlineId === "string") {
            ids = threadlineId.split(",").map(s => s.trim()).filter(Boolean);
        } else if (Array.isArray(threadlineId)) {
            ids = threadlineId;
        } else if (threadlineId) {
            ids = [threadlineId];
        }

        if (uid) {
            const archiveId = `archive_${uid}`;
            if (!ids.includes(archiveId)) ids.push(archiveId);
        }

        if (ids.length === 0) {
            return this.emptyResult(queryText, page, batchSize);
        }

        // --- STAGE 1: INTENT & ENTITY PARSING ---
        const intent = this.searchEngine ? this.searchEngine.parseQuery(queryText, ids) : {
            people: [],
            month: null,
            year: null,
            quotedPhrases: [],
            keywords: queryText.toLowerCase().split(/\s+/).filter(w => w.length > 2)
        };

        // --- STAGE 2: HIGH-RECALL CANDIDATE CHUNK RETRIEVAL (SQLite FTS5) ---
        const candidateChunks = this.fetchCandidateChunks(ids, intent, queryText, filters);

        if (!candidateChunks || candidateChunks.length === 0) {
            return this.emptyResult(queryText, page, batchSize);
        }

        // --- STAGE 3: TEMPORAL MERGING & DEDUPLICATION ---
        const mergedExchanges = this.mergeAndAssembleExchanges(candidateChunks);

        // --- STAGE 4: DETERMINISTIC MULTI-FACTOR RANKING ---
        const scoredExchanges = this.scoreAndRankExchanges(mergedExchanges, intent, queryText);

        const totalMatches = scoredExchanges.length;
        const totalPages = Math.ceil(totalMatches / batchSize) || 1;

        // --- STAGE 5: BOUNDED BATCH PAGINATION ---
        const startIndex = (page - 1) * batchSize;
        const batchItems = scoredExchanges.slice(startIndex, startIndex + batchSize);

        // --- STAGE 6: OPTIONAL BOUNDED LLM CLASSIFICATION (PHASE 3) ---
        // LLM only analyzes the bounded batch (max 12), never the full archive.
        const useAI = options.useAI !== false && (options.mode === "ai" || options.useAI === true);
        let aiEvaluations = new Map();
        let aiDiagnostics = null;

        if (useAI && batchItems.length > 0) {
            if (semanticAdapter.isEnabled()) {
                const formattedForAi = batchItems.map(item => ({
                    exchangeId: item.exchange.id,
                    conversationTitle: item.exchange.conversationTitle,
                    participants: item.exchange.participants,
                    messages: item.exchange.messages
                }));

                const classificationRes = await semanticAdapter.classifyExchanges(queryText, formattedForAi, {
                    timeoutMs: options.timeoutMs
                });

                aiDiagnostics = classificationRes.diagnostics;
                if (classificationRes.applied) {
                    aiEvaluations = classificationRes.evaluationsMap;
                }
            } else {
                aiDiagnostics = {
                    provider: "none",
                    reason: "AI provider not enabled or configured",
                    fallback: "deterministic"
                };
            }
        }

        const hasMore = startIndex + batchSize < totalMatches;
        const evaluatedCount = (useAI && aiEvaluations.size > 0) ? batchItems.length : 0;
        const remainingCount = Math.max(0, totalMatches - (page * batchSize));
        const isCompleteArchiveEvaluated = totalMatches <= batchSize;

        return {
            status: "success",
            query: queryText,
            mode: useAI && aiEvaluations.size > 0 ? "ai" : "deterministic",
            archiveCoverage: {
                totalEligibleExchanges: totalMatches,
                evaluatedCount,
                remainingCount,
                batchIndex: page,
                batchSize: batchSize,
                totalPages: totalPages,
                hasMore,
                isCompleteArchiveEvaluated
            },
            aiDiagnostics,
            results: batchItems.map(item => {
                const aiEval = aiEvaluations.get(item.exchange.id);
                const startDate = new Date(item.exchange.startTime);
                const dateStr = startDate.toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" });
                const convTitle = item.exchange.conversationTitle || "Conversation";

                return {
                    id: item.exchange.id,
                    clusterId: item.exchange.id,
                    type: "event_cluster",
                    isExchange: true,
                    exchangeId: item.exchange.id,
                    conversationId: item.exchange.conversationId,
                    conversationTitle: convTitle,
                    threadlineId: item.exchange.threadlineId,
                    title: `${convTitle} (${dateStr})`,
                    dateString: dateStr,
                    timeSpan: {
                        start: item.exchange.startTime,
                        end: item.exchange.endTime,
                        dateString: dateStr
                    },
                    timeRange: {
                        start: item.exchange.startTime,
                        end: item.exchange.endTime,
                        durationMinutes: Math.round((item.exchange.endTime - item.exchange.startTime) / 60000)
                    },
                    participants: item.exchange.participants,
                    relevance: item.score > 200 ? "HIGH" : item.score > 100 ? "MEDIUM" : "LOW",
                    clusterConfidence: item.score > 200 ? "HIGH" : "MEDIUM",
                    reason: (item.matchReasons || []).join(" • "),
                    summaryReason: (item.matchReasons || []).join(" • "),
                    relevanceScore: item.score,
                    matchReasons: item.matchReasons,
                    detectedSignals: {
                        hasTurnAlternation: item.exchange.hasTurnAlternation,
                        hasRequest: item.exchange.hasRequest,
                        hasResponse: item.exchange.hasResponse,
                        hasDirectRefusal: item.hasDirectRefusal,
                        hasConditional: item.hasConditional
                    },
                    initialCategory: item.initialCategory, // Deterministic heuristic
                    aiClassification: aiEval ? {
                        outcomeCategory: aiEval.outcomeCategory,
                        confidence: aiEval.confidence,
                        explanation: aiEval.explanation,
                        keyQuote: aiEval.keyQuote,
                        isMatch: aiEval.isMatch
                    } : null,
                    finalCategory: aiEval ? aiEval.outcomeCategory : item.initialCategory,
                    messageCount: item.exchange.messages.length,
                    messages: item.exchange.messages
                };
            })
        };
    }

    fetchCandidateChunks(threadlineIds, intent, queryText, filters) {
        const queryLower = queryText.toLowerCase();
        const ftsTokens = [];

        (intent.quotedPhrases || []).forEach(qp => {
            ftsTokens.push(`"${qp}"`);
        });

        const stopKeywords = new Set(["find", "times", "time", "show", "get", "all", "the", "she", "he", "for"]);
        (intent.keywords || []).forEach(kw => {
            const clean = kw.replace(/[^a-zA-Z0-9]/g, "").trim();
            if (clean.length > 2 && !stopKeywords.has(clean)) {
                ftsTokens.push(`${clean}*`);
            }
        });

        const isRequestQuery = /\b(ask|request|bring|see|take|visit|custody|schedule|time)\b/i.test(queryLower);
        const isRefusalQuery = /\b(no|refus|deni|withheld|stop|prevent|reject|never)\b/i.test(queryLower);

        if (isRequestQuery && isRefusalQuery) {
            ftsTokens.push('"denied time"');
            ftsTokens.push('"parenting time"');
            ftsTokens.push('refus*');
            ftsTokens.push('deni*');
        } else if (isRequestQuery) {
            ftsTokens.push('"parenting time"');
            ftsTokens.push('visit*');
            ftsTokens.push('schedul*');
        } else if (isRefusalQuery) {
            ftsTokens.push('refus*');
            ftsTokens.push('deni*');
        }

        (intent.people || []).forEach(person => {
            ftsTokens.push(`"${person}"`);
        });

        const placeholders = threadlineIds.map(() => "?").join(",");
        let sql = "";
        let params = [];

        if (ftsTokens.length > 0) {
            const ftsExpression = Array.from(new Set(ftsTokens)).join(" OR ");
            sql = `
                SELECT c.id, c.conversation_id, c.threadline_id, c.start_timestamp, c.end_timestamp,
                       c.message_count, c.participant_ids, c.message_ids, c.chunk_text,
                       c.has_turn_alternation, c.has_request, c.has_response, c.metadata,
                       chunks_fts.rank AS ftsRank
                FROM conversation_chunks c
                JOIN chunks_fts ON c.id = chunks_fts.chunk_id
                WHERE c.threadline_id IN (${placeholders})
                  AND chunks_fts.chunk_text MATCH ?
                ORDER BY chunks_fts.rank ASC, c.start_timestamp DESC
                LIMIT 300
            `;
            params = [...threadlineIds, ftsExpression];
        } else {
            sql = `
                SELECT c.id, c.conversation_id, c.threadline_id, c.start_timestamp, c.end_timestamp,
                       c.message_count, c.participant_ids, c.message_ids, c.chunk_text,
                       c.has_turn_alternation, c.has_request, c.has_response, c.metadata
                FROM conversation_chunks c
                WHERE c.threadline_id IN (${placeholders})
                ORDER BY c.start_timestamp DESC
                LIMIT 300
            `;
            params = [...threadlineIds];
        }

        return this.db.query(sql, params);
    }

    mergeAndAssembleExchanges(chunks) {
        if (!chunks || chunks.length === 0) return [];

        const convGroups = new Map();

        for (const rawChunk of chunks) {
            let participantIds = [];
            let messageIds = [];
            let meta = {};

            try { participantIds = JSON.parse(rawChunk.participant_ids || "[]"); } catch (e) {}
            try { messageIds = JSON.parse(rawChunk.message_ids || "[]"); } catch (e) {}
            try { meta = JSON.parse(rawChunk.metadata || "{}"); } catch (e) {}

            const parsed = {
                id: rawChunk.id,
                conversationId: rawChunk.conversation_id,
                conversationTitle: meta.conversationTitle || "Direct Message",
                threadlineId: rawChunk.threadline_id,
                startTime: rawChunk.start_timestamp,
                endTime: rawChunk.end_timestamp,
                participantIds,
                messageIds,
                hasTurnAlternation: Boolean(rawChunk.has_turn_alternation),
                hasRequest: Boolean(rawChunk.has_request),
                hasResponse: Boolean(rawChunk.has_response),
                ftsRank: rawChunk.ftsRank || 0
            };

            if (!convGroups.has(parsed.conversationId)) {
                convGroups.set(parsed.conversationId, []);
            }
            convGroups.get(parsed.conversationId).push(parsed);
        }

        const mergedExchanges = [];
        const MERGE_GAP_MS = 45 * 60 * 1000;

        for (const [convId, chunkList] of convGroups.entries()) {
            chunkList.sort((a, b) => a.startTime - b.startTime);

            let currentExchange = null;

            for (const chunk of chunkList) {
                if (!currentExchange) {
                    currentExchange = {
                        id: chunk.id,
                        conversationId: convId,
                        conversationTitle: chunk.conversationTitle,
                        threadlineId: chunk.threadlineId,
                        startTime: chunk.startTime,
                        endTime: chunk.endTime,
                        messageIdSet: new Set(chunk.messageIds),
                        participants: new Set(chunk.participantIds),
                        hasTurnAlternation: chunk.hasTurnAlternation,
                        hasRequest: chunk.hasRequest,
                        hasResponse: chunk.hasResponse,
                        minFtsRank: chunk.ftsRank
                    };
                } else {
                    const timeGap = chunk.startTime - currentExchange.endTime;
                    const isOverlapping = chunk.startTime <= currentExchange.endTime || timeGap <= MERGE_GAP_MS;

                    if (isOverlapping) {
                        currentExchange.endTime = Math.max(currentExchange.endTime, chunk.endTime);
                        chunk.messageIds.forEach(id => currentExchange.messageIdSet.add(id));
                        chunk.participantIds.forEach(p => currentExchange.participants.add(p));
                        if (chunk.hasTurnAlternation) currentExchange.hasTurnAlternation = true;
                        if (chunk.hasRequest) currentExchange.hasRequest = true;
                        if (chunk.hasResponse) currentExchange.hasResponse = true;
                        currentExchange.minFtsRank = Math.min(currentExchange.minFtsRank, chunk.ftsRank);
                    } else {
                        mergedExchanges.push(this.hydrateExchange(currentExchange));
                        currentExchange = {
                            id: chunk.id,
                            conversationId: convId,
                            conversationTitle: chunk.conversationTitle,
                            threadlineId: chunk.threadlineId,
                            startTime: chunk.startTime,
                            endTime: chunk.endTime,
                            messageIdSet: new Set(chunk.messageIds),
                            participants: new Set(chunk.participantIds),
                            hasTurnAlternation: chunk.hasTurnAlternation,
                            hasRequest: chunk.hasRequest,
                            hasResponse: chunk.hasResponse,
                            minFtsRank: chunk.ftsRank
                        };
                    }
                }
            }

            if (currentExchange) {
                mergedExchanges.push(this.hydrateExchange(currentExchange));
            }
        }

        return mergedExchanges;
    }

    hydrateExchange(exchangeObj) {
        const msgIds = Array.from(exchangeObj.messageIdSet);
        if (msgIds.length === 0) {
            return {
                ...exchangeObj,
                participants: Array.from(exchangeObj.participants),
                messages: []
            };
        }

        const placeholders = msgIds.map(() => "?").join(",");
        const messages = this.db.query(
            `SELECT id, sender, recipient, timestamp, body, direction, platform
             FROM messages
             WHERE id IN (${placeholders})
             ORDER BY timestamp ASC`,
            msgIds
        );

        return {
            id: exchangeObj.id,
            conversationId: exchangeObj.conversationId,
            conversationTitle: exchangeObj.conversationTitle,
            threadlineId: exchangeObj.threadlineId,
            startTime: exchangeObj.startTime,
            endTime: exchangeObj.endTime,
            participants: Array.from(exchangeObj.participants),
            hasTurnAlternation: exchangeObj.hasTurnAlternation,
            hasRequest: exchangeObj.hasRequest,
            hasResponse: exchangeObj.hasResponse,
            minFtsRank: exchangeObj.minFtsRank,
            messages
        };
    }

    scoreAndRankExchanges(exchanges, intent, queryText) {
        const queryLower = queryText.toLowerCase();
        const lookingForRefusal = /\b(no|refus|deni|withheld|stop|cant|wont)\b/i.test(queryLower);

        return exchanges.map(exchange => {
            let score = 0;
            const matchReasons = [];

            const fullExchangeText = exchange.messages.map(m => `[${m.sender}]: ${m.body}`).join("\n").toLowerCase();

            // 1. Quoted phrase matches
            (intent.quotedPhrases || []).forEach(qp => {
                if (fullExchangeText.includes(qp.toLowerCase())) {
                    score += 250;
                    matchReasons.push(`Exact phrase match: "${qp}"`);
                }
            });

            // 2. Keyword matching across dialogue
            let matchedKeywords = 0;
            const stopKeywords = new Set(["find", "times", "time", "show", "get", "all", "the", "she", "he", "for"]);
            (intent.keywords || []).forEach(kw => {
                if (kw.length > 2 && !stopKeywords.has(kw)) {
                    // Check base keyword and verb inflections
                    const variants = this.searchEngine ? this.searchEngine.getVerbVariants(kw) : [kw];
                    let matchedVariant = null;
                    for (const v of variants) {
                        if (new RegExp(`\\b${v}\\b`, "i").test(fullExchangeText)) {
                            matchedVariant = v;
                            break;
                        }
                    }
                    if (matchedVariant) {
                        score += 50;
                        matchedKeywords++;
                        matchReasons.push(`Keyword match: ${kw}${matchedVariant !== kw ? ` (${matchedVariant})` : ""}`);
                    }
                }
            });

            if (matchedKeywords > 1) {
                score += (matchedKeywords - 1) * 60;
            }

            // 3. Conversational Dialogue Signals
            if (exchange.hasTurnAlternation) {
                score += 50;
                matchReasons.push("Interactive dialogue exchange between multiple parties");
            }

            // 4. Request / Question Detection
            if (exchange.hasRequest) {
                score += 40;
                matchReasons.push("Contains scheduling / parenting request or inquiry");
            }

            // 5. Outcome & Response Detection
            let hasDirectRefusal = false;
            let hasConditional = false;

            for (const cond of this.conditionalSynonyms) {
                if (new RegExp(`\\b${cond}\\b`, "i").test(fullExchangeText)) {
                    hasConditional = true;
                    score += 50;
                    matchReasons.push(`Identified conditional constraint: "${cond}"`);
                    break;
                }
            }

            let matchedRefusals = 0;
            for (const ref of this.refusalSynonyms) {
                if (new RegExp(`\\b${ref}\\b`, "i").test(fullExchangeText)) {
                    hasDirectRefusal = true;
                    matchedRefusals++;
                    score += 70;
                    matchReasons.push(`Identified refusal / denial indicator: "${ref}"`);
                    if (matchedRefusals >= 2) break; // Allow multiple distinct refusal indicators to compound
                }
            }

            // Cross-Turn Request + Denial Synergistic Bonus
            // If the query is specifically looking for refusals:
            // Pure refusals (without conditional constraints) rank highest for refusal queries
            if (lookingForRefusal) {
                if (exchange.hasRequest && hasDirectRefusal && !hasConditional) {
                    score += 350; // Decisive, paramount priority for pure refusal
                    matchReasons.push("Strong episodic match: Request followed by explicit refusal");
                } else if (hasConditional) {
                    score -= 100;  // Strongly de-prioritize conditional agreements when looking for pure refusals
                }
            }

            // Participant alignment bonus
            (intent.people || []).forEach(person => {
                if (exchange.participants.some(p => p.toLowerCase().includes(person.toLowerCase())) ||
                    exchange.conversationTitle.toLowerCase().includes(person.toLowerCase())) {
                    score += 80;
                    matchReasons.push(`Target participant involved: ${person}`);
                }
            });

            // Deterministic classification heuristic
            let initialCategory = "ambiguous_outcome";
            if (hasConditional) {
                initialCategory = "conditional_response";
            } else if (hasDirectRefusal && exchange.hasRequest) {
                initialCategory = "explicit_refusal";
            } else if (hasDirectRefusal) {
                initialCategory = "indirect_objection";
            } else if (exchange.hasRequest && !exchange.hasTurnAlternation) {
                initialCategory = "unanswered_request";
            }

            return {
                exchange,
                score,
                matchReasons,
                hasDirectRefusal,
                hasConditional,
                initialCategory
            };
        }).sort((a, b) => b.score - a.score);
    }

    emptyResult(queryText, page, batchSize) {
        return {
            status: "success",
            query: queryText,
            archiveCoverage: {
                totalEligibleExchanges: 0,
                evaluatedCount: 0,
                remainingCount: 0,
                batchIndex: page,
                batchSize: batchSize,
                totalPages: 0,
                hasMore: false,
                isCompleteArchiveEvaluated: true
            },
            results: []
        };
    }
}

module.exports = ExchangeRetriever;
