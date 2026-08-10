/*
    Sidebar.jsx

    Primary navigation panel.
    Displays user session metadata, workspace triggers, the list of active
    threadline workspaces, and session logout controls.

    Responsibilities:
    - Render premium Lanzar Threadline branding.
    - Provide "+ New Threadline" action.
    - Display and manage "Your Threadlines" list with delete and edit triggers.
    - Handle local mode session logouts.
*/

// =====================================
// Imports
// =====================================

import { useState } from "react";
import { useAuth } from "../auth/AuthProvider";
import { auth } from "../auth/firebase";
import { signOut } from "firebase/auth";

// =====================================
// Component
// =====================================

function Sidebar({
    threadlines = [],
    currentThreadline,
    onSelect,
    onNew,
    onDelete,
    onRename,
    onShowHelp
}){
    const [compareIds, setCompareIds] = useState([]);
    /*==============================================
                        AUTH
    ==============================================*/

    const { user, logoutLocalGuest } = useAuth();

    /*==============================================
                        EVENTS
    ==============================================*/

    async function handleSignOut(){
        try {
            if (user?.uid === "local") {
                logoutLocalGuest();
            } else {
                await signOut(auth);
            }
        } catch(error) {
            console.error("Sign out failed:", error);
        }
    }

    /*==============================================
                        RENDER
    ==============================================*/

    return(
        <aside className="sidebar">
            {/* Lanzar Ecosystem Branding */}
            <div className="lanzar-branding" style={{ padding: "0 0 15px 0" }}>
                <div style={{ color: "var(--text-light)", fontSize: "1.4rem", letterSpacing: "2px", fontWeight: "700" }}>THREADLINE</div>
                <div style={{ color: "var(--text-muted)", fontSize: "0.65rem", letterSpacing: "2px", margin: "4px 0 0 0", fontWeight: "600", textTransform: "uppercase" }}>
                    by <span style={{ color: "var(--accent)" }}>▲ LANZAR</span>
                </div>
            </div>

            <div className="sidebar-user">
                <div className="sidebar-name">
                    {user?.displayName}
                </div>
                <div className="sidebar-email">
                    {user?.email}
                </div>
            </div>

            <nav style={{ flex: 1 }}>
                {/*==============================
                        NEW THREADLINE
                ==============================*/}

                <div
                    className="nav-item"
                    onClick={onNew}
                    style={{ fontWeight: "600" }}
                >
                    + New Threadline
                </div>

                <div
                    className="nav-item"
                    onClick={onShowHelp}
                    style={{ fontWeight: "600", color: "var(--accent)" }}
                >
                    📖 Help & Guide
                </div>

                <div
                    className={
                        currentThreadline?.id === `archive_${user?.uid || "local"}`
                            ? "nav-item active"
                            : "nav-item"
                    }
                    onClick={() => onSelect({
                        id: `archive_${user?.uid || "local"}`,
                        firestoreId: `archive_${user?.uid || "local"}`,
                        title: "Communications Archive",
                        source: "Ingested History",
                        platform: "Multi",
                        messageCount: 0,
                        conversationCount: 0
                    })}
                    style={{ fontWeight: "600", color: "var(--text-light)" }}
                >
                    📁 Communications Archive
                </div>

                <div className="sidebar-divider"></div>

                {/*==============================
                        THREADLINES
                ==============================*/}

                <div className="sidebar-section">
                    YOUR THREADLINES
                </div>

                {
                    threadlines
                        .filter(t => !t.firestoreId.startsWith("archive_"))
                        .map(threadline=>(
                        <div
                            key={threadline.firestoreId}
                            className={
                                threadline.firestoreId === currentThreadline?.firestoreId
                                    ? "nav-item active nav-item-threadline"
                                    : "nav-item nav-item-threadline"
                            }
                            onClick={()=>onSelect(threadline)}
                            style={{ display: "flex", alignItems: "center", paddingLeft: "10px" }}
                        >
                            <input 
                                type="checkbox"
                                checked={compareIds.includes(threadline.firestoreId)}
                                onClick={(e) => e.stopPropagation()} // Prevent selecting single row
                                onChange={(e) => {
                                    if (e.target.checked) {
                                        setCompareIds(prev => [...prev, threadline.firestoreId]);
                                    } else {
                                        setCompareIds(prev => prev.filter(id => id !== threadline.firestoreId));
                                    }
                                }}
                                style={{ 
                                    marginRight: "10px", 
                                    cursor: "pointer",
                                    accentColor: "var(--accent)",
                                    width: "14px",
                                    height: "14px"
                                }}
                            />
                            
                            <span className="threadline-title-label" style={{ flex: 1 }}>{threadline.title}</span>
                            
                            <div className="threadline-actions">
                                <button 
                                    className="edit-threadline-btn" 
                                    title="Rename Threadline"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        const newName = prompt("Rename threadline:", threadline.title);
                                        if (newName && newName.trim() && newName.trim() !== threadline.title) {
                                            onRename(threadline, newName.trim());
                                        }
                                    }}
                                >
                                    ✏️
                                </button>
                                <button 
                                    className="delete-threadline-btn" 
                                    title="Delete Threadline"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (confirm(`Are you sure you want to delete "${threadline.title}"? All associated conversation logs will be permanently deleted.`)) {
                                            onDelete(threadline);
                                        }
                                    }}
                                >
                                    &times;
                                </button>
                            </div>
                        </div>
                    ))
                }

                {
                    compareIds.length > 1 && (
                        <div
                            className={
                                currentThreadline?.id === "compare"
                                    ? "nav-item active"
                                    : "nav-item"
                            }
                            onClick={() => {
                                const selectedNames = threadlines
                                    .filter(t => compareIds.includes(t.firestoreId))
                                    .map(t => t.title)
                                    .join(" + ");
                                
                                onSelect({
                                    id: "compare",
                                    isCompare: true,
                                    ids: compareIds,
                                    title: `Comparison: ${selectedNames}`,
                                    messageCount: 9999,
                                    conversationCount: 9999
                                });
                            }}
                            style={{ 
                                fontWeight: "700", 
                                color: "var(--success)", 
                                border: "1px dashed var(--success)",
                                borderRadius: "4px",
                                margin: "12px 16px",
                                textAlign: "center",
                                display: "flex",
                                justifyContent: "center",
                                alignItems: "center",
                                gap: "8px",
                                padding: "8px 12px",
                                cursor: "pointer"
                            }}
                        >
                            🔀 Compare Selected ({compareIds.length})
                        </div>
                    )
                }
            </nav>

            <button
                className="button sidebar-signout"
                onClick={handleSignOut}
                style={{ marginTop: "auto" }}
            >
                Sign Out
            </button>
        </aside>
    );
}

// =====================================
// Exports
// =====================================

export default Sidebar;