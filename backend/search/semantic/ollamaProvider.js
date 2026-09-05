/*
    ollamaProvider.js

    Ollama implementation of the SemanticProvider abstraction.
    Interacts with a local Ollama daemon via its native HTTP API (/api/generate).
    Features:
    - Low-latency local execution (configurable model, e.g. llama3:latest or qwen2.5-coder:7b)
    - Structured JSON enforcement (format: 'json')
    - Configurable timeouts with AbortController to prevent search hanging
    - Bounded context payloads
    - Safe error handling with deterministic fallback
*/

const http = require("http");
const SemanticProvider = require("./semanticProvider");
const SemanticSchemaValidator = require("./semanticSchema");

class OllamaSemanticProvider extends SemanticProvider {
    constructor(config = {}) {
        super(config);
        this.url = config.url || process.env.THREADLINE_OLLAMA_URL || "http://localhost:11434";
        this.model = config.model || process.env.THREADLINE_OLLAMA_MODEL || "llama3:latest";
        this.timeoutMs = Number(config.timeoutMs || process.env.THREADLINE_SEMANTIC_TIMEOUT_MS || 8000);
        this.maxCandidates = Number(config.maxCandidates || process.env.THREADLINE_SEMANTIC_MAX_CANDIDATES || 50);
    }

    /**
     * Send a low-level prompt to the local Ollama daemon with strict JSON schema format and timeout.
     */
    async _generateJson(prompt, options = {}) {
        const timeoutMs = options.timeoutMs || this.timeoutMs;
        const parsedUrl = new URL(this.url);
        const payload = JSON.stringify({
            model: this.model,
            prompt,
            format: "json",
            stream: false,
            options: {
                temperature: 0.0, // Zero temperature for deterministic, factual semantic evaluation
                num_predict: options.numPredict || 256
            }
        });

        return new Promise((resolve, reject) => {
            const req = http.request({
                hostname: parsedUrl.hostname,
                port: parsedUrl.port || 11434,
                path: "/api/generate",
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(payload)
                }
            }, res => {
                let body = "";
                res.on("data", chunk => body += chunk);
                res.on("end", () => {
                    try {
                        const ollamaRes = JSON.parse(body);
                        if (ollamaRes.error) {
                            return reject(new Error(`Ollama error: ${ollamaRes.error}`));
                        }
                        const structured = JSON.parse(ollamaRes.response || "{}");
                        resolve(structured);
                    } catch (e) {
                        reject(new Error(`Failed to parse structured JSON from Ollama: ${e.message}`));
                    }
                });
            });

            req.setTimeout(timeoutMs, () => {
                req.destroy(new Error(`Ollama inference timed out after ${timeoutMs}ms`));
            });

            req.on("error", err => {
                const message = err.message || (err.code ? `Connection failed: ${err.code}` : String(err));
                reject(new Error(message));
            });
            req.write(payload);
            req.end();
        });
    }

    /**
     * Propose semantic vocabulary expansion terms for a user search query.
     */
    async expandQuery(query, options = {}) {
        if (!query || typeof query !== "string" || !query.trim()) {
            return { concepts: [] };
        }

        const maxExpansions = options.maxExpansions || 8;
        const minConfidence = options.minConfidence || 0.65;

        const prompt = `Propose 2 to 4 search synonyms or casual keywords for the query: "${query.trim()}"

Output JSON strictly as:
{"concepts": [{"term": "keyword", "confidence": 0.9, "reason": "brief"}]}`;

        try {
            const raw = await this._generateJson(prompt, { ...options, numPredict: 300 });
            return SemanticSchemaValidator.validateQueryExpansionOutput(raw, {
                maxExpansions,
                minConfidence
            });
        } catch (error) {
            // Graceful failure: return empty concepts so caller falls back to unexpanded query
            return { concepts: [], error: error.message };
        }
    }

    /**
     * Re-rank and score a bounded set of candidate messages for semantic relevance.
     */
    async scoreRelevance(query, candidates, options = {}) {
        if (!candidates || candidates.length === 0) {
            return { results: [] };
        }

        // Bound candidates to configured maximum
        const bounded = candidates.slice(0, this.maxCandidates);
        const validIds = bounded.map(c => c.id);

        const candidatesList = bounded.map(c => `- ID: ${c.id}, Sender: ${c.sender || "Unknown"}, Text: "${(c.body || "").replace(/\n+/g, " ").trim()}"`).join("\n");

        const prompt = `Evaluate whether these messages are semantically relevant to the query: "${query}"

Candidates:
${candidatesList}

Output JSON strictly matching:
{
  "results": [
    {
      "messageId": "ID",
      "relevanceScore": 0.0,
      "reason": "short explanation"
    }
  ]
}`;

        try {
            const raw = await this._generateJson(prompt, { ...options, numPredict: 256 });
            return SemanticSchemaValidator.validateRelevanceOutput(raw, validIds);
        } catch (error) {
            // Graceful failure: return empty results so caller falls back cleanly to deterministic scores
            return { results: [], error: error.message };
        }
    }

    /**
     * Analyze semantic relationships between pairs of candidate messages.
     */
    async analyzeRelationships(query, candidates, options = {}) {
        if (!candidates || candidates.length < 2) {
            return { relationships: [] };
        }

        const bounded = candidates.slice(0, Math.min(this.maxCandidates, 20));
        const validIds = bounded.map(c => c.id);

        const prompt = `Analyze whether the following communications refer to the same real-world event or topic.
User Query context: "${query}"

Messages:
${JSON.stringify(bounded.map(c => ({ id: c.id, sender: c.sender, time: c.timestamp, body: c.body })), null, 2)}

Instructions:
Identify pairs that coordinate or discuss the same event.
Output JSON strictly matching this schema:
{
  "relationships": [
    {
      "messageIdA": "string",
      "messageIdB": "string",
      "relationship": "same_event",
      "confidence": 0.0,
      "reason": "string"
    }
  ]
}`;

        try {
            const raw = await this._generateJson(prompt, options);
            return SemanticSchemaValidator.validateRelationshipsOutput(raw, validIds);
        } catch (error) {
            return { relationships: [], error: error.message };
        }
    }

    /**
     * Suggest likely referents for pronouns within bounded conversational evidence.
     */
    async resolveCoreferences(query, candidates, knownParticipants = [], options = {}) {
        if (!candidates || candidates.length === 0) {
            return { coreferences: [] };
        }

        const bounded = candidates.slice(0, Math.min(this.maxCandidates, 20));
        const validIds = bounded.map(c => c.id);

        const prompt = `Analyze pronouns (she, he, they, we) in the following messages.
Known Participants: ${JSON.stringify(knownParticipants)}
Messages:
${JSON.stringify(bounded.map(c => ({ id: c.id, sender: c.sender, body: c.body })), null, 2)}

Instructions:
Identify who pronouns refer to if supported by context.
Never assert certainty if ambiguous.
Output JSON strictly matching this schema:
{
  "coreferences": [
    {
      "sourceMessageId": "string",
      "term": "she",
      "candidateParticipant": "string",
      "confidence": 0.0,
      "reason": "string"
    }
  ]
}`;

        try {
            const raw = await this._generateJson(prompt, options);
            return SemanticSchemaValidator.validateCoreferencesOutput(raw, validIds, knownParticipants);
        } catch (error) {
            return { coreferences: [], error: error.message };
        }
    }
}

module.exports = OllamaSemanticProvider;
