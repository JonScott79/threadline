/*======================================================
                        IMPORTS
======================================================*/

function SupportedImports(){

    return(

        <section className="panel imports">

            <h3>

                SUPPORTED IMPORT SOURCES

            </h3>

            <div className="import-grid">

                <div className="import-item"><span className="check">✓</span>SMS Backup & Restore (.xml)</div>

                <div className="import-item"><span className="check">✓</span>HTML Conversation Exports</div>

                <div className="import-item"><span className="planned">⌛</span>Facebook Messenger (Planned)</div>

                <div className="import-item"><span className="planned">⌛</span>WhatsApp (Planned)</div>

                <div className="import-item"><span className="planned">⌛</span>Signal (Planned)</div>

                <div className="import-item"><span className="planned">⌛</span>Email (Planned)</div>

                <div className="import-item"><span className="planned">⌛</span>PDF Documents (Planned)</div>

                <div className="import-item"><span className="planned">⌛</span>Screenshots / OCR (Planned)</div>

            </div>

        </section>

    );

}

export default SupportedImports;