/*
    Sidebar.jsx

    Primary navigation panel.
    Displays user session metadata, workspace triggers, the list of active
    threadline workspaces, case file import/export, and session logout controls.

    Responsibilities:
    - Render premium Lanzar Threadline branding.
    - Provide "+ New Threadline" action.
    - Provide "📥 Open .tl Case" action for standalone portable case archives.
    - Display and manage "Your Threadlines" list with delete and edit triggers.
    - Handle local mode session logouts.
*/

// =====================================
// Imports
// =====================================

import { useState } from "react";
import axios from "axios";
import { useAuth } from "../auth/AuthProvider";
import { auth } from "../auth/firebase";
import { signOut } from "firebase/auth";
import { API_BASE_URL } from "../src/apiConfig";
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
    onCaseImported,
    archiveEmpty,
    isOpenMobile = false,
    onCloseMobile
}){
    const [compareIds, setCompareIds] = useState([]);
    const [threadlineToDelete, setThreadlineToDelete] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState(null);
    const [isImportingCase, setIsImportingCase] = useState(false);

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

    async function handleImportCaseFile(e) {
        const file = e.target.files?.[0];
        if (!file) return;
        setIsImportingCase(true);
        const formData = new FormData();
        formData.append("casefile", file);
        const uid = user?.uid || "local";
        try {
            const res = await axios.post(`${API_BASE_URL}/threadlines/casefile`, formData, {
                headers: {
                    "x-user-uid": uid,
                    "Content-Type": "multipart/form-data"
                }
            });
            if (res.data?.case) {
                if (onCaseImported) {
                    onCaseImported(res.data.case);
                } else if (onSelect) {
                    onSelect(res.data.case);
                }
            }
        } catch (err) {
            console.error("Failed to import .tl case file:", err);
            alert("Failed to import case file: " + (err.response?.data?.message || err.message));
        } finally {
            setIsImportingCase(false);
            e.target.value = "";
        }
    }

    return(

        <aside className={`sidebar ${isOpenMobile ? "mobile-open" : ""}`}>
            {onCloseMobile && (
                <button type="button" className="sidebar-close-btn" onClick={onCloseMobile} aria-label="Close menu">&times;</button>
            )}

            <div className="sidebar-header" style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "22px" }}>
                <img 
                    src="/logo-icon.png" 
                    alt="Threadline" 
                    style={{ 
                        width: "38px", 
                        height: "38px", 
                        borderRadius: "9px",
                        boxShadow: "0 4px 14px rgba(0, 0, 0, 0.45), 0 0 12px rgba(63, 216, 255, 0.25)",
                        flexShrink: 0,
                        display: "block"
                    }} 
                />
                <div>
                    <h1 style={{ fontSize: "1.25rem", fontWeight: "800", color: "var(--text)", margin: 0, letterSpacing: "1px", lineHeight: 1.15 }}>
                        THREADLINE
                    </h1>
                    <div style={{ fontSize: "0.65rem", fontWeight: "600", letterSpacing: "1px", color: "var(--text-muted)", marginTop: "4px" }}>
                        <a
                            href="https://lanzar.me"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                color: "inherit",
                                textDecoration: "none",
                                display: "inline-block"
                            }}
                            onMouseEnter={(e) => {
                                const span = e.currentTarget.querySelector('span');
                                if (span) span.style.textDecoration = 'underline';
                            }}
                            onMouseLeave={(e) => {
                                const span = e.currentTarget.querySelector('span');
                                if (span) span.style.textDecoration = 'none';
                            }}
                        >
                            by <span style={{ color: "var(--accent)" }}>▲ LANZAR</span>
                        </a>
                    </div>
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

                <label
                    className="nav-item"
                    style={{ fontWeight: "600", cursor: isImportingCase ? "wait" : "pointer", display: "flex", alignItems: "center", color: "var(--accent)" }}
                    title="Open a saved Threadline case file from your computer"
                >
                    {isImportingCase ? "⏳ Opening Case..." : "📂 Open Saved Case"}
                    <input
                        type="file"
                        accept=".tl"
                        style={{ display: "none" }}
                        onChange={handleImportCaseFile}
                        disabled={isImportingCase}
                    />
                </label>

                <div
                    className="nav-item"
                    onClick={() => { onShowHelp(); if (onCloseMobile) onCloseMobile(); }}
                    style={{ fontWeight: "600", color: "var(--text-muted)" }}
                >
                    📘 Help Center
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
                    threadlines.map((threadline)=>(
                        <div
                            key={threadline.firestoreId || threadline.id}
                            className={
                                (currentThreadline?.firestoreId === threadline.firestoreId || currentThreadline?.id === threadline.id)
                                    ? "nav-item active"
                                    : "nav-item"
                            }
                            onClick={()=>onSelect(threadline)}
                            style={{ display: "flex", alignItems: "center", gap: "8px" }}
                        >
                            <input
                                type="checkbox"
                                checked={compareIds.includes(threadline.firestoreId || threadline.id)}
                                onChange={(e) => {
                                    e.stopPropagation();
                                    const id = threadline.firestoreId || threadline.id;
                                    setCompareIds(prev => 
                                        prev.includes(id) 
                                            ? prev.filter(x => x !== id)
                                            : [...prev, id]
                                    );
                                }}
                                onClick={(e) => e.stopPropagation()}
                                title="Select to compare multiple Threadlines"
                                style={{
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
