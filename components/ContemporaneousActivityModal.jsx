/*
    ContemporaneousActivityModal.jsx

    Cross-Conversation Temporal Co-Occurrence Matrix (±Δt Scanner)
    Enables investigators to pivot on any message and instantly surface all
    contemporaneous communications across all open devices, logs, and threads
    within ±N seconds of that event.
*/

import { useState, useEffect, useMemo } from "react";
import axios from "axios";
import { API_BASE_URL } from "../src/apiConfig";

const PRESET_DELTAS = [
    { label: "±15s", seconds: 15 },
    { label: "±30s", seconds: 30 },
    { label: "±60s", seconds: 60 },
    { label: "±2m", seconds: 120 },
    { label: "±5m", seconds: 300 },
    { label: "±15m", seconds: 900 },
    { label: "±30m", seconds: 1800 },
    { label: "±1h", seconds: 3600 }
];

export default function ContemporaneousActivityModal({
    threadlineId,
    pivotMessageId,
    pivotTimestamp: initialPivotTimestamp,
    uid,
    onClose,
    onJumpToMessage,
    onSegmentSaved
}) {
    const [currentPivotId, setCurrentPivotId] = useState(pivotMessageId);
    const [currentPivotTimestamp, setCurrentPivotTimestamp] = useState(initialPivotTimestamp);
    const [deltaSeconds, setDeltaSeconds] = useState(60);
    const [excludeSameConversation, setExcludeSameConversation] = useState(true);
    
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [correlationData, setCorrelationData] = useState(null);
    const [savingSegment, setSavingSegment] = useState(false);
    const [saveSuccessMsg, setSaveSuccessMsg] = useState(null);
    const [copySuccess, setCopySuccess] = useState(false);

    // Fetch correlated data when pivot, delta, or filters change
    useEffect(() => {
        let isCancelled = false;

        async function fetchCorrelation() {
            setLoading(true);
            setError(null);
            try {
                const params = {
                    deltaSeconds,
                    excludeSameConversation: excludeSameConversation ? "true" : "false"
                };
                if (currentPivotId) {
                    params.messageId = currentPivotId;
                } else if (currentPivotTimestamp) {
                    params.timestamp = currentPivotTimestamp;
                }

                const res = await axios.get(`${API_BASE_URL}/threadlines/${threadlineId}/timeline/correlate`, {
                    params,
                    headers: { "x-user-uid": uid }
                });

                if (!isCancelled) {
                    if (res.data && res.data.status === "success") {
                        setCorrelationData(res.data);
                        if (res.data.pivotMessage) {
                            setCurrentPivotTimestamp(Number(res.data.pivotMessage.timestamp));
                        }
                    } else {
                        setError(res.data?.message || "Failed to calculate correlation.");
                    }
                    setLoading(false);
                }
            } catch (err) {
                if (!isCancelled) {
                    console.error("Correlation fetch error:", err);
                    setError(err.response?.data?.message || err.message || "Failed to load correlation data.");
                    setLoading(false);
                }
            }
        }

        fetchCorrelation();

        return () => {
            isCancelled = true;
        };
    }, [threadlineId, currentPivotId, currentPivotTimestamp, deltaSeconds, excludeSameConversation, uid]);

    // Keyboard escape handling
    useEffect(() => {
        function handleKeyDown(e) {
            if (e.key === "Escape") {
                onClose();
            }
        }
        window.addEventListener("keydown", handleKeyDown);
        return () => window.removeEventListener("keydown", handleKeyDown);
    }, [onClose]);

    const pivotMsg = correlationData?.pivotMessage;
    const items = correlationData?.contemporaneous || [];
    const summary = correlationData?.summary || {};

    // Format helpers
    function formatExactTime(ts) {
        if (!ts) return "";
        const d = new Date(Number(ts));
        return d.toISOString().replace("T", " ").replace("Z", " UTC");
    }

    function formatTimeOnly(ts) {
        if (!ts) return "";
        const d = new Date(Number(ts));
        return d.toLocaleTimeString([], { hour12: false, hour: "2-digit", minute: "2-digit", second: "2-digit" });
    }

    // Pivot change
    function handlePivotTo(msg) {
        setCurrentPivotId(msg.id);
        setCurrentPivotTimestamp(Number(msg.timestamp));
        setSaveSuccessMsg(null);
    }

    // Copy formatted report to clipboard
    async function handleCopyForensicReport() {
        if (!correlationData) return;
        const p = correlationData.pivotMessage;
        const lines = [
            "==================================================================",
            "THREADLINE CONTEMPORANEOUS ACTIVITY CORRELATION MATRIX",
            "==================================================================",
            `Case Threadline ID: ${threadlineId}`,
            `Pivot Message: "${p?.body || 'N/A'}"`,
            `Pivot Timestamp: ${formatExactTime(p?.timestamp || currentPivotTimestamp)}`,
            `Pivot Sender: ${p?.sender || 'Unknown'} (${p?.roleTag || 'Unassigned'})`,
            `Pivot Log: ${p?.importFilename || 'N/A'}`,
            `Time Window: ±${deltaSeconds}s (${summary.totalCount || 0} events across ${summary.deviceCount || 0} devices)`,
            "------------------------------------------------------------------",
            "OFFSET     | TIME (UTC)            | DEVICE LOG          | SENDER / ROLE             | MESSAGE",
            "------------------------------------------------------------------"
        ];

        items.forEach(item => {
            const offsetStr = item.offsetSeconds === 0 ? " 0.0s [PIVOT]" : (item.offsetSeconds > 0 ? `+${item.offsetSeconds.toFixed(1)}s` : `${item.offsetSeconds.toFixed(1)}s`);
            const timeStr = formatExactTime(item.timestamp);
            const dev = (item.importFilename || "").substring(0, 18);
            const senderRole = `${item.participantName || item.sender || "Unknown"} [${item.roleTag || "NO ROLE"}]`;
            lines.push(`${offsetStr.padEnd(10)} | ${timeStr.padEnd(21)} | ${dev.padEnd(19)} | ${senderRole.padEnd(25)} | ${item.body || ""}`);
        });

        lines.push("==================================================================");

        try {
            await navigator.clipboard.writeText(lines.join("\n"));
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2500);
        } catch (e) {
            console.error("Clipboard copy failed:", e);
        }
    }

    // Save as evidence segment
    async function handleSaveAsSegment() {
        if (!items || items.length === 0) return;
        setSavingSegment(true);
        setSaveSuccessMsg(null);
        try {
            const allMessageIds = items.map(i => i.id);
            const title = `Contemporaneous Activity (±${deltaSeconds}s) around ${pivotMsg?.sender || 'Pivot'}`;
            const description = `Curated cross-device co-occurrence segment containing ${items.length} events detected within ±${deltaSeconds} seconds of message [ID ${pivotMsg?.id || currentPivotId}]: "${(pivotMsg?.body || '').substring(0, 60)}..."`;

            const res = await axios.post(`${API_BASE_URL}/saved-segments`, {
                title,
                description,
                messageIds: allMessageIds
            }, {
                headers: { "x-user-uid": uid }
            });

            if (res.data && res.data.status === "success") {
                setSaveSuccessMsg(`Saved as Segment "${title}" with ${allMessageIds.length} messages.`);
                if (onSegmentSaved) onSegmentSaved(res.data);
            } else {
                setError(res.data?.message || "Failed to save segment.");
            }
        } catch (err) {
            console.error("Failed to save correlated segment:", err);
            setError(err.response?.data?.message || err.message || "Failed to save segment.");
        } finally {
            setSavingSegment(false);
        }
    }

    return (
        <div className="correlate-modal-backdrop" onClick={onClose}>
            <div className="correlate-modal-window" onClick={(e) => e.stopPropagation()}>
                {/* Header */}
                <div className="correlate-header">
                    <div className="correlate-header-titles">
                        <div className="correlate-badge-chip">⚡ FORENSIC CONTEMPORANEOUS SCANNER</div>
                        <h2 className="correlate-main-title">Cross-Device Activity Co-Occurrence Matrix</h2>
                        <p className="correlate-sub-title">
                            Detect simultaneous communications across all extracted devices and conversations within a synchronized ±Δt time envelope.
                        </p>
                    </div>
                    <button className="correlate-close-btn" onClick={onClose} title="Close (Esc)">✕</button>
                </div>

                {/* Pivot Message Card */}
                {pivotMsg && (
                    <div className="correlate-pivot-card">
                        <div className="correlate-pivot-badge">
                            <span>⚡ PIVOT ANCHOR MESSAGE</span>
                            <span className="correlate-pivot-utc">{formatExactTime(pivotMsg.timestamp)}</span>
                        </div>
                        <div className="correlate-pivot-meta-row">
                            <span className="correlate-device-tag">📱 {pivotMsg.importFilename || "Direct Entry"}</span>
                            <span className="correlate-thread-tag">💬 {pivotMsg.conversationTitle || "Conversation"}</span>
                            <span className="correlate-sender-tag">
                                {pivotMsg.direction === "sent" ? "↗ Sent by Me" : `↙ From: ${pivotMsg.participantName || pivotMsg.sender}`}
                            </span>
                            {pivotMsg.roleTag && (
                                <span className={`correlate-role-pill role-${pivotMsg.roleTag.toLowerCase()}`}>
                                    {pivotMsg.roleTag}
                                </span>
                            )}
                        </div>
                        <div className="correlate-pivot-body">
                            "{pivotMsg.body}"
                        </div>
                    </div>
                )}

                {/* Controls Bar */}
                <div className="correlate-controls-bar">
                    <div className="correlate-window-presets">
                        <span className="correlate-label">CORRELATION WINDOW (±Δt):</span>
                        {PRESET_DELTAS.map(p => (
                            <button
                                key={p.seconds}
                                className={`correlate-preset-btn ${deltaSeconds === p.seconds ? "active" : ""}`}
                                onClick={() => setDeltaSeconds(p.seconds)}
                            >
                                {p.label}
                            </button>
                        ))}
                    </div>

                    <div className="correlate-filter-toggles">
                        <label className="correlate-toggle-label">
                            <input
                                type="checkbox"
                                checked={excludeSameConversation}
                                onChange={(e) => setExcludeSameConversation(e.target.checked)}
                            />
                            <span>Cross-Conversation Only (Hide same thread)</span>
                        </label>
                    </div>
                </div>

                {/* Intelligence Metrics Strip */}
                <div className="correlate-metrics-strip">
                    <div className="correlate-metric-box">
                        <span className="metric-val">{summary.totalCount || 0}</span>
                        <span className="metric-label">CONTEMPORANEOUS EVENTS</span>
                    </div>
                    <div className="correlate-metric-box">
                        <span className="metric-val">{summary.deviceCount || 0}</span>
                        <span className="metric-label">DISTINCT LOGS / DEVICES</span>
                    </div>
                    <div className="correlate-metric-box">
                        <span className="metric-val">{summary.prePivotCount || 0}</span>
                        <span className="metric-label">PRE-PIVOT (-Δt)</span>
                    </div>
                    <div className="correlate-metric-box">
                        <span className="metric-val">{summary.postPivotCount || 0}</span>
                        <span className="metric-label">POST-PIVOT (+Δt)</span>
                    </div>
                    {summary.roleBreakdown && Object.keys(summary.roleBreakdown).length > 0 && (
                        <div className="correlate-roles-box">
                            <span className="metric-label" style={{ display: "block", marginBottom: "4px" }}>PARTICIPANT ROLES:</span>
                            <div className="correlate-role-tags-wrap">
                                {Object.entries(summary.roleBreakdown).map(([role, cnt]) => (
                                    <span key={role} className={`correlate-role-pill role-${role.toLowerCase()}`}>
                                        {role}: {cnt}
                                    </span>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* Content Matrix / Waterfall */}
                <div className="correlate-matrix-container">
                    {loading ? (
                        <div className="correlate-loading-state">
                            <div className="correlate-spinner"></div>
                            <span>Scanning cross-device chronological evidence...</span>
                        </div>
                    ) : error ? (
                        <div className="correlate-error-state">
                            ⚠️ {error}
                        </div>
                    ) : items.length === 0 ? (
                        <div className="correlate-empty-state">
                            <div style={{ fontSize: "2rem", marginBottom: "8px" }}>🔍</div>
                            <strong>No contemporaneous activity detected within ±{deltaSeconds}s.</strong>
                            <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginTop: "4px" }}>
                                Try expanding the window to ±2m, ±5m, or unchecking "Cross-Conversation Only".
                            </p>
                        </div>
                    ) : (
                        <div className="correlate-waterfall-list">
                            <div className="correlate-waterfall-header">
                                <span className="col-offset">OFFSET (Δt)</span>
                                <span className="col-device">LOG / DEVICE</span>
                                <span className="col-subject">PARTICIPANT & ROLE</span>
                                <span className="col-content">COMMUNICATION CONTENT</span>
                                <span className="col-actions">ACTIONS</span>
                            </div>

                            {items.map((item) => {
                                const isPivot = item.isPivot || (pivotMsg && item.id === pivotMsg.id);
                                const isNegative = item.offsetSeconds < 0;
                                const isPositive = item.offsetSeconds > 0;

                                return (
                                    <div
                                        key={item.id}
                                        className={`correlate-waterfall-row ${isPivot ? "is-pivot-row" : ""} ${isNegative ? "is-pre" : "is-post"}`}
                                    >
                                        {/* Offset Column */}
                                        <div className="col-offset">
                                            {isPivot ? (
                                                <span className="offset-badge pivot">⚡ 0.0s PIVOT</span>
                                            ) : isNegative ? (
                                                <span className="offset-badge pre">{item.offsetSeconds.toFixed(1)}s</span>
                                            ) : (
                                                <span className="offset-badge post">+{item.offsetSeconds.toFixed(1)}s</span>
                                            )}
                                            <span className="offset-time-sub">{formatTimeOnly(item.timestamp)}</span>
                                        </div>

                                        {/* Device Column */}
                                        <div className="col-device">
                                            <span className="waterfall-device-chip" title={item.importFilename}>
                                                📱 {item.importFilename || "Direct Entry"}
                                            </span>
                                            <span className="waterfall-conv-sub" title={item.conversationTitle}>
                                                💬 {item.conversationTitle || "Thread"}
                                            </span>
                                        </div>

                                        {/* Participant / Role Column */}
                                        <div className="col-subject">
                                            <div className="subject-name-line">
                                                <span className={`direction-glyph ${item.direction}`}>
                                                    {item.direction === "sent" ? "↗" : "↙"}
                                                </span>
                                                <span className="subject-name">
                                                    {item.direction === "sent" ? "Me" : (item.participantName || item.sender)}
                                                </span>
                                            </div>
                                            {item.roleTag && (
                                                <span className={`correlate-role-pill role-${item.roleTag.toLowerCase()}`}>
                                                    {item.roleTag}
                                                </span>
                                            )}
                                        </div>

                                        {/* Body Column */}
                                        <div className="col-content">
                                            <div className="waterfall-body-text">
                                                {item.body}
                                            </div>
                                        </div>

                                        {/* Actions Column */}
                                        <div className="col-actions">
                                            {!isPivot && (
                                                <button
                                                    className="waterfall-action-btn pivot-btn"
                                                    onClick={() => handlePivotTo(item)}
                                                    title="Pivot: Center correlation matrix on this message"
                                                >
                                                    ⚡ Pivot
                                                </button>
                                            )}
                                            {onJumpToMessage && (
                                                <button
                                                    className="waterfall-action-btn jump-btn"
                                                    onClick={() => {
                                                        onJumpToMessage(item);
                                                        onClose();
                                                    }}
                                                    title="Jump to message in conversation viewer"
                                                >
                                                    View
                                                </button>
                                            )}
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>

                {/* Footer Bar */}
                <div className="correlate-footer">
                    <div className="correlate-footer-status">
                        {saveSuccessMsg && <span className="footer-success-pill">✓ {saveSuccessMsg}</span>}
                    </div>

                    <div className="correlate-footer-actions">
                        <button
                            className="correlate-btn secondary"
                            onClick={handleCopyForensicReport}
                            disabled={items.length === 0}
                            title="Copy plain text correlation matrix formatted for reports"
                        >
                            {copySuccess ? "✓ Copied Matrix to Clipboard" : "📋 Copy Forensic Table"}
                        </button>

                        <button
                            className="correlate-btn primary"
                            onClick={handleSaveAsSegment}
                            disabled={savingSegment || items.length === 0}
                            title="Save these correlated contemporaneous messages as a curated evidence segment"
                        >
                            {savingSegment ? "Saving..." : `💾 Save Correlated Segment (${items.length})`}
                        </button>

                        <button className="correlate-btn cancel" onClick={onClose}>
                            Close
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
}
