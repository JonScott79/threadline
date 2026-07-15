/*======================================================
                        IMPORTS
======================================================*/

import {

    handleDragOver,
    handleDragEnter,
    handleDragLeave,
    handleDrop,
    handleBrowse

} from "../js/imports/dragdrop";

/*======================================================
                    UPLOAD PANEL
======================================================*/

function UploadPanel({

    setImportResult

}){

    return(

        <section className="panel upload-panel">

            <input

                id="archive-upload"

                type="file"

                hidden

                onChange={(event)=>

					handleBrowse(

						event,

						setImportResult

					)

				}

            />

            <label

                htmlFor="archive-upload"

                className="upload-area"

                onDragOver={handleDragOver}

                onDragEnter={handleDragEnter}

                onDragLeave={handleDragLeave}

                onDrop={(event)=>

					handleDrop(

						event,

						setImportResult

					)

				}

            >

                <h3>

                    DROP ARCHIVE HERE

                </h3>

                <p>

                    Drag & Drop your archive or click anywhere inside this panel.

                </p>

            </label>

        </section>

    );

}

export default UploadPanel;