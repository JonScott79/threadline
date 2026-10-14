/*
    HelpSection.jsx

    Threadline Investigative Help Center & Standard Operating Procedures.
    Provides comprehensive documentation for:
    - End-to-end forensic communications analysis workflow
    - Multi-Track Swimlanes (By Log, By Conversation, Unified) & Hover HUD
    - Forensic Person Tagging, Role Badges & People Tab
    - Temporal Windowing, Alibi Verification & Evidence Export
    - Chain of custody, standalone .tl files, and supported evidence formats
*/

// =====================================
// Imports
// =====================================

import { useState } from "react";

// =====================================
// Component
// =====================================

function HelpSection({ onBack = null }) {
    const [activeTab, setActiveTab] = useState("workflow");

    return (
        <div style={{ maxWidth: "1280px", margin: "0 auto", padding: "28px 24px", color: "var(--text)" }}>
            {/* Header Bar */}
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "24px", borderBottom: "1px solid var(--border)", paddingBottom: "18px" }}>
                <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "6px" }}>
                        <img 
                            src="/logo-icon.png" 
                            alt="Threadline" 
                            style={{ 
                                width: "32px", 
                                height: "32px", 
                                borderRadius: "8px",
                                boxShadow: "0 2px 10px rgba(63, 216, 255, 0.3)",
                                flexShrink: 0 
                            }} 
                        />
                        <h2 style={{ color: "var(--accent)", letterSpacing: "1.5px", textTransform: "uppercase", fontSize: "1.5rem", fontWeight: "800", margin: 0 }}>
                            THREADLINE INVESTIGATIVE HELP CENTER
                        </h2>
                    </div>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", margin: 0 }}>
                        Forensic Communications Analysis, Multi-Track Timeline Reconstruction & Evidence SOP
                    </p>
                </div>
                {onBack && (
                    <button 
                        className="button primary" 
                        onClick={onBack}
                        style={{ padding: "9px 22px", fontSize: "0.82rem", fontWeight: "600", letterSpacing: "0.5px", height: "38px", display: "flex", alignItems: "center", gap: "6px" }}
                    >
                        <span>&larr;</span> BACK TO WORKSPACE
                    </button>
                )}
            </div>

            {/* Forensic Architecture Hero Banner */}
            <section className="panel hero" style={{ padding: "24px 28px", marginBottom: "24px", background: "linear-gradient(135deg, rgba(20, 29, 38, 0.95) 0%, rgba(16, 24, 32, 0.98) 100%)", border: "1px solid rgba(63, 216, 255, 0.25)", borderRadius: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "12px" }}>
                    <span style={{ fontSize: "1.3rem" }}>🛡️</span>
                    <h3 style={{ fontSize: "1.15rem", fontWeight: "700", color: "var(--text)", margin: 0, letterSpacing: "0.5px" }}>
                        Digital Evidence Integrity & Forensic Architecture
                    </h3>
                </div>
                <p style={{ color: "var(--text-light)", fontSize: "0.9rem", lineHeight: "1.65", margin: "0 0 16px 0", textAlign: "left" }}>
                    Threadline is an offline, local-first forensic communications analysis system designed to ingest, normalize, and visually synchronize disparate electronic communication records. By unifying SMS extractions, encrypted messaging exports, carrier logs, emails, PDF transcripts, and screenshot OCR into synchronized multi-track timelines, investigators can establish communication patterns, verify alibis, and isolate critical evidentiary exchanges with complete chain of custody.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "14px", marginTop: "16px" }}>
                    <div style={{ padding: "12px 16px", background: "rgba(63, 216, 255, 0.05)", border: "1px solid rgba(63, 216, 255, 0.2)", borderRadius: "6px" }}>
                        <div style={{ color: "var(--accent)", fontWeight: "700", fontSize: "0.82rem", marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                            <span>🔒</span> 100% LOCAL-FIRST / CJIS SAFE
                        </div>
                        <div style={{ color: "var(--text-muted)", fontSize: "0.78rem", lineHeight: "1.45" }}>
                            All evidence ingestion, parsing, database operations, and search indexing occur strictly on your authorized local machine. No records or PII are transmitted to external cloud APIs.
                        </div>
                    </div>
                    <div style={{ padding: "12px 16px", background: "rgba(66, 211, 146, 0.05)", border: "1px solid rgba(66, 211, 146, 0.2)", borderRadius: "6px" }}>
                        <div style={{ color: "var(--success)", fontWeight: "700", fontSize: "0.82rem", marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                            <span>📁</span> STANDALONE CASE FILES (.TL)
                        </div>
                        <div style={{ color: "var(--text-muted)", fontSize: "0.78rem", lineHeight: "1.45" }}>
                            Portable SQLite archives sealed with SHA-256 tamper-resistant checksums. Easily transferred between detectives, digital forensics examiners, and prosecuting attorneys.
                        </div>
                    </div>
                    <div style={{ padding: "12px 16px", background: "rgba(247, 201, 75, 0.05)", border: "1px solid rgba(247, 201, 75, 0.2)", borderRadius: "6px" }}>
                        <div style={{ color: "var(--warning)", fontWeight: "700", fontSize: "0.82rem", marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                            <span>⏱️</span> MULTI-TRACK SWIMLANES
                        </div>
                        <div style={{ color: "var(--text-muted)", fontSize: "0.78rem", lineHeight: "1.45" }}>
                            Continuous timeline with parallel swimlanes per extraction log or conversation, directional node arrows (↗/↙), and instant hover popover HUDs.
                        </div>
                    </div>
                </div>
            </section>

            {/* Navigation Tabs */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "22px", borderBottom: "1px solid var(--border)", paddingBottom: "12px", flexWrap: "wrap" }}>
                <button
                    type="button"
                    onClick={() => setActiveTab("workflow")}
                    style={{
                        padding: "8px 18px",
                        fontSize: "0.84rem",
                        fontWeight: "600",
                        borderRadius: "6px",
                        border: activeTab === "workflow" ? "1px solid var(--accent)" : "1px solid var(--border)",
                        background: activeTab === "workflow" ? "rgba(63, 216, 255, 0.12)" : "transparent",
                        color: activeTab === "workflow" ? "var(--accent)" : "var(--text-muted)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px"
                    }}
                >
                    <span>🧭</span> Investigative Workflow
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("timeline")}
                    style={{
                        padding: "8px 18px",
                        fontSize: "0.84rem",
                        fontWeight: "600",
                        borderRadius: "6px",
                        border: activeTab === "timeline" ? "1px solid var(--accent)" : "1px solid var(--border)",
                        background: activeTab === "timeline" ? "rgba(63, 216, 255, 0.12)" : "transparent",
                        color: activeTab === "timeline" ? "var(--accent)" : "var(--text-muted)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px"
                    }}
                >
                    <span>⏱️</span> Timeline & Swimlanes
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("tagging")}
                    style={{
                        padding: "8px 18px",
                        fontSize: "0.84rem",
                        fontWeight: "600",
                        borderRadius: "6px",
                        border: activeTab === "tagging" ? "1px solid var(--accent)" : "1px solid var(--border)",
                        background: activeTab === "tagging" ? "rgba(63, 216, 255, 0.12)" : "transparent",
                        color: activeTab === "tagging" ? "var(--accent)" : "var(--text-muted)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px"
                    }}
                >
                    <span>🏷️</span> Person Tagging & Roles
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("formats")}
                    style={{
                        padding: "8px 18px",
                        fontSize: "0.84rem",
                        fontWeight: "600",
                        borderRadius: "6px",
                        border: activeTab === "formats" ? "1px solid var(--accent)" : "1px solid var(--border)",
                        background: activeTab === "formats" ? "rgba(63, 216, 255, 0.12)" : "transparent",
                        color: activeTab === "formats" ? "var(--accent)" : "var(--text-muted)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px"
                    }}
                >
                    <span>📄</span> Evidence Formats
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("custody")}
                    style={{
                        padding: "8px 18px",
                        fontSize: "0.84rem",
                        fontWeight: "600",
                        borderRadius: "6px",
                        border: activeTab === "custody" ? "1px solid var(--accent)" : "1px solid var(--border)",
                        background: activeTab === "custody" ? "rgba(63, 216, 255, 0.12)" : "transparent",
                        color: activeTab === "custody" ? "var(--accent)" : "var(--text-muted)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px"
                    }}
                >
                    <span>⚖️</span> Chain of Custody & Court
                </button>
                <button
                    type="button"
                    onClick={() => setActiveTab("tips")}
                    style={{
                        padding: "8px 18px",
                        fontSize: "0.84rem",
                        fontWeight: "600",
                        borderRadius: "6px",
                        border: activeTab === "tips" ? "1px solid var(--accent)" : "1px solid var(--border)",
                        background: activeTab === "tips" ? "rgba(63, 216, 255, 0.12)" : "transparent",
                        color: activeTab === "tips" ? "var(--accent)" : "var(--text-muted)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "6px"
                    }}
                >
                    <span>💡</span> Tips & SOP
                </button>
            </div>

            {/* TAB 1: WORKFLOW */}
            {activeTab === "workflow" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
                    <div className="preview-card" style={{ textAlign: "left", padding: "22px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                            <span style={{ fontSize: "1.8rem" }}>📥</span>
                            <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--accent)", background: "rgba(63,216,255,0.1)", padding: "2px 8px", borderRadius: "4px" }}>PHASE 1</span>
                        </div>
                        <h4 style={{ color: "var(--accent)", fontSize: "1rem", marginBottom: "8px", fontWeight: "700" }}>1. Ingest Extractions & Logs</h4>
                        <p style={{ fontSize: "0.84rem", color: "var(--text-light)", lineHeight: "1.5" }}>
                            Click <strong>+ IMPORT</strong> in the upper right. Drag and drop phone extractions (Cellebrite, Oxygen, GrayKey, carrier XML, WhatsApp ZIP, Signal JSON, Email, PDF, or screenshots) or paste raw text transcripts directly into the parser.
                        </p>
                    </div>

                    <div className="preview-card" style={{ textAlign: "left", padding: "22px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                            <span style={{ fontSize: "1.8rem" }}>🏷️</span>
                            <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--accent)", background: "rgba(63,216,255,0.1)", padding: "2px 8px", borderRadius: "4px" }}>PHASE 2</span>
                        </div>
                        <h4 style={{ color: "var(--accent)", fontSize: "1rem", marginBottom: "8px", fontWeight: "700" }}>2. Tag Suspects & People</h4>
                        <p style={{ fontSize: "0.84rem", color: "var(--text-light)", lineHeight: "1.5" }}>
                            Switch to the <strong>People</strong> tab or click the tag icon on any raw phone number. Assign real names, investigative roles (<code>SUSPECT</code>, <code>COURIER</code>, <code>BUYER</code>, <code>WITNESS</code>), and operational notes that automatically propagate across all views.
                        </p>
                    </div>

                    <div className="preview-card" style={{ textAlign: "left", padding: "22px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                            <span style={{ fontSize: "1.8rem" }}>⏱️</span>
                            <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--accent)", background: "rgba(63,216,255,0.1)", padding: "2px 8px", borderRadius: "4px" }}>PHASE 3</span>
                        </div>
                        <h4 style={{ color: "var(--accent)", fontSize: "1rem", marginBottom: "8px", fontWeight: "700" }}>3. Multi-Track Swimlane Analysis</h4>
                        <p style={{ fontSize: "0.84rem", color: "var(--text-light)", lineHeight: "1.5" }}>
                            Switch between <strong>📱 BY LOG</strong> to view extractions side-by-side on parallel lines, or <strong>💬 BY CONVERSATION</strong>. Hover over any bar or event pill to inspect messages instantly with the zero-latency Forensic Popover HUD.
                        </p>
                    </div>

                    <div className="preview-card" style={{ textAlign: "left", padding: "22px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                            <span style={{ fontSize: "1.8rem" }}>🔍</span>
                            <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--accent)", background: "rgba(63,216,255,0.1)", padding: "2px 8px", borderRadius: "4px" }}>PHASE 4</span>
                        </div>
                        <h4 style={{ color: "var(--accent)", fontSize: "1rem", marginBottom: "8px", fontWeight: "700" }}>4. Contextual Forensic Search</h4>
                        <p style={{ fontSize: "0.84rem", color: "var(--text-light)", lineHeight: "1.5" }}>
                            Execute multi-word natural queries or keywords (e.g. <em>"drop spot"</em>, <em>"payment"</em>). Matching nodes pulse in neon yellow across the timeline, and results preserve preceding and succeeding messages to prevent out-of-context misinterpretation.
                        </p>
                    </div>

                    <div className="preview-card" style={{ textAlign: "left", padding: "22px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                            <span style={{ fontSize: "1.8rem" }}>📌</span>
                            <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--accent)", background: "rgba(63,216,255,0.1)", padding: "2px 8px", borderRadius: "4px" }}>PHASE 5</span>
                        </div>
                        <h4 style={{ color: "var(--accent)", fontSize: "1rem", marginBottom: "8px", fontWeight: "700" }}>5. Curate Evidence Segments</h4>
                        <p style={{ fontSize: "0.84rem", color: "var(--text-light)", lineHeight: "1.5" }}>
                            In the message viewer, select incriminating messages and click <strong>Save Segment</strong>. Label each segment to capture its trial significance (e.g., <em>"Order Confirmation 22:14"</em> or <em>"Threat Delivered"</em>).
                        </p>
                    </div>

                    <div className="preview-card" style={{ textAlign: "left", padding: "22px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                            <span style={{ fontSize: "1.8rem" }}>📦</span>
                            <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--accent)", background: "rgba(63,216,255,0.1)", padding: "2px 8px", borderRadius: "4px" }}>PHASE 6</span>
                        </div>
                        <h4 style={{ color: "var(--accent)", fontSize: "1rem", marginBottom: "8px", fontWeight: "700" }}>6. Export Court-Ready Exhibit</h4>
                        <p style={{ fontSize: "0.84rem", color: "var(--text-light)", lineHeight: "1.5" }}>
                            Click <strong>📦 EXPORT CASE</strong> to package the sealed <code>.tl</code> database file with SHA-256 verification hash, or generate trial-ready PDF/JSON exhibits with complete context chains.
                        </p>
                    </div>
                </div>
            )}

            {/* TAB 2: TIMELINE & SWIMLANES */}
            {activeTab === "timeline" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                    <div style={{ padding: "22px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <h4 style={{ color: "var(--accent)", fontSize: "1.05rem", fontWeight: "700", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>⏱️</span> Multi-Track Swimlanes (Parallel Line Modes)
                        </h4>
                        <p style={{ color: "var(--text-light)", fontSize: "0.88rem", lineHeight: "1.6", margin: "0 0 14px 0" }}>
                            Use the <strong>SWIMLANES</strong> mode switcher on the timeline header to toggle between three visual representations:
                        </p>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px" }}>
                            <div style={{ padding: "14px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "6px" }}>
                                <strong style={{ color: "var(--accent)", fontSize: "0.85rem", display: "block", marginBottom: "4px" }}>📱 BY LOG (Multi-Device Swimlanes)</strong>
                                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: "1.45" }}>
                                    Each uploaded extraction log (e.g. suspect phone, courier phone, victim backup) gets its <strong>own horizontal line</strong>. Allows instant identification of what different parties were doing at the exact same minute.
                                </span>
                            </div>
                            <div style={{ padding: "14px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "6px" }}>
                                <strong style={{ color: "#ff9500", fontSize: "0.85rem", display: "block", marginBottom: "4px" }}>💬 BY CONVERSATION</strong>
                                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: "1.45" }}>
                                    Plots each chat thread onto an independent horizontal track with participant badges and total message counts on the left axis.
                                </span>
                            </div>
                            <div style={{ padding: "14px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "6px" }}>
                                <strong style={{ color: "var(--text)", fontSize: "0.85rem", display: "block", marginBottom: "4px" }}>📊 UNIFIED STREAM</strong>
                                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: "1.45" }}>
                                    Consolidates all messages into a single aggregate activity distribution waveform for macro-level pattern recognition across years or months.
                                </span>
                            </div>
                        </div>
                    </div>

                    <div style={{ padding: "22px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <h4 style={{ color: "var(--accent)", fontSize: "1.05rem", fontWeight: "700", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>⚡</span> Zero-Latency Forensic Hover Popover HUD
                        </h4>
                        <p style={{ color: "var(--text-light)", fontSize: "0.88rem", lineHeight: "1.6", margin: "0 0 14px 0" }}>
                            Hovering your mouse over any bar or message node on the timeline triggers an immediate glassmorphic card with full intelligence context:
                        </p>
                        <ul style={{ color: "var(--text-muted)", fontSize: "0.84rem", lineHeight: "1.6", paddingLeft: "20px", margin: 0 }}>
                            <li><strong>Direction Indicator:</strong> High-contrast badges distinguishing <code>↗ OUTGOING</code> (Amber) from <code>↙ INCOMING</code> (Electric Cyan).</li>
                            <li><strong>Sender & Recipient Alignment:</strong> Identifies who sent the message, who received it, and displays custom investigator tags (e.g. <code>SUSPECT</code>, <code>COURIER</code>).</li>
                            <li><strong>Source Identification:</strong> Displays the source file name (e.g. <code>📄 phone_extraction_marcus.json</code>) or chat thread title.</li>
                            <li><strong>Timestamp Down to the Second:</strong> Exact localized timestamp without rounding or approximation.</li>
                            <li><strong>Message Content Bubble:</strong> Displays the full text quote so you can read exchanges without leaving the temporal view.</li>
                        </ul>
                    </div>

                    <div style={{ padding: "22px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <h4 style={{ color: "var(--accent)", fontSize: "1.05rem", fontWeight: "700", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>⏱️</span> Custom Drag-Range & Alibi Windows
                        </h4>
                        <p style={{ color: "var(--text-light)", fontSize: "0.88rem", lineHeight: "1.6", margin: "0 0 14px 0" }}>
                            To isolate an incident timeframe (e.g., robbery window between 14:15 and 14:45):
                        </p>
                        <ul style={{ color: "var(--text-muted)", fontSize: "0.84rem", lineHeight: "1.6", paddingLeft: "20px", margin: 0 }}>
                            <li>Click <strong>⏱️ SELECT RANGE</strong> on the timeline header (or hold the <code>Shift</code> key).</li>
                            <li>Click and drag across the timeline across any swimlane.</li>
                            <li>The selected period will be locked as the active <strong>Temporal Window</strong>, displaying all communications across all suspect phones in that exact window under the <em>Temporal Window</em> tab.</li>
                        </ul>
                    </div>
                </div>
            )}

            {/* TAB 3: PERSON TAGGING */}
            {activeTab === "tagging" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                    <div style={{ padding: "22px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <h4 style={{ color: "var(--accent)", fontSize: "1.05rem", fontWeight: "700", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>🏷️</span> Forensic Person Tagging & Custom Roles
                        </h4>
                        <p style={{ color: "var(--text-light)", fontSize: "0.88rem", lineHeight: "1.6", margin: "0 0 14px 0" }}>
                            Police and forensic examiners frequently extract devices containing unassigned numbers, burner contacts, or ambiguous handles. Threadline allows you to tag any raw identifier with verified investigative identity:
                        </p>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px" }}>
                            <div style={{ padding: "14px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "6px" }}>
                                <strong style={{ color: "var(--text)", fontSize: "0.85rem", display: "block", marginBottom: "4px" }}>1. Click the Tag Badge</strong>
                                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: "1.45" }}>
                                    In any thread list, dialogue bubble, or the <strong>People</strong> tab, click the 🏷️ icon next to any phone number or name.
                                </span>
                            </div>
                            <div style={{ padding: "14px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "6px" }}>
                                <strong style={{ color: "var(--text)", fontSize: "0.85rem", display: "block", marginBottom: "4px" }}>2. Assign Real Name & Role</strong>
                                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: "1.45" }}>
                                    Enter the person's confirmed name and choose an investigative role (<code>SUSPECT</code>, <code>COURIER</code>, <code>BUYER</code>, <code>VICTIM</code>, <code>WITNESS</code>, <code>POI</code>).
                                </span>
                            </div>
                            <div style={{ padding: "14px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "6px" }}>
                                <strong style={{ color: "var(--text)", fontSize: "0.85rem", display: "block", marginBottom: "4px" }}>3. Global Propagation</strong>
                                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: "1.45" }}>
                                    The assigned name and glowing role badge instantly update across dialogue threads, day activity lists, and the Timeline Hover HUD cards.
                                </span>
                            </div>
                        </div>
                    </div>

                    <div style={{ padding: "22px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <h4 style={{ color: "var(--accent)", fontSize: "1.05rem", fontWeight: "700", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>👥</span> The People Directory Tab
                        </h4>
                        <p style={{ color: "var(--text-light)", fontSize: "0.88rem", lineHeight: "1.6", margin: "0 0 14px 0" }}>
                            Click the <strong>PEOPLE</strong> tab in the left explorer panel to view an aggregated roster of all entities discovered across your ingested phone logs. Search by name, phone number, alias, or filter by investigative role.
                        </p>
                    </div>
                </div>
            )}

            {/* TAB 4: FORMATS */}
            {activeTab === "formats" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px" }}>
                    <div style={{ padding: "16px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <div style={{ color: "var(--accent)", fontWeight: "700", fontSize: "0.88rem", marginBottom: "6px" }}>📱 Forensic Phone Extractions</div>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: "1.45", margin: 0 }}>
                            Cellebrite UFED (XML, HTML, XLSX, CSV), Oxygen Forensic Suite exports, and GrayKey extraction reports. Auto-normalizes carrier metadata and multimedia references.
                        </p>
                    </div>
                    <div style={{ padding: "16px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <div style={{ color: "var(--accent)", fontWeight: "700", fontSize: "0.88rem", marginBottom: "6px" }}>💬 Messaging App Archives</div>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: "1.45", margin: 0 }}>
                            WhatsApp chat exports (.txt / .zip), Signal Desktop JSON databases, Telegram JSON exports, and Discord conversation dumps.
                        </p>
                    </div>
                    <div style={{ padding: "16px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <div style={{ color: "var(--accent)", fontWeight: "700", fontSize: "0.88rem", marginBottom: "6px" }}>📞 Carrier CDR & Tower Logs</div>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: "1.45", margin: 0 }}>
                            Call Detail Records (AT&T, Verizon, T-Mobile) in CSV/Excel. Heuristic header detection automatically identifies originating, terminating, and cell tower IDs.
                        </p>
                    </div>
                    <div style={{ padding: "16px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <div style={{ color: "var(--accent)", fontWeight: "700", fontSize: "0.88rem", marginBottom: "6px" }}>📄 PDF Exhibits & Word Reports</div>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: "1.45", margin: 0 }}>
                            Searchable police reports, witness deposition transcripts, subpoena responses, and discovery PDFs parsed with temporal text heuristics.
                        </p>
                    </div>
                    <div style={{ padding: "16px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <div style={{ color: "var(--accent)", fontWeight: "700", fontSize: "0.88rem", marginBottom: "6px" }}>🖼️ Chat Screenshot OCR</div>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: "1.45", margin: 0 }}>
                            Screenshots of iMessage, SMS, WhatsApp, and social media DMs. Optical Character Recognition reconstructs timestamps, bubble directions, and text.
                        </p>
                    </div>
                    <div style={{ padding: "16px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <div style={{ color: "var(--accent)", fontWeight: "700", fontSize: "0.88rem", marginBottom: "6px" }}>📋 Direct Text & Clipboard Paste</div>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: "1.45", margin: 0 }}>
                            Instantly paste copied chat logs, emails, or subpoenaed excerpts directly into the parser without converting or saving files first.
                        </p>
                    </div>
                </div>
            )}

            {/* TAB 5: CHAIN OF CUSTODY */}
            {activeTab === "custody" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                    <div style={{ padding: "22px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <h4 style={{ color: "var(--accent)", fontSize: "1.05rem", fontWeight: "700", marginBottom: "10px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>📁</span> Standalone Case Files (.tl) & Tamper Resistance
                        </h4>
                        <p style={{ color: "var(--text-light)", fontSize: "0.88rem", lineHeight: "1.6", margin: "0 0 14px 0" }}>
                            Threadline provides a native standalone case format: <strong>.tl</strong> files. A <code>.tl</code> file encapsulates all parsed tables, metadata, timeline mappings, and curated evidence segments inside a standalone SQLite archive sealed with a SHA-256 cryptographic checksum.
                        </p>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px" }}>
                            <div style={{ padding: "14px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "6px" }}>
                                <strong style={{ color: "var(--text)", fontSize: "0.85rem", display: "block", marginBottom: "4px" }}>Exporting a Case File:</strong>
                                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: "1.45" }}>
                                    Click <strong>Export .tl Case</strong> in the left sidebar or top bar. The system bundles the active database and issues an integrity verification hash that can be recorded directly in investigative case notes.
                                </span>
                            </div>
                            <div style={{ padding: "14px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "6px" }}>
                                <strong style={{ color: "var(--text)", fontSize: "0.85rem", display: "block", marginBottom: "4px" }}>Opening Saved Cases:</strong>
                                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: "1.45" }}>
                                    Click <strong>📂 Open Saved Case</strong> to restore any saved case file instantly onto an offline workstation without requiring network access, account sync, or cloud credentials.
                                </span>
                            </div>
                        </div>
                    </div>

                    <div style={{ padding: "22px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <h4 style={{ color: "var(--accent)", fontSize: "1.05rem", fontWeight: "700", marginBottom: "10px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>⚖️</span> Courtroom Discovery & Export Standards
                        </h4>
                        <p style={{ color: "var(--text-light)", fontSize: "0.88rem", lineHeight: "1.6", margin: "0 0 14px 0" }}>
                            Threadline exports transcripts with complete context to ensure defense teams cannot allege selective omission or out-of-context quotation:
                        </p>
                        <ul style={{ color: "var(--text-muted)", fontSize: "0.84rem", lineHeight: "1.6", paddingLeft: "20px", margin: 0 }}>
                            <li><strong>Interval PDF Transcripts:</strong> Generates chronological trial exhibits with page numbers, precise timestamps, participant identifiers, and message bodies.</li>
                            <li><strong>JSON Evidence Packages:</strong> Exports machine-readable raw message arrays with UTC timestamps, sender IDs, and recipient maps for technical forensic verification.</li>
                            <li><strong>Surrounding Context Preservation:</strong> Every curated segment maintains its parent thread pointer, allowing instant expansion to view the full conversational history during testimony.</li>
                        </ul>
                    </div>
                </div>
            )}

            {/* TAB 6: TIPS & SOP */}
            {activeTab === "tips" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div style={{ padding: "20px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <h4 style={{ color: "var(--text)", fontSize: "0.95rem", fontWeight: "700", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>📱</span> 1. Ingest All Seized Phones into One Case
                        </h4>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.84rem", lineHeight: "1.5", margin: 0 }}>
                            Always import all available extractions (suspect device, courier device, victim device) into the same Threadline case. Using <strong>📱 BY LOG</strong> swimlanes allows you to immediately see cross-talk and simultaneous actions across devices.
                        </p>
                    </div>

                    <div style={{ padding: "20px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <h4 style={{ color: "var(--text)", fontSize: "0.95rem", fontWeight: "700", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>🏷️</span> 2. Tag Unsaved Numbers Immediately
                        </h4>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.84rem", lineHeight: "1.5", margin: 0 }}>
                            Tag unknown phone numbers with known suspect or associate names in the <strong>People</strong> tab. This eliminates confusion in timeline swimlanes and ensures every message bubble clearly identifies the sender.
                        </p>
                    </div>

                    <div style={{ padding: "20px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <h4 style={{ color: "var(--text)", fontSize: "0.95rem", fontWeight: "700", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>⏱️</span> 3. Anchor Searches to Alibi Windows
                        </h4>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.84rem", lineHeight: "1.5", margin: 0 }}>
                            If an incident occurred between 21:00 and 23:30, drag to select that 2.5-hour interval on the timeline first. Subsequent search queries and day activities will automatically lock to that window.
                        </p>
                    </div>

                    <div style={{ padding: "20px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <h4 style={{ color: "var(--text)", fontSize: "0.95rem", fontWeight: "700", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>🔒</span> 4. Safe Offline Air-Gapped Deployment
                        </h4>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.84rem", lineHeight: "1.5", margin: 0 }}>
                            Threadline runs 100% offline. You can safely deploy and operate it on isolated, air-gapped forensic forensic examination stations without internet connectivity.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

// =====================================
// Exports
// =====================================

export default HelpSection;
