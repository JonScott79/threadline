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
    onShowHelp,
    archiveEmpty
}){
    const [compareIds, setCompareIds] = useState([]);
    const { user, logoutLocalGuest } = useAuth();

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

    return(

        <aside className="sidebar">

            <div className="sidebar-header">
                
                <h1 style={{ fontSize: "1.3rem", fontWeight: "800", color: "var(--text)" }}>
                    THREADLINE
                </h1>
                
                <div style={{ fontSize: "0.65rem", fontWeight: "600", letterSpacing: "1px", color: "var(--text-muted)", marginTop: "4px" }}>
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
                    className={archiveEmpty ? "nav-item disabled" : "nav-item"}
                    onClick={archiveEmpty ? () => alert("Please upload a backup file to your Communications Archive first to unlock workspace features.") : onNew}
                    style={{ fontWeight: "600", opacity: archiveEmpty ? 0.4 : 1, cursor: archiveEmpty ? "not-allowed" : "pointer" }}
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
                        (currentThreadline?.id || "").startsWith("archive_")
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
                        .filter(t => !(t.firestoreId || t.id || "").startsWith("archive_"))
                        .map(threadline=>(
                        <div
                            key={threadline.firestoreId || threadline.id}
                            className={
                                archiveEmpty ? "nav-item nav-item-threadline disabled" : 
                                (threadline.firestoreId || threadline.id) === (currentThreadline?.firestoreId || currentThreadline?.id)
                                    ? "nav-item active nav-item-threadline"
                                    : "nav-item nav-item-threadline"
                            }
                            onClick={archiveEmpty ? () => alert("Please upload a backup file to your Communications Archive first to unlock custom workspaces.") : ()=>onSelect(threadline)}
                            style={{ display: "flex", alignItems: "center", paddingLeft: "10px", opacity: archiveEmpty ? 0.4 : 1, cursor: archiveEmpty ? "not-allowed" : "pointer" }}
                        >
                            <input 
                                type="checkbox"
                                disabled={archiveEmpty}
                                checked={!archiveEmpty && compareIds.includes(threadline.firestoreId || threadline.id)}
                                onClick={(e) => e.stopPropagation()} // Prevent selecting single row
                                onChange={(e) => {
                                    if (archiveEmpty) return;
                                    const tid = threadline.firestoreId || threadline.id;
                                    if (e.target.checked) {
                                        setCompareIds(prev => [...prev, tid]);
                                    } else {
                                        setCompareIds(prev => prev.filter(id => id !== tid));
                                    }
                                }}
                                style={{ 
                                    marginRight: "10px", 
                                    cursor: archiveEmpty ? "not-allowed" : "pointer",
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
                                    disabled={archiveEmpty}
                                    style={{ cursor: archiveEmpty ? "not-allowed" : "pointer" }}
                                    onClick={(e) => {
                                        if (archiveEmpty) return;
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
                                    style={{ cursor: "pointer" }}
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
                                    .filter(t => compareIds.includes(t.firestoreId || t.id))
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