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
import { useState, useEffect } from "react";
import { loadThreadlines, deleteThreadline } from "../services/threadlines";

/*======================================================
                        COMPONENT
======================================================*/

function App(){

	const [threadlines, setThreadlines] = useState([]);

	const [currentThreadline, setCurrentThreadline] = useState(null);

	const [creatingThreadline, setCreatingThreadline] = useState(false);

	const [showingHelp, setShowingHelp] = useState(false);

    /*==============================================
                        AUTH
    ==============================================*/

    const {

        user,

        loading

    } = useAuth();

    /*==============================================
                        LOAD DATA
    ==============================================*/

    useEffect(() => {

        if (user) {

            loadThreadlines(user.uid)

                .then(data => {

                    setThreadlines(data);

                })

                .catch(error => {

                    console.error("Failed to load threadlines:", error);

                });

        } else {

            setThreadlines([]);

            setCurrentThreadline(null);

            setShowingHelp(false);

        }

    }, [user]);

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

				onSelect={(tl) => {
					setCurrentThreadline(tl);
					setShowingHelp(false);
					setCreatingThreadline(false);
				}}

				onNew={() => {
					setCreatingThreadline(true);
					setShowingHelp(false);
					setCurrentThreadline(null);
				}}

				onDelete={async (threadline) => {
					try {
						await deleteThreadline(user.uid, threadline.firestoreId);
						setThreadlines(prev => prev.filter(t => t.firestoreId !== threadline.firestoreId));
						if (currentThreadline?.firestoreId === threadline.firestoreId) {
							setCurrentThreadline(null);
						}
					} catch (error) {
						console.error("Failed to delete threadline:", error);
					}
				}}

				onRename={async (threadline, newName) => {
					try {
						const updated = { ...threadline, title: newName };
						await updateThreadline(user.uid, updated);
						setThreadlines(prev => prev.map(t => t.firestoreId === threadline.firestoreId ? updated : t));
						if (currentThreadline?.firestoreId === threadline.firestoreId) {
							setCurrentThreadline(updated);
						}
					} catch (error) {
						console.error("Failed to rename threadline:", error);
					}
				}}

				onShowHelp={() => {
					setShowingHelp(true);
					setCurrentThreadline(null);
					setCreatingThreadline(false);
				}}

			/>

			<Workspace

				threadlines={threadlines}

				setThreadlines={setThreadlines}

				currentThreadline={currentThreadline}

				setCurrentThreadline={setCurrentThreadline}

				creatingThreadline={creatingThreadline}

				setCreatingThreadline={setCreatingThreadline}

				showingHelp={showingHelp}

				setShowingHelp={setShowingHelp}

			/>

			<StatusBar />

		</div>

    );

}

/*======================================================
                        EXPORTS
======================================================*/

export default App;