import React, { useState, useMemo } from "react";
import axios from "axios";
import { API_BASE_URL } from "../src/apiConfig";

export default function LinkIdentifierModal({
    isOpen,
    onClose,
    subject,
    threadlineId,
    availableIdentifiers = [],
    onLinked,
    uid = "local"
}) {
    if (!isOpen || !subject) return null;

    const [mode, setMode] = useState("detected"); // "detected" | "custom"
    const [selectedIdent, setSelectedIdent] = useState("");
    const [customIdent, setCustomIdent] = useState("");
    const [confidence, setConfidence] = useState("verified");
    const [notes, setNotes] = useState("");
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

    // Filter available identifiers to exclude identifiers already associated with this subject
    const subjectIdents = useMemo(() => {
        return new Set(subject.allIdentifiers || [subject.phoneNumber, subject.name].filter(Boolean));
    }, [subject]);

    const candidates = useMemo(() => {
        return (availableIdentifiers || []).filter(c => !subjectIdents.has(c.identifier));
    }, [availableIdentifiers, subjectIdents]);

    const targetIdentifier = mode === "detected" ? selectedIdent : customIdent.trim();

    async function handleSubmit(e) {
        e.preventDefault();
        setErrorMsg("");

        if (!targetIdentifier) {
            setErrorMsg("Please select or enter an identifier to link.");
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await axios.post(
                `${API_BASE_URL}/threadlines/${threadlineId}/participants/${subject.id}/link`,
                {
                    identifier: targetIdentifier,
                    confidence,
                    notes: notes.trim()
                },
                {
                    headers: { "x-user-uid": uid }
                }
            );

            if (response.data && response.data.status === "success") {
                if (onLinked) {
                    onLinked(response.data.participant);
                }
                onClose();
            } else {
                setErrorMsg(response.data?.message || "Failed to link identifier.");
            }
        } catch (err) {
            setErrorMsg(err.response?.data?.message || err.message || "Failed to link identifier.");
        } finally {
            setIsSubmitting(false);
        }
    }

    return (
        <div className="modal-backdrop" onClick={onClose} style={{ zIndex: 10000 }}>
            <div
                className="modal-container"
                onClick={(e) => e.stopPropagation()}
                style={{
                    maxWidth: "540px",
                    width: "90%",
                    background: "#080E18",
                    border: "1.5px solid rgba(0, 208, 255, 0.4)",
                    borderRadius: "12px",
                    padding: "24px",
                    boxShadow: "0 10px 40px rgba(0, 0, 0, 0.8), 0 0 25px rgba(0, 208, 255, 0.15)",
                    color: "var(--text-light)"
                }}
            >
                {/* Header */}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: "16px" }}>
                    <div>
                        <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                            <span style={{ fontSize: "1.2rem" }}>🔗</span>
                            <h3 style={{ margin: 0, fontSize: "1.05rem", color: "#3fd8ff", letterSpacing: "0.8px", textTransform: "uppercase" }}>
                                Link Secondary Identifier
                            </h3>
                        </div>
                        <p style={{ margin: "4px 0 0 0", fontSize: "0.78rem", color: "var(--text-muted)" }}>
                            Associate burner phones, secondary SIMs, or app handles to Subject entity.
                        </p>
                    </div>
                    <button
                        type="button"
                        onClick={onClose}
                        style={{
                            background: "transparent",
                            border: "none",
                            color: "var(--text-muted)",
                            fontSize: "1.2rem",
                            cursor: "pointer",
                            padding: "0 4px"
                        }}
                    >
                        ✕
                    </button>
                </div>

                {/* Target Subject Summary */}
                <div style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "10px 14px",
                    borderRadius: "8px",
                    background: "rgba(0, 208, 255, 0.06)",
                    border: "1px solid rgba(0, 208, 255, 0.2)",
                    marginBottom: "18px"
                }}>
                    <div>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.6px" }}>
                            Target Subject Entity
                        </div>
                        <div style={{ fontSize: "0.95rem", fontWeight: "700", color: "#FFF" }}>
                            {subject.name || subject.phoneNumber || "Unnamed Subject"}
                        </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                        <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", textTransform: "uppercase", letterSpacing: "0.6px" }}>
                            Primary Identifier
                        </div>
                        <div style={{ fontSize: "0.82rem", fontFamily: "var(--font-mono)", color: "#FF9500" }}>
                            {subject.phoneNumber || subject.name}
                        </div>
                    </div>
                </div>

                {errorMsg && (
                    <div style={{
                        padding: "8px 12px",
                        marginBottom: "16px",
                        borderRadius: "6px",
                        background: "rgba(255, 69, 58, 0.15)",
                        border: "1px solid rgba(255, 69, 58, 0.4)",
                        color: "#FF453A",
                        fontSize: "0.8rem"
                    }}>
                        {errorMsg}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    {/* Identifier Source Mode */}
                    <div style={{ marginBottom: "14px" }}>
                        <label style={{ display: "block", fontSize: "0.75rem", fontWeight: "700", color: "var(--text-light)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "6px" }}>
                            IDENTIFIER SOURCE
                        </label>
                        <div style={{ display: "flex", gap: "8px" }}>
                            <button
                                type="button"
                                onClick={() => setMode("detected")}
                                style={{
                                    flex: 1,
                                    padding: "7px 10px",
                                    borderRadius: "6px",
                                    fontSize: "0.78rem",
                                    fontWeight: "700",
                                    cursor: "pointer",
                                    border: mode === "detected" ? "1px solid #3fd8ff" : "1px solid rgba(255,255,255,0.12)",
                                    background: mode === "detected" ? "rgba(0, 208, 255, 0.15)" : "rgba(255,255,255,0.03)",
                                    color: mode === "detected" ? "#3fd8ff" : "var(--text-muted)"
                                }}
                            >
                                📱 Detected in Case ({candidates.length})
                            </button>
                            <button
                                type="button"
                                onClick={() => setMode("custom")}
                                style={{
                                    flex: 1,
                                    padding: "7px 10px",
                                    borderRadius: "6px",
                                    fontSize: "0.78rem",
                                    fontWeight: "700",
                                    cursor: "pointer",
                                    border: mode === "custom" ? "1px solid #3fd8ff" : "1px solid rgba(255,255,255,0.12)",
                                    background: mode === "custom" ? "rgba(0, 208, 255, 0.15)" : "rgba(255,255,255,0.03)",
                                    color: mode === "custom" ? "#3fd8ff" : "var(--text-muted)"
                                }}
                            >
                                ✏️ Enter Custom Burner / Handle
                            </button>
                        </div>
                    </div>

                    {/* Selection / Input Field */}
                    {mode === "detected" ? (
                        <div style={{ marginBottom: "16px" }}>
                            <label style={{ display: "block", fontSize: "0.74rem", fontWeight: "700", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "6px" }}>
                                SELECT DETECTED IDENTIFIER
                            </label>
                            {candidates.length > 0 ? (
                                <select
                                    value={selectedIdent}
                                    onChange={(e) => setSelectedIdent(e.target.value)}
                                    required
                                    style={{
                                        width: "100%",
                                        padding: "9px 12px",
                                        background: "#05090F",
                                        border: "1px solid rgba(0, 208, 255, 0.35)",
                                        borderRadius: "6px",
                                        color: "#FFF",
                                        fontSize: "0.85rem",
                                        fontFamily: "var(--font-mono)",
                                        outline: "none"
                                    }}
                                >
                                    <option value="">-- Choose detected number or handle --</option>
                                    {candidates.map(c => (
                                        <option key={c.identifier} value={c.identifier}>
                                            {c.identifier} ({c.messageCount} msgs)
                                            {c.assignedTo ? ` [Currently: ${c.assignedTo.name}]` : " [Unassigned]"}
                                        </option>
                                    ))}
                                </select>
                            ) : (
                                <div style={{ fontSize: "0.78rem", color: "var(--text-muted)", fontStyle: "italic", padding: "6px 0" }}>
                                    All detected case identifiers are already associated with this subject.
                                </div>
                            )}
                        </div>
                    ) : (
                        <div style={{ marginBottom: "16px" }}>
                            <label style={{ display: "block", fontSize: "0.74rem", fontWeight: "700", color: "var(--text-muted)", textTransform: "uppercase", marginBottom: "6px" }}>
                                CUSTOM NUMBER, SIM IMSI, OR HANDLE
                            </label>
                            <input
                                type="text"
                                placeholder="e.g. +15550192831, @shadow_dealer, wickr:vance..."
                                value={customIdent}
                                onChange={(e) => setCustomIdent(e.target.value)}
                                autoFocus
                                required
                                style={{
                                    width: "100%",
                                    padding: "9px 12px",
                                    background: "#05090F",
                                    border: "1px solid rgba(0, 208, 255, 0.35)",
                                    borderRadius: "6px",
                                    color: "#FFF",
                                    fontSize: "0.85rem",
                                    fontFamily: "var(--font-mono)",
                                    outline: "none"
                                }}
                            />
                        </div>
                    )}

                    {/* Disambiguation Confidence Rating */}
                    <div style={{ marginBottom: "16px" }}>
                        <label style={{ display: "block", fontSize: "0.74rem", fontWeight: "700", color: "#FF9500", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "6px" }}>
                            DISAMBIGUATION CONFIDENCE LEVEL
                        </label>
                        <select
                            value={confidence}
                            onChange={(e) => setConfidence(e.target.value)}
                            style={{
                                width: "100%",
                                padding: "9px 12px",
                                background: "#05090F",
                                border: "1px solid rgba(255, 149, 0, 0.35)",
                                borderRadius: "6px",
                                color: "#FFF",
                                fontSize: "0.84rem",
                                outline: "none"
                            }}
                        >
                            <option value="verified">🟢 Verified - Forensic match / Subscriber records / Physical device seizure</option>
                            <option value="inferred">🟡 Inferred - Shared cell tower / Contemporaneous activity / Pattern-of-life</option>
                            <option value="suspected">🟠 Suspected - Confidential informant tip / Unverified lead</option>
                        </select>
                    </div>

                    {/* Evidentiary Rationale / Case Notes */}
                    <div style={{ marginBottom: "18px" }}>
                        <label style={{ display: "block", fontSize: "0.74rem", fontWeight: "700", color: "var(--text-light)", textTransform: "uppercase", letterSpacing: "0.6px", marginBottom: "6px" }}>
                            EVIDENTIARY RATIONALE / CHAIN-OF-CUSTODY JUSTIFICATION
                        </label>
                        <textarea
                            rows={3}
                            placeholder="e.g. Burner device recovered from nightstand during search warrant; carrier call records corroborate user identity."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            style={{
                                width: "100%",
                                padding: "8px 12px",
                                background: "rgba(6, 11, 18, 0.8)",
                                border: "1px solid rgba(255, 255, 255, 0.12)",
                                borderRadius: "6px",
                                color: "#FFF",
                                fontSize: "0.8rem",
                                outline: "none",
                                resize: "vertical"
                            }}
                        />
                    </div>

                    {/* Forensic Integrity Notice */}
                    <div style={{
                        padding: "8px 12px",
                        background: "rgba(48, 209, 88, 0.05)",
                        border: "1px solid rgba(48, 209, 88, 0.2)",
                        borderRadius: "6px",
                        fontSize: "0.72rem",
                        color: "var(--text-muted)",
                        marginBottom: "20px",
                        lineHeight: "1.4"
                    }}>
                        <strong style={{ color: "var(--success)" }}>🛡️ Forensic Integrity Guarantee:</strong> Linking this identifier updates entity resolution in Threadline without altering any raw forensic message logs. Original sender/recipient metadata is strictly preserved for trial discovery.
                    </div>

                    {/* Footer Actions */}
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: "14px" }}>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSubmitting}
                            style={{
                                padding: "8px 16px",
                                background: "transparent",
                                border: "1px solid rgba(255, 255, 255, 0.15)",
                                borderRadius: "6px",
                                color: "var(--text-muted)",
                                fontSize: "0.8rem",
                                fontWeight: "600",
                                cursor: isSubmitting ? "not-allowed" : "pointer"
                            }}
                        >
                            Cancel
                        </button>
                        <button
                            type="submit"
                            disabled={!targetIdentifier || isSubmitting}
                            style={{
                                padding: "8px 22px",
                                background: targetIdentifier && !isSubmitting
                                    ? "linear-gradient(135deg, #00D0FF 0%, #FF9500 100%)"
                                    : "rgba(255, 255, 255, 0.08)",
                                border: "none",
                                borderRadius: "6px",
                                color: targetIdentifier && !isSubmitting ? "#05080E" : "var(--text-muted)",
                                fontSize: "0.82rem",
                                fontWeight: "800",
                                letterSpacing: "0.8px",
                                textTransform: "uppercase",
                                cursor: targetIdentifier && !isSubmitting ? "pointer" : "not-allowed",
                                boxShadow: targetIdentifier && !isSubmitting ? "0 0 16px rgba(0, 208, 255, 0.35)" : "none"
                            }}
                        >
                            {isSubmitting ? "LINKING..." : "LINK IDENTIFIER"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}
