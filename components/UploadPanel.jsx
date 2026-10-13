/*
    UploadPanel.jsx

    Primary user upload and ingestion interface.
    Supports both file drag-and-drop/browsing and direct text/chat snippet pasting.
    Integrated with Temporal Verification Gate to ensure valid chronological timestamps.
*/

import { useState, useRef } from "react";
import { uploadArchive, pasteArchiveText } from "../js/imports/upload";
import { useAuth } from "../auth/AuthProvider";
import DateTimePromptModal from "./DateTimePromptModal";
import { 
    inspectTemporalText, 
    inspectTemporalFile, 
    injectTimestampToText 
} from "../js/utilities/temporalVerifier";

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

    // Temporal Verification Modal State
    const [modalOpen, setModalOpen] = useState(false);
    const [modalMetadata, setModalMetadata] = useState(null);
    const [pendingAction, setPendingAction] = useState(null); // { type: 'file' | 'paste', payload: any, title?: string }

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

    const executeFileUpload = async (fileToUpload) => {
        setStatus("uploading");
        setErrorMessage("");
        try {
            validateFile(fileToUpload);
            const response = await uploadArchive(fileToUpload, user, threadlineId);
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

    const processFile = async (file) => {
        try {
            validateFile(file);
            // Pre-flight Temporal Inspection
            const inspection = await inspectTemporalFile(file);
            if (!inspection.hasValidTimestamp) {
                setModalMetadata({
                    sourceName: `FILE: ${file.name}`,
                    reason: inspection.reason,
                    detectedType: inspection.detectedFormat
                });
                setPendingAction({ type: "file", payload: file });
                setModalOpen(true);
                return;
            }

            // Valid timestamps detected -> Proceed
            await executeFileUpload(file);
        } catch (error) {
            console.error("Upload validation error:", error);
            setStatus("error");
            setErrorMessage(error.message);
        }
    };

    const executePasteUpload = async (textToUpload, titleToUpload) => {
        setStatus("uploading");
        setErrorMessage("");
        try {
            const response = await pasteArchiveText(textToUpload, titleToUpload, user, threadlineId);
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

    const handleProcessPaste = async () => {
        if (!pastedText.trim()) return;

        // Pre-flight Temporal Inspection
        const inspection = inspectTemporalText(pastedText);
        if (!inspection.hasValidTimestamp) {
            setModalMetadata({
                sourceName: pasteTitle ? `PASTE: ${pasteTitle}` : "PASTED CHAT SNIPPET",
                reason: inspection.reason,
                detectedType: inspection.detectedFormat
            });
            setPendingAction({ type: "paste", payload: pastedText, title: pasteTitle });
            setModalOpen(true);
            return;
        }

        // Valid timestamps detected -> Proceed
        await executePasteUpload(pastedText, pasteTitle);
    };

    /*==============================================
                TEMPORAL MODAL HANDLERS
    ==============================================*/

    const handleModalConfirm = async (temporalData) => {
        setModalOpen(false);
        if (!pendingAction) return;

        if (pendingAction.type === "paste") {
            const augmentedText = injectTimestampToText(pendingAction.payload, temporalData.isoTimestamp);
            setPendingAction(null);
            await executePasteUpload(augmentedText, pendingAction.title);
        } else if (pendingAction.type === "file") {
            const origFile = pendingAction.payload;
            const ext = origFile.name.split(".").pop().toLowerCase();
            const textExts = ["txt", "log", "csv", "json"];

            if (textExts.includes(ext)) {
                try {
                    const textContent = await origFile.text();
                    const augmentedContent = injectTimestampToText(textContent, temporalData.isoTimestamp);
                    const augmentedFile = new File([augmentedContent], origFile.name, {
                        type: origFile.type || "text/plain"
                    });
                    setPendingAction(null);
                    await executeFileUpload(augmentedFile);
                } catch (err) {
                    console.warn("Could not read file text for timestamp injection, passing raw file:", err);
                    setPendingAction(null);
                    await executeFileUpload(origFile);
                }
            } else {
                setPendingAction(null);
                await executeFileUpload(origFile);
            }
        }
    };

    const handleModalCancel = () => {
        setModalOpen(false);
        setPendingAction(null);
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
                        padding: "8px 20px",
                        fontSize: "0.85rem",
                        fontWeight: "700",
                        borderRadius: "8px",
                        border: mode === "file" ? "1.5px solid #38BDF8" : "1px solid var(--border)",
                        background: mode === "file" ? "rgba(56, 189, 248, 0.16)" : "transparent",
                        color: mode === "file" ? "#38BDF8" : "var(--text-muted)",
                        boxShadow: mode === "file" ? "0 0 16px rgba(56, 189, 248, 0.35)" : "none",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
                    }}
                >
                    <span style={{ filter: mode === "file" ? "drop-shadow(0 0 6px rgba(56, 189, 248, 0.6))" : "none" }}>📁</span> 
                    Upload File / Archive
                </button>
                <button
                    type="button"
                    onClick={() => setMode("paste")}
                    style={{
                        padding: "8px 20px",
                        fontSize: "0.85rem",
                        fontWeight: "700",
                        borderRadius: "8px",
                        border: mode === "paste" ? "1.5px solid #F46B45" : "1px solid var(--border)",
                        background: mode === "paste" ? "rgba(244, 107, 69, 0.16)" : "transparent",
                        color: mode === "paste" ? "#FF8A63" : "var(--text-muted)",
                        boxShadow: mode === "paste" ? "0 0 16px rgba(244, 107, 69, 0.35)" : "none",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "8px",
                        transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
                    }}
                >
                    <span style={{ filter: mode === "paste" ? "drop-shadow(0 0 6px rgba(244, 107, 69, 0.6))" : "none" }}>📋</span> 
                    Paste Chat / Text Snippet
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
                        style={{ 
                            minHeight: "250px", 
                            border: dragOver ? "2px dashed #F46B45" : "2px dashed #20596E",
                            borderRadius: "10px",
                            margin: "16px",
                            background: dragOver ? "rgba(244, 107, 69, 0.1)" : "rgba(16, 42, 67, 0.35)",
                            boxShadow: dragOver 
                                ? "0 0 30px rgba(244, 107, 69, 0.4), inset 0 0 15px rgba(244, 107, 69, 0.2)" 
                                : "0 0 20px rgba(56, 189, 248, 0.08)",
                            cursor: "pointer",
                            transition: "all 0.22s ease",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "24px"
                        }}
                    >
                        <div style={{ fontSize: "2.4rem", marginBottom: "8px", filter: dragOver ? "drop-shadow(0 0 12px rgba(244, 107, 69, 0.6))" : "drop-shadow(0 0 10px rgba(56, 189, 248, 0.4))" }}>
                            {dragOver ? "🚀" : "🛸"}
                        </div>
                        <h3 style={{ letterSpacing: "1.2px", textTransform: "uppercase", color: dragOver ? "#FF8A63" : "#F8FAFC", textShadow: dragOver ? "0 0 12px rgba(244, 107, 69, 0.5)" : "none" }}>
                            {dragOver ? "DROP ARCHIVE FILE TO ENGAGE" : "CLICK TO SELECT FILE OR DROP IT HERE"}
                        </h3>
                        <p style={{ maxWidth: "600px", textAlign: "center", fontSize: "0.85rem", lineHeight: "1.5", color: "#94A3B8", marginTop: "6px" }}>
                            Supports XML, HTML exports, JSON (Messenger / Signal), WhatsApp (.txt / .zip), Email (.eml / .mbox), PDF documents, and Screenshots (.png / .jpg).
                        </p>
                    </div>
                </>
            ) : (
                <div className="paste-area" style={{ padding: "24px", display: "flex", flexDirection: "column", gap: "16px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                        <label style={{ fontSize: "0.8rem", fontWeight: "700", color: "#38BDF8", textTransform: "uppercase", letterSpacing: "1px", display: "flex", alignItems: "center", gap: "6px" }}>
                            <span>✦</span> Paste Chat Transcript or Messages
                        </label>
                        {detectedType && (
                            <span 
                                style={{ 
                                    fontSize: "0.75rem", 
                                    padding: "4px 12px", 
                                    borderRadius: "14px", 
                                    background: "rgba(244, 107, 69, 0.16)", 
                                    color: "#FF8A63", 
                                    border: "1px solid #F46B45", 
                                    boxShadow: "0 0 12px rgba(244, 107, 69, 0.3)",
                                    fontWeight: "700" 
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
                        placeholder="Paste conversation text here...&#10;&#10;Supported formats:&#10;  WhatsApp: 10/12/2026, 10:30 - Alice: Hey! Are you ready?&#10;  Signal: [2026-10-12 14:30:15] Alice: Meeting notes attached.&#10;  Email: From: alice@example.com / Subject: Case update...&#10;  Logs: [2026-10-12 10:30:00] Alice: Status update..."
                        rows={8}
                        style={{
                            width: "100%",
                            background: "#0A1826",
                            border: "1.5px solid #20596E",
                            borderRadius: "8px",
                            padding: "14px",
                            color: "#F8FAFC",
                            fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                            fontSize: "0.85rem",
                            lineHeight: "1.5",
                            resize: "vertical",
                            outline: "none",
                            boxShadow: "inset 0 1px 4px rgba(0, 0, 0, 0.6)"
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
                                background: "#0A1826",
                                border: "1.5px solid #20596E",
                                borderRadius: "8px",
                                padding: "10px 14px",
                                color: "#F8FAFC",
                                fontSize: "0.85rem",
                                outline: "none"
                            }}
                        />
                        <button
                            type="button"
                            className="button primary"
                            disabled={!pastedText.trim()}
                            onClick={handleProcessPaste}
                            style={{
                                padding: "11px 26px",
                                fontWeight: "800",
                                fontSize: "0.85rem",
                                letterSpacing: "0.6px",
                                background: "linear-gradient(135deg, #FF8A63 0%, #F46B45 50%, #D95737 100%)",
                                border: "none",
                                color: "#FFFFFF",
                                borderRadius: "8px",
                                cursor: pastedText.trim() ? "pointer" : "not-allowed",
                                opacity: pastedText.trim() ? 1 : 0.45,
                                boxShadow: pastedText.trim() 
                                    ? "0 4px 18px rgba(244, 107, 69, 0.55), 0 0 25px rgba(244, 107, 69, 0.3)" 
                                    : "none",
                                textShadow: "0 1px 2px rgba(0, 0, 0, 0.4)",
                                transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
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

            {/* Temporal Verification & Prompt Modal */}
            <DateTimePromptModal
                isOpen={modalOpen}
                metadata={modalMetadata}
                onConfirm={handleModalConfirm}
                onCancel={handleModalCancel}
            />
        </section>
    );
}

export default UploadPanel;
