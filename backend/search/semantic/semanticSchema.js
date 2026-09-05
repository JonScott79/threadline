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
}

module.exports = SemanticSchemaValidator;
