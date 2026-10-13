/*
    UploadPanel.jsx

    Primary user upload and ingestion interface.
    Supports both file drag-and-drop/browsing and direct text/chat snippet pasting.
*/

import { useState, useRef } from "react";
import { uploadArchive, pasteArchiveText } from "../js/imports/upload";
import { useAuth } from "../auth/AuthProvider";

function UploadPanel({ setImportResult, threadlineId }) {
    /*==============================================
                        STATE
    ==============================================*/

    const { user } = useAuth();
    const [mode, setMode] = useState("file"); // 'file' | 'paste'
    const [status, setStatus] = useState("idle"); // 'idle' | 'uploading' | 'error'
    const [errorMessage, setErrorMessage] = useState("");
    const [dragOver, setDragOver] = useState(false);
    const [pastedText, setPastedText] = useState("");
    const [pasteTitle, setPasteTitle] = useState("");
    const [detectedType, setDetectedType] = useState(null);
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
        const supported = [
            "xml", "html", "json", "log", "txt", 
            "eml", "mbox", "zip", "pdf", 
            "png", "jpg", "jpeg", "webp"
        ];
        if (!supported.includes(ext)) {
            throw new Error(`Invalid file format (.${ext}). Supported formats: XML, HTML, JSON, LOG, TXT, EML, MBOX, ZIP, PDF, PNG, JPG, WEBP.`);
        }
        
        // Limit upload size to 250MB
        const maxLimit = 250 * 1024 * 1024;
        if (file.size > maxLimit) {
            throw new Error("File exceeds maximum limit. Upload size is capped at 250MB.");
        }
    };

    /*==============================================
                    FORMAT DETECTION
    ==============================================*/

    const detectPastedFormat = (text) => {
        if (!text || !text.trim()) {
            setDetectedType(null);
            return;
        }
        if (text.includes("<smses") || text.includes("<sms ") || text.includes("<mms ")) {
            setDetectedType("SMS Backup XML");
        } else if (text.includes("<h2>Conversation with:") || (text.includes("<th>Type</th>") && text.includes("<th>Date</th>"))) {
            setDetectedType("HTML Export");
        } else if (text.includes('"participants"') && text.includes('"messages"')) {
            setDetectedType("Facebook Messenger JSON");
        } else if (/\[\d{4}[-/.]\d{1,2}[-/.]\d{1,2}[,\s]+\d{1,2}:\d{2}/.test(text) || /\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?\s+-\s+/.test(text)) {
            setDetectedType("Signal Export");
        } else if (/\[\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4},?\s+\d{1,2}:\d{2}/.test(text) || /\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4},?\s+\d{1,2}:\d{2}\s+-\s+/.test(text)) {
            setDetectedType("WhatsApp Chat");
        } else if (/^From:\s+/m.test(text) && (/^Date:\s+/m.test(text) || /^Subject:\s+/m.test(text))) {
            setDetectedType("Email Headers");
        } else if (/(?:\[?\d{4}[-/.]\d{2}[-/.]\d{2}[ T]\d{2}:\d{2}|\[\d{10,13}\]|[A-Za-z]{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})/.test(text)) {
            setDetectedType("Timestamped Log");
        } else {
            setDetectedType("Plaintext Chat");
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
            const msg = error.response?.data?.message || error.message || "Failed to upload or parse communication archive.";
            setErrorMessage(msg);
        }
    };

    const handleProcessPaste = async () => {
        if (!pastedText.trim()) return;
        setStatus("uploading");
        setErrorMessage("");
        try {
            const response = await pasteArchiveText(pastedText, pasteTitle, user, threadlineId);
            setStatus("idle");
            setPastedText("");
            setPasteTitle("");
            setDetectedType(null);
            if (setImportResult) {
                setImportResult(response);
            }
        } catch (error) {
            console.error("Paste import error:", error);
            setStatus("error");
            const msg = error.response?.data?.message || error.message || "Failed to parse pasted communication text.";
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
                        minHeight: "260px", 
                        borderStyle: "solid", 
                        borderColor: "var(--accent)" 
                    }}
                >
                    <div className="spinner-glow">⚙</div>
                    <h3 style={{ color: "var(--accent)", letterSpacing: "1px", textTransform: "uppercase" }}>
                        PARSING COMMUNICATION DATA...
                    </h3>
                    <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", maxWidth: "450px", textAlign: "center", lineHeight: "1.5" }}>
                        Extracting timestamps, normalizing speakers, and populating local timeline index tables.
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
                        minHeight: "260px", 
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
                        TRY AGAIN
                    </button>
                </div>
            </section>
        );
    }

    // 3. Default idle UI with Mode Tabs
    return (
        <section className="panel upload-panel" style={{ padding: 0, overflow: "hidden" }}>
            {/* Mode Switcher Tabs */}
            <div 
                className="upload-mode-toggle" 
                style={{ 
                    display: "flex", 
                    gap: "10px", 
                    padding: "12px 20px", 
                    borderBottom: "1px solid var(--border)", 
                    background: "rgba(255,255,255,0.02)" 
                }}
            >
                <button
                    type="button"
                    onClick={() => setMode("file")}
                    style={{
                        padding: "8px 18px",
                        fontSize: "0.85rem",
                        fontWeight: "600",
                        borderRadius: "6px",
                        border: mode === "file" ? "1px solid var(--accent)" : "1px solid var(--border)",
                        background: mode === "file" ? "rgba(63,216,255,0.12)" : "transparent",
                        color: mode === "file" ? "var(--accent)" : "var(--text-muted)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        transition: "all 0.2s ease"
                    }}
                >
                    <span>📁</span> Upload File / Archive
                </button>
                <button
                    type="button"
                    onClick={() => setMode("paste")}
                    style={{
                        padding: "8px 18px",
                        fontSize: "0.85rem",
                        fontWeight: "600",
                        borderRadius: "6px",
                        border: mode === "paste" ? "1px solid var(--accent)" : "1px solid var(--border)",
                        background: mode === "paste" ? "rgba(63,216,255,0.12)" : "transparent",
                        color: mode === "paste" ? "var(--accent)" : "var(--text-muted)",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        transition: "all 0.2s ease"
                    }}
                >
                    <span>📋</span> Paste Chat / Text Snippet
                </button>
            </div>

            {mode === "file" ? (
                <>
                    <input
                        ref={fileInputRef}
                        id="archive-upload"
                        type="file"
                        accept=".xml,.html,.json,.log,.txt,.eml,.mbox,.zip,.pdf,.png,.jpg,.jpeg,.webp"
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
                        style={{ minHeight: "240px", border: "none" }}
                    >
                        <h3 style={{ letterSpacing: "1px", textTransform: "uppercase" }}>
                            {dragOver ? "DROP ARCHIVE FILE HERE" : "CLICK TO SELECT FILE OR DROP IT HERE"}
                        </h3>
                        <p style={{ maxWidth: "600px", textAlign: "center", fontSize: "0.85rem", lineHeight: "1.5" }}>
                            Supports XML, HTML exports, JSON (Messenger / Signal), WhatsApp (.txt / .zip), Email (.eml / .mbox), PDF documents, and Screenshots (.png / .jpg).
                        </p>
                    </div>
                </>
            ) : (
                <div className="paste-area" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <label style={{ fontSize: "0.8rem", fontWeight: "600", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "1px" }}>
                            Paste Chat Transcript or Messages
                        </label>
                        {detectedType && (
                            <span 
                                style={{ 
                                    fontSize: "0.75rem", 
                                    padding: "3px 10px", 
                                    borderRadius: "12px", 
                                    background: "rgba(63,216,255,0.15)", 
                                    color: "var(--accent)", 
                                    border: "1px solid rgba(63,216,255,0.3)", 
                                    fontWeight: "600" 
                                }}
                            >
                                Format: {detectedType}
                            </span>
                        )}
                    </div>
                    <textarea
                        value={pastedText}
                        onChange={(e) => {
                            setPastedText(e.target.value);
                            detectPastedFormat(e.target.value);
                        }}
                        placeholder="Paste conversation text here...&#10;&#10;Supported formats:&#10;• WhatsApp: 10/12/2026, 10:30 - Alice: Hey! Are you ready?&#10;• Signal: [2026-10-12 14:30:15] Alice: Meeting notes attached.&#10;• Email: From: alice@example.com / Subject: Case update...&#10;• Logs: [2026-10-12 10:30:00] Alice: Status update..."
                        rows={8}
                        style={{
                            width: "100%",
                            background: "var(--background)",
                            border: "1px solid var(--border)",
                            borderRadius: "6px",
                            padding: "14px",
                            color: "var(--text)",
                            fontFamily: "var(--font-mono)",
                            fontSize: "0.85rem",
                            lineHeight: "1.5",
                            resize: "vertical"
                        }}
                    />
                    <div style={{ display: "flex", gap: "12px", alignItems: "center", flexWrap: "wrap" }}>
                        <input
                            type="text"
                            placeholder="Optional Title (e.g. WhatsApp with Alice)"
                            value={pasteTitle}
                            onChange={(e) => setPasteTitle(e.target.value)}
                            style={{
                                flex: 1,
                                minWidth: "220px",
                                background: "var(--background)",
                                border: "1px solid var(--border)",
                                borderRadius: "6px",
                                padding: "10px 14px",
                                color: "var(--text)",
                                fontSize: "0.85rem"
                            }}
                        />
                        <button
                            type="button"
                            className="button primary"
                            disabled={!pastedText.trim()}
                            onClick={handleProcessPaste}
                            style={{
                                padding: "10px 24px",
                                fontWeight: "600",
                                fontSize: "0.85rem",
                                cursor: pastedText.trim() ? "pointer" : "not-allowed",
                                opacity: pastedText.trim() ? 1 : 0.5
                            }}
                        >
                            IMPORT PASTED CHAT
                        </button>
                        {pastedText && (
                            <button
                                type="button"
                                onClick={() => { setPastedText(""); setPasteTitle(""); setDetectedType(null); }}
                                style={{
                                    background: "transparent",
                                    border: "1px solid var(--border)",
                                    borderRadius: "6px",
                                    padding: "10px 16px",
                                    color: "var(--text-muted)",
                                    cursor: "pointer",
                                    fontSize: "0.85rem"
                                }}
                            >
                                CLEAR
                            </button>
                        )}
                    </div>
                </div>
            )}
        </section>
    );
}

export default UploadPanel;
