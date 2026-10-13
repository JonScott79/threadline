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

                <div className="import-item"><span className="check">✔</span>SMS Backup & Restore (.xml)</div>

                <div className="import-item"><span className="check">✔</span>HTML Conversation Exports (.html)</div>

                <div className="import-item"><span className="check">✔</span>Communication Logs (.log, .txt)</div>

                <div className="import-item"><span className="check">✔</span>Facebook Messenger (.json)</div>

                <div className="import-item"><span className="check">✔</span>WhatsApp (.txt, .zip)</div>

                <div className="import-item"><span className="check">✔</span>Signal (.txt, .json)</div>

                <div className="import-item"><span className="check">✔</span>Email (.eml, .mbox)</div>

                <div className="import-item"><span className="check">✔</span>PDF Documents (.pdf)</div>

                <div className="import-item"><span className="check">✔</span>Screenshots / OCR (.png, .jpg, .webp)</div>

                <div className="import-item"><span className="check">✔</span>Direct Paste Snippets (Text / Chat)</div>

            </div>

        </section>

    );

}

export default SupportedImports;
