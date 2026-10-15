# Threadline Changelog

## Version 0.5.0 — Multi-Tier Search, Contextual AI & Verifiable Provenance
- **Simple Deterministic Search:** Ultra-fast, 100% offline full-text search powered by SQLite FTS5.
- **AI Contextual Search:** Multi-turn dialogue exchange retrieval and semantic intent analysis.
- **Staged Pipeline ("Retrieve First, Analyze Second"):** Local chunk generation (0 tokens) before bounded LLM batch evaluation.
- **7 Discrete Outcome Categories:** Added `explicit_refusal`, `conditional_response`, `indirect_objection`, `unanswered_request`, `changed_response`, `ambiguous_outcome`, and `unrelated`.
- **Verifiable Evidence Grounding:** Model outputs ground directly into source SQLite messages with exact timestamps, speakers, and `★ QUOTED EVIDENCE` highlights.
- **Privacy Controls & Boundaries:** Local Ollama default (`localhost:11434`) with zero outbound traffic; opt-in Groq Cloud with disclosure modal and localStorage key storage; strict no-silent-fallback policy.
- **Archive Coverage Limitations:** Transparent indicators displaying total candidates found, evaluated count, remaining candidates, and batch navigation.
- **Interactive Help Center:** Added dedicated Multi-Tier Search documentation tab in `HelpSection.jsx`.

## Version 0.4.0 — Forensic Swimlances & Contemporaneous Matrix
- Multi-track swimlanes (By Log, By Conversation, Unified).
- Synchronized Cross-Track Laser Cursor with Freeze Lock ('L' key).
- Contemporaneous Activity Matrix (Sliding-window correlation across devices).
- Multi-identifier subject disambiguation and burner linking.
- Universal ingestion audit and SHA-256 cryptographic provenance.
- Courtroom Bates Stamping and PDF trial exhibit generation.

## Version 0.2.0 — Initial Ingestion Engine
- React application created with Vis-Timeline.
- Express backend with SQLite WAL mode.
- SMS Backup & Restore XML parser and streaming SAX pipeline.
