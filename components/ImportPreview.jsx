/*======================================================
                        IMPORT PREVIEW
======================================================*/

function ImportPreview({ result }){

    if(!result){

        return null;

    }

    return(

        <section className="panel import-preview" style={{ marginTop: "24px" }}>

            <h3 style={{ textTransform: "uppercase", letterSpacing: "2px", fontSize: "0.9rem", color: "var(--accent)" }}>IMPORT SUMMARY</h3>

            <div className="import-grid">

                <div className="preview-card">

                    <strong>Platform</strong>

                    <p>{result.detected || result.platform || "Unknown"}</p>

                </div>

                <div className="preview-card">

                    <strong>Confidence</strong>

                    <p>{result.confidence}%</p>

                </div>

                <div className="preview-card">

                    <strong>Messages</strong>

                    <p>{result.messageCount.toLocaleString()}</p>

                </div>

                <div className="preview-card">

                    <strong>Conversations</strong>

                    <p>{result.conversationCount.toLocaleString()}</p>

                </div>

                <div className="preview-card" style={{ gridColumn: "span 2" }}>

                    <strong>Original File</strong>

                    <p style={{ wordBreak: "break-all", fontSize: "1rem" }}>{result.originalName}</p>

                </div>

            </div>

        </section>

    );

}

export default ImportPreview;