/*
    UploadPanel.jsx

    Threadline Primary Ingestion & Telemetry Dropzone.
    100% Styled to the Official Threadline Logo Identity:
    - Dual-Glow Neon Squircle Rim (Electric Cyan #00D0FF to Warm Amber #FF9500)
    - Signature Waveform Pulse Line (Cyan to Amber gradient)
    - Faceted Chrome Delta Chevron & Radiant 4-Point Lens Flare
    - No cartoon emojis: crisp high-tech vector SVGs throughout
    - Integrated with Temporal Verification Gate for pre-flight timestamp inspection
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
    const [uploadProgress, setUploadProgress] = useState(null);

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
        
        // Limit upload size to 10GB
        const maxLimit = 10 * 1024 * 1024 * 1024;
        if (file.size > maxLimit) {
            throw new Error("File exceeds maximum limit. Upload size is capped at 10GB.");
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
        setUploadProgress({ percent: 0, chunkIndex: 1, totalChunks: 1 });
        try {
            validateFile(fileToUpload);
            const response = await uploadArchive(fileToUpload, user, threadlineId, (percent, meta) => {
                setUploadProgress({ percent, ...meta });
            });
            setStatus("idle");
            setUploadProgress(null);
            if (setImportResult) {
                setImportResult(response);
            }
        } catch (error) {
            console.error("Upload process error:", error);
            setStatus("error");
            setUploadProgress(null);
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

    // Common card container style matching Threadline Logo Squircle
    const squircleCardStyle = {
        position: "relative",
        background: "linear-gradient(#070C14, #070C14) padding-box, linear-gradient(135deg, #00D0FF 0%, rgba(0, 208, 255, 0.4) 30%, rgba(255, 149, 0, 0.4) 70%, #FF9500 100%) border-box",
        border: "1.5px solid transparent",
        borderRadius: "22px",
        boxShadow: "0 0 35px rgba(0, 208, 255, 0.22), 0 0 35px rgba(255, 149, 0, 0.18), 0 20px 50px rgba(0, 0, 0, 0.75)",
        overflow: "hidden"
    };

    // 1. Processing state UI
    if (status === "uploading") {
        return (
            <div style={squircleCardStyle}>
                <div 
                    style={{ 
                        cursor: "wait", 
                        minHeight: "280px", 
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        padding: "36px 24px",
                        background: "radial-gradient(ellipse at center, rgba(0, 208, 255, 0.08) 0%, rgba(6, 11, 18, 0.95) 100%)"
                    }}
                >
                    {/* Glowing Logo Icon */}
                    <div style={{ position: "relative", marginBottom: "20px" }}>
                        <img 
                            src="/logo-icon.png" 
                            alt="Processing..." 
                            style={{ 
                                width: "64px", 
                                height: "64px", 
                                borderRadius: "14px",
                                filter: "drop-shadow(0 0 20px rgba(0, 208, 255, 0.8)) drop-shadow(0 0 25px rgba(255, 149, 0, 0.6))",
                                animation: "pulse 2s infinite ease-in-out"
                            }} 
                        />
                    </div>

                    {/* Glowing Waveform Pulse SVG */}
                    <svg width="240" height="28" viewBox="0 0 240 28" fill="none" style={{ marginBottom: "16px" }}>
                        <path 
                            d="M0 14H75Q85 14 90 22Q95 28 100 14Q107 -4 115 14Q120 25 125 7Q130 -3 135 14Q140 23 145 14H240" 
                            stroke="url(#uploadGlowGrad)" 
                            strokeWidth="2.5" 
                            strokeLinecap="round" 
                            strokeLinejoin="round"
                        />
                        <defs>
                            <linearGradient id="uploadGlowGrad" x1="0" y1="14" x2="240" y2="14" gradientUnits="userSpaceOnUse">
                                <stop offset="0%" stopColor="#00D0FF" />
                                <stop offset="50%" stopColor="#00D0FF" />
                                <stop offset="55%" stopColor="#FF9500" />
                                <stop offset="100%" stopColor="#FF9500" />
                            </linearGradient>
                        </defs>
                    </svg>

                    <h3 style={{ 
                        color: "#F8FAFC", 
                        fontSize: "1.05rem", 
                        fontWeight: "800", 
                        letterSpacing: "1.5px", 
                        textTransform: "uppercase",
                        marginBottom: "8px",
                        textShadow: "0 0 15px rgba(0, 208, 255, 0.5)"
                    }}>
                        {uploadProgress && uploadProgress.percent < 100 
                            ? (uploadProgress.totalChunks > 1 
                                ? `UPLOADING CHUNKS (${uploadProgress.percent}%)...` 
                                : `UPLOADING ARCHIVE (${uploadProgress.percent}%)...`) 
                            : "STREAMING & PARSING COMMUNICATION DATA..."}
                    </h3>
                    {uploadProgress && (
                        <div style={{ width: "100%", maxWidth: "340px", marginTop: "4px", marginBottom: "14px" }}>
                            <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.75rem", color: "#94A3B8", marginBottom: "6px" }}>
                                <span>{uploadProgress.totalChunks > 1 ? `Chunk ${uploadProgress.chunkIndex} of ${uploadProgress.totalChunks}` : "Direct Transfer"}</span>
                                <span style={{ color: "#00D0FF", fontWeight: "700" }}>{uploadProgress.percent}%</span>
                            </div>
                            <div style={{ width: "100%", height: "6px", background: "rgba(255, 255, 255, 0.1)", borderRadius: "3px", overflow: "hidden" }}>
                                <div style={{
                                    width: `${uploadProgress.percent}%`,
                                    height: "100%",
                                    background: "linear-gradient(90deg, #00D0FF 0%, #FF9500 100%)",
                                    transition: "width 0.2s ease"
                                }} />
                            </div>
                        </div>
                    )}
                    <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", maxWidth: "460px", textAlign: "center", lineHeight: "1.6" }}>
                        Extracting timestamps, normalizing conversation participants, and populating forensic timeline records.
                    </p>
                </div>
            </div>
        );
    }

    // 2. Error state UI
    if (status === "error") {
        return (
            <div style={squircleCardStyle}>
                <div 
                    style={{ 
                        minHeight: "280px", 
                        padding: "36px 24px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        background: "radial-gradient(ellipse at center, rgba(255, 69, 58, 0.08) 0%, rgba(6, 11, 18, 0.95) 100%)"
                    }}
                >
                    <div style={{ 
                        width: "52px", 
                        height: "52px", 
                        borderRadius: "12px", 
                        background: "rgba(255, 69, 58, 0.15)",
                        border: "1.5px solid #FF453A",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "center",
                        boxShadow: "0 0 20px rgba(255, 69, 58, 0.4)",
                        marginBottom: "16px"
                    }}>
                        <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="#FF453A" strokeWidth="2.5" strokeLinecap="round">
                            <line x1="18" y1="6" x2="6" y2="18" />
                            <line x1="6" y1="6" x2="18" y2="18" />
                        </svg>
                    </div>

                    <h3 style={{ color: "#FF453A", letterSpacing: "1.5px", textTransform: "uppercase", marginBottom: "8px", fontWeight: "800" }}>
                        IMPORT FAILED
                    </h3>
                    <div 
                        style={{ 
                            color: "var(--text-light)", 
                            fontSize: "0.85rem", 
                            maxWidth: "520px", 
                            padding: "12px 18px", 
                            background: "rgba(255, 69, 58, 0.06)", 
                            border: "1px solid rgba(255, 69, 58, 0.25)", 
                            borderRadius: "8px", 
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
                        type="button"
                        onClick={() => setStatus("idle")}
                        style={{ 
                            padding: "10px 28px", 
                            fontSize: "0.85rem", 
                            fontWeight: "800",
                            letterSpacing: "1px",
                            background: "linear-gradient(135deg, #FF453A 0%, #FF9500 100%)",
                            color: "#FFFFFF",
                            border: "none",
                            borderRadius: "8px",
                            cursor: "pointer",
                            boxShadow: "0 0 20px rgba(255, 69, 58, 0.4)"
                        }}
                    >
                        TRY AGAIN
                    </button>
                </div>
            </div>
        );
    }

    // 3. Default idle UI with Logo-Matched Dual Glow
    return (
        <section style={squircleCardStyle}>
            {/* Mode Switcher Tabs */}
            <div 
                style={{ 
                    display: "flex", 
                    gap: "10px", 
                    padding: "14px 20px", 
                    borderBottom: "1px solid rgba(255, 255, 255, 0.07)", 
                    background: "rgba(10, 16, 25, 0.65)",
                    backdropFilter: "blur(12px)"
                }}
            >
                {/* File Upload Mode Tab */}
                <button
                    type="button"
                    onClick={() => setMode("file")}
                    style={{
                        padding: "10px 22px",
                        fontSize: "0.85rem",
                        fontWeight: "800",
                        letterSpacing: "0.5px",
                        borderRadius: "10px",
                        border: mode === "file" ? "1.5px solid #00D0FF" : "1px solid rgba(255, 255, 255, 0.08)",
                        background: mode === "file" ? "rgba(0, 208, 255, 0.14)" : "rgba(255, 255, 255, 0.02)",
                        color: mode === "file" ? "#00D0FF" : "var(--text-muted)",
                        boxShadow: mode === "file" ? "0 0 20px rgba(0, 208, 255, 0.4), inset 0 0 10px rgba(0, 208, 255, 0.15)" : "none",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
                    }}
                >
                    {/* Sleek Upload Tray Vector Icon */}
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                        <polyline points="17 8 12 3 7 8" />
                        <line x1="12" y1="3" x2="12" y2="15" />
                    </svg>
                    Upload File / Archive
                </button>

                {/* Paste Mode Tab */}
                <button
                    type="button"
                    onClick={() => setMode("paste")}
                    style={{
                        padding: "10px 22px",
                        fontSize: "0.85rem",
                        fontWeight: "800",
                        letterSpacing: "0.5px",
                        borderRadius: "10px",
                        border: mode === "paste" ? "1.5px solid #FF9500" : "1px solid rgba(255, 255, 255, 0.08)",
                        background: mode === "paste" ? "rgba(255, 149, 0, 0.14)" : "rgba(255, 255, 255, 0.02)",
                        color: mode === "paste" ? "#FF9500" : "var(--text-muted)",
                        boxShadow: mode === "paste" ? "0 0 20px rgba(255, 149, 0, 0.4), inset 0 0 10px rgba(255, 149, 0, 0.15)" : "none",
                        cursor: "pointer",
                        display: "flex",
                        alignItems: "center",
                        gap: "10px",
                        transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
                    }}
                >
                    {/* Sleek Terminal / Snippet Vector Icon */}
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                        <polyline points="4 17 10 11 4 5" />
                        <line x1="12" y1="19" x2="20" y2="19" />
                    </svg>
                    Paste Chat / Text Snippet
                </button>
            </div>

            {/* Mode 1: File Dropzone */}
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
                        onClick={handleAreaClick}
                        onDragOver={handleDragOver}
                        onDragEnter={handleDragEnter}
                        onDragLeave={handleDragLeave}
                        onDrop={handleDrop}
                        style={{ 
                            minHeight: "270px", 
                            border: dragOver ? "2px dashed #FF9500" : "1.5px dashed rgba(0, 208, 255, 0.35)",
                            borderRadius: "16px",
                            margin: "18px",
                            background: dragOver 
                                ? "radial-gradient(ellipse at center, rgba(255, 149, 0, 0.14) 0%, rgba(6, 11, 18, 0.95) 100%)" 
                                : "radial-gradient(ellipse at center, rgba(0, 208, 255, 0.05) 0%, rgba(6, 11, 18, 0.85) 100%)",
                            boxShadow: dragOver 
                                ? "0 0 40px rgba(255, 149, 0, 0.5), inset 0 0 25px rgba(255, 149, 0, 0.2)" 
                                : "0 0 25px rgba(0, 208, 255, 0.08), inset 0 0 20px rgba(0, 208, 255, 0.03)",
                            cursor: "pointer",
                            transition: "all 0.22s cubic-bezier(0.16, 1, 0.3, 1)",
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            justifyContent: "center",
                            padding: "28px 24px"
                        }}
                    >
                        {/* Emblem: Official Logo Badge with Chrome Arrow & Dual Neon Glow */}
                        <div style={{ position: "relative", marginBottom: "16px" }}>
                            <img 
                                src="/logo-icon.png" 
                                alt="Threadline" 
                                style={{ 
                                    width: "60px", 
                                    height: "60px", 
                                    borderRadius: "14px",
                                    filter: dragOver 
                                        ? "drop-shadow(0 0 25px rgba(255, 149, 0, 0.9)) drop-shadow(0 0 15px rgba(0, 208, 255, 0.6))" 
                                        : "drop-shadow(0 0 16px rgba(0, 208, 255, 0.65)) drop-shadow(0 0 14px rgba(255, 149, 0, 0.45))",
                                    transform: dragOver ? "scale(1.08)" : "scale(1)",
                                    transition: "all 0.25s ease"
                                }} 
                            />
                        </div>

                        {/* Signature Horizontal Waveform Accent */}
                        <svg width="220" height="24" viewBox="0 0 220 24" fill="none" style={{ marginBottom: "14px" }}>
                            <path 
                                d="M0 12H70Q80 12 85 19Q90 24 95 12Q102 -3 108 12Q113 22 117 6Q122 -2 127 12Q132 20 137 12H220" 
                                stroke="url(#dropZoneWaveGrad)" 
                                strokeWidth="2.2" 
                                strokeLinecap="round" 
                                strokeLinejoin="round"
                            />
                            <defs>
                                <linearGradient id="dropZoneWaveGrad" x1="0" y1="12" x2="220" y2="12" gradientUnits="userSpaceOnUse">
                                    <stop offset="0%" stopColor="#00D0FF" />
                                    <stop offset="48%" stopColor="#00D0FF" />
                                    <stop offset="52%" stopColor="#FF9500" />
                                    <stop offset="100%" stopColor="#FF9500" />
                                </linearGradient>
                            </defs>
                        </svg>

                        {/* Title */}
                        <h3 style={{ 
                            fontSize: "1.1rem",
                            fontWeight: "800",
                            letterSpacing: "1.5px", 
                            textTransform: "uppercase", 
                            color: dragOver ? "#FF9500" : "#F8FAFC", 
                            textShadow: dragOver ? "0 0 18px rgba(255, 149, 0, 0.7)" : "0 0 12px rgba(0, 208, 255, 0.4)",
                            marginBottom: "10px"
                        }}>
                            {dragOver ? "RELEASE ARCHIVE TO INGEST" : "CLICK TO SELECT FILE OR DROP IT HERE"}
                        </h3>

                        {/* Supported Formats Pill Strip */}
                        <div style={{
                            display: "flex",
                            flexWrap: "wrap",
                            justifyContent: "center",
                            gap: "6px",
                            maxWidth: "520px",
                            margin: "4px 0 12px 0"
                        }}>
                            {[
                                "XML Exports", "HTML Backups", "Messenger JSON", 
                                "WhatsApp (.txt / .zip)", "Signal", "Email (.eml / .mbox)", 
                                "PDF Forensics", "Screenshots / OCR"
                            ].map((tag) => (
                                <span 
                                    key={tag}
                                    style={{
                                        fontSize: "0.72rem",
                                        fontWeight: "600",
                                        letterSpacing: "0.4px",
                                        padding: "3px 9px",
                                        borderRadius: "6px",
                                        background: "rgba(255, 255, 255, 0.03)",
                                        border: "1px solid rgba(255, 255, 255, 0.08)",
                                        color: "var(--text-light)"
                                    }}
                                >
                                    {tag}
                                </span>
                            ))}
                        </div>

                        <p style={{ 
                            color: "var(--text-muted)", 
                            fontSize: "0.8rem", 
                            margin: 0,
                            letterSpacing: "0.3px"
                        }}>
                            Max file size: 10GB &bull; Direct streaming & chunked upload on ingest
                        </p>
                    </div>
                </>
            ) : (
                /* Mode 2: Direct Text & Chat Snippet Pasting */
                <div style={{ padding: "20px 24px" }}>
                    <div style={{ marginBottom: "14px" }}>
                        <div style={{ 
                            display: "flex", 
                            justifyContent: "space-between", 
                            alignItems: "center", 
                            marginBottom: "8px" 
                        }}>
                            <label style={{ 
                                fontSize: "0.78rem", 
                                fontWeight: "800", 
                                letterSpacing: "1px", 
                                color: "#FF9500", 
                                textTransform: "uppercase" 
                            }}>
                                SOURCE / THREAD LABEL (OPTIONAL)
                            </label>
                            {detectedType && (
                                <span style={{
                                    fontSize: "0.72rem",
                                    fontWeight: "800",
                                    color: "#00D0FF",
                                    background: "rgba(0, 208, 255, 0.12)",
                                    border: "1px solid rgba(0, 208, 255, 0.3)",
                                    padding: "2px 8px",
                                    borderRadius: "4px",
                                    letterSpacing: "0.5px"
                                }}>
                                    DETECTED: {detectedType.toUpperCase()}
                                </span>
                            )}
                        </div>
                        <input
                            type="text"
                            placeholder="e.g., Target WhatsApp Export, Incident Transcript, SMS Thread..."
                            value={pasteTitle}
                            onChange={(e) => setPasteTitle(e.target.value)}
                            style={{
                                width: "100%",
                                padding: "10px 14px",
                                background: "rgba(6, 11, 18, 0.7)",
                                border: "1px solid rgba(255, 149, 0, 0.35)",
                                borderRadius: "8px",
                                color: "#F8FAFC",
                                fontSize: "0.88rem",
                                outline: "none",
                                boxShadow: "inset 0 0 10px rgba(0, 0, 0, 0.5)"
                            }}
                        />
                    </div>

                    <div style={{ marginBottom: "16px" }}>
                        <textarea
                            rows={8}
                            placeholder="Paste raw conversation text, exported messages, chat snippets, or communication logs here..."
                            value={pastedText}
                            onChange={(e) => {
                                setPastedText(e.target.value);
                                detectPastedFormat(e.target.value);
                            }}
                            style={{
                                width: "100%",
                                padding: "12px 14px",
                                background: "rgba(6, 11, 18, 0.8)",
                                border: "1px solid rgba(0, 208, 255, 0.3)",
                                borderRadius: "8px",
                                color: "#F8FAFC",
                                fontSize: "0.84rem",
                                fontFamily: "var(--font-mono)",
                                lineHeight: "1.5",
                                resize: "vertical",
                                outline: "none",
                                boxShadow: "inset 0 0 15px rgba(0, 0, 0, 0.6)"
                            }}
                        />
                    </div>

                    <div style={{ display: "flex", justifyContent: "flex-end" }}>
                        <button
                            type="button"
                            onClick={handleProcessPaste}
                            disabled={!pastedText.trim()}
                            style={{
                                padding: "12px 28px",
                                fontSize: "0.85rem",
                                fontWeight: "800",
                                letterSpacing: "1px",
                                textTransform: "uppercase",
                                borderRadius: "8px",
                                border: "none",
                                background: pastedText.trim() 
                                    ? "linear-gradient(135deg, #00D0FF 0%, #FF9500 100%)" 
                                    : "rgba(255, 255, 255, 0.08)",
                                color: pastedText.trim() ? "#05080E" : "var(--text-muted)",
                                boxShadow: pastedText.trim() 
                                    ? "0 0 25px rgba(0, 208, 255, 0.4), 0 0 25px rgba(255, 149, 0, 0.35)" 
                                    : "none",
                                cursor: pastedText.trim() ? "pointer" : "not-allowed",
                                display: "flex",
                                alignItems: "center",
                                gap: "8px",
                                transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
                            }}
                        >
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                                <polygon points="5 3 19 12 5 21 5 3" />
                            </svg>
                            INGEST &amp; VERIFY CHAT STREAM
                        </button>
                    </div>
                </div>
            )}

            {/* Interactive Temporal Verification Modal */}
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
