/*
    UploadPanel.jsx

    Communication archive upload panel.
    Renders the drag-and-drop workspace uploader with full progress and error reporting.

    Responsibilities:
    - Capture files via click-to-browse or native HTML5 drag-and-drop.
    - Provide visual feedback for dragover, processing, and failure states.
    - Perform frontend validations (file format, size boundaries, empty files).
    - Deliver file content to backend parser APIs.
    - Display clear error reports on processing failures.
*/

// =====================================
// Imports
// =====================================

import { useState, useRef } from "react";
import { useAuth } from "../auth/AuthProvider";
import { uploadArchive } from "../js/imports/upload";

// =====================================
// Component
// =====================================

function UploadPanel({ setImportResult, threadlineId }) {
    /*==============================================
                        STATE
    ==============================================*/

    const { user } = useAuth();
    const [status, setStatus] = useState("idle"); // 'idle' | 'uploading' | 'error'
    const [errorMessage, setErrorMessage] = useState("");
    const [dragOver, setDragOver] = useState(false);
    const fileInputRef = useRef(null);

    /*==============================================
                        VALIDATION
    ==============================================*/

    const validateFile = (file) => {
        if (!file) {
            throw new Error("No file selected.");
        }
        if (file.size === 0) {
            throw new Error("The selected file is empty (0 bytes).");
        }
        const ext = file.name.split(".").pop().toLowerCase();
        if (ext !== "xml" && ext !== "html") {
            throw new Error(`Invalid file format (.${ext}). Only XML and HTML backup files are supported.`);
        }
        
        // Limit browser parsing size to 150MB to prevent memory crashes
        const maxLimit = 150 * 1024 * 1024;
        if (file.size > maxLimit) {
            throw new Error("File exceeds maximum limit. Upload size is capped at 150MB.");
        }
    };

    /*==============================================
                        PROCESS
    ==============================================*/

    const processFile = async (file) => {
        setStatus("uploading");
        setErrorMessage("");
        try {
            validateFile(file);
            const response = await uploadArchive(file, user, threadlineId);
            setStatus("idle");
            if (setImportResult) {
                setImportResult(response);
            }
        } catch (error) {
            console.error("Upload process error:", error);
            setStatus("error");
            
            // Extract backend-specific error message if available
            const msg = error.response?.data?.message || error.message || "Failed to upload or parse communication archive.";
            setErrorMessage(msg);
        }
    };

    /*==============================================
                        EVENTS
    ==============================================*/

    const handleAreaClick = () => {
        if (status === "uploading") return;
        if (fileInputRef.current) {
            fileInputRef.current.click();
        }
    };

    const handleBrowseChange = (event) => {
        const file = event.target.files[0];
        if (file) {
            processFile(file);
        }
    };

    const handleDragOver = (e) => {
        e.preventDefault();
    };

    const handleDragEnter = (e) => {
        e.preventDefault();
        if (status !== "uploading") {
            setDragOver(true);
        }
    };

    const handleDragLeave = (e) => {
        e.preventDefault();
        setDragOver(false);
    };

    const handleDrop = (e) => {
        e.preventDefault();
        setDragOver(false);
        if (status === "uploading") return;
        
        const file = e.dataTransfer.files[0];
        if (file) {
            processFile(file);
        }
    };

    /*==============================================
                        RENDER
    ==============================================*/

    // 1. Processing state UI
    if (status === "uploading") {
        return (
            <section className="panel upload-panel" style={{ padding: 0 }}>
                <div 
                    className="upload-area uploading" 
                    style={{ 
                        cursor: "wait", 
                        minHeight: "250px", 
                        borderStyle: "solid", 
                        borderColor: "var(--accent)" 
                    }}
                >
                    <div className="spinner-glow">🔄</div>
                    <h3 style={{ color: "var(--accent)", letterSpacing: "1px", textTransform: "uppercase" }}>
                        PARSING COMMUNICATION ARCHIVE...
                    </h3>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", maxWidth: "450px", textAlign: "center", lineHeight: "1.5" }}>
                        Reading XML message nodes and populating local SQLite database index tables. This might take a few moments for large files.
                    </p>
                </div>
            </section>
        );
    }

    // 2. Error state UI
    if (status === "error") {
        return (
            <section className="panel upload-panel" style={{ padding: 0 }}>
                <div 
                    className="upload-area error-state" 
                    style={{ 
                        minHeight: "250px", 
                        borderStyle: "solid", 
                        borderColor: "var(--danger)", 
                        background: "rgba(255,69,58,0.02)" 
                    }}
                >
                    <div style={{ fontSize: "2rem", marginBottom: "12px" }}>⚠️</div>
                    <h3 style={{ color: "var(--danger)", letterSpacing: "1px", textTransform: "uppercase", marginBottom: "8px" }}>
                        IMPORT FAILED
                    </h3>
                    <div 
                        style={{ 
                            color: "var(--text-light)", 
                            fontSize: "0.85rem", 
                            maxWidth: "500px", 
                            padding: "12px 18px", 
                            background: "rgba(255,69,58,0.06)", 
                            border: "1px solid rgba(255,69,58,0.15)", 
                            borderRadius: "4px", 
                            textAlign: "center", 
                            fontFamily: "var(--font-mono)", 
                            wordBreak: "break-word", 
                            marginBottom: "20px", 
                            lineHeight: "1.5" 
                        }}
                    >
                        {errorMessage}
                    </div>
                    <button 
                        className="button primary" 
                        onClick={() => setStatus("idle")}
                        style={{ 
                            padding: "10px 24px", 
                            fontSize: "0.85rem", 
                            background: "var(--danger)", 
                            borderColor: "var(--danger)" 
                        }}
                    >
                        CHOOSE ANOTHER FILE
                    </button>
                </div>
            </section>
        );
    }

    // 3. Default idle file drop UI
    return (
        <section className="panel upload-panel" style={{ padding: 0 }}>
            <input
                ref={fileInputRef}
                id="archive-upload"
                type="file"
                hidden
                onChange={handleBrowseChange}
            />
            <div
                className={`upload-area ${dragOver ? "drag-over" : ""}`}
                onClick={handleAreaClick}
                onDragOver={handleDragOver}
                onDragEnter={handleDragEnter}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
            >
                <h3>
                    {dragOver ? "DROP ARCHIVE FILE HERE" : "CLICK TO SELECT FILE OR DROP IT HERE"}
                </h3>
                <p>
                    Select your XML backup or HTML conversation export, or drag it directly into this box.
                </p>
            </div>
        </section>
    );
}

// =====================================
// Exports
// =====================================

export default UploadPanel;