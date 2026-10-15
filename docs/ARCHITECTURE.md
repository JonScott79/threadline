# Threadline Architecture

## Core Design Principles

- **Separation of Concerns:** One responsibility per module.
- **Offline & Private First:** Full forensic investigations run 100% locally with zero internet dependency.
- **Retrieve First, Analyze Second:** Search archives deterministically; assemble relevant exchanges on local SQLite chunks first; use LLMs only for bounded candidate batches requiring contextual understanding.
- **Evidence Provenance & Immutability:** Model outputs are treated as interpretive annotations, never modifying original raw messages or presenting inferences as established facts.
- **Verifiable Grounding:** Every AI classification links directly to verified source message IDs, speakers, and timestamps.

---

## High-Level Architecture

```
[ Raw Evidentiary Files (XML, JSON, TXT, PDF, ZIP) ]
                     │
                     ▼
             [ Universal Importer ]
                     │
                     ▼
           [ SQLite Database (WAL) ]
        ├── messages (29,300+ records)
        ├── conversations
        ├── threadlines
        ├── conversation_chunks
        └── chunks_fts (FTS5 Index)
                     │
        ┌────────────┴────────────┐
        ▼                         ▼
 [ Simple Search ]        [ AI Contextual Search ]
  (100% Local FTS5)        (Staged Pipeline)
   - Keywords / Quotes      1. Intent & Entity Parsing
   - Participants           2. High-Recall FTS5 Chunks (0 tokens)
   - Date ranges            3. Temporal Merging (45m windows)
   - Zero AI overhead       4. Multi-Factor Heuristic Scoring
                            5. Bounded Batch LLM Classifier (Top 8-12)
                                  ├── Local Ollama (Llama 3)
                                  └── Groq Cloud (Llama 3.3 70B, Opt-In)
```

---

## Multi-Tier Search Engine Architecture

### Stage 1: Intent & Entity Parsing
Natural language query analysis extracting:
- Quoted exact phrases (e.g. `"pick me up"`)
- Participant names & entities (e.g. `Darcy Gilleo`)
- Temporal markers & months
- Action keywords & refusal indicators

### Stage 2: High-Recall Chunk Candidate Generation
Queries the `chunks_fts` virtual table using SQLite FTS5 prefix and phrase matching. Returns candidate dialogue segments with zero LLM token consumption.

### Stage 3: Temporal Merging & Deduplication
Merges sequential messages within 45-minute temporal proximity windows across conversations to reconstruct full episodic interactions (request turn ➔ response/refusal turn).

### Stage 4: Multi-Factor Heuristic Ranking
Scores candidate exchanges based on:
- Cross-turn request followed by direct refusal signals
- Conditional constraint indicators (`"only if"`, `"unless"`)
- Participant match alignment
- Temporal window proximity

### Stage 5: Bounded Batch Outcome Classification
Passes strictly the Top 8–12 candidate exchanges to the configured semantic provider. Model output adheres to a strict versioned JSON schema (1.0.0) validating exchange IDs and assigning one of 7 standard categories:
1. `explicit_refusal`
2. `conditional_response`
3. `indirect_objection`
4. `unanswered_request`
5. `changed_response`
6. `ambiguous_outcome`
7. `unrelated`

### Privacy Boundaries & Fallback Invariants
- **Local Ollama:** Default provider connecting to `http://localhost:11434`. Zero network data transmission.
- **Groq Cloud:** Opt-in only via explicit user consent modal and API key in local browser storage. Sends only top candidate snippets.
- **Strict No Silent Fallback:** Local failures or timeouts cleanly fall back to deterministic local rules—never to cloud providers.
