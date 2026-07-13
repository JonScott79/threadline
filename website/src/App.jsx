/*======================================================
                        IMPORTS
======================================================*/

import "../css/theme.css";
import "../css/main.css";
import "../css/components.css";
import "../css/animation.css";
import "../css/responsive.css";

import Sidebar from "../components/Sidebar";
import Workspace from "../components/Workspace";
import StatusBar from "../components/StatusBar";

/*======================================================
                        APP
======================================================*/

function App(){

    return(

        <div className="application">

            <Sidebar />

            <Workspace />

            <StatusBar />

        </div>

    );

}

export default App;