/*
    HelpSection.jsx

    Threadline Investigative Help Center & Forensic Guide.
    Provides clear, authoritative documentation on digital communications forensics,
    timeline reconstruction, evidence ingestion, contextual search, and case file management.
*/

// =====================================
// Imports
// =====================================

import React, { useState } from "react";

// =====================================
// Component
// =====================================

function HelpSection({ onBack }) {
    const [activeTab, setActiveTab] = useState("workflow");

    return (
        <div className="workspace-dashboard empty-state" style={{ overflowY: "auto", padding: "32px 40px", maxWidth: "1500px", margin: "0 auto" }}>
            {/* Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "28px", borderBottom: "1px solid var(--border)", paddingBottom: "20px" }}>
                <div>
                    <div style={{ display: "flex", alignItems: "center", gap: "10px", marginBottom: "6px" }}>
                        <span style={{ fontSize: "1.6rem" }}>🛡️</span>
                        <h2 style={{ color: "var(--accent)", letterSpacing: "1.5px", textTransform: "uppercase", fontSize: "1.5rem", fontWeight: "800", margin: 0 }}>
                            THREADLINE INVESTIGATIVE HELP CENTER
                        </h2>
                    </div>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.88rem", margin: 0 }}>
                        Forensic Communications Analysis, Multi-Source Timeline Reconstruction & Case Management Guide
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
                    <span style={{ fontSize: "1.3rem" }}>⚖️</span>
                    <h3 style={{ fontSize: "1.15rem", fontWeight: "700", color: "var(--text)", margin: 0, letterSpacing: "0.5px" }}>
                        Digital Evidence Integrity & Forensic Architecture
                    </h3>
                </div>
                <p style={{ color: "var(--text-light)", fontSize: "0.9rem", lineHeight: "1.65", margin: "0 0 16px 0", textAlign: "left" }}>
                    Threadline is an offline, local-first forensic communications analysis system designed to ingest, normalize, and visually synchronize disparate electronic communication records. By unifying SMS extractions, encrypted messaging exports, carrier logs, emails, PDF transcripts, and screenshot OCR into a single chronological timeline, investigators can instantly establish communication patterns, verify alibis, and isolate critical evidentiary exchanges with complete chain of custody.
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
                            Portable SQLite archives with SHA-256 tamper-resistant checksums. Easily transferred between detectives, digital forensics examiners, and prosecuting attorneys.
                        </div>
                    </div>
                    <div style={{ padding: "12px 16px", background: "rgba(247, 201, 75, 0.05)", border: "1px solid rgba(247, 201, 75, 0.2)", borderRadius: "6px" }}>
                        <div style={{ color: "var(--warning)", fontWeight: "700", fontSize: "0.82rem", marginBottom: "4px", display: "flex", alignItems: "center", gap: "6px" }}>
                            <span>⏱️</span> CHRONOLOGICAL RECONSTRUCTION
                        </div>
                        <div style={{ color: "var(--text-muted)", fontSize: "0.78rem", lineHeight: "1.45" }}>
                            Continuous millisecond-to-year timeline visualization with automatic speaker alignment, SMS/MMS inversion correction, and multi-source cross-communication comparison.
                        </div>
                    </div>
                </div>
            </section>

            {/* Navigation Tabs */}
            <div style={{ display: "flex", gap: "10px", marginBottom: "22px", borderBottom: "1px solid var(--border)", paddingBottom: "12px" }}>
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
                    <span>📦</span> Supported Evidence Formats
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
                    <span>📜</span> Chain of Custody & Courtroom Reporting
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
                    <span>💡</span> SOP & Detective Pro Tips
                </button>
            </div>

            {/* TAB 1: WORKFLOW */}
            {activeTab === "workflow" && (
                <div className="import-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "20px" }}>
                    {/* Step 1 */}
                    <div className="preview-card" style={{ textAlign: "left", padding: "22px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                            <span style={{ fontSize: "1.8rem" }}>📥</span>
                            <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--accent)", background: "rgba(63,216,255,0.1)", padding: "2px 8px", borderRadius: "4px" }}>PHASE 1</span>
                        </div>
                        <h4 style={{ color: "var(--accent)", fontSize: "1rem", marginBottom: "8px", fontWeight: "700" }}>1. Ingest Raw Evidence</h4>
                        <p style={{ fontSize: "0.84rem", color: "var(--text-light)", lineHeight: "1.5" }}>
                            Navigate to <strong>Communications Archive</strong> in the left sidebar. Drag and drop forensic extraction files (Cellebrite, Oxygen, GrayKey, carrier XML, WhatsApp ZIP, Signal JSON, Email, PDF, or screenshots) or paste raw text snippets directly into the ingestion panel.
                        </p>
                    </div>

                    {/* Step 2 */}
                    <div className="preview-card" style={{ textAlign: "left", padding: "22px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                            <span style={{ fontSize: "1.8rem" }}>💬</span>
                            <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--accent)", background: "rgba(63,216,255,0.1)", padding: "2px 8px", borderRadius: "4px" }}>PHASE 2</span>
                        </div>
                        <h4 style={{ color: "var(--accent)", fontSize: "1rem", marginBottom: "8px", fontWeight: "700" }}>2. Review Threads & Participants</h4>
                        <p style={{ fontSize: "0.84rem", color: "var(--text-light)", lineHeight: "1.5" }}>
                            Threadline automatically extracts phone numbers, participant handles, and contact aliases into clean dialogue threads. Inverted SMS/MMS timestamps are auto-corrected and multimedia attachments are preserved with file paths.
                        </p>
                    </div>

                    {/* Step 3 */}
                    <div className="preview-card" style={{ textAlign: "left", padding: "22px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                            <span style={{ fontSize: "1.8rem" }}>🔍</span>
                            <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--accent)", background: "rgba(63,216,255,0.1)", padding: "2px 8px", borderRadius: "4px" }}>PHASE 3</span>
                        </div>
                        <h4 style={{ color: "var(--accent)", fontSize: "1rem", marginBottom: "8px", fontWeight: "700" }}>3. Contextual Forensic Search</h4>
                        <p style={{ fontSize: "0.84rem", color: "var(--text-light)", lineHeight: "1.5" }}>
                            Execute multi-word natural queries or strict forensic keywords (e.g., <em>"cash deposit"</em>, <em>"threat"</em>, <em>"meet at 9"</em>). Search results display surrounding context (preceding and subsequent messages) to prevent out-of-context misinterpretation.
                        </p>
                    </div>

                    {/* Step 4 */}
                    <div className="preview-card" style={{ textAlign: "left", padding: "22px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                            <span style={{ fontSize: "1.8rem" }}>📌</span>
                            <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--accent)", background: "rgba(63,216,255,0.1)", padding: "2px 8px", borderRadius: "4px" }}>PHASE 4</span>
                        </div>
                        <h4 style={{ color: "var(--accent)", fontSize: "1rem", marginBottom: "8px", fontWeight: "700" }}>4. Save Evidence Segments</h4>
                        <p style={{ fontSize: "0.84rem", color: "var(--text-light)", lineHeight: "1.5" }}>
                            In the message viewer, check the boxes next to critical messages and click <strong>Save Segment</strong>. Name each segment to reflect its evidentiary significance (e.g., <em>"Alibi Inconsistency 22:15"</em> or <em>"Incriminating Admission"</em>) to tag and preserve it for discovery.
                        </p>
                    </div>

                    {/* Step 5 */}
                    <div className="preview-card" style={{ textAlign: "left", padding: "22px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                            <span style={{ fontSize: "1.8rem" }}>📊</span>
                            <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--accent)", background: "rgba(63,216,255,0.1)", padding: "2px 8px", borderRadius: "4px" }}>PHASE 5</span>
                        </div>
                        <h4 style={{ color: "var(--accent)", fontSize: "1rem", marginBottom: "8px", fontWeight: "700" }}>5. Build Case Threadlines</h4>
                        <p style={{ fontSize: "0.84rem", color: "var(--text-light)", lineHeight: "1.5" }}>
                            Click <strong>+ New Threadline</strong> to initiate an investigation workspace named after your case or suspect. Add entire threads or drag saved evidence segments directly into the workspace to build an incident-specific dossier.
                        </p>
                    </div>

                    {/* Step 6 */}
                    <div className="preview-card" style={{ textAlign: "left", padding: "22px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                            <span style={{ fontSize: "1.8rem" }}>📈</span>
                            <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--accent)", background: "rgba(63,216,255,0.1)", padding: "2px 8px", borderRadius: "4px" }}>PHASE 6</span>
                        </div>
                        <h4 style={{ color: "var(--accent)", fontSize: "1rem", marginBottom: "8px", fontWeight: "700" }}>6. Continuous Timeline Zoom</h4>
                        <p style={{ fontSize: "0.84rem", color: "var(--text-light)", lineHeight: "1.5" }}>
                            Use the interactive Vis-Timeline to pan and zoom across time buckets: <strong>Years &rarr; Months &rarr; Weeks &rarr; Days &rarr; Hours &rarr; Seconds</strong>. Click any day activity spike to immediately isolate and review all messages sent that day.
                        </p>
                    </div>

                    {/* Step 7 */}
                    <div className="preview-card" style={{ textAlign: "left", padding: "22px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                            <span style={{ fontSize: "1.8rem" }}>👥</span>
                            <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--accent)", background: "rgba(63,216,255,0.1)", padding: "2px 8px", borderRadius: "4px" }}>PHASE 7</span>
                        </div>
                        <h4 style={{ color: "var(--accent)", fontSize: "1rem", marginBottom: "8px", fontWeight: "700" }}>7. Multi-Participant Lane Comparison</h4>
                        <p style={{ fontSize: "0.84rem", color: "var(--text-light)", lineHeight: "1.5" }}>
                            Pin multiple conversation threads to plot them in parallel horizontal lanes on the same timeline. Identify cross-talk, coordinated actions, contemporaneous alibis, or periods of total silence across different subjects.
                        </p>
                    </div>

                    {/* Step 8 */}
                    <div className="preview-card" style={{ textAlign: "left", padding: "22px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "12px" }}>
                            <span style={{ fontSize: "1.8rem" }}>⏳</span>
                            <span style={{ fontSize: "0.75rem", fontFamily: "var(--font-mono)", color: "var(--accent)", background: "rgba(63,216,255,0.1)", padding: "2px 8px", borderRadius: "4px" }}>PHASE 8</span>
                        </div>
                        <h4 style={{ color: "var(--accent)", fontSize: "1rem", marginBottom: "8px", fontWeight: "700" }}>8. Temporal Range Filtering</h4>
                        <p style={{ fontSize: "0.84rem", color: "var(--text-light)", lineHeight: "1.5" }}>
                            Set precise <strong>FROM</strong> and <strong>TO</strong> bounds or drag a range on the timeline to isolate the relevant crime window. Click <strong>RESET RANGE</strong> to return to the macro multi-year view.
                        </p>
                    </div>
                </div>
            )}

            {/* TAB 2: FORMATS */}
            {activeTab === "formats" && (
                <div>
                    <div style={{ marginBottom: "18px", color: "var(--text-muted)", fontSize: "0.88rem" }}>
                        Threadline provides built-in parsers for all major mobile extractions, carrier logs, encrypted messaging platforms, and document formats:
                    </div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: "16px" }}>
                        {[
                            { name: "SMS / MMS Backup", ext: ".xml", icon: "📱", desc: "Standard Android/iOS carrier XML backups. Parses senders, recipients, dates, MMS media parts, and resolves inversion." },
                            { name: "HTML Conversation Exports", ext: ".html", icon: "🌐", desc: "Structured HTML chat transcripts from Cellebrite, Oxygen Forensics, or browser backup tools. Normalizes table dialogues." },
                            { name: "Facebook Messenger", ext: ".json", icon: "💬", desc: "Meta/Facebook download-your-information JSON archives. Preserves participants, reactions, and multimedia URIs." },
                            { name: "WhatsApp Chat Archives", ext: ".txt, .zip", icon: "🟢", desc: "Direct WhatsApp exports. Supports both iOS bracketed format and Android dash format, multiline continuation, and ZIP media." },
                            { name: "Signal Messenger", ext: ".txt, .json", icon: "🔵", desc: "Signal encrypted desktop and mobile chat backups. Parses ISO-8601 timestamps, sender handles, and attachment references." },
                            { name: "Email Messages", ext: ".eml, .mbox", icon: "✉️", desc: "RFC 5322 standard email archives. Extracts From, To, CC, Subject, Date, message bodies, and nested headers." },
                            { name: "PDF Documents", ext: ".pdf", icon: "📄", desc: "Formal PDF transcripts, subpoena responses, and forensic reports. Automatically parses tabular transcripts into records." },
                            { name: "Screenshots / OCR", ext: ".png, .jpg, .webp", icon: "📷", desc: "Image evidence and chat screenshots. Processed using local on-device Tesseract OCR to extract timestamps and text." },
                            { name: "Timestamped Server Logs", ext: ".log, .txt", icon: "🖥️", desc: "System, server, and application communication logs with ISO, UNIX epoch, or syslog timestamps." },
                            { name: "Direct Paste Chat Snippets", ext: "Clipboard / Text", icon: "📋", desc: "Instant text ingestion with automatic heuristic format detection (Signal, WhatsApp, Messenger, SMS, Plaintext)." }
                        ].map((fmt, idx) => (
                            <div key={idx} style={{ padding: "18px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px", display: "flex", gap: "14px" }}>
                                <span style={{ fontSize: "1.8rem" }}>{fmt.icon}</span>
                                <div style={{ flex: 1 }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                                        <div style={{ fontWeight: "700", color: "var(--text)", fontSize: "0.92rem" }}>{fmt.name}</div>
                                        <span style={{ color: "var(--success)", fontSize: "0.8rem", fontWeight: "700" }}>✔ ACTIVE</span>
                                    </div>
                                    <div style={{ fontSize: "0.76rem", fontFamily: "var(--font-mono)", color: "var(--accent)", marginBottom: "6px" }}>{fmt.ext}</div>
                                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)", lineHeight: "1.4" }}>{fmt.desc}</div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* TAB 3: CHAIN OF CUSTODY */}
            {activeTab === "custody" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
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
                                    Click <strong>Export .tl Case</strong> in the left sidebar. The system bundles the active database and issues an integrity verification hash that can be recorded directly in investigative case notes.
                                </span>
                            </div>
                            <div style={{ padding: "14px", background: "rgba(255,255,255,0.02)", border: "1px solid var(--border)", borderRadius: "6px" }}>
                                <strong style={{ color: "var(--text)", fontSize: "0.85rem", display: "block", marginBottom: "4px" }}>Importing / Cross-Examinations:</strong>
                                <span style={{ color: "var(--text-muted)", fontSize: "0.8rem", lineHeight: "1.45" }}>
                                    Click <strong>📂 Open .tl Case</strong> to restore any saved case file instantly onto an offline workstation without requiring network access, account sync, or cloud credentials.
                                </span>
                            </div>
                        </div>
                    </div>

                    <div style={{ padding: "22px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <h4 style={{ color: "var(--accent)", fontSize: "1.05rem", fontWeight: "700", marginBottom: "10px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>📑</span> Courtroom Discovery & Export Standards
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

            {/* TAB 4: TIPS & SOP */}
            {activeTab === "tips" && (
                <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div style={{ padding: "20px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <h4 style={{ color: "var(--text)", fontSize: "0.95rem", fontWeight: "700", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>🎯</span> 1. Ingest All Sources Prior to Filtering
                        </h4>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.84rem", lineHeight: "1.5", margin: 0 }}>
                            Always import all available extractions (e.g., suspect device + victim device + carrier records) into the Communications Archive before applying filters. Having all records in the archive enables the system to cross-reference timestamps and identify discrepancies across devices.
                        </p>
                    </div>

                    <div style={{ padding: "20px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <h4 style={{ color: "var(--text)", fontSize: "0.95rem", fontWeight: "700", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>🕒</span> 2. Anchor Searches to Alibi Windows
                        </h4>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.84rem", lineHeight: "1.5", margin: 0 }}>
                            If an incident occurred between 21:00 and 23:30, drag to select that 2.5-hour interval on the timeline first. Subsequent search queries will automatically search exclusively within that temporal window, immediately exposing or corroborating statements.
                        </p>
                    </div>

                    <div style={{ padding: "20px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <h4 style={{ color: "var(--text)", fontSize: "0.95rem", fontWeight: "700", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>📋</span> 3. Direct Paste for Instant Subpoena Triage
                        </h4>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.84rem", lineHeight: "1.5", margin: 0 }}>
                            When receiving raw text transcripts from witnesses or subpoenaed emails, use the <strong>Paste Chat / Text Snippet</strong> tab in the ingestion panel. The heuristic parser automatically identifies the syntax and parses it without requiring file conversion.
                        </p>
                    </div>

                    <div style={{ padding: "20px", background: "var(--panel)", border: "1px solid var(--border)", borderRadius: "8px" }}>
                        <h4 style={{ color: "var(--text)", fontSize: "0.95rem", fontWeight: "700", marginBottom: "8px", display: "flex", alignItems: "center", gap: "8px" }}>
                            <span>🔐</span> 4. Safe Offline Workstation Deployment
                        </h4>
                        <p style={{ color: "var(--text-muted)", fontSize: "0.84rem", lineHeight: "1.5", margin: 0 }}>
                            Threadline can be operated inside air-gapped forensic laboratories. No external network connection is required to parse archives, generate timelines, or search records.
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
