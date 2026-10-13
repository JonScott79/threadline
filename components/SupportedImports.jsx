/*======================================================
    SupportedImports.jsx
    Displays supported data sources with high-tech badges
    matching the Threadline logo aesthetic.
======================================================*/

function SupportedImports({ compact = false }) {
    const sources = [
        "SMS Backup & Restore (.xml)",
        "HTML Conversation Exports (.html)",
        "Communication Logs (.log, .txt)",
        "Facebook Messenger (.json)",
        "WhatsApp (.txt, .zip)",
        "Signal (.txt, .json)",
        "Email (.eml, .mbox)",
        "PDF Documents (.pdf)",
        "Screenshots / OCR (.png, .jpg, .webp)",
        "Direct Paste Snippets (Text / Chat)"
    ];

    return (
        <section 
            className="imports"
            style={{
                width: "100%",
                maxWidth: "1000px",
                borderRadius: compact ? "12px" : "18px",
                border: "1px solid rgba(0, 208, 255, 0.18)",
                background: "linear-gradient(180deg, rgba(12, 19, 31, 0.7) 0%, rgba(6, 11, 18, 0.9) 100%)",
                boxShadow: "0 12px 30px rgba(0, 0, 0, 0.5), 0 0 20px rgba(0, 208, 255, 0.08)",
                padding: compact ? "14px 18px" : "24px 32px",
                position: "relative",
                boxSizing: "border-box"
            }}
        >
            <h3 style={{ 
                textAlign: "center", 
                marginBottom: compact ? "10px" : "18px", 
                letterSpacing: "1.5px", 
                fontSize: compact ? "0.82rem" : "0.92rem", 
                fontWeight: "800",
                color: "#00D0FF",
                textShadow: "0 0 14px rgba(0, 208, 255, 0.4)"
            }}>
                SUPPORTED IMPORT SOURCES
            </h3>

            <div 
                className="import-grid" 
                style={{ 
                    display: "grid", 
                    gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", 
                    gap: compact ? "8px" : "12px" 
                }}
            >
                {sources.map((src) => (
                    <div 
                        key={src}
                        style={{
                            display: "flex",
                            alignItems: "center",
                            gap: "8px",
                            fontSize: compact ? "0.76rem" : "0.82rem",
                            color: "var(--text-light)",
                            fontWeight: "600",
                            padding: compact ? "5px 9px" : "6px 10px",
                            borderRadius: "6px",
                            background: "rgba(255, 255, 255, 0.02)",
                            border: "1px solid rgba(255, 255, 255, 0.05)"
                        }}
                    >
                        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#30D158" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}>
                            <polyline points="20 6 9 17 4 12" />
                        </svg>
                        <span>{src}</span>
                    </div>
                ))}
            </div>
        </section>
    );
}

export default SupportedImports;
