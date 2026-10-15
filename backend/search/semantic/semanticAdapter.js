/*
    semanticAdapter.js

    Orchestrator and bridge between Threadline SearchEngine and Semantic Providers.
    Responsibilities:
    - Manage provider selection: Local Ollama vs Explicit Cloud Groq.
    - Privacy Guarantee: Never silently falls back from local to cloud or vice versa.
    - Enforce request timeouts, bounded candidate batches (8-12), and error isolation.
    - Pure deterministic fallback if AI is disabled, times out, or errors.
    - Strict JSON validation adhering to versioned SemanticSchemaValidator.
*/

const OllamaSemanticProvider = require("./ollamaProvider");
const GroqSemanticProvider = require("./groqProvider");

class SemanticAdapter {
    constructor() {
        this.init();
    }

    init() {
        this.enabled = process.env.THREADLINE_SEMANTIC_ENABLED !== "false";
        this.providerName = process.env.THREADLINE_SEMANTIC_PROVIDER || "ollama";

        if (this.providerName === "groq" && process.env.GROQ_API_KEY) {
            this.provider = new GroqSemanticProvider({
                apiKey: process.env.GROQ_API_KEY,
                model: process.env.THREADLINE_GROQ_MODEL || "llama-3.3-70b-versatile",
                timeoutMs: Number(process.env.THREADLINE_GROQ_TIMEOUT_MS || 5000),
                maxCandidates: 12
            });
        } else if (this.providerName === "ollama") {
            this.provider = new OllamaSemanticProvider({
                url: process.env.THREADLINE_OLLAMA_URL || "http://localhost:11434",
                model: process.env.THREADLINE_OLLAMA_MODEL || "llama3:latest",
                timeoutMs: Number(process.env.THREADLINE_SEMANTIC_TIMEOUT_MS || 8000),
                maxCandidates: 12
            });
        } else {
            this.provider = null;
        }
    }

    /**
     * Dynamically configure provider (e.g. when user enables cloud Groq or local Ollama).
     */
    /**
     * Creates an isolated provider instance for testing or sandboxed inference.
     */
    createIsolatedProvider(type, config = {}) {
        if (type === "ollama") {
            return new OllamaSemanticProvider(config);
        } else if (type === "groq") {
            return new GroqSemanticProvider(config);
        }
        return null;
    }

    configureProvider(name, options = {}) {
        if (name === "groq") {
            if (!options.apiKey && !process.env.GROQ_API_KEY) {
                throw new Error("Cannot configure Groq provider without an API key.");
            }
            this.providerName = "groq";
            this.provider = new GroqSemanticProvider({
                apiKey: options.apiKey || process.env.GROQ_API_KEY,
                model: options.model || "llama-3.3-70b-versatile",
                timeoutMs: options.timeoutMs || 5000,
                maxCandidates: 12
            });
            this.enabled = true;
        } else if (name === "ollama") {
            this.providerName = "ollama";
            this.provider = new OllamaSemanticProvider({
                url: options.url || "http://localhost:11434",
                model: options.model || "llama3:latest",
                timeoutMs: options.timeoutMs || 8000,
                maxCandidates: 12
            });
            this.enabled = true;
        } else if (name === "disabled") {
            this.enabled = false;
            this.provider = null;
            this.providerName = "none";
        }
    }

    isEnabled() {
        return Boolean(this.enabled && this.provider);
    }

    getProviderInfo() {
        return {
            enabled: this.isEnabled(),
            providerName: this.providerName,
            model: this.provider ? this.provider.model : "none",
            isLocal: this.providerName === "ollama"
        };
    }

    /**
     * Classify conversational outcomes for a bounded batch of candidate exchanges (Phase 3).
     * 
     * Requirements:
     * - Only bounded candidate batch (max 12) is evaluated.
     * - Distinguishes retrieval score from outcome classification.
     * - Preserves original messages, timestamps, and provenance unaltered.
     * - Model outputs are attached as annotations.
     * - Complete deterministic fallback if provider times out, fails, or is disabled.
     */
    async classifyExchanges(query, candidateExchanges, options = {}) {
        if (!this.isEnabled() || !candidateExchanges || candidateExchanges.length === 0) {
            return {
                applied: false,
                evaluationsMap: new Map(),
                diagnostics: { reason: "AI classifier disabled or empty candidates", provider: "none" }
            };
        }

        const t0 = Date.now();
        try {
            const res = await this.provider.classifyExchangeOutcomes(query, candidateExchanges, options);
            const elapsed = Date.now() - t0;

            const evaluationsMap = new Map();
            if (res && Array.isArray(res.evaluations)) {
                res.evaluations.forEach(ev => {
                    evaluationsMap.set(ev.exchangeId, ev);
                });
            }

            const isSuccess = evaluationsMap.size > 0 && !res.error;
            return {
                applied: isSuccess,
                evaluationsMap,
                diagnostics: {
                    provider: this.providerName,
                    model: this.provider.model,
                    candidatesSubmitted: candidateExchanges.length,
                    evaluationsReturned: evaluationsMap.size,
                    elapsedMs: elapsed,
                    usage: res.usage || null,
                    error: res.error || null,
                    fallback: isSuccess ? null : "deterministic"
                }
            };
        } catch (error) {
            const elapsed = Date.now() - t0;
            // Clean error message without leaking keys
            const cleanError = String(error.message || "Unknown error").replace(/Bearer\s+[a-zA-Z0-9_-]+/gi, "Bearer ***");
            return {
                applied: false,
                evaluationsMap: new Map(),
                diagnostics: {
                    provider: this.providerName,
                    model: this.provider ? this.provider.model : "none",
                    elapsedMs: elapsed,
                    error: cleanError,
                    fallback: "deterministic"
                }
            };
        }
    }

    async expandQuery(query, options = {}) {
        if (!this.isEnabled() || !query || !query.trim()) {
            return { concepts: [], applied: false };
        }
        const t0 = Date.now();
        try {
            const res = await this.provider.expandQuery(query, options);
            return {
                applied: res && res.concepts && res.concepts.length > 0,
                concepts: res.concepts || [],
                diagnostics: { elapsed: Date.now() - t0, model: this.provider.model },
                error: res.error || null
            };
        } catch (err) {
            return { applied: false, concepts: [], error: err.message };
        }
    }

    async scoreCandidates(query, candidates, options = {}) {
        if (!this.isEnabled() || !candidates || candidates.length === 0) {
            return { applied: false, relevanceMap: new Map() };
        }
        try {
            const rawCandidates = candidates.map(c => c.message || c);
            const res = await this.provider.scoreRelevance(query, rawCandidates, options);
            const relevanceMap = new Map();
            if (res && Array.isArray(res.results)) {
                res.results.forEach(item => relevanceMap.set(item.messageId, item));
            }
            return { applied: true, relevanceMap };
        } catch (err) {
            return { applied: false, relevanceMap: new Map(), error: err.message };
        }
    }
}

module.exports = new SemanticAdapter();
