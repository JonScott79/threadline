/*
    HelpSection.jsx

    Threadline user guide and interactive handbook.
    Provides clear, visual explanations of core concepts (timelines, imports, contextual search, drag-and-drop)
    written in simple, accessible language that anyone (even a 12-year-old) can quickly grasp.
*/

// =====================================
// Imports
// =====================================

import React from "react";

// =====================================
// Component
// =====================================

function HelpSection({ onBack }) {
    return (
        <div className="workspace-dashboard empty-state" style={{ overflowY: "auto", padding: "30px 40px" }}>
            {/* Section Header */}
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "30px" }}>
                <div>
                    <h2 style={{ color: "var(--accent)", letterSpacing: "2px", textTransform: "uppercase", fontSize: "1.6rem" }}>
                        📖 THREADLINE HELP CENTRE
                    </h2>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "4px" }}>
                        Learn how to load, search, and analyze your communication timelines!
                    </p>
                </div>
                {onBack && (
                    <button 
                        className="button primary" 
                        onClick={onBack}
                        style={{ padding: "8px 20px", fontSize: "0.8rem", height: "36px" }}
                    >
                        &larr; BACK TO WORKSPACE
                    </button>
                )}
            </div>

            {/* Introductory Hero Card */}
            <section className="panel hero" style={{ padding: "30px", marginBottom: "24px" }}>
                <h3 style={{ fontSize: "1.3rem", fontWeight: "600", color: "var(--text-light)", marginBottom: "12px", textAlign: "left" }}>
                    🚀 What is Threadline?
                </h3>
                <p style={{ color: "var(--text-light)", fontSize: "0.95rem", lineHeight: "1.6", textAlign: "left" }}>
                    Think of Threadline as a <strong>time machine for your text messages</strong>. If you have years of chat logs from different files and backups, finding when key conversations occurred is difficult. Threadline helps you import those logs into a unified <strong>Communications Archive</strong>, normalizes them into clean chat <strong>Threads</strong>, and lets you search them using everyday human queries. You can then save key snippets as <strong>Saved Segments</strong> and assemble them onto custom <strong>Threadline</strong> workspaces for deep visual timelines!
                </p>
            </section>

            {/* Instruction Grid */}
            <div className="import-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
                {/* Step 1 */}
                <div className="preview-card" style={{ textAlign: "left", padding: "20px" }}>
                    <div style={{ fontSize: "2rem", marginBottom: "12px" }}>📥</div>
                    <h4 style={{ color: "var(--accent)", fontSize: "1rem", marginBottom: "8px", fontWeight: "700" }}>1. Import History</h4>
                    <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: "1.4" }}>
                        Click on <strong>📁 Communications Archive</strong> in the left sidebar. Drag and drop your SMS backup XML file or HTML conversation logs directly into the ingestion panel to load them into your private local database.
                    </p>
                </div>

                {/* Step 2 */}
                <div className="preview-card" style={{ textAlign: "left", padding: "20px" }}>
                    <div style={{ fontSize: "2rem", marginBottom: "12px" }}>💬</div>
                    <h4 style={{ color: "var(--accent)", fontSize: "1rem", marginBottom: "8px", fontWeight: "700" }}>2. Explore Your Threads</h4>
                    <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: "1.4" }}>
                        Open the <strong>Threads</strong> tab in the Archive. Threadline automatically parses participants, maps timelines, and groups thousands of messages into clean, unified conversation threads ready to view.
                    </p>
                </div>

                {/* Step 3 */}
                <div className="preview-card" style={{ textAlign: "left", padding: "20px" }}>
                    <div style={{ fontSize: "2rem", marginBottom: "12px" }}>🔍</div>
                    <h4 style={{ color: "var(--accent)", fontSize: "1rem", marginBottom: "8px", fontWeight: "700" }}>3. Search in Plain English</h4>
                    <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: "1.4" }}>
                        Go to the <strong>Search</strong> tab. Type everyday natural language queries like <em>"visitation in October"</em> or <em>"shopping in Florida"</em>. The concept system matches synonyms, ranks matches, and retrieves surrounding message contexts.
                    </p>
                </div>

                {/* Step 4 */}
                <div className="preview-card" style={{ textAlign: "left", padding: "20px" }}>
                    <div style={{ fontSize: "2rem", marginBottom: "12px" }}>💾</div>
                    <h4 style={{ color: "var(--accent)", fontSize: "1rem", marginBottom: "8px", fontWeight: "700" }}>4. Save What Matters</h4>
                    <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: "1.4" }}>
                        In the thread viewer, check the boxes next to relevant messages, then click <strong>💾 Save Segment</strong> at the bottom. Give your segment a title (e.g., "Visitation Dispute") to preserve that specific context snippet.
                    </p>
                </div>

                {/* Step 5 */}
                <div className="preview-card" style={{ textAlign: "left", padding: "20px" }}>
                    <div style={{ fontSize: "2rem", marginBottom: "12px" }}>🛠️</div>
                    <h4 style={{ color: "var(--accent)", fontSize: "1rem", marginBottom: "8px", fontWeight: "700" }}>5. Build a Threadline</h4>
                    <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: "1.4" }}>
                        Click <strong>+ New Threadline</strong> to create a custom research timeline workspace. Give it a subject name. You can then add entire threads from the <strong>Threads</strong> tab or drag Saved Segments directly onto it!
                    </p>
                </div>

                {/* Step 6 */}
                <div className="preview-card" style={{ textAlign: "left", padding: "20px" }}>
                    <div style={{ fontSize: "2rem", marginBottom: "12px" }}>📈</div>
                    <h4 style={{ color: "var(--accent)", fontSize: "1rem", marginBottom: "8px", fontWeight: "700" }}>6. Explore the Timeline</h4>
                    <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: "1.4" }}>
                        Click on timeline spikes to zoom down: <strong>Years &rarr; Months &rarr; Days</strong>. Clicking on a day displays a chronological report of all message events that occurred across your linked conversations.
                    </p>
                </div>

                {/* Step 7 */}
                <div className="preview-card" style={{ textAlign: "left", padding: "20px" }}>
                    <div style={{ fontSize: "2rem", marginBottom: "12px" }}>📌</div>
                    <h4 style={{ color: "var(--accent)", fontSize: "1rem", marginBottom: "8px", fontWeight: "700" }}>7. Compare Threads</h4>
                    <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: "1.4" }}>
                        Pin multiple threads using the pin (📌) button to compare them on the shared timeline workspace. Each pinned conversation gets its own lane so you can analyze overlapping dates and times side-by-side.
                    </p>
                </div>

                {/* Step 8 */}
                <div className="preview-card" style={{ textAlign: "left", padding: "20px" }}>
                    <div style={{ fontSize: "2rem", marginBottom: "12px" }}>⏳</div>
                    <h4 style={{ color: "var(--accent)", fontSize: "1rem", marginBottom: "8px", fontWeight: "700" }}>8. Filter Time</h4>
                    <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: "1.4" }}>
                        Use the <strong>FROM</strong> and <strong>TO</strong> inputs at the top to focus your research. Click <strong>RESET RANGE</strong> to expand the temporal bounds and display the entire timeline history.
                    </p>
                </div>
            </div>

            {/* Quick Tips */}
            <div className="panel" style={{ padding: "20px", marginTop: "24px" }}>
                <h4 style={{ color: "var(--text-light)", marginBottom: "10px", fontSize: "0.95rem", fontWeight: "700" }}>💡 Pro Tips for Analysis:</h4>
                <ul style={{ color: "var(--text-muted)", fontSize: "0.82rem", paddingLeft: "20px", lineHeight: "1.6" }}>
                    <li>Click <strong>RESET RANGE</strong> to clear your date filters and view the whole timeline.</li>
                    <li>If you click a day spike on the timeline first, any search term you enter will automatically narrow down to just search inside that single day! Click "Search Globally" in the search box to clear it.</li>
                    <li>All data is saved completely offline inside your local database. It is 100% private and never leaves your computer!</li>
                </ul>
            </div>
        </div>
    );
}

// =====================================
// Exports
// =====================================

export default HelpSection;
