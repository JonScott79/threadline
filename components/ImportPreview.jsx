/*======================================================
                        IMPORT PREVIEW
======================================================*/

function ImportPreview({ result }){

    if(!result){
        return null;
    }

    const stats = result.stats || {
        discovered: result.messageCount,
        imported: result.messageCount,
        skipped: 0,
        failed: 0
    };

    const errors = result.errors || [];

    return(
        <section className="panel import-preview" style={{ marginTop: "24px" }}>
            <h3 style={{ textTransform: "uppercase", letterSpacing: "2px", fontSize: "0.9rem", color: "var(--accent)" }}>IMPORT SUMMARY</h3>

            <div className="import-grid" style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: "12px", marginTop: "12px" }}>
                <div className="preview-card" style={{ background: "rgba(255,255,255,0.05)", padding: "12px", borderRadius: "6px" }}>
                    <strong>Discovered</strong>
                    <p style={{ margin: "4px 0 0", fontSize: "1.2rem", fontWeight: "bold" }}>{stats.discovered.toLocaleString()}</p>
                </div>

                <div className="preview-card" style={{ background: "rgba(48, 209, 88, 0.15)", border: "1px solid rgba(48, 209, 88, 0.3)", padding: "12px", borderRadius: "6px" }}>
                    <strong style={{ color: "#30d158" }}>Imported</strong>
                    <p style={{ margin: "4px 0 0", fontSize: "1.2rem", fontWeight: "bold", color: "#30d158" }}>{stats.imported.toLocaleString()}</p>
                </div>

                <div className="preview-card" style={{ background: stats.skipped > 0 ? "rgba(255, 159, 10, 0.15)" : "rgba(255,255,255,0.05)", border: stats.skipped > 0 ? "1px solid rgba(255, 159, 10, 0.3)" : "none", padding: "12px", borderRadius: "6px" }}>
                    <strong style={{ color: stats.skipped > 0 ? "#ff9f0a" : "inherit" }}>Skipped / Unmapped</strong>
                    <p style={{ margin: "4px 0 0", fontSize: "1.2rem", fontWeight: "bold", color: stats.skipped > 0 ? "#ff9f0a" : "inherit" }}>{stats.skipped.toLocaleString()}</p>
                </div>
            </div>

            <div className="import-grid" style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: "12px", marginTop: "12px" }}>
                <div className="preview-card" style={{ background: "rgba(255,255,255,0.05)", padding: "12px", borderRadius: "6px" }}>
                    <strong>Platform</strong>
                    <p style={{ margin: "4px 0 0" }}>{result.detected || result.platform || "Unknown"}</p>
                </div>

                <div className="preview-card" style={{ background: "rgba(255,255,255,0.05)", padding: "12px", borderRadius: "6px" }}>
                    <strong>Conversations</strong>
                    <p style={{ margin: "4px 0 0" }}>{result.conversationCount.toLocaleString()}</p>
                </div>
            </div>

            {errors.length > 0 && (
                <div className="import-errors" style={{ marginTop: "16px", padding: "12px", background: "rgba(255, 69, 58, 0.1)", border: "1px solid rgba(255, 69, 58, 0.3)", borderRadius: "6px" }}>
                    <strong style={{ color: "#ff453a", display: "block", marginBottom: "6px" }}>Import Warnings / Skipped Records ({errors.length}):</strong>
                    <ul style={{ margin: 0, paddingLeft: "20px", fontSize: "0.85rem", color: "rgba(255,255,255,0.7)", maxHeight: "150px", overflowY: "auto" }}>
                        {errors.map((err, i) => (
                            <li key={i} style={{ marginBottom: "4px" }}>{err}</li>
                        ))}
                    </ul>
                </div>
            )}
        </section>
    );
}

export default ImportPreview;