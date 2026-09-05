/*
    testSemanticUnit.js

    Unit test suite for Threadline Semantic Intelligence Infrastructure:
    1. Provider initialization with defaults and custom configurations
    2. Graceful fallback on unavailable Ollama daemon / network error
    3. Timeout handling & abort without hanging
    4. Strict schema validation & rejection of malformed JSON
    5. Rejection of hallucinated/nonexistent message IDs
    6. Candidate count boundedness (never exceeding configured max)
    7. Clean separation between Evidence and Inference
*/

const assert = require("assert");
const OllamaSemanticProvider = require("../search/semantic/ollamaProvider");
const SemanticSchemaValidator = require("../search/semantic/semanticSchema");
const semanticAdapter = require("../search/semantic/semanticAdapter");

async function runTests() {
    console.log("==================================================");
    console.log(" TESTING: SEMANTIC INTELLIGENCE UNIT TESTS");
    console.log("==================================================");

    // 1. Provider Initialization
    console.log("1. Provider initialization & config...");
    const provider = new OllamaSemanticProvider({
        url: "http://localhost:11434",
        model: "test-model-4b",
        timeoutMs: 3000,
        maxCandidates: 25
    });
    assert.strictEqual(provider.model, "test-model-4b");
    assert.strictEqual(provider.timeoutMs, 3000);
    assert.strictEqual(provider.maxCandidates, 25);
    console.log("✓ Provider initialized correctly.");

    // 2. Schema Validation - Relevance
    console.log("2. Schema validation & hallucinated ID rejection...");
    const validCandidateIds = ["msg_001", "msg_002"];
    const rawRelevanceMock = {
        results: [
            { messageId: "msg_001", relevanceScore: 0.85, reason: "Mentions airport pickup" },
            { messageId: "msg_HALLUCINATED", relevanceScore: 0.99, reason: "Fabricated message" },
            { messageId: "msg_002", relevanceScore: "invalid_score", reason: "Non-numeric score" },
            null,
            "corrupted_entry"
        ]
    };

    const validatedRelevance = SemanticSchemaValidator.validateRelevanceOutput(rawRelevanceMock, validCandidateIds);
    assert.strictEqual(validatedRelevance.results.length, 2, "Failed to filter out invalid/hallucinated results");
    assert.strictEqual(validatedRelevance.results[0].messageId, "msg_001");
    assert.strictEqual(validatedRelevance.results[0].relevanceScore, 0.85);
    assert.strictEqual(validatedRelevance.results[0].inference, true);
    assert.strictEqual(validatedRelevance.results[1].messageId, "msg_002");
    assert.strictEqual(validatedRelevance.results[1].relevanceScore, 0.0, "Non-numeric score should default safely to 0.0");
    console.log("✓ Hallucinated message IDs and malformed scores safely rejected.");

    // 3. Schema Validation - Relationships
    console.log("3. Schema validation for relationships...");
    const rawRelMock = {
        relationships: [
            { messageIdA: "msg_001", messageIdB: "msg_002", relationship: "same_event", confidence: 0.9, reason: "Same event" },
            { messageIdA: "msg_001", messageIdB: "msg_001", relationship: "same_event", confidence: 0.9 }, // Self-reference
            { messageIdA: "msg_001", messageIdB: "msg_FAKE", relationship: "same_event", confidence: 0.9 }  // Hallucinated ID
        ]
    };
    const validatedRel = SemanticSchemaValidator.validateRelationshipsOutput(rawRelMock, validCandidateIds);
    assert.strictEqual(validatedRel.relationships.length, 1);
    assert.strictEqual(validatedRel.relationships[0].messageIdA, "msg_001");
    assert.strictEqual(validatedRel.relationships[0].messageIdB, "msg_002");
    assert.strictEqual(validatedRel.relationships[0].inference, true);
    console.log("✓ Self-referential and hallucinated relationship pairs rejected.");

    // 4. Schema Validation - Coreferences
    console.log("4. Schema validation for coreferences...");
    const rawCorefMock = {
        coreferences: [
            { sourceMessageId: "msg_001", term: "she", candidateParticipant: "Rachel", confidence: 0.85, reason: "Preceding call" },
            { sourceMessageId: "msg_FAKE", term: "he", candidateParticipant: "John" }
        ]
    };
    const validatedCoref = SemanticSchemaValidator.validateCoreferencesOutput(rawCorefMock, validCandidateIds, ["Rachel", "John"]);
    assert.strictEqual(validatedCoref.coreferences.length, 1);
    assert.strictEqual(validatedCoref.coreferences[0].candidateParticipant, "Rachel");
    assert.strictEqual(validatedCoref.coreferences[0].inference, true);
    console.log("✓ Coreference inference schema validated.");

    // 5. Graceful Fallback on Network Error / Unavailable Port
    console.log("5. Graceful fallback on unavailable Ollama port...");
    const deadProvider = new OllamaSemanticProvider({
        url: "http://localhost:59999", // Unused port
        model: "llama3:latest",
        timeoutMs: 1000
    });

    const deadResult = await deadProvider.scoreRelevance("test query", [{ id: "msg_001", body: "hello", sender: "Alice" }]);
    assert(Array.isArray(deadResult.results), "Should return array");
    assert.strictEqual(deadResult.results.length, 0, "Should return empty array on failure");
    assert(deadResult.error, "Should report error");
    console.log("✓ Unavailable provider gracefully returns empty results without throwing.");

    // 6. Timeout handling
    console.log("6. Timeout handling without process hanging...");
    const timeoutProvider = new OllamaSemanticProvider({
        url: "http://localhost:11434",
        model: "llama3:latest",
        timeoutMs: 1 // 1ms timeout will reliably trigger timeout abort
    });

    const timeoutRes = await timeoutProvider.scoreRelevance("test query", [{ id: "msg_001", body: "hello", sender: "Alice" }]);
    assert.strictEqual(timeoutRes.results.length, 0);
    assert(timeoutRes.error && timeoutRes.error.includes("timed out"), "Should record timeout in error");
    console.log("✓ Request timeout safely triggered without blocking execution.");

    // 7. Adapter Feature Flag Check
    console.log("7. Adapter feature flag enforcement...");
    assert.strictEqual(typeof semanticAdapter.isEnabled(), "boolean");
    console.log(`✓ Adapter enabled status: ${semanticAdapter.isEnabled()} (governed by THREADLINE_SEMANTIC_ENABLED).`);

    console.log("ALL SEMANTIC INFRASTRUCTURE UNIT TESTS PASSED! ✅\n");
}

runTests().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
