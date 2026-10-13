/*
    Sidebar.jsx

    Primary navigation panel.
    Displays user session metadata, workspace triggers, the list of active
    threadline workspaces, case file import/export, and session logout controls.

    Responsibilities:
    - Render premium Lanzar Threadline branding matching official logo identity.
    - Provide "+ New Threadline" action.
    - Provide "Open Saved Case" action with sleek vector icon.
    - Display and manage "Your Threadlines" list with delete and edit triggers.
    - Handle local mode session logouts.
*/

import { useState } from "react";
import axios from "axios";
import { useAuth } from "../auth/AuthProvider";
import { auth } from "../auth/firebase";
import { signOut } from "firebase/auth";
import { API_BASE_URL } from "../src/apiConfig";
import DeleteThreadlineModal from "./DeleteThreadlineModal";

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
}) {
    const [compareIds, setCompareIds] = useState([]);
    const [threadlineToDelete, setThreadlineToDelete] = useState(null);
    const [isDeleting, setIsDeleting] = useState(false);
    const [deleteError, setDeleteError] = useState(null);
    const [isImportingCase, setIsImportingCase] = useState(false);

    // Custom rename inline/modal state
    const [editingThreadline, setEditingThreadline] = useState(null);
    const [renameValue, setRenameValue] = useState("");

    const { user, logoutLocalGuest } = useAuth();

    async function handleSignOut() {
        try {
            if (user?.uid === "local") {
                logoutLocalGuest();
            } else {
                await signOut(auth);
            }
        } catch (error) {
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

    return (
        <aside className={`sidebar ${isOpenMobile ? "mobile-open" : ""}`}>
            {onCloseMobile && (
                <button type="button" className="sidebar-close-btn" onClick={onCloseMobile} aria-label="Close menu">&times;</button>
            )}

            {/* Sidebar Branding Header */}
            <div className="sidebar-header" style={{ display: "flex", alignItems: "center", gap: "12px", marginBottom: "22px" }}>
                <img 
                    src="/logo-icon.png" 
                    alt="Threadline" 
                    style={{ 
                        width: "38px", 
                        height: "38px", 
                        borderRadius: "10px",
                        boxShadow: "0 0 16px rgba(0, 208, 255, 0.45), 0 0 12px rgba(255, 149, 0, 0.35)",
                        flexShrink: 0,
                        display: "block"
                    }} 
                />
                <div>
                    <h1 style={{ fontSize: "1.25rem", fontWeight: "800", color: "#F2F7FB", margin: 0, letterSpacing: "1.5px", lineHeight: 1.15 }}>
                        THREADLINE
                    </h1>
                    <div style={{ fontSize: "0.68rem", fontWeight: "600", letterSpacing: "1px", color: "var(--text-muted)", marginTop: "4px" }}>
                        <a
                            href="https://lanzar.me"
                            target="_blank"
                            rel="noopener noreferrer"
                            style={{
                                color: "inherit",
                                textDecoration: "none",
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "4px"
                            }}
                        >
                            by <span style={{ color: "#FF9500", fontWeight: "800", display: "inline-flex", alignItems: "center", gap: "3px" }}>
                                <svg width="9" height="9" viewBox="0 0 10 10" fill="currentColor">
                                    <polygon points="5,1 9,9 5,7 1,9"/>
                                </svg>
                                LANZAR
                            </span>
                        </a>
                    </div>
                </div>
            </div>

            {/* User Session Info */}
            <div className="sidebar-user">
                <div className="sidebar-name">
                    {user?.displayName || "Forensics Examiner"}
                </div>
                <div className="sidebar-email">
                    {user?.email || "local@session"}
                </div>
            </div>

            <nav style={{ flex: 1 }}>
                {/* + New Threadline Action */}
                <div
                    className="nav-item"
                    onClick={onNew}
                    style={{ 
                        fontWeight: "700", 
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        color: "#00D0FF"
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
                        <line x1="12" y1="5" x2="12" y2="19" />
                        <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    New Threadline
                </div>

                {/* Open Saved Case (.tl) */}
                <label
                    className="nav-item"
                    style={{ 
                        fontWeight: "600", 
                        cursor: isImportingCase ? "wait" : "pointer", 
                        display: "flex", 
                        alignItems: "center", 
                        gap: "10px",
                        color: "#FF9500" 
                    }}
                    title="Open a saved Threadline case file from your computer"
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" />
                    </svg>
                    {isImportingCase ? "Opening Case..." : "Open Saved Case"}
                    <input
                        type="file"
                        accept=".tl"
                        style={{ display: "none" }}
                        onChange={handleImportCaseFile}
                        disabled={isImportingCase}
                    />
                </label>

                {/* Help Center */}
                <div
                    className="nav-item"
                    onClick={() => { onShowHelp(); if (onCloseMobile) onCloseMobile(); }}
                    style={{ 
                        fontWeight: "600", 
                        color: "var(--text-light)",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px"
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00D0FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <circle cx="12" cy="12" r="10" />
                        <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                        <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                    Help Center
                </div>

                {/* Communications Archive */}
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
                    style={{ 
                        fontWeight: "600", 
                        color: "var(--text)",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px"
                    }}
                >
                    <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#00D0FF" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="21 8 21 21 3 21 3 8" />
                        <rect x="1" y="3" width="22" height="5" />
                        <line x1="10" y1="12" x2="14" y2="12" />
                    </svg>
                    Communications Archive
                </div>

                <div className="sidebar-divider"></div>

                {/* THREADLINES LIST */}
                <div className="sidebar-section" style={{ letterSpacing: "1.2px", color: "var(--text-muted)", fontSize: "0.72rem", fontWeight: "800" }}>
                    YOUR THREADLINES
                </div>

                {threadlines
                    .filter(t => !t.id?.startsWith("archive_") && !t.firestoreId?.startsWith("archive_"))
                    .map((threadline) => (
                    <div
                        key={threadline.firestoreId || threadline.id}
                        className={
                            (currentThreadline?.firestoreId === threadline.firestoreId || currentThreadline?.id === threadline.id)
                                ? "nav-item active"
                                : "nav-item"
                        }
                        onClick={() => onSelect(threadline)}
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
                                accentColor: "#00D0FF",
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
                                style={{ 
                                    cursor: archiveEmpty ? "not-allowed" : "pointer",
                                    padding: "3px 6px",
                                    display: "inline-flex",
                                    alignItems: "center"
                                }}
                                onClick={(e) => {
                                    if (archiveEmpty) return;
                                    e.stopPropagation();
                                    setEditingThreadline(threadline);
                                    setRenameValue(threadline.title);
                                }}
                            >
                                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
                                    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
                                </svg>
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
                ))}

                {compareIds.length > 1 && (
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
                            borderRadius: "6px",
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
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                            <rect x="2" y="3" width="8" height="18" rx="1" />
                            <rect x="14" y="3" width="8" height="18" rx="1" />
                        </svg>
                        Compare Selected ({compareIds.length})
                    </div>
                )}
            </nav>

            <button
                className="button sidebar-signout"
                onClick={handleSignOut}
                style={{ 
                    marginTop: "auto",
                    background: "rgba(255, 69, 58, 0.12)",
                    border: "1px solid rgba(255, 69, 58, 0.3)",
                    color: "#FF453A"
                }}
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
                        style={{ borderColor: "rgba(0, 208, 255, 0.4)", boxShadow: "0 25px 50px -12px rgba(0,0,0,0.8), 0 0 25px rgba(0, 208, 255, 0.25)" }}
                        role="dialog"
                        aria-modal="true"
                    >
                        <div className="delete-modal-header" style={{ background: "#0A1019" }}>
                            <h3 style={{ margin: 0, fontSize: "1rem", color: "#00D0FF" }}>
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
                            <label style={{ fontSize: "0.8rem", color: "var(--text-muted)", textTransform: "uppercase", fontWeight: 600 }}>
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
                                style={{ background: "linear-gradient(135deg, #00D0FF 0%, #FF9500 100%)", color: "#05080E", fontWeight: "800" }}
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

export default Sidebar;
