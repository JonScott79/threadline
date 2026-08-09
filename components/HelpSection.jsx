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
                    Think of Threadline as a <strong>time machine for your text messages</strong>. If you have years of chat logs from different people, it can be really hard to find when things happened. Threadline helps you import those logs, visualizes them on a glowing "heartbeat" timeline, and lets you search them using everyday human questions!
                </p>
            </section>

            {/* Instruction Grid */}
            <div className="import-grid" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(280px, 1fr))", gap: "20px" }}>
                {/* Step 1 */}
                <div className="preview-card" style={{ textAlign: "left", padding: "20px" }}>
                    <div style={{ fontSize: "2rem", marginBottom: "12px" }}>📁</div>
                    <h4 style={{ color: "var(--accent)", fontSize: "1rem", marginBottom: "8px", fontWeight: "700" }}>1. Create a Threadline</h4>
                    <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: "1.4" }}>
                        Click on <strong>+ New Threadline</strong> in the left sidebar. Type a name for your workspace (like "My Family Log" or "Work Chats") and hit Create. If you leave the name blank, we'll automatically name it for you!
                    </p>
                </div>

                {/* Step 2 */}
                <div className="preview-card" style={{ textAlign: "left", padding: "20px" }}>
                    <div style={{ fontSize: "2rem", marginBottom: "12px" }}>📥</div>
                    <h4 style={{ color: "var(--accent)", fontSize: "1rem", marginBottom: "8px", fontWeight: "700" }}>2. Drop Your Messages</h4>
                    <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: "1.4" }}>
                        Open your new empty Threadline. Drag and drop your XML backup file or HTML conversation export (like <code>darcy.html</code>) directly into the dashed box. We'll automatically inspect and load the messages in seconds!
                    </p>
                </div>

                {/* Step 3 */}
                <div className="preview-card" style={{ textAlign: "left", padding: "20px" }}>
                    <div style={{ fontSize: "2rem", marginBottom: "12px" }}>📈</div>
                    <h4 style={{ color: "var(--accent)", fontSize: "1rem", marginBottom: "8px", fontWeight: "700" }}>3. Zoom the Heartbeat Wave</h4>
                    <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: "1.4" }}>
                        The timeline graph at the top looks like a heartbeat. The higher the wave, the more you were talking! Click on the spikes to zoom in: <strong>Years &rarr; Months &rarr; Days</strong>. Clicking a day loads the chronological transcript of that day!
                    </p>
                </div>

                {/* Step 4 */}
                <div className="preview-card" style={{ textAlign: "left", padding: "20px" }}>
                    <div style={{ fontSize: "2rem", marginBottom: "12px" }}>🔍</div>
                    <h4 style={{ color: "var(--accent)", fontSize: "1rem", marginBottom: "8px", fontWeight: "700" }}>4. Search in Plain English</h4>
                    <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: "1.4" }}>
                        Go to the Search tab on the left. Type normal questions like <em>"visitation in October"</em> or <em>"shopping in Florida"</em>. We will search for concepts, dates, and people, ranking them as High/Medium/Low relevance, and show you the messages before and after!
                    </p>
                </div>

                {/* Step 5 */}
                <div className="preview-card" style={{ textAlign: "left", padding: "20px" }}>
                    <div style={{ fontSize: "2rem", marginBottom: "12px" }}>📌</div>
                    <h4 style={{ color: "var(--accent)", fontSize: "1rem", marginBottom: "8px", fontWeight: "700" }}>5. Drag & Compare Swimlanes</h4>
                    <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: "1.4" }}>
                        Want to look at two conversations side-by-side? Click the pin (📌) next to a thread or drag a search card directly onto the timeline! We will map them in separate swimlanes so you can spot overlaps in dates and times.
                    </p>
                </div>

                {/* Step 6 */}
                <div className="preview-card" style={{ textAlign: "left", padding: "20px" }}>
                    <div style={{ fontSize: "2rem", marginBottom: "12px" }}>⏳</div>
                    <h4 style={{ color: "var(--accent)", fontSize: "1rem", marginBottom: "8px", fontWeight: "700" }}>6. Filter Time Ranges</h4>
                    <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: "1.4" }}>
                        Use the <strong>FROM</strong> and <strong>TO</strong> date pickers at the top to narrow down your timeline. To see the full chat context of any single thread, check the <strong>Show Full Conversation</strong> box in the chat header.
                    </p>
                </div>

                {/* Step 7 */}
                <div className="preview-card" style={{ textAlign: "left", padding: "20px" }}>
                    <div style={{ fontSize: "2rem", marginBottom: "12px" }}>🔀</div>
                    <h4 style={{ color: "var(--accent)", fontSize: "1rem", marginBottom: "8px", fontWeight: "700" }}>7. Overlap Workspaces</h4>
                    <p style={{ fontSize: "0.82rem", color: "var(--text-muted)", lineHeight: "1.4" }}>
                        Want to compare two different backup files side-by-side? Check the checkboxes next to their names in the left sidebar. Click the green <strong>Compare Selected</strong> button to merge their active messages, visual timelines, and searches!
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
