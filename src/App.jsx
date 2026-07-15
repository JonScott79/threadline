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
import { useState } from "react";

/*======================================================
                        COMPONENT
======================================================*/

function App(){

	const [threadlines, setThreadlines] = useState([]);

	const [currentThreadline, setCurrentThreadline] = useState(null);

	const [creatingThreadline, setCreatingThreadline] = useState(false);
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

			<Sidebar

				threadlines={threadlines}

				currentThreadline={currentThreadline}

				onSelect={setCurrentThreadline}

				onNew={() => setCreatingThreadline(true)}

			/>

			<Workspace

				threadlines={threadlines}

				setThreadlines={setThreadlines}

				currentThreadline={currentThreadline}

				setCurrentThreadline={setCurrentThreadline}

				creatingThreadline={creatingThreadline}

				setCreatingThreadline={setCreatingThreadline}

			/>

			<StatusBar />

		</div>

    );

}

/*======================================================
                        EXPORTS
======================================================*/

export default App;