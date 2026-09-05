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
import DeleteThreadlineModal from "./DeleteThreadlineModal";

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
    const [threadlineToDelete, setThreadlineToDelete] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState(null);

    // Custom rename inline/modal state
    const [editingThreadline, setEditingThreadline] = useState(null);
    const [renameValue, setRenameValue] = useState("");

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

    async function handleConfirmDelete(tl) {
        if (!tl) return;
        setIsDeleting(true);
        setDeleteError(null);
        try {
            await onDelete(tl);
            setThreadlineToDelete(null);
        } catch (err) {
            setDeleteError(err.message || "Failed to delete threadline.");
        } finally {
            setIsDeleting(false);
        }
    }

    function handleSaveRename() {
        if (!editingThreadline) return;
        const trimmed = renameValue.trim();
        if (trimmed && trimmed !== editingThreadline.title) {
            onRename(editingThreadline, trimmed);
        }
        setEditingThreadline(null);
        setRenameValue("");
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
                                        setEditingThreadline(threadline);
                                        setRenameValue(threadline.title);
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
                                        setThreadlineToDelete(threadline);
                                        setDeleteError(null);
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

            {/* Custom In-App Threadline Deletion Confirmation Modal */}
            <DeleteThreadlineModal
                isOpen={!!threadlineToDelete}
                threadline={threadlineToDelete}
                onClose={() => {
                    if (!isDeleting) {
                        setThreadlineToDelete(null);
                        setDeleteError(null);
                    }
                }}
                onConfirm={handleConfirmDelete}
                isDeleting={isDeleting}
                errorMessage={deleteError}
            />

            {/* In-App Rename Dialog */}
            {editingThreadline && (
                <div
                    className="delete-modal-backdrop"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            setEditingThreadline(null);
                        }
                    }}
                >
                    <div
                        className="delete-modal-card"
                        style={{ borderColor: "rgba(56, 189, 248, 0.35)", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.7), 0 0 25px rgba(56, 189, 248, 0.15)" }}
                        role="dialog"
                        aria-modal="true"
                    >
                        <div className="delete-modal-header" style={{ background: "#1e293b" }}>
                            <h3 style={{ margin: 0, fontSize: "1rem", color: "#38bdf8" }}>
                                RENAME THREADLINE
                            </h3>
                            <button
                                type="button"
                                className="delete-modal-close-btn"
                                onClick={() => setEditingThreadline(null)}
                            >
                                &times;
                            </button>
                        </div>
                        <div className="delete-modal-body">
                            <label style={{ fontSize: "0.8rem", color: "#94a3b8", textTransform: "uppercase", fontWeight: 600 }}>
                                Threadline Title
                            </label>
                            <input
                                type="text"
                                className="export-field-input"
                                value={renameValue}
                                onChange={(e) => setRenameValue(e.target.value)}
                                autoFocus
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") handleSaveRename();
                                    if (e.key === "Escape") setEditingThreadline(null);
                                }}
                            />
                        </div>
                        <div className="delete-modal-footer">
                            <button
                                type="button"
                                className="delete-btn-cancel"
                                onClick={() => setEditingThreadline(null)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="export-btn-submit"
                                onClick={handleSaveRename}
                                disabled={!renameValue.trim()}
                            >
                                SAVE
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </aside>
    );
}

// =====================================
// Exports
// =====================================

export default Sidebar;