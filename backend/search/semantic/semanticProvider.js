/*
    semanticProvider.js

    Abstract base class for Threadline Semantic Intelligence Providers.
    Enforces the strict security and forensic boundary:
    - Providers NEVER interact with SQLite or disk.
    - Providers ONLY receive bounded in-memory candidate messages.
    - Outputs are strictly structured JSON adhering to rigorous schemas.
*/

class SemanticProvider {
    constructor(config = {}) {
        this.config = config;
    }

    /**
     * Propose semantic vocabulary expansion terms for a user search query.
     * 
     * @param {string} query - The natural-language user query.
     * @param {Object} options - Options (maxExpansions, minConfidence, etc.)
     * @returns {Promise<Object>} Structured result: { concepts: [{ term, confidence, reason }] }
     */
    async expandQuery(query, options = {}) {
        throw new Error("expandQuery must be implemented by concrete SemanticProvider");
    }

    /**
     * Re-rank and score a bounded set of deterministic candidate messages for semantic relevance.
     * 
     * @param {string} query - The user search query.
     * @param {Array<Object>} candidates - Array of bounded candidates: [{ id, body, sender, timestamp, conversationTitle }]
     * @param {Object} options - Additional options (timeoutMs, etc.)
     * @returns {Promise<Object>} Structured result: { results: [{ messageId, relevanceScore, reason, inference: true }] }
     */
    async scoreRelevance(query, candidates, options = {}) {
        throw new Error("scoreRelevance must be implemented by concrete SemanticProvider");
    }

    /**
     * Analyze semantic relationships between pairs of candidate messages.
     * 
     * @param {string} query - The user search query.
     * @param {Array<Object>} candidates - Bounded candidate messages.
     * @param {Object} options - Additional options.
     * @returns {Promise<Object>} Structured result: { relationships: [{ messageIdA, messageIdB, relationship, confidence, reason }] }
     */
    async analyzeRelationships(query, candidates, options = {}) {
        throw new Error("analyzeRelationships must be implemented by concrete SemanticProvider");
    }

    /**
     * Suggest likely referents for pronouns/terms within bounded conversational evidence.
     * 
     * @param {string} query - The user search query.
     * @param {Array<Object>} candidates - Bounded candidate messages.
     * @param {Array<string>} knownParticipants - Registered participant names.
     * @param {Object} options - Additional options.
     * @returns {Promise<Object>} Structured result: { coreferences: [{ sourceMessageId, term, candidateParticipant, confidence, reason }] }
     */
    async resolveCoreferences(query, candidates, knownParticipants = [], options = {}) {
        throw new Error("resolveCoreferences must be implemented by concrete SemanticProvider");
    }
}

module.exports = SemanticProvider;
