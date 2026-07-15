/*======================================================
                        IMPORTS
======================================================*/

import { useAuth } from "../auth/AuthProvider";

import { auth } from "../auth/firebase";

import { signOut } from "firebase/auth";

/*======================================================
                        COMPONENT
======================================================*/

function Sidebar({

    threadlines = [],

    currentThreadline,

    onSelect,

    onNew

}){

    /*==============================================
                        AUTH
    ==============================================*/

    const { user } = useAuth();

    /*==============================================
                        EVENTS
    ==============================================*/

    async function handleSignOut(){

        try{

            await signOut(auth);

        }

        catch(error){

            console.error(error);

        }

    }

    /*==============================================
                        RENDER
    ==============================================*/

    return(

        <aside className="sidebar">

            <div className="sidebar-title">

                THREADLINE

            </div>

            <div className="sidebar-user">

                <div className="sidebar-name">

                    {user?.displayName}

                </div>

                <div className="sidebar-email">

                    {user?.email}

                </div>

            </div>

            <nav>

                {/*==============================
                        NEW THREADLINE
                ==============================*/}

                <div

                    className="nav-item"

                    onClick={onNew}

                >

                    + New Threadline

                </div>

                <div className="sidebar-divider"></div>

                {/*==============================
                        THREADLINES
                ==============================*/}

                <div className="sidebar-section">

                    OPEN THREADLINES

                </div>

                {

                    threadlines.map(threadline=>(

                        <div

                            key={threadline.firestoreId}

                            className={

                                threadline.firestoreId === currentThreadline?.firestoreId

                                    ? "nav-item active"

                                    : "nav-item"

                            }

                            onClick={()=>onSelect(threadline)}

                        >

                            {threadline.title}

                        </div>

                    ))

                }

                <div className="sidebar-divider"></div>

                {/*==============================
                        TOOLS
                ==============================*/}

                <div className="nav-item">

                    Import History

                </div>

                <div className="nav-item">

                    Timeline

                </div>

                <div className="nav-item">

                    Participants

                </div>

                <div className="nav-item">

                    Search

                </div>

                <div className="nav-item">

                    Reports

                </div>

                <div className="nav-item">

                    Exports

                </div>

                <div className="sidebar-divider"></div>

                {/*==============================
                        SETTINGS
                ==============================*/}

                <div className="nav-item">

                    Settings

                </div>

            </nav>

            <button

                className="button sidebar-signout"

                onClick={handleSignOut}

            >

                Sign Out

            </button>

        </aside>

    );

}

/*======================================================
                        EXPORTS
======================================================*/

export default Sidebar;