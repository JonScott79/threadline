/*======================================================
                        IMPORTS
======================================================*/

import { useState } from "react";

import SupportedImports from "./SupportedImports";

import UploadPanel from "./UploadPanel";

import ImportPreview from "./ImportPreview";

/*======================================================
                THREADLINE WORKSPACE
======================================================*/

function ThreadlineWorkspace({

    threadline

}){

    const [

        importResult,

        setImportResult

    ] = useState(null);

    return(

        <>

            <section className="panel hero">

                <h2>

                    {threadline.title}

                </h2>

            </section>

            <SupportedImports />

            <UploadPanel

                setImportResult={setImportResult}

            />

            <ImportPreview

                result={importResult}

            />

        </>

    );

}

/*======================================================
                        EXPORTS
======================================================*/

export default ThreadlineWorkspace;