/*
    DeleteThreadlineModal.jsx

    Custom accessible confirmation modal for destructive Threadline deletion.
    Replaces browser native window.confirm() / alert() with a styled in-app
    dialog adhering to Threadline design tokens.

    Guarantees:
    - Clear warning that action cannot be undone.
    - Threadline name prominently displayed.
    - Dismissable via Cancel button, Close [X], and Escape key.
    - Clicking backdrop does NOT trigger deletion.
    - Loading state while deletion is in progress.
    - Accessibility: role="dialog", aria-modal="true", aria-labelledby.
*/

import React, { useEffect } from "react";

function DeleteThreadlineModal({
    isOpen,
    threadline,
    onClose,
    onConfirm,
    isDeleting = false,
    errorMessage = null
}) {
    // Trap Escape key to cancel safely
    useEffect(() => {
        if (!isOpen) return;
        function handleKeyDown(e) {
            if (e.key === "Escape" && !isDeleting) {
                onClose();
            }
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [isOpen, isDeleting, onClose]);

    if (!isOpen || !threadline) return null;

    const title = threadline.title || threadline.name || "Untitled Threadline";

    return (
        <div
            className="delete-modal-backdrop"
            onClick={(e) => {
                // Clicking outside does NOT confirm; only closes if not currently deleting
                if (e.target === e.currentTarget && !isDeleting) {
                    onClose();
                }
            }}
            role="presentation"
        >
            <div
                className="delete-modal-card"
                role="dialog"
                aria-modal="true"
                aria-labelledby="delete-threadline-title"
            >
                <div className="delete-modal-header">
                    <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                        <span className="delete-modal-danger-badge">PERMANENT ACTION</span>
                        <h3 id="delete-threadline-title" style={{ margin: 0, fontSize: "1rem", color: "#f87171" }}>
                            DELETE THREADLINE
                        </h3>
                    </div>
                    <button
                        type="button"
                        className="delete-modal-close-btn"
                        onClick={onClose}
                        disabled={isDeleting}
                        aria-label="Close dialog"
                    >
                        &times;
                    </button>
                </div>

                <div className="delete-modal-body">
                    <p style={{ margin: "0 0 12px 0", color: "#e2e8f0", fontSize: "0.9rem", lineHeight: "1.4" }}>
                        Are you sure you want to permanently delete:
                    </p>

                    <div className="delete-modal-target-box">
                        <span className="delete-target-icon">📁</span>
                        <strong className="delete-target-name">{title}</strong>
                    </div>

                    <p className="delete-modal-warning-text">
                        This will remove this Threadline workspace and its associated timeline events,
                        linked conversations, and imported segments. <strong>This action cannot be undone.</strong>
                    </p>

                    {errorMessage && (
                        <div className="delete-modal-error-box">
                            ⚠️ {errorMessage}
                        </div>
                    )}
                </div>

                <div className="delete-modal-footer">
                    <button
                        type="button"
                        className="delete-btn-cancel"
                        onClick={onClose}
                        disabled={isDeleting}
                    >
                        Cancel
                    </button>
                    <button
                        type="button"
                        className="delete-btn-confirm"
                        onClick={() => onConfirm(threadline)}
                        disabled={isDeleting}
                    >
                        {isDeleting ? "DELETING..." : "DELETE THREADLINE"}
                    </button>
                </div>
            </div>
        </div>
    );
}

export default DeleteThreadlineModal;
