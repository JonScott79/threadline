/*
    Workspace.jsx

    Main layout workspace router.
    Resolves what panel content to render based on the current user session
    and active navigation parameters.

    Responsibilities:
    - Load HelpSection when showingHelp state is active.
    - Load ThreadlineWorkspace when a threadline is selected.
    - Load NewThreadline form when creating a new workspace.
    - Fallback to ThreadlineHome welcome dashboard.
*/

// =====================================
// Imports
// =====================================

import ThreadlineHome from "./ThreadlineHome";
import NewThreadline from "./NewThreadline";
import ThreadlineWorkspace from "./ThreadlineWorkspace";
import HelpSection from "./HelpSection";

import { useAuth } from "../auth/AuthProvider";
import { saveThreadline } from "../services/threadlines";

// =====================================
// Component
// =====================================

function Workspace({
    threadlines,
    setThreadlines,
    currentThreadline,
    setCurrentThreadline,
    creatingThreadline,
    setCreatingThreadline,
    showingHelp,
    setShowingHelp,
    archiveEmpty,
    refreshArchiveStatus
}){
    /*==============================================
                        STATE
    ==============================================*/

    const { user } = useAuth();

    /*==============================================
                        RENDER
    ==============================================*/

    const isDashboardActive = (!!currentThreadline || archiveEmpty) && !showingHelp;

    return(
        <section className={`workspace ${isDashboardActive ? "dashboard-active" : ""}`}>
            {
                showingHelp ? (
                    <HelpSection 
                        onBack={() => setShowingHelp(false)} 
                    />
                ) : archiveEmpty ? (
                    <ThreadlineWorkspace
                        threadline={{
                            id: `archive_${user.uid}`,
                            title: "Communications Archive",
                            source: "Ingested History",
                            platform: "Multi",
                            messageCount: 0,
                            conversationCount: 0
                        }}
                        setThreadlines={setThreadlines}
                        setCurrentThreadline={setCurrentThreadline}
                        uid={user.uid}
                        onImportSuccess={refreshArchiveStatus}
                    />
                ) : currentThreadline ? (
                    <ThreadlineWorkspace
                        threadline={currentThreadline}
                        setThreadlines={setThreadlines}
                        setCurrentThreadline={setCurrentThreadline}
                        uid={user.uid}
                        onImportSuccess={refreshArchiveStatus}
                    />
                ) : creatingThreadline ? (
                    <NewThreadline
                        onCreate={async(threadline)=>{
                            try{
                                const saved = await saveThreadline(
                                    user.uid,
                                    threadline
                                );

                                setThreadlines(previous=>([
                                    ...previous,
                                    saved
                                ]));

                                setCurrentThreadline(saved);
                                setCreatingThreadline(false);
                                setShowingHelp(false);
                            }
                            catch(error){
                                console.error(error);
                            }
                        }}
                        onCancel={()=>{
                            setCreatingThreadline(false);
                        }}
                    />
                ) : (
                    <ThreadlineHome
                        onCreate={()=>{
                            setCreatingThreadline(true);
                            setShowingHelp(false);
                        }}
                    />
                )
            }
        </section>
    );
}

// =====================================
// Exports
// =====================================

export default Workspace;