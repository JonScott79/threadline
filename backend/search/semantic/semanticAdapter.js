/*
    semanticAdapter.js

    Orchestrator and bridge between Threadline SearchEngine and Semantic Providers.
    Responsibilities:
    - Manage feature flag (THREADLINE_SEMANTIC_ENABLED, default: false)
    - Instantiate the configured SemanticProvider (Ollama)
    - Enforce request timeouts, bounded context, and error isolation
    - Maintain pure deterministic fallback on any error, timeout, or flag disablement
    - Provide structured logging and diagnostic telemetry
*/

const OllamaSemanticProvider = require("./ollamaProvider");

class SemanticAdapter {
    constructor() {
        this.init();
    }

    init() {
        this.enabled = process.env.THREADLINE_SEMANTIC_ENABLED === "true";
        this.providerName = process.env.THREADLINE_SEMANTIC_PROVIDER || "ollama";

        if (this.providerName === "ollama") {
            this.provider = new OllamaSemanticProvider({
                url: process.env.THREADLINE_OLLAMA_URL || "http://localhost:11434",
                model: process.env.THREADLINE_OLLAMA_MODEL || "llama3:latest",
                timeoutMs: Number(process.env.THREADLINE_SEMANTIC_TIMEOUT_MS || 8000),
                maxCandidates: Number(process.env.THREADLINE_SEMANTIC_MAX_CANDIDATES || 50)
            });
        } else {
            this.provider = null;
        }
    }

    /**
     * Check if semantic intelligence is enabled.
     */
    isEnabled() {
        return Boolean(this.enabled && this.provider);
    }

    /**
     * Propose semantic vocabulary expansion terms for a user search query.
     * Controlled by THREADLINE_SEMANTIC_EXPANSION_ENABLED (defaults to true if semantic is enabled).
     */
    async expandQuery(query, options = {}) {
        const expansionFlag = process.env.THREADLINE_SEMANTIC_EXPANSION_ENABLED !== "false";
        if (!this.isEnabled() || !expansionFlag || !query || !query.trim()) {
            return { concepts: [], applied: false };
        }

        const t0 = Date.now();
        try {
            const maxExpansions = Number(options.maxExpansions || process.env.THREADLINE_SEMANTIC_MAX_EXPANSIONS || 6);
            const minConfidence = Number(options.minConfidence || process.env.THREADLINE_SEMANTIC_MIN_CONFIDENCE || 0.65);

            const res = await this.provider.expandQuery(query, {
                ...options,
                maxExpansions,
                minConfidence
            });
            const elapsed = Date.now() - t0;

            const concepts = res && Array.isArray(res.concepts) ? res.concepts : [];
            return {
                applied: concepts.length > 0,
                concepts,
                diagnostics: {
                    model: this.provider.model,
                    elapsed,
                    expansionCount: concepts.length
                },
                error: res.error || null
            };
        } catch (error) {
            return {
                applied: false,
                concepts: [],
                error: error.message,
                diagnostics: { elapsed: Date.now() - t0 }
            };
        }
    }

    /**
     * Re-rank and score bounded candidates semantically.
     * Guaranteed: Pure deterministic fallback if disabled or on error.
     */
    async scoreCandidates(query, candidates, options = {}) {
        if (!this.isEnabled() || !candidates || candidates.length === 0) {
            return {
                applied: false,
                relevanceMap: new Map(),
                diagnostics: { reason: "Semantic intelligence disabled or empty candidates" }
            };
        }

        const t0 = Date.now();
        try {
            const rawCandidates = candidates.map(c => c.message || c);
            const res = await this.provider.scoreRelevance(query, rawCandidates, options);
            const elapsed = Date.now() - t0;

            const relevanceMap = new Map();
            if (res && Array.isArray(res.results)) {
                res.results.forEach(item => {
                    relevanceMap.set(item.messageId, item);
                });
            }

            return {
                applied: true,
                relevanceMap,
                diagnostics: {
                    model: this.provider.model,
                    candidateCount: rawCandidates.length,
                    semanticMatches: relevanceMap.size,
                    elapsedMs: elapsed,
                    error: res.error || null
                }
            };
        } catch (error) {
            const elapsed = Date.now() - t0;
            return {
                applied: false,
                relevanceMap: new Map(),
                diagnostics: {
                    model: this.provider ? this.provider.model : "none",
                    elapsedMs: elapsed,
                    error: error.message,
                    fallback: "deterministic"
                }
            };
        }
    }

    /**
     * Analyze cross-thread relationships between bounded candidates.
     */
    async analyzeRelationships(query, candidates, options = {}) {
        if (!this.isEnabled() || !candidates || candidates.length < 2) {
            return { relationships: [], applied: false };
        }

        try {
            const rawCandidates = candidates.map(c => c.message || c);
            const res = await this.provider.analyzeRelationships(query, rawCandidates, options);
            return {
                applied: true,
                relationships: res.relationships || [],
                error: res.error || null
            };
        } catch (error) {
            return { relationships: [], applied: false, error: error.message };
        }
    }

    /**
     * Resolve coreferences within bounded candidates.
     */
    async resolveCoreferences(query, candidates, knownParticipants = [], options = {}) {
        if (!this.isEnabled() || !candidates || candidates.length === 0) {
            return { coreferences: [], applied: false };
        }

        try {
            const rawCandidates = candidates.map(c => c.message || c);
            const res = await this.provider.resolveCoreferences(query, rawCandidates, knownParticipants, options);
            return {
                applied: true,
                coreferences: res.coreferences || [],
                error: res.error || null
            };
        } catch (error) {
            return { coreferences: [], applied: false, error: error.message };
        }
    }
}

module.exports = new SemanticAdapter();
