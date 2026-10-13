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

                <div className="import-item"><span className="check">{"\u2714"}</span>SMS Backup &amp; Restore (.xml)</div>

                <div className="import-item"><span className="check">{"\u2714"}</span>HTML Conversation Exports (.html)</div>

                <div className="import-item"><span className="check">{"\u2714"}</span>Communication Logs (.log, .txt)</div>

                <div className="import-item"><span className="check">{"\u2714"}</span>Facebook Messenger (.json)</div>

                <div className="import-item"><span className="check">{"\u2714"}</span>WhatsApp (.txt, .zip)</div>

                <div className="import-item"><span className="check">{"\u2714"}</span>Signal (.txt, .json)</div>

                <div className="import-item"><span className="check">{"\u2714"}</span>Email (.eml, .mbox)</div>

                <div className="import-item"><span className="check">{"\u2714"}</span>PDF Documents (.pdf)</div>

                <div className="import-item"><span className="check">{"\u2714"}</span>Screenshots / OCR (.png, .jpg, .webp)</div>

                <div className="import-item"><span className="check">{"\u2714"}</span>Direct Paste Snippets (Text / Chat)</div>

            </div>

        </section>

    );

}

export default SupportedImports;
