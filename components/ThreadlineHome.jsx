/*
    ThreadlineHome.jsx

    Landing dashboard when no threadline is open.
    Renders welcome context and guides the user to create their first timeline workspace.

    Responsibilities:
    - Present clear, call-to-action welcome screen.
    - Trigger creation form transition when clicked.
*/

// =====================================
// Component
// =====================================

function ThreadlineHome({ onCreate }) {
    return (
        <section className="panel welcome-home" style={{ textAlign: "center", padding: "60px 40px" }}>
            <div style={{ display: "flex", justifyContent: "center", marginBottom: "28px" }}>
                <img 
                    src="/banner-small-print.png" 
                    alt="THREADLINE by LANZAR — Organize • Understand • Timelines That Tell The Truth" 
                    style={{ 
                        width: "100%", 
                        maxWidth: "500px", 
                        height: "auto", 
                        borderRadius: "18px",
                        boxShadow: "0 12px 36px rgba(0, 0, 0, 0.65), 0 0 28px rgba(63, 216, 255, 0.18)",
                        border: "1px solid rgba(255, 255, 255, 0.08)",
                        display: "block"
                    }} 
                />
            </div>
            
            <p style={{ fontSize: "1.2rem", color: "var(--text-light)", marginBottom: "12px" }}>
                A line through time containing the history of human communication.
            </p>
            
            <p style={{ maxWidth: "600px", margin: "0 auto 36px auto", color: "var(--text-muted)", lineHeight: "1.6" }}>
                Organize years of fragmented communication logs (SMS, Google Messages, WhatsApp, Signal, Emails, etc.)
                into one cohesive, searchable, objective historical timeline.
            </p>

            <button
                className="button primary"
                onClick={onCreate}
                style={{ fontSize: "1rem", padding: "14px 36px" }}
            >
                + CREATE A THREADLINE
            </button>
        </section>
    );
}

// =====================================
// Exports
// =====================================

export default ThreadlineHome;