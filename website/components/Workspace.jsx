/*======================================================
                        IMPORTS
======================================================*/

import { useState } from "react";

import SupportedImports from "./SupportedImports";
import UploadPanel from "./UploadPanel";
import ImportPreview from "./ImportPreview";

/*======================================================
                        COMPONENT
======================================================*/

function Workspace(){

    const [importResult, setImportResult] = useState(null);

    return(

        <section className="workspace">

            <SupportedImports />

            <UploadPanel

                setImportResult={setImportResult}

            />

            <ImportPreview

                result={importResult}

            />

        </section>

    );

}

/*======================================================
                        EXPORTS
======================================================*/

export default Workspace;