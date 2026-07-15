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
import Login from "../components/Login";

import { useAuth } from "../auth/AuthProvider";

/*======================================================
                        COMPONENT
======================================================*/

function App(){

    /*==============================================
                        AUTH
    ==============================================*/

    const {

        user,

        loading

    } = useAuth();

    /*==============================================
                        LOADING
    ==============================================*/

    if(loading){

        return(

            <h1>

                Loading...

            </h1>

        );

    }

    /*==============================================
                        LOGIN
    ==============================================*/

    if(!user){

        return(

            <Login />

        );

    }

    /*==============================================
                        APPLICATION
    ==============================================*/

    return(

        <div className="application">

            <Sidebar />

            <Workspace />

            <StatusBar />

        </div>

    );

}

/*======================================================
                        EXPORTS
======================================================*/

export default App;