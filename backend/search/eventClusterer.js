/*
    eventClusterer.js

    Conservative evidence-grouping layer for Threadline Smart Search.
    Groups candidate messages into coherent Event Clusters across conversations
    based on:
    - Shared query concepts/keywords
    - Participant relationships
    - Temporal cohesion / activity windows
    - Conversation relationships
    - Relevance scores

    Forensic Invariant:
    Every reconstructed Event Cluster is composed entirely of unaltered SQLite source messages.
    No messages are manufactured or modified. Inferred cluster metadata is strictly distinguished
    from source evidence.
*/

class EventClusterer {
    /**
     * Clusters scored candidate messages into Event Clusters.
     * 
     * @param {Array} scoredCandidates - Array of { message, score, matchReasons }
     * @param {Object} intent - Parsed query intent from searchEngine.parseQuery
     * @param {Object} db - Database access handle for context expansion
     * @param {Object} filters - Optional search filters (start, end, etc.)
     * @returns {Array<Object>} Array of EventCluster objects (with backward-compatibility fields)
     */
    cluster(scoredCandidates, intent, db, filters = {}) {
        if (!scoredCandidates || scoredCandidates.length === 0) {
            return [];
        }

        // Sort candidates chronologically for temporal continuity analysis
        const candidates = [...scoredCandidates].sort((a, b) => a.message.timestamp - b.message.timestamp);

        // --- PHASE 1: IDENTIFY EVENT CLUSTER CORES ---
        // A cluster core begins with high-scoring anchor messages (matches that contain explicit concepts,
        // quoted phrases, keywords, or relative event anchors).
        const rawClusters = [];

        for (const candidate of candidates) {
            const m = candidate.message;
            let bestClusterIndex = -1;
            let highestSimilarity = 0;

            // Evaluate fit with existing clusters
            for (let i = 0; i < rawClusters.length; i++) {
                const cluster = rawClusters[i];
                const similarity = this.calculateEvidenceFit(candidate, cluster, intent);
                if (similarity > highestSimilarity && similarity >= 0.5) {
                    highestSimilarity = similarity;
                    bestClusterIndex = i;
                }
            }

            if (bestClusterIndex !== -1) {
                // Add message to best-fitting existing cluster
                const target = rawClusters[bestClusterIndex];
                target.items.push(candidate);
                target.earliestTimestamp = Math.min(target.earliestTimestamp, m.timestamp);
                target.latestTimestamp = Math.max(target.latestTimestamp, m.timestamp);
                if (!target.conversationIds.includes(m.conversationId)) {
                    target.conversationIds.push(m.conversationId);
                }
                if (!target.participants.includes(m.sender)) {
                    target.participants.push(m.sender);
                }
            } else {
                // Start a new cluster core
                rawClusters.push({
                    items: [candidate],
                    earliestTimestamp: m.timestamp,
                    latestTimestamp: m.timestamp,
                    conversationIds: [m.conversationId],
                    participants: [m.sender].filter(Boolean)
                });
            }
        }

        // --- PHASE 1.5: CONSERVATIVE CONTEXTUAL EVENT EXPANSION ---
        // When a high-confidence cluster core is found, inspect immediate temporal neighbors (±30 minutes)
        // in the SAME conversation to recover relevant sequential context (e.g. confirmations, follow-ups)
        // without leaking unrelated chatter.
        if (db) {
            for (const cluster of rawClusters) {
                // Determine highest score in the cluster
                const maxScore = Math.max(...cluster.items.map(item => item.score));
                if (maxScore < 80) continue; // Only expand high-confidence clusters

                const existingMsgIds = new Set(cluster.items.map(item => item.message.id));
                const candidatesToAdd = [];

                // Only expand around high-confidence seed items (score >= 80), not subordinate items
                const seedItems = cluster.items.filter(it => it.score >= 80);
                for (const item of seedItems) {
                    const m = item.message;
                    const contextWindowMs = 60 * 60 * 1000; // Bounded 60-minute window for adjacent sequence context
                    let minTime = m.timestamp - contextWindowMs;
                    let maxTime = m.timestamp + contextWindowMs;

                    if (filters.start) {
                        minTime = Math.max(minTime, Number(filters.start));
                    }
                    if (filters.end) {
                        maxTime = Math.min(maxTime, Number(filters.end));
                    }

                    if (minTime > maxTime) continue;

                    const neighbors = db.query(
                        `SELECT m.id, 
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
                         WHERE m.conversation_id = ? 
                           AND m.timestamp >= ? 
                           AND m.timestamp <= ? 
                           AND m.id != ?
                         ORDER BY m.timestamp ASC`,
                        [m.conversationId, minTime, maxTime, m.id]
                    );

                    for (const neighbor of neighbors) {
                        if (existingMsgIds.has(neighbor.id)) continue;

                        // Check supporting evidence for contextual message:
                        // 1. Check for shared concept or query keyword / verb inflection
                        const neighborCandidate = { message: neighbor, score: 0, matchReasons: [] };
                        const fit = this.calculateEvidenceFit(neighborCandidate, cluster, intent);

                        // 2. Check for sequence/reply relationship or conversational continuity markers
                        // e.g., words indicating agreement/confirmation/continuity: yeah, totally, sure, ok, okay, thanks, sounds good, canceled, confirmed
                        const neighborBody = (neighbor.body || "").toLowerCase();
                        const hasContinuityMarker = /\b(yeah|totally|sure|ok|okay|yes|yep|thanks|thank you|sounds good|canceled|cancelled|agreed|confirmed|safe|safety|deal|will do)\b/i.test(neighborBody);

                        if (fit >= 0.35 || (hasContinuityMarker && Math.abs(neighbor.timestamp - m.timestamp) <= 60 * 60 * 1000)) {
                            existingMsgIds.add(neighbor.id);
                            candidatesToAdd.push({
                                message: neighbor,
                                score: Math.round(item.score * 0.6), // Subordinate contextual score
                                matchReasons: ["Conversation context (adjacent sequence)"]
                            });
                        }
                    }
                }

                if (candidatesToAdd.length > 0) {
                    candidatesToAdd.forEach(cand => {
                        cluster.items.push(cand);
                        cluster.earliestTimestamp = Math.min(cluster.earliestTimestamp, cand.message.timestamp);
                        cluster.latestTimestamp = Math.max(cluster.latestTimestamp, cand.message.timestamp);
                        if (!cluster.participants.includes(cand.message.sender)) {
                            cluster.participants.push(cand.message.sender);
                        }
                    });
                }
            }
        }

        // --- PHASE 2: FORMAT EVENT CLUSTERS WITH FORENSIC PROVENANCE ---
        const eventClusters = rawClusters.map((cluster, clusterIdx) => {
            // Sort constituent items by score to find representative message
            const sortedByScore = [...cluster.items].sort((a, b) => b.score - a.score);
            const repItem = sortedByScore[0];
            const repMsg = repItem.message;

            // Sort all messages in this cluster chronologically
            const chronologicalMessages = cluster.items
                .map(item => ({
                    id: item.message.id,
                    conversationId: item.message.conversationId,
                    conversationTitle: item.message.conversationTitle || "Conversation",
                    sender: item.message.sender,
                    recipient: item.message.recipient,
                    timestamp: item.message.timestamp,
                    body: item.message.body,
                    direction: item.message.direction,
                    platform: item.message.platform,
                    matchReason: (item.matchReasons && item.matchReasons.length > 0)
                        ? item.matchReasons.join("; ")
                        : "Related communication in event timeframe",
                    score: item.score,
                    semanticInference: item.semanticInference || null,
                    semanticExpansion: item.semanticExpansion || null
                }))
                .sort((a, b) => a.timestamp - b.timestamp);

            // Compute cluster metrics
            const maxScore = repItem.score;
            const avgScore = cluster.items.reduce((sum, item) => sum + item.score, 0) / cluster.items.length;

            let relevance = "Low";
            if (maxScore >= 180 || avgScore >= 100) relevance = "High";
            else if (maxScore >= 70 || avgScore >= 50) relevance = "Medium";

            // Determine cluster confidence (High if multiple corroborating sources or strong explicit matches)
            let clusterConfidence = "Medium";
            const distinctConvs = new Set(chronologicalMessages.map(m => m.conversationId)).size;
            if (distinctConvs > 1 && maxScore >= 120) {
                clusterConfidence = "High";
            } else if (chronologicalMessages.length === 1 && maxScore < 80) {
                clusterConfidence = "Low";
            }

            // Inferred human-readable title, topic, and summary
            const { title, topic, reason } = this.deriveClusterTitleAndReason(chronologicalMessages, intent, repMsg);

            // Collect distinct conversations
            const conversationMap = new Map();
            chronologicalMessages.forEach(m => {
                if (!conversationMap.has(m.conversationId)) {
                    conversationMap.set(m.conversationId, {
                        id: m.conversationId,
                        title: m.conversationTitle,
                        platform: m.platform
                    });
                }
            });
            const conversations = Array.from(conversationMap.values());

            // Collect distinct participants
            const participantSet = new Set();
            chronologicalMessages.forEach(m => {
                if (m.sender) participantSet.add(m.sender);
                if (m.recipient) participantSet.add(m.recipient);
            });
            const participants = Array.from(participantSet);

            // Date strings formatted in UTC
            const startDate = new Date(cluster.earliestTimestamp);
            const endDate = new Date(cluster.latestTimestamp);
            const dateOptions = { timeZone: "UTC", year: "numeric", month: "short", day: "numeric" };
            const startStr = startDate.toLocaleDateString("en-US", dateOptions);
            const endStr = endDate.toLocaleDateString("en-US", dateOptions);
            const dateString = startStr === endStr ? startStr : `${startStr} – ${endStr}`;

            // Context window for dominant message (backward compatibility)
            let contextWindow = [];
            if (db) {
                const preceding = db.query(
                    `SELECT id, sender, recipient, timestamp, body, direction, platform, metadata
                     FROM messages
                     WHERE conversation_id = ? AND timestamp < ?
                     ORDER BY timestamp DESC
                     LIMIT 2`,
                    [repMsg.conversationId, repMsg.timestamp]
                ).reverse();

                const succeeding = db.query(
                    `SELECT id, sender, recipient, timestamp, body, direction, platform, metadata
                     FROM messages
                     WHERE conversation_id = ? AND timestamp > ?
                     ORDER BY timestamp ASC
                     LIMIT 2`,
                    [repMsg.conversationId, repMsg.timestamp]
                );

                contextWindow = [
                    ...preceding.map(pm => ({ ...pm, contextRole: "preceding" })),
                    { ...repMsg, contextRole: "match" },
                    ...succeeding.map(sm => ({ ...sm, contextRole: "succeeding" }))
                ].map(m => ({
                    ...m,
                    metadata: typeof m.metadata === "string" ? JSON.parse(m.metadata || "{}") : m.metadata
                }));
            }

            return {
                id: `cluster_${cluster.earliestTimestamp}_${clusterIdx}`,
                clusterId: `cluster_${cluster.earliestTimestamp}_${clusterIdx}`,
                type: "event_cluster",
                title,
                topic,
                summaryReason: reason,
                relevance,
                relevanceScore: maxScore,
                clusterConfidence,
                earliestTimestamp: cluster.earliestTimestamp,
                latestTimestamp: cluster.latestTimestamp,
                timeSpan: {
                    earliestTimestamp: cluster.earliestTimestamp,
                    latestTimestamp: cluster.latestTimestamp,
                    dateString
                },
                participants,
                conversations,
                messages: chronologicalMessages,

                // --- BACKWARD COMPATIBILITY FIELDS FOR EXISTING SEARCH PANE & TIMELINE ---
                conversationId: repMsg.conversationId,
                conversationTitle: conversations.length > 1
                    ? `${repMsg.conversationTitle} (+${conversations.length - 1} more)`
                    : repMsg.conversationTitle,
                platform: repMsg.platform,
                reason,
                dateString,
                timestamp: repMsg.timestamp,
                messageCount: chronologicalMessages.length,
                representativeMessageId: repMsg.id,
                contextWindow
            };
        });

        // Return clusters ordered by relevance score descending.
        // For equal max scores, prioritize clusters with higher multi-keyword match density,
        // higher average score, and tighter temporal/message focus.
        return eventClusters.sort((a, b) => {
            if (b.relevanceScore !== a.relevanceScore) {
                return b.relevanceScore - a.relevanceScore;
            }
            // Count messages matching multiple keywords (score >= 180)
            const aMultiCount = a.messages.filter(m => m.score >= 180).length;
            const bMultiCount = b.messages.filter(m => m.score >= 180).length;
            if (bMultiCount !== aMultiCount) {
                return bMultiCount - aMultiCount;
            }
            // Secondary tie-breaker: average score across cluster messages
            const aAvg = a.messages.reduce((sum, m) => sum + m.score, 0) / (a.messages.length || 1);
            const bAvg = b.messages.reduce((sum, m) => sum + m.score, 0) / (b.messages.length || 1);
            if (Math.abs(bAvg - aAvg) > 0.01) {
                return bAvg - aAvg;
            }
            // Tertiary tie-breaker: prefer more focused clusters (fewer diluted messages)
            return a.messages.length - b.messages.length;
        });
    }

    /**
     * Evaluates the multi-signal fit between a candidate message and an existing cluster.
     * Returns a normalized fit score between 0.0 and 1.0.
     * Conservative: requires corroborating evidence beyond simple proximity.
     */
    calculateEvidenceFit(candidate, cluster, intent) {
        const m = candidate.message;
        const msgTime = m.timestamp;

        // 1. Check temporal distance to cluster bounds
        const distToStart = Math.abs(msgTime - cluster.earliestTimestamp);
        const distToEnd = Math.abs(msgTime - cluster.latestTimestamp);
        const minDistanceMs = (msgTime >= cluster.earliestTimestamp && msgTime <= cluster.latestTimestamp)
            ? 0
            : Math.min(distToStart, distToEnd);

        const dayMs = 24 * 60 * 60 * 1000;

        // If separated by more than 14 days without intervening connection, do not cluster
        if (minDistanceMs > 14 * dayMs) {
            return 0.0;
        }

        let fitScore = 0.0;

        // 2. Shared concept / keyword overlap (highest weight)
        const bodyLower = (m.body || "").toLowerCase();
        let hasSharedConcept = false;

        const conceptSynonyms = {
            visitation: ["visit", "schedule", "custody", "child", "children", "overnight", "sleepover"],
            transportation: ["transportation", "ride", "drive", "car", "pick up", "picking up", "drop off", "dropping off", "uber", "lyft", "traffic", "flight", "airport", "rideshare", "ride-share", "driving", "truck", "wheels"],
            refused: ["refuse", "cancel", "deny", "not tonight", "withheld", "denied"],
            shopping: ["shop", "store", "buy", "mall", "grocery", "groceries", "bought", "purchased", "market"],
            concert: ["concert", "band", "music", "ticket", "tickets", "stage", "venue", "live", "gig", "performance", "passes", "set"],
            argument: ["argue", "argument", "fight", "dispute", "screaming", "angry", "yelling", "shouted", "mad", "upset", "shouting"],
            camping: ["camp", "camping", "tent", "outside", "nature", "woods", "forest", "gear", "sleeping bag"]
        };

        const verbInflections = {
            call: ["call", "called", "calling", "calls"],
            pick: ["pick", "picked", "picking", "picks"],
            talk: ["talk", "talked", "talking", "talks"],
            decide: ["decide", "decided", "deciding", "decides"],
            cancel: ["cancel", "canceled", "cancelled", "canceling", "cancelling", "cancels"],
            meet: ["meet", "met", "meeting", "meets"],
            go: ["go", "went", "going", "goes", "gone"],
            plan: ["plan", "planned", "planning", "plans"]
        };

        if (intent.concepts && intent.concepts.length > 0) {
            for (const c of intent.concepts) {
                if (bodyLower.includes(c.toLowerCase())) {
                    hasSharedConcept = true;
                    fitScore += 0.45;
                    break;
                }
                const syns = conceptSynonyms[c] || [];
                for (const s of syns) {
                    let pattern = `\\b${s}\\b`;
                    if (s.includes(" ")) {
                        const parts = s.split(/\s+/);
                        pattern = `\\b${parts[0]}(?:\\s+(?:me|her|him|us|them|someone|you))?\\s+${parts.slice(1).join("\\s+")}\\b`;
                    }
                    if (new RegExp(pattern, "i").test(bodyLower)) {
                        hasSharedConcept = true;
                        fitScore += 0.40;
                        break;
                    }
                }
                if (hasSharedConcept) break;
            }
        }

        let matchedKwCount = 0;
        let hasSharedKeyword = false;
        if (intent.keywords && intent.keywords.length > 0) {
            for (const kw of intent.keywords) {
                let variants = [kw.toLowerCase()];
                for (const [stem, varList] of Object.entries(verbInflections)) {
                    if (stem === kw.toLowerCase() || varList.includes(kw.toLowerCase())) {
                        variants = varList;
                        break;
                    }
                }

                for (const v of variants) {
                    const rxV = new RegExp(`\\b${v}\\b`, "i");
                    if (rxV.test(bodyLower)) {
                        matchedKwCount++;
                        hasSharedKeyword = true;
                        break;
                    }
                }
            }

            if (hasSharedKeyword) {
                // For multi-word queries, award proportional fit based on matched query keywords
                if (intent.keywords.length > 1) {
                    const matchRatio = matchedKwCount / intent.keywords.length;
                    fitScore += 0.15 + (matchRatio * 0.20);
                } else {
                    fitScore += 0.25;
                }
            }
        }

        // 3. Participant relevance
        // Check if candidate sender/recipient matches query people or cluster participants
        const isQueryParticipant = intent.people && intent.people.some(p =>
            (m.sender && m.sender.toLowerCase().includes(p.toLowerCase())) ||
            (m.conversationTitle && m.conversationTitle.toLowerCase().includes(p.toLowerCase()))
        );

        const matchesClusterParticipant = cluster.participants.some(cp =>
            (m.sender && m.sender.toLowerCase() === cp.toLowerCase())
        );

        if (isQueryParticipant || matchesClusterParticipant) {
            fitScore += 0.25;
        }

        // 4. Same conversation continuity
        if (cluster.conversationIds.includes(m.conversationId)) {
            fitScore += 0.15;
        }

        // 6. Calendar month / year match
        let hasCalendarMatch = false;
        if (intent.month || intent.year) {
            const mDate = new Date(msgTime);
            if (intent.month && mDate.getUTCMonth() + 1 === intent.month) {
                fitScore += 0.35;
                hasCalendarMatch = true;
            }
            if (intent.year && mDate.getUTCFullYear() === intent.year) {
                fitScore += 0.20;
                hasCalendarMatch = true;
            }
        }

        // Conservative guard:
        // Do NOT create an Event Cluster merely because people know each other or messages occurred near the same time.
        // There must be meaningful shared evidence:
        // - Shared concept
        // - OR shared query keyword within active temporal proximity
        //   * For multi-word queries where candidate only matches 1 keyword: require closer temporal window (<= 2 days)
        //     to prevent distant incidental single-keyword hits from chaining across weeks.
        //   * For full/strong keyword matches or single-keyword queries: allow <= 7 days.
        // - OR explicit calendar window match (e.g. pure temporal queries within requested month)
        // - For same-conversation continuity, if there is no shared concept or calendar match, require temporal proximity
        //   to prevent distant single-keyword hits from chaining across weeks or months.
        const allowedKwWindowMs = (intent.keywords && intent.keywords.length > 1 && matchedKwCount === 1)
            ? (2 * dayMs)
            : (7 * dayMs);

        const hasCrossThreadEvidence = hasSharedConcept || (hasSharedKeyword && minDistanceMs <= allowedKwWindowMs) || (hasCalendarMatch && minDistanceMs <= 7 * dayMs);
        if (!hasCrossThreadEvidence) {
            if (!cluster.conversationIds.includes(m.conversationId)) {
                return 0.0;
            }
            if (minDistanceMs > allowedKwWindowMs) {
                return 0.0;
            }
        }

        return Math.min(fitScore, 1.0);
    }

    /**
     * Derives a descriptive title and forensic reason for the event cluster.
     */
    deriveClusterTitleAndReason(messages, intent, repMsg) {
        let topic = "";
        if (intent.concepts && intent.concepts.length > 0) {
            topic = intent.concepts.map(c => c.charAt(0).toUpperCase() + c.slice(1)).join(" & ");
        } else if (intent.keywords && intent.keywords.length > 0) {
            topic = intent.keywords.map(kw => kw.charAt(0).toUpperCase() + kw.slice(1)).join(" ");
        } else {
            topic = repMsg.conversationTitle || "Communication";
        }

        const distinctConvs = new Set(messages.map(m => m.conversationId)).size;
        let title = `${topic} — Event History`;
        if (distinctConvs > 1) {
            title = `${topic} — Coordinated Communications (${distinctConvs} Threads)`;
        }

        let reason = `Found ${messages.length} relevant message${messages.length === 1 ? '' : 's'}`;
        if (distinctConvs > 1) {
            reason += ` across ${distinctConvs} conversations`;
        }
        if (intent.concepts && intent.concepts.length > 0) {
            reason += ` discussing ${intent.concepts.join(" and ")}`;
        }
        if (intent.people && intent.people.length > 0) {
            reason += ` involving ${intent.people.join(", ")}`;
        }
        reason += ".";

        return { title, topic, reason };
    }
}

module.exports = new EventClusterer();
