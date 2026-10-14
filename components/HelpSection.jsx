/*
    HelpSection.jsx

    Threadline Investigative Help Center & Forensic Standard Operating Procedures.
    Provides comprehensive documentation for:
    - End-to-end forensic communications analysis workflow
    - Multi-Track Swimlanes (By Log, By Conversation, Unified) & Evidence Log Isolation Filters
    - Synchronized Cross-Track Laser Cursor with Freeze Lock ('L' key)
    - Contemporaneous Activity Co-Occurrence Matrix (Sliding-Window Correlation)
    - Multi-Identifier Subject Disambiguation & Burner Number Linking
    - Universal Ingestion Audit, Provenance & SHA-256 Cryptographic Hashes
    - Courtroom Trial Exhibit Generator with Cryptographic Bates Stamping
    - Chain of Custody, Standalone .tl Case Archives, and Supported Evidence Formats
*/

import { useState } from "react";

function HelpSection({ onBack = null }) {
    const [activeTab, setActiveTab] = useState("workflow");

    const tabs = [
        { id: "workflow", icon: "🧭", label: "Investigative Workflow" },
        { id: "timeline", icon: "⏱️", label: "Timeline, Swimlanes & Laser" },
        { id: "cooccurrence", icon: "⚡", label: "Contemporaneous Matrix" },
        { id: "disambiguation", icon: "👤", label: "Disambiguation & Entities" },
        { id: "audit", icon: "🔍", label: "Ingestion Audit & Hashes" },
        { id: "courtroom", icon: "⚖️", label: "Bates Stamping & Exhibits" },
        { id: "formats", icon: "📄", label: "Supported Formats" },
        { id: "sop", icon: "💡", label: "Forensic SOP & Best Practices" }
    ];

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
                                width: "34px", 
                                height: "34px", 
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
                        Digital Forensics Standard Operating Procedures, Multi-Device Correlation & Courtroom Evidence Guide
                    </p>
                </div>
                {onBack && (
                    <button 
                        className="button primary" 
                        onClick={onBack}
                        style={{ padding: "9px 22px", fontSize: "0.82rem", fontWeight: "600", letterSpacing: "0.5px", height: "38px", display: "flex", alignItems: "center", gap: "6px" }}
                    >
                        <span>&larr;</span> BACK TO CASE WORKSPACE
                    </button>
                )}
            </div>

            {/* Forensic Architecture Hero Banner */}
            <section className="panel hero" style={{ padding: "22px 26px", marginBottom: "24px", background: "linear-gradient(135deg, rgba(20, 29, 38, 0.95) 0%, rgba(16, 24, 32, 0.98) 100%)", border: "1px solid rgba(63, 216, 255, 0.25)", borderRadius: "8px" }}>
                <div style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "10px" }}>
                    <span style={{ fontSize: "1.4rem" }}>🛡️</span>
                    <h3 style={{ fontSize: "1.15rem", fontWeight: "700", color: "var(--text)", margin: 0, letterSpacing: "0.5px" }}>
                        Local-First Forensic Communications Intelligence
                    </h3>
                </div>
                <p style={{ color: "var(--text-light)", fontSize: "0.88rem", lineHeight: "1.65", margin: "0 0 16px 0", textAlign: "left" }}>
                    Threadline is an offline, air-gapped forensic communications analysis workstation built to ingest, synchronize, and correlate multi-device extraction records. By linking extraction logs, carrier CDRs, encrypted chats, and document transcripts into synchronized multi-track timelines, investigators can verify alibis, uncover co-conspirator communications across alternate handles, and generate cryptographically sealed courtroom trial exhibits.
                </p>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: "12px", marginTop: "14px" }}>
                    <div style={{ padding: "12px 14px", background: "rgba(63, 216, 255, 0.05)", border: "1px solid rgba(63, 216, 255, 0.2)", borderRadius: "6px" }}>
                        <div style={{ color: "var(--accent)", fontWeight: "700", fontSize: "0.82rem", marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                            <span>🔒</span> 100% AIR-GAPPED & CJIS SAFE
                        </div>
                        <div style={{ color: "var(--text-muted)", fontSize: "0.78rem", lineHeight: "1.45" }}>
                            All parsing, SQLite indexing, semantic keyword matching, and SHA-256 verification run entirely in your local environment. Zero external API leaks.
                        </div>
                    </div>
                    <div style={{ padding: "12px 14px", background: "rgba(66, 211, 146, 0.05)", border: "1px solid rgba(66, 211, 146, 0.2)", borderRadius: "6px" }}>
                        <div style={{ color: "var(--success)", fontWeight: "700", fontSize: "0.82rem", marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                            <span>⚡</span> CO-OCCURRENCE MATRIX
                        </div>
                        <div style={{ color: "var(--text-muted)", fontSize: "0.78rem", lineHeight: "1.45" }}>
                            Detects contemporaneous communications across multiple suspect and courier devices within configurable temporal windows (&plusmn;30s to &plusmn;1h).
                        </div>
                    </div>
                    <div style={{ padding: "12px 14px", background: "rgba(255, 159, 10, 0.05)", border: "1px solid rgba(255, 159, 10, 0.2)", borderRadius: "6px" }}>
                        <div style={{ color: "#ff9f0a", fontWeight: "700", fontSize: "0.82rem", marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                            <span>⚖️</span> CRYPTOGRAPHIC BATES STAMPING
                        </div>
                        <div style={{ color: "var(--text-muted)", fontSize: "0.78rem", lineHeight: "1.45" }}>
                            Automated, customizable Bates numbering with agency headers and SHA-256 digital seals for direct admissibility in court.
                        </div>
                    </div>
                </div>
            </section>

            {/* Navigation Tabs */}
            <div style={{ display: "flex", gap: "8px", marginBottom: "22px", borderBottom: "1px solid var(--border)", paddingBottom: "12px", flexWrap: "wrap" }}>
                {tabs.map(t => (
                    <button
                        key={t.id}
                        type="button"
                        onClick={() => setActiveTab(t.id)}
                        style={{
                            padding: "8px 16px",
                            fontSize: "0.82rem",
                            fontWeight: "600",
                            borderRadius: "6px",
                            border: activeTab === t.id ? "1px solid var(--accent)" : "1px solid var(--border)",
                            background: activeTab === t.id ? "rgba(63, 216, 255, 0.12)" : "transparent",
                            color: activeTab === t.id ? "var(--accent)" : "var(--text-muted)",
                            cursor: "pointer",
                            display: "flex",
                            alignItems: "center",
                            gap: "6px"
                        }}
                    >
                        <span>{t.icon}</span> {t.label}
                    </button>
                ))}
            </div>

            {/* TAB 1: INVESTIGATIVE WORKFLOW */}
            {activeTab === "workflow" && (
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
                    <div className="preview-card" style={{ textAlign: "left", padding: "20px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                            <span style={{ fontSize: "1.6rem" }}>📁</span>
                            <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--accent)", background: "rgba(63,216,255,0.1)", padding: "2px 8px", borderRadius: "4px" }}>PHASE 1</span>
                        </div>
                        <h4 style={{ color: "var(--accent)", fontSize: "0.95rem", marginBottom: "8px", fontWeight: "700" }}>1. Case Setup & Multi-Log Ingestion</h4>
                        <p style={{ fontSize: "0.84rem", color: "var(--text-light)", lineHeight: "1.5" }}>
                            Create a dedicated Threadline case (or click <strong>+ IMPORT</strong>). Ingest all seized extractions for the case (Cellebrite UFED, Oxygen, GrayKey, WhatsApp, Signal, carrier CDRs, or screenshot OCR). Every file is automatically hashed with SHA-256 and mapped to its own swimlane.
                        </p>
                    </div>

                    <div className="preview-card" style={{ textAlign: "left", padding: "20px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                            <span style={{ fontSize: "1.6rem" }}>👤</span>
                            <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--accent)", background: "rgba(63,216,255,0.1)", padding: "2px 8px", borderRadius: "4px" }}>PHASE 2</span>
                        </div>
                        <h4 style={{ color: "var(--accent)", fontSize: "0.95rem", marginBottom: "8px", fontWeight: "700" }}>2. Disambiguation & Alias Linking</h4>
                        <p style={{ fontSize: "0.84rem", color: "var(--text-light)", lineHeight: "1.5" }}>
                            Open the <strong>PEOPLE</strong> tab. Link burner phone numbers, SIM swaps, and chat handles to real-world target identities with confidence ratings. Assign investigative roles (<code>SUSPECT</code>, <code>COURIER</code>, <code>BUYER</code>, <code>WITNESS</code>) that propagate globally across all swimlanes.
                        </p>
                    </div>

                    <div className="preview-card" style={{ textAlign: "left", padding: "20px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                            <span style={{ fontSize: "1.6rem" }}>⚡</span>
                            <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "#ff9f0a", background: "rgba(255,159,10,0.1)", padding: "2px 8px", borderRadius: "4px" }}>PHASE 3</span>
                        </div>
                        <h4 style={{ color: "#ff9f0a", fontSize: "0.95rem", marginBottom: "8px", fontWeight: "700" }}>3. Laser Crosshair & Co-Occurrence Analysis</h4>
                        <p style={{ fontSize: "0.84rem", color: "var(--text-light)", lineHeight: "1.5" }}>
                            Engage the Synchronized Cross-Track Laser Cursor. Move across suspect swimlanes and press <kbd style={{ background: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: "3px" }}>L</kbd> to freeze on an incriminating message. Click <strong>⚡ CORRELATE</strong> to launch the Contemporaneous Activity Matrix and reveal what co-conspirators sent at that exact time.
                        </p>
                    </div>

                    <div className="preview-card" style={{ textAlign: "left", padding: "20px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                            <span style={{ fontSize: "1.6rem" }}>🔍</span>
                            <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--accent)", background: "rgba(63,216,255,0.1)", padding: "2px 8px", borderRadius: "4px" }}>PHASE 4</span>
                        </div>
                        <h4 style={{ color: "var(--accent)", fontSize: "0.95rem", marginBottom: "8px", fontWeight: "700" }}>4. Plain-Language Evidence Search</h4>
                        <p style={{ fontSize: "0.84rem", color: "var(--text-light)", lineHeight: "1.5" }}>
                            Query keywords and natural phrases (e.g. <em>"drop location"</em>, <em>"wire transfer"</em>, <em>"meet at 10"</em>). Matches highlight in pulsing gold across timeline tracks with complete contextual surrounding dialog preserved.
                        </p>
                    </div>

                    <div className="preview-card" style={{ textAlign: "left", padding: "20px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                            <span style={{ fontSize: "1.6rem" }}>📋</span>
                            <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--accent)", background: "rgba(63,216,255,0.1)", padding: "2px 8px", borderRadius: "4px" }}>PHASE 5</span>
                        </div>
                        <h4 style={{ color: "var(--accent)", fontSize: "0.95rem", marginBottom: "8px", fontWeight: "700" }}>5. Evidence Verification & Ingestion Audit</h4>
                        <p style={{ fontSize: "0.84rem", color: "var(--text-light)", lineHeight: "1.5" }}>
                            Inspect the <strong>IMPORTS</strong> tab or launch the Ingestion Audit modal. Verify raw file SHA-256 hashes, earliest/latest parsed timestamps, total message discovery counts, and any parser discrepancies for defensible evidentiary auditing.
                        </p>
                    </div>

                    <div className="preview-card" style={{ textAlign: "left", padding: "20px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "10px" }}>
                            <span style={{ fontSize: "1.6rem" }}>⚖️</span>
                            <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--success)", background: "rgba(66,211,146,0.1)", padding: "2px 8px", borderRadius: "4px" }}>PHASE 6</span>
                        </div>
                        <h4 style={{ color: "var(--success)", fontSize: "0.95rem", marginBottom: "8px", fontWeight: "700" }}>6. Bates Stamping & Courtroom Exhibits</h4>
                        <p style={{ fontSize: "0.84rem", color: "var(--text-light)", lineHeight: "1.5" }}>
                            Click <strong>⚖️ TRIAL EXHIBIT</strong> to generate formal court exhibits. Configure custom Bates numbering (e.g. <code>STATE-EXHIBIT-000001</code>), select evidence threads or contemporaneous windows, and print/export court-admissible records with cryptographic verification seals.
                        </p>
                    </div>
                </div>
            )}

            {/* TAB 2: TIMELINE, SWIMLANES & LASER SYNC */}
            {activeTab === "timeline" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                    <div style={{ padding: "22px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <h4 style={{ color: "var(--accent)", fontSize: "1.05rem", fontWeight: "700", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>⏱️</span> Parallel Swimlanes & Evidence Log Isolation
                        </h4>
                        <p style={{ color: "var(--text-light)", fontSize: "0.88rem", lineHeight: "1.6", margin: "0 0 14px 0" }}>
                            Threadline replaces cluttered single-line charts with dedicated multi-device horizontal swimlanes:
                        </p>
                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px" }}>
                            <div style={{ padding: "14px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "6px" }}>
                                <strong style={{ color: "var(--accent)", fontSize: "0.85rem", display: "block", marginBottom: "4px" }}>📱 BY LOG (Multi-Device Swimlanes)</strong>
                                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: "1.45" }}>
                                    Each imported evidence log (e.g. Suspect iPhone, Courier Android, Victim CDR) is rendered on its own dedicated horizontal track. Compare temporal behavior side-by-side.
                                </span>
                            </div>
                            <div style={{ padding: "14px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "6px" }}>
                                <strong style={{ color: "#ff9f0a", fontSize: "0.85rem", display: "block", marginBottom: "4px" }}>💬 BY CONVERSATION</strong>
                                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: "1.45" }}>
                                    Plots individual chat threads on separate horizontal lanes. Shows message counts, participant names, and start/end dates along the vertical axis.
                                </span>
                            </div>
                            <div style={{ padding: "14px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "6px" }}>
                                <strong style={{ color: "var(--text)", fontSize: "0.85rem", display: "block", marginBottom: "4px" }}>📊 UNIFIED STREAM</strong>
                                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: "1.45" }}>
                                    Aggregates all selected messages into a single temporal distribution waveform for macro pattern analysis across months or years.
                                </span>
                            </div>
                        </div>

                        {/* Log Isolation Checkboxes */}
                        <div style={{ marginTop: "16px", padding: "14px", background: "rgba(63, 216, 255, 0.04)", border: "1px solid rgba(63, 216, 255, 0.2)", borderRadius: "6px" }}>
                            <strong style={{ color: "var(--accent)", fontSize: "0.85rem", display: "block", marginBottom: "6px" }}>
                                🔘 Evidence Log Isolation Checkboxes:
                            </strong>
                            <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", lineHeight: "1.5", margin: 0 }}>
                                When viewing cases with multiple extractions, Threadline renders <strong>LOGS IN CASE:</strong> checkboxes right on the timeline bar. Check or uncheck any individual log (e.g., hide a massive 20,000-message carrier log while examining a specific phone extraction) to instantly declutter your workspace without deleting data.
                            </p>
                        </div>
                    </div>

                    <div style={{ padding: "22px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <h4 style={{ color: "#ff9f0a", fontSize: "1.05rem", fontWeight: "700", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>⚡</span> Synchronized Cross-Track Laser Cursor with Freeze Lock
                        </h4>
                        <p style={{ color: "var(--text-light)", fontSize: "0.88rem", lineHeight: "1.6", margin: "0 0 14px 0" }}>
                            The Cross-Track Laser Cursor cuts vertically across all active swimlanes simultaneously to provide absolute temporal alignment:
                        </p>
                        <ul style={{ color: "var(--text-muted)", fontSize: "0.84rem", lineHeight: "1.6", paddingLeft: "20px", margin: "0 0 14px 0" }}>
                            <li><strong>Continuous Crosshair:</strong> A high-visibility cyan beam tracks your mouse cursor across every device track, displaying the exact second at the bottom ruler.</li>
                            <li><strong>Lock / Freeze Beam (<kbd style={{ background: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: "3px" }}>L</kbd> Key):</strong> Press <kbd style={{ background: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: "3px" }}>L</kbd> or click the timeline to lock the laser in place (turning amber). You can then safely move your mouse to click <strong>⚡ CORRELATE</strong> or inspect surrounding data.</li>
                            <li><strong>Hover Popover HUD:</strong> Hovering any message node opens an instant glassmorphic HUD showing direction (<code>↗ OUTGOING</code> / <code>↙ INCOMING</code>), sender/recipient names, investigative tags, and full text body.</li>
                        </ul>
                    </div>

                    <div style={{ padding: "22px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <h4 style={{ color: "var(--accent)", fontSize: "1.05rem", fontWeight: "700", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>⏱️</span> Drag-to-Select Alibi Window
                        </h4>
                        <p style={{ color: "var(--text-light)", fontSize: "0.88rem", lineHeight: "1.6", margin: "0 0 12px 0" }}>
                            To isolate an incident timeframe (e.g. robbery window between 14:15 and 14:45):
                        </p>
                        <ol style={{ color: "var(--text-muted)", fontSize: "0.84rem", lineHeight: "1.6", paddingLeft: "20px", margin: 0 }}>
                            <li>Click <strong>⏱️ SELECT RANGE</strong> on the timeline header (or hold the <kbd style={{ background: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: "3px" }}>Shift</kbd> key).</li>
                            <li>Click and drag across the timeline over the incident duration.</li>
                            <li>The selected period is locked as the active <strong>Temporal Window</strong>, filtering search queries and day activities across all suspect phones.</li>
                        </ol>
                    </div>
                </div>
            )}

            {/* TAB 3: CONTEMPORANEOUS MATRIX */}
            {activeTab === "cooccurrence" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                    <div style={{ padding: "22px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <h4 style={{ color: "#ff9f0a", fontSize: "1.05rem", fontWeight: "700", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>⚡</span> Contemporaneous Activity Co-Occurrence Matrix
                        </h4>
                        <p style={{ color: "var(--text-light)", fontSize: "0.88rem", lineHeight: "1.6", margin: "0 0 14px 0" }}>
                            A decisive competitive capability over legacy forensics tools like Cellebrite Pathfinder and Magnet AXIOM: discovering hidden coordination when bad actors message back and forth across different apps or switch devices during an operation.
                        </p>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px", marginTop: "12px" }}>
                            <div style={{ padding: "14px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "6px" }}>
                                <strong style={{ color: "var(--accent)", fontSize: "0.85rem", display: "block", marginBottom: "4px" }}>1. Launch from Laser or Header</strong>
                                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: "1.45" }}>
                                    Position the Laser Cursor over any key event, freeze it with <kbd style={{ background: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: "3px" }}>L</kbd>, and click <strong>⚡ CORRELATE</strong>, or click the correlate button on any message in dialog view.
                                </span>
                            </div>
                            <div style={{ padding: "14px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "6px" }}>
                                <strong style={{ color: "var(--accent)", fontSize: "0.85rem", display: "block", marginBottom: "4px" }}>2. Configurable Window (&Delta;t)</strong>
                                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: "1.45" }}>
                                    Select your correlation tolerance: <strong>&plusmn;30 seconds</strong> (hot exchange), <strong>&plusmn;1 minute</strong>, <strong>&plusmn;5 minutes</strong>, <strong>&plusmn;15 minutes</strong>, or <strong>&plusmn;1 hour</strong>.
                                </span>
                            </div>
                            <div style={{ padding: "14px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "6px" }}>
                                <strong style={{ color: "var(--accent)", fontSize: "0.85rem", display: "block", marginBottom: "4px" }}>3. Device Activity Breakdown</strong>
                                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: "1.45" }}>
                                    Displays total co-occurring message counts grouped by device and conversation, exposing secondary channels being used at the exact same moment.
                                </span>
                            </div>
                        </div>

                        <div style={{ marginTop: "16px", padding: "14px", background: "rgba(255, 159, 10, 0.05)", border: "1px solid rgba(255, 159, 10, 0.2)", borderRadius: "6px" }}>
                            <strong style={{ color: "#ff9f0a", fontSize: "0.85rem", display: "block", marginBottom: "6px" }}>
                                💡 Investigative Use Case:
                            </strong>
                            <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", lineHeight: "1.5", margin: 0 }}>
                                Suspect A texts Victim: <em>"Where are you?"</em> at 19:42:10. By correlating at &plusmn;1m, the matrix instantly flags Suspect A sending a Signal message to Suspect B at 19:42:35 saying: <em>"Target is walking in now"</em>. This establishes clear contemporaneous intent and conspiracy.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 4: DISAMBIGUATION & ENTITIES */}
            {activeTab === "disambiguation" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                    <div style={{ padding: "22px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <h4 style={{ color: "var(--accent)", fontSize: "1.05rem", fontWeight: "700", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>👤</span> Multi-Identifier Subject Disambiguation & Alias Linking
                        </h4>
                        <p style={{ color: "var(--text-light)", fontSize: "0.88rem", lineHeight: "1.6", margin: "0 0 14px 0" }}>
                            Criminal actors routinely switch between burner numbers, multiple SIM cards, WhatsApp, and Telegram handles. Threadline allows you to consolidate multiple digital identities into a single real-world person entity:
                        </p>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px" }}>
                            <div style={{ padding: "14px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "6px" }}>
                                <strong style={{ color: "var(--text)", fontSize: "0.85rem", display: "block", marginBottom: "4px" }}>1. Non-Destructive Raw Integrity</strong>
                                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: "1.45" }}>
                                    Original sender numbers and raw platform IDs are never overwritten in the database. Disambiguation operates as a forensic link layer.
                                </span>
                            </div>
                            <div style={{ padding: "14px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "6px" }}>
                                <strong style={{ color: "var(--text)", fontSize: "0.85rem", display: "block", marginBottom: "4px" }}>2. Confidence Grading</strong>
                                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: "1.45" }}>
                                    Assign evidentiary confidence ratings when linking handles: <strong>Verified</strong> (subpoena/warrant confirmed), <strong>Inferred</strong> (content attribution), or <strong>Suspected</strong>.
                                </span>
                            </div>
                            <div style={{ padding: "14px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "6px" }}>
                                <strong style={{ color: "var(--text)", fontSize: "0.85rem", display: "block", marginBottom: "4px" }}>3. Forensic Role Badges</strong>
                                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: "1.45" }}>
                                    Tag subjects with standard investigative roles: <code>SUSPECT</code>, <code>COURIER</code>, <code>BUYER</code>, <code>VICTIM</code>, <code>WITNESS</code>, or <code>POI</code>. Badges illuminate across all UI views.
                                </span>
                            </div>
                        </div>
                    </div>

                    <div style={{ padding: "22px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <h4 style={{ color: "var(--accent)", fontSize: "1.05rem", fontWeight: "700", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>👥</span> How to Link an Alternate Number or Handle
                        </h4>
                        <ol style={{ color: "var(--text-muted)", fontSize: "0.84rem", lineHeight: "1.6", paddingLeft: "20px", margin: 0 }}>
                            <li>Navigate to the <strong>PEOPLE</strong> tab in the left explorer panel.</li>
                            <li>Locate the target individual and click <strong>🔗 Link Number / Handle</strong> (or click <strong>Edit Profile</strong>).</li>
                            <li>Enter the secondary phone number, Telegram username, or Instagram handle.</li>
                            <li>Select your confidence level and enter case notes explaining the basis for attribution.</li>
                            <li>Click <strong>Link Identifier</strong>. Threadline now associates all historical exchanges from that identifier to this entity!</li>
                        </ol>
                    </div>
                </div>
            )}

            {/* TAB 5: INGESTION AUDIT & HASHES */}
            {activeTab === "audit" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                    <div style={{ padding: "22px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <h4 style={{ color: "var(--accent)", fontSize: "1.05rem", fontWeight: "700", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>🔍</span> Universal Ingestion Audit & Provenance Inspector
                        </h4>
                        <p style={{ color: "var(--text-light)", fontSize: "0.88rem", lineHeight: "1.6", margin: "0 0 14px 0" }}>
                            Defensibility in digital forensics requires proving the mathematical integrity of imported evidence from the moment of ingestion:
                        </p>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px" }}>
                            <div style={{ padding: "14px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "6px" }}>
                                <strong style={{ color: "var(--accent)", fontSize: "0.85rem", display: "block", marginBottom: "4px" }}>SHA-256 Cryptographic Hashing</strong>
                                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: "1.45" }}>
                                    Upon file receipt, Threadline computes a SHA-256 hash before parsing. The hash is permanently logged in the SQLite audit ledger for cross-examination verification.
                                </span>
                            </div>
                            <div style={{ padding: "14px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "6px" }}>
                                <strong style={{ color: "var(--accent)", fontSize: "0.85rem", display: "block", marginBottom: "4px" }}>Discovered vs. Ingested Accounting</strong>
                                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: "1.45" }}>
                                    Complete audit trail tracking total messages found, successfully stored records, and count of skipped/corrupted nodes with detailed error explanations.
                                </span>
                            </div>
                            <div style={{ padding: "14px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "6px" }}>
                                <strong style={{ color: "var(--accent)", fontSize: "0.85rem", display: "block", marginBottom: "4px" }}>Provenance Metadata</strong>
                                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: "1.45" }}>
                                    Logs original filename, file size, extraction source, detected platform, and exact temporal boundaries (earliest and latest record timestamp).
                                </span>
                            </div>
                        </div>

                        <div style={{ marginTop: "16px", padding: "14px", background: "rgba(63, 216, 255, 0.04)", border: "1px solid rgba(63, 216, 255, 0.2)", borderRadius: "6px" }}>
                            <strong style={{ color: "var(--accent)", fontSize: "0.85rem", display: "block", marginBottom: "4px" }}>
                                Accessing the Ingestion Audit:
                            </strong>
                            <p style={{ color: "var(--text-muted)", fontSize: "0.82rem", lineHeight: "1.5", margin: 0 }}>
                                Click the <strong>IMPORTS</strong> tab in the left explorer panel to view every ingested extraction file and click <strong>🔍 View Audit & SHA-256</strong> to open the full provenance report.
                            </p>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 6: BATES STAMPING & COURTROOM EXHIBITS */}
            {activeTab === "courtroom" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "18px" }}>
                    <div style={{ padding: "22px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <h4 style={{ color: "var(--success)", fontSize: "1.05rem", fontWeight: "700", marginBottom: "12px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>⚖️</span> Courtroom Trial Exhibit & Cryptographic Bates Stamping Generator
                        </h4>
                        <p style={{ color: "var(--text-light)", fontSize: "0.88rem", lineHeight: "1.6", margin: "0 0 14px 0" }}>
                            Transform raw communication databases into court-admissible trial exhibits with standardized Bates numbering, agency headers, and digital custody seals:
                        </p>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "14px" }}>
                            <div style={{ padding: "14px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "6px" }}>
                                <strong style={{ color: "var(--success)", fontSize: "0.85rem", display: "block", marginBottom: "4px" }}>Sequential Bates Stamping</strong>
                                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: "1.45" }}>
                                    Configure custom prefixes (e.g., <code>STATE-EX-</code>, <code>DEF-BATES-</code>) and starting sequence numbers with 6-digit zero-padding (<code>STATE-EX-000001</code>).
                                </span>
                            </div>
                            <div style={{ padding: "14px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "6px" }}>
                                <strong style={{ color: "var(--success)", fontSize: "0.85rem", display: "block", marginBottom: "4px" }}>Agency & Court Header</strong>
                                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: "1.45" }}>
                                    Include Agency Name, Case/Docket Number, Lead Investigator badge, and Title directly on generated exhibit cover sheets.
                                </span>
                            </div>
                            <div style={{ padding: "14px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "6px" }}>
                                <strong style={{ color: "var(--success)", fontSize: "0.85rem", display: "block", marginBottom: "4px" }}>Print & PDF Ready</strong>
                                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: "1.45" }}>
                                    Dedicated print CSS produces crisp black-and-white or high-contrast tables suitable for physical trial binders or electronic PDF discovery.
                                </span>
                            </div>
                        </div>

                        <div style={{ marginTop: "16px", padding: "14px", background: "rgba(66, 211, 146, 0.05)", border: "1px solid rgba(66, 211, 146, 0.2)", borderRadius: "6px" }}>
                            <strong style={{ color: "var(--success)", fontSize: "0.85rem", display: "block", marginBottom: "6px" }}>
                                📄 How to Generate a Trial Exhibit:
                            </strong>
                            <ol style={{ color: "var(--text-muted)", fontSize: "0.82rem", lineHeight: "1.5", margin: 0, paddingLeft: "20px" }}>
                                <li>In your case workspace, click the <strong>⚖️ TRIAL EXHIBIT</strong> button in the upper right.</li>
                                <li>Specify your Bates prefix, start number, Agency Name, and Case Number.</li>
                                <li>Choose your scope: full thread, current temporal alibi range, or bookmarked segments.</li>
                                <li>Click <strong>🖨️ PRINT / SAVE TO PDF</strong> to generate the formatted legal exhibit.</li>
                            </ol>
                        </div>
                    </div>
                </div>
            )}

            {/* TAB 7: SUPPORTED FORMATS */}
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

            {/* TAB 8: FORENSIC SOP & BEST PRACTICES */}
            {activeTab === "sop" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div style={{ padding: "20px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <h4 style={{ color: "var(--text)", fontSize: "0.95rem", fontWeight: "700", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>📁</span> 1. Ingest All Seized Evidence into One Case Workspace
                        </h4>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.84rem", lineHeight: "1.5", margin: 0 }}>
                            Always import all extractions relating to the same matter (suspect device, courier device, victim extraction, carrier CDRs) into a single Threadline case. Use the <strong>LOGS IN CASE:</strong> filter checkboxes to toggle visibility on and off without segmenting your evidence.
                        </p>
                    </div>

                    <div style={{ padding: "20px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <h4 style={{ color: "var(--text)", fontSize: "0.95rem", fontWeight: "700", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>⚡</span> 2. Correlate Critical Events Across Alternate Tracks
                        </h4>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.84rem", lineHeight: "1.5", margin: 0 }}>
                            Whenever you discover an alibi claim or high-value message, lock the Cross-Track Laser Cursor with <kbd style={{ background: "rgba(255,255,255,0.1)", padding: "2px 6px", borderRadius: "3px" }}>L</kbd> and click <strong>⚡ CORRELATE</strong>. This systematically disproves alibis by proving alternate communication on another device or platform.
                        </p>
                    </div>

                    <div style={{ padding: "20px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <h4 style={{ color: "var(--text)", fontSize: "0.95rem", fontWeight: "700", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>👤</span> 3. Disambiguate Identifiers Early
                        </h4>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.84rem", lineHeight: "1.5", margin: 0 }}>
                            Link burner contacts and social media handles to target entities in the <strong>PEOPLE</strong> tab as soon as attribution is established. This ensures all subsequent timeline reviews, matrix scans, and exhibit exports reflect confirmed identities.
                        </p>
                    </div>

                    <div style={{ padding: "20px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <h4 style={{ color: "var(--text)", fontSize: "0.95rem", fontWeight: "700", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>⚖️</span> 4. Package Standalone .tl Case Archives for Discovery
                        </h4>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.84rem", lineHeight: "1.5", margin: 0 }}>
                            Use <strong>📦 EXPORT CASE</strong> to create sealed <code>.tl</code> files for turnover to prosecutors, defense counsel, or partner agencies. The recipient can open the file in Threadline without cloud accounts, preserving full interactive timeline analysis and SHA-256 chain of custody.
                        </p>
                    </div>
                </div>
            )}
        </div>
    );
}

export default HelpSection;
