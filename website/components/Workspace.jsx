/*======================================================
                        IMPORTS
======================================================*/

import Header from "./Header";
import SupportedImports from "./SupportedImports";
import UploadPanel from "./UploadPanel";

/*======================================================
                        WORKSPACE
======================================================*/

function Workspace(){

    return(

        <section className="workspace">

            <Header />

            <SupportedImports />

            <UploadPanel />

        </section>

    );

}

export default Workspace;