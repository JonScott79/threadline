/*
    groqProvider.js

    Groq implementation of the SemanticProvider abstraction for Threadline.
    Uses official Groq REST API (https://api.groq.com/openai/v1/chat/completions)
    with model llama-3.3-70b-versatile.

    Security & Privacy Invariants:
    - ONLY invoked when user explicitly provides a GROQ_API_KEY.
    - Operates with strict timeouts and bounded token contexts.
    - Never receives raw database records or disk access.
    - Strips all API keys from diagnostic error logs.
    - Outputs strict versioned JSON validated by SemanticSchemaValidator.
*/

const https = require("https");
const SemanticProvider = require("./semanticProvider");
const SemanticSchemaValidator = require("./semanticSchema");

class GroqSemanticProvider extends SemanticProvider {
    constructor(config = {}) {
        super(config);
        this.apiKey = config.apiKey || process.env.GROQ_API_KEY || "";
        this.model = config.model || process.env.THREADLINE_GROQ_MODEL || "llama-3.3-70b-versatile";
        this.timeoutMs = Number(config.timeoutMs || process.env.THREADLINE_GROQ_TIMEOUT_MS || 5000);
        this.maxCandidates = Number(config.maxCandidates || 15);
    }

    async _chatCompletionJson(messages, options = {}) {
        if (!this.apiKey) {
            throw new Error("GROQ_API_KEY is not configured.");
        }

        const timeoutMs = options.timeoutMs || this.timeoutMs;
        const payload = JSON.stringify({
            model: this.model,
            messages,
            response_format: { type: "json_object" },
            temperature: 0.0,
            max_tokens: options.maxTokens || 1024
        });

        return new Promise((resolve, reject) => {
            const req = https.request({
                hostname: "api.groq.com",
                port: 443,
                path: "/openai/v1/chat/completions",
                method: "POST",
                headers: {
                    "Authorization": `Bearer ${this.apiKey}`,
                    "Content-Type": "application/json",
                    "Content-Length": Buffer.byteLength(payload)
                }
            }, res => {
                let body = "";
                res.on("data", chunk => body += chunk);
                res.on("end", () => {
                    let parsed = null;
                    try {
                        parsed = JSON.parse(body);
                    } catch (_) {}

                    if (res.statusCode >= 400 || (parsed && parsed.error)) {
                        const rawMsg = (parsed && parsed.error && parsed.error.message)
                            ? parsed.error.message
                            : `HTTP ${res.statusCode}: ${res.statusMessage || "Error response from Groq"}`;
                        const safeErrorMsg = String(rawMsg).replace(this.apiKey, "***");
                        return reject(new Error(`Groq error: ${safeErrorMsg}`));
                    }

                    try {
                        const content = parsed?.choices?.[0]?.message?.content || "{}";
                        const structured = JSON.parse(content);
                        const usage = parsed?.usage || {};
                        resolve({
                            data: structured,
                            usage: {
                                promptTokens: usage.prompt_tokens || 0,
                                completionTokens: usage.completion_tokens || 0,
                                totalTokens: usage.total_tokens || 0
                            }
                        });
                    } catch (e) {
                        reject(new Error(`Failed to parse response from Groq: ${e.message}`));
                    }
                });
            });

            req.setTimeout(timeoutMs, () => {
                req.destroy(new Error(`Groq request timed out after ${timeoutMs}ms`));
            });

            req.on("error", err => {
                const safeMsg = String(err.message || "Network error").replace(this.apiKey, "***");
                reject(new Error(`Groq connection failed: ${safeMsg}`));
            });

            req.write(payload);
            req.end();
        });
    }

    /**
     * Classify conversational outcomes for a bounded batch of candidate exchanges.
     */
    async classifyExchangeOutcomes(query, exchanges, options = {}) {
        if (!exchanges || exchanges.length === 0) {
            return { evaluations: [], usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 } };
        }

        const bounded = exchanges.slice(0, this.maxCandidates);
        const validIds = bounded.map(e => e.exchangeId);

        const compactExchanges = bounded.map(e => ({
            exchangeId: e.exchangeId,
            participants: e.participants,
            dialogue: e.messages.map(m => `[${m.sender}]: ${m.body}`).join("\n")
        }));

        const systemPrompt = `You are a forensic legal communication analyzer.
Analyze the provided conversation exchanges regarding the user's search query.
Classify each exchange into exactly one outcome category:
- "explicit_refusal": Direct rejection or refusal of a request.
- "conditional_response": Agreement or permission subject to conditions or constraints.
- "indirect_objection": Reluctance, avoidance, resistance, or passive denial without explicit refusal.
- "unanswered_request": A clear request was made, but no response was given by the recipient.
- "changed_response": An agreement was initially made and later modified or withdrawn.
- "ambiguous_outcome": Evidence is incomplete, ambiguous, or lacks clear outcome.
- "unrelated": The exchange does not match the user's intent.

Output JSON strictly adhering to:
{
  "evaluations": [
    {
      "exchangeId": "string",
      "isMatch": true,
      "outcomeCategory": "explicit_refusal",
      "confidence": 0.95,
      "explanation": "concise explanation of why this category applies",
      "keyQuote": "most relevant sentence quote from exchange"
    }
  ]
}`;

        const userPrompt = `User Query: "${query}"

Candidate Exchanges:
${JSON.stringify(compactExchanges, null, 2)}`;

        try {
            const { data, usage } = await this._chatCompletionJson([
                { role: "system", content: systemPrompt },
                { role: "user", content: userPrompt }
            ], options);

            const validated = SemanticSchemaValidator.validateExchangeOutcomeOutput(data, validIds);
            return {
                ...validated,
                usage,
                provider: "groq",
                model: this.model
            };
        } catch (error) {
            return {
                evaluations: [],
                error: error.message,
                usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
            };
        }
    }
}

module.exports = GroqSemanticProvider;
