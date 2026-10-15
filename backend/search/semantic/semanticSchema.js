/*
    semanticSchema.js

    Strict validation and schema sanitation for Semantic Intelligence output.
    Ensures that any malformed, hallucinated, or out-of-bounds responses from
    a semantic provider are safely rejected or sanitized before reaching the
    forensic pipeline.
*/

class SemanticSchemaValidator {
    /**
     * Validate and sanitize relevance scoring output.
     * Guaranteed: All returned results reference valid, existing candidate message IDs.
     */
    static validateRelevanceOutput(rawOutput, validCandidateIds) {
        const idSet = new Set(validCandidateIds);
        const sanitized = { results: [] };

        if (!rawOutput || typeof rawOutput !== "object") {
            return sanitized;
        }

        const list = Array.isArray(rawOutput.results) ? rawOutput.results : [];
        for (const item of list) {
            if (!item || typeof item !== "object") continue;

            // Strict ID verification: must exist in bounded candidate set
            const messageId = String(item.messageId || "").trim();
            if (!idSet.has(messageId)) {
                // Reject hallucinated or nonexistent message IDs
                continue;
            }

            // Normalize relevance score to [0.0, 1.0]
            let score = Number(item.relevanceScore);
            if (isNaN(score)) score = 0.0;
            score = Math.max(0.0, Math.min(1.0, score));

            const reason = String(item.reason || "Semantic relevance match").substring(0, 250);

            sanitized.results.push({
                messageId,
                relevanceScore: score,
                reason,
                inference: true
            });
        }

        return sanitized;
    }

    /**
     * Validate and sanitize relationship analysis output.
     */
    static validateRelationshipsOutput(rawOutput, validCandidateIds) {
        const idSet = new Set(validCandidateIds);
        const sanitized = { relationships: [] };

        if (!rawOutput || typeof rawOutput !== "object") {
            return sanitized;
        }

        const list = Array.isArray(rawOutput.relationships) ? rawOutput.relationships : [];
        for (const item of list) {
            if (!item || typeof item !== "object") continue;

            const messageIdA = String(item.messageIdA || "").trim();
            const messageIdB = String(item.messageIdB || "").trim();

            // Both IDs must belong to the valid candidates and be distinct
            if (!idSet.has(messageIdA) || !idSet.has(messageIdB) || messageIdA === messageIdB) {
                continue;
            }

            let confidence = Number(item.confidence);
            if (isNaN(confidence)) confidence = 0.0;
            confidence = Math.max(0.0, Math.min(1.0, confidence));

            const relationship = ["same_event", "follow_up", "contradiction", "unrelated"].includes(item.relationship)
                ? item.relationship
                : "same_event";

            const reason = String(item.reason || "Inferred semantic relationship").substring(0, 250);

            sanitized.relationships.push({
                messageIdA,
                messageIdB,
                relationship,
                confidence,
                reason,
                inference: true
            });
        }

        return sanitized;
    }

    /**
     * Validate and sanitize coreference resolution output.
     */
    static validateCoreferencesOutput(rawOutput, validCandidateIds, knownParticipants = []) {
        const idSet = new Set(validCandidateIds);
        const participantSet = new Set(knownParticipants.map(p => p.toLowerCase()));
        const sanitized = { coreferences: [] };

        if (!rawOutput || typeof rawOutput !== "object") {
            return sanitized;
        }

        const list = Array.isArray(rawOutput.coreferences) ? rawOutput.coreferences : [];
        for (const item of list) {
            if (!item || typeof item !== "object") continue;

            const sourceMessageId = String(item.sourceMessageId || "").trim();
            if (!idSet.has(sourceMessageId)) {
                continue;
            }

            const term = String(item.term || "").trim().toLowerCase();
            const candidateParticipant = String(item.candidateParticipant || "").trim();

            let confidence = Number(item.confidence);
            if (isNaN(confidence)) confidence = 0.0;
            confidence = Math.max(0.0, Math.min(1.0, confidence));

            const reason = String(item.reason || "Inferred coreference link").substring(0, 250);

            sanitized.coreferences.push({
                sourceMessageId,
                term,
                candidateParticipant,
                confidence,
                reason,
                inference: true
            });
        }

        return sanitized;
    }

    /**
     * Validate and sanitize semantic query expansion output.
     * 
     * Requirements:
     * - Valid array of concept terms
     * - Strictly string terms, sanitized for safe FTS/SQL usage (letters, numbers, single spaces/hyphens)
     * - Discard empty strings, excessive length (>40 chars), or unsafe characters
     * - Deduplicate terms case-insensitively
     * - Confidence clamped to [0.0, 1.0] and filtered by minConfidence
     * - Capped to maxExpansions (default 8)
     */
    static validateQueryExpansionOutput(rawOutput, options = {}) {
        const maxExpansions = Number(options.maxExpansions || 8);
        const minConfidence = Number(options.minConfidence || 0.65);
        const sanitized = { concepts: [] };

        if (!rawOutput || typeof rawOutput !== "object") {
            return sanitized;
        }

        const list = Array.isArray(rawOutput.concepts) ? rawOutput.concepts : [];
        const seenTerms = new Set();

        for (const item of list) {
            if (!item || typeof item !== "object") continue;

            const rawTerm = String(item.term || "").trim();
            // Sanitize term: only allow alphanumeric, spaces, and hyphens; collapse whitespace
            const cleanTerm = rawTerm
                .replace(/[^a-zA-Z0-9\s-]/g, "")
                .replace(/\s+/g, " ")
                .trim()
                .toLowerCase();

            // Length constraints: between 2 and 40 characters
            if (cleanTerm.length < 2 || cleanTerm.length > 40) {
                continue;
            }

            // Deduplicate
            if (seenTerms.has(cleanTerm)) {
                continue;
            }

            let confidence = Number(item.confidence);
            if (isNaN(confidence)) confidence = 0.0;
            confidence = Math.max(0.0, Math.min(1.0, confidence));

            if (confidence < minConfidence) {
                continue;
            }

            const reason = String(item.reason || "Semantic expansion term").substring(0, 250);

            sanitized.concepts.push({
                term: cleanTerm,
                confidence,
                reason,
                inference: true
            });
            seenTerms.add(cleanTerm);

            if (sanitized.concepts.length >= maxExpansions) {
                break;
            }
        }

        return sanitized;
    }

    /**
     * Validate and sanitize bounded exchange outcome classification output (Phase 3).
     * 
     * Schema Version: 1.0.0
     * Allowed Outcome Categories:
     * - explicit_refusal
     * - conditional_response
     * - indirect_objection
     * - unanswered_request
     * - changed_response
     * - ambiguous_outcome
     * - unrelated
     * 
     * Enforcements:
     * - Every returned exchangeId must strictly match an item in validExchangeIds.
     * - Category must be in the approved enum, defaulting to ambiguous_outcome.
     * - Confidence clamped to [0.0, 1.0].
     * - Explanations and quotes sanitized and bounded.
     * - Preserves metadata and flags model hallucinations.
     */
    static validateExchangeOutcomeOutput(rawOutput, validExchangeIds) {
        const idSet = new Set(validExchangeIds);
        const sanitized = {
            schemaVersion: "1.0.0",
            evaluations: [],
            unmatchedCount: 0,
            evaluatedCount: 0
        };

        if (!rawOutput || typeof rawOutput !== "object") {
            return sanitized;
        }

        const validCategories = new Set([
            "explicit_refusal",
            "conditional_response",
            "indirect_objection",
            "unanswered_request",
            "changed_response",
            "ambiguous_outcome",
            "unrelated"
        ]);

        const list = Array.isArray(rawOutput.evaluations) ? rawOutput.evaluations : [];
        const seenIds = new Set();

        for (const item of list) {
            if (!item || typeof item !== "object") continue;

            const exchangeId = String(item.exchangeId || "").trim();
            // Strict ID verification: reject hallucinated or nonexistent exchange IDs
            if (!idSet.has(exchangeId) || seenIds.has(exchangeId)) {
                sanitized.unmatchedCount++;
                continue;
            }

            const rawCat = String(item.outcomeCategory || "").trim().toLowerCase();
            const outcomeCategory = validCategories.has(rawCat) ? rawCat : "ambiguous_outcome";

            let confidence = Number(item.confidence);
            if (isNaN(confidence)) confidence = 0.5;
            confidence = Math.max(0.0, Math.min(1.0, confidence));

            const isMatch = Boolean(item.isMatch !== undefined ? item.isMatch : outcomeCategory !== "unrelated");
            const explanation = String(item.explanation || "").substring(0, 300).trim();
            const keyQuote = String(item.keyQuote || "").substring(0, 200).trim();

            sanitized.evaluations.push({
                exchangeId,
                isMatch,
                outcomeCategory,
                confidence,
                explanation: explanation || "Exchange evaluated for conversational outcome",
                keyQuote: keyQuote || null,
                inference: true
            });

            seenIds.add(exchangeId);
        }

        sanitized.evaluatedCount = sanitized.evaluations.length;
        return sanitized;
    }

}

module.exports = SemanticSchemaValidator;
