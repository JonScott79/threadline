/*======================================================
                        IMPORT PREVIEW
======================================================*/

function ImportPreview({ result }){

    if(!result){

        return null;

    }

    return(

        <section className="panel import-preview">

            <h3>IMPORT SUMMARY</h3>

            <div className="import-grid">

                <div>

                    <strong>Platform</strong>

                    <p>{result.detected}</p>

                </div>

                <div>

                    <strong>Confidence</strong>

                    <p>{result.confidence}%</p>

                </div>

                <div>

                    <strong>Messages</strong>

                    <p>{result.messageCount}</p>

                </div>

                <div>

                    <strong>Conversations</strong>

                    <p>{result.conversationCount}</p>

                </div>

                <div>

                    <strong>Original File</strong>

                    <p>{result.originalName}</p>

                </div>

            </div>

        </section>

    );

}

export default ImportPreview;