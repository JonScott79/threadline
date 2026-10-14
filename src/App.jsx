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
import { loadThreadlines, deleteThreadline, updateThreadline } from "../services/threadlines";
import axios from "axios";
import { API_BASE_URL } from "./apiConfig";

/*======================================================
                        COMPONENT
======================================================*/

function App(){

	const [threadlines, setThreadlines] = useState([]);

	const [currentThreadline, setCurrentThreadline] = useState(null);

	const [creatingThreadline, setCreatingThreadline] = useState(false);

	const [showingHelp, setShowingHelp] = useState(false);

	const [mobileSidebarOpen, setMobileSidebarOpen] = useState(false);

    /*==============================================
                        AUTH
    ==============================================*/

    const { user, loading } = useAuth();

    /*==============================================
                        LOAD DATA
    ==============================================*/

    useEffect(() => {

        if (user) {

            loadThreadlines(user.uid)
                .then(data => {
                    setThreadlines(data);
                    if (data && data.length > 0) {
                        setCurrentThreadline(prev => prev || data[0]);
                    }
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

			{/* Mobile Header Bar */}
			<header className="mobile-header">
				<button 
					type="button" 
					className="mobile-header-btn" 
					onClick={() => setMobileSidebarOpen(prev => !prev)}
					aria-label="Toggle navigation menu"
				>
					<span style={{ fontSize: "1.2rem", lineHeight: 1 }}>☰</span>
					<span style={{ fontSize: "0.75rem", fontWeight: "700", letterSpacing: "1px" }}>MENU</span>
				</button>
				<div className="mobile-header-title" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
					<img 
						src="/logo-icon.png" 
						alt="Threadline" 
						style={{ 
							width: "24px", 
							height: "24px", 
							borderRadius: "6px",
							boxShadow: "0 0 10px rgba(63, 216, 255, 0.35)",
							flexShrink: 0
						}} 
					/>
					<span style={{ color: "var(--accent)", fontWeight: "800", letterSpacing: "1.5px", fontSize: "0.9rem" }}>
						THREADLINE
					</span>
				</div>
				<button 
					type="button" 
					className="mobile-header-btn" 
					onClick={() => {
						setShowingHelp(true);
						setCurrentThreadline(null);
						setCreatingThreadline(false);
						setMobileSidebarOpen(false);
					}}
					title="Investigative Help Center"
				>
					<span>📘</span>
					<span style={{ fontSize: "0.75rem", fontWeight: "600" }}>HELP</span>
				</button>
			</header>

			{/* Backdrop for off-canvas drawer on mobile */}
			{mobileSidebarOpen && (
				<div 
					className="sidebar-backdrop" 
					onClick={() => setMobileSidebarOpen(false)}
				/>
			)}

			<Sidebar
				isOpenMobile={mobileSidebarOpen}
				onCloseMobile={() => setMobileSidebarOpen(false)}

				onCaseImported={(importedCase) => {
					setThreadlines(prev => [importedCase, ...prev.filter(t => (t.firestoreId || t.id) !== (importedCase.firestoreId || importedCase.id))]);
					setCurrentThreadline(importedCase);
					setCreatingThreadline(false);
					setShowingHelp(false);
				}}

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
						await deleteThreadline(user.uid, threadline.firestoreId || threadline.id);
						setThreadlines(prev => prev.filter(t => (t.firestoreId || t.id) !== (threadline.firestoreId || threadline.id)));
						if ((currentThreadline?.firestoreId || currentThreadline?.id) === (threadline.firestoreId || threadline.id)) {
							setCurrentThreadline(null);
						}
					} catch (error) {
						console.error("Failed to delete threadline:", error);
						throw error;
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

				onDelete={async (threadline) => {
					try {
						await deleteThreadline(user.uid, threadline.firestoreId || threadline.id);
						setThreadlines(prev => prev.filter(t => (t.firestoreId || t.id) !== (threadline.firestoreId || threadline.id)));
						if ((currentThreadline?.firestoreId || currentThreadline?.id) === (threadline.firestoreId || threadline.id)) {
							setCurrentThreadline(null);
						}
					} catch (error) {
						console.error("Failed to delete threadline:", error);
						throw error;
					}
				}}

			/>

			<StatusBar />

		</div>

    );

}

/*======================================================
                        EXPORTS
======================================================*/

export default App;