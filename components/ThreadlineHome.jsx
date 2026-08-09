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
            <h1 style={{ fontSize: "3rem", color: "var(--accent)", letterSpacing: "0.2rem", marginBottom: "16px" }}>
                THREADLINE
            </h1>
            
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