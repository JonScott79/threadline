/*======================================================
                        IMPORTS
======================================================*/

import {

    handleDragOver,

    handleDragEnter,

    handleDragLeave,

    handleDrop,

    handleBrowse

} from "../js/import/dragdrop";

/*======================================================
                    UPLOAD PANEL
======================================================*/

function UploadPanel(){

    return(

        <section className="panel upload-panel">

            <input

                id="archive-upload"

                type="file"

                hidden

                onChange={handleBrowse}

            />

            <label

                htmlFor="archive-upload"

                className="upload-area"

                onDragOver={handleDragOver}

                onDragEnter={handleDragEnter}

                onDragLeave={handleDragLeave}

                onDrop={handleDrop}

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