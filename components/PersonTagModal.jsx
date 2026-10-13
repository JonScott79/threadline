/*
    PersonTagModal.jsx

    Threadline Forensic Identity & Phone Number Tagging Modal.
    Allows forensic investigators & police officers to assign formal names,
    role classifications, aliases, and notes to raw phone numbers and chat participants.
    100% styled to the Threadline Logo Identity (Dual-Glow Neon Squircle).
*/

import React, { useState, useEffect } from "react";

function PersonTagModal({
    isOpen,
    participant, // { id?, name?, phoneNumber?, aliases?, metadata? } or string identifier
    onSave,
    onClose,
    isSaving = false
}) {
    if (!isOpen) return null;

    const initialIdentifier = typeof participant === "string" 
        ? participant 
        : (participant?.phoneNumber || participant?.name || "");

    const initialName = typeof participant === "object" && participant?.name && participant.name !== initialIdentifier
        ? participant.name
        : "";

    const initialRole = participant?.metadata?.role || "";
    const initialAliases = Array.isArray(participant?.aliases)
        ? participant.aliases.filter(a => a !== initialIdentifier && a !== initialName).join(", ")
        : "";
    const initialNotes = participant?.metadata?.notes || "";

    const [name, setName] = useState(initialName);
    const [role, setRole] = useState(initialRole);
    const [aliases, setAliases] = useState(initialAliases);
    const [notes, setNotes] = useState(initialNotes);

    useEffect(() => {
        if (isOpen) {
            setName(initialName);
            setRole(initialRole);
            setAliases(initialAliases);
            setNotes(initialNotes);
        }
    }, [isOpen, participant]);

    const handleFormSubmit = (e) => {
        e.preventDefault();
        if (!name.trim()) return;

        const aliasesArray = aliases
            .split(",")
            .map(s => s.trim())
            .filter(Boolean);

        onSave({
            participantId: participant?.id,
            identifier: initialIdentifier,
            name: name.trim(),
            role: role || null,
            aliases: aliasesArray,
            notes: notes.trim() || null
        });
    };

    return (
        <div 
            style={{
                position: "fixed",
                inset: 0,
                zIndex: 10000,
                background: "rgba(4, 7, 11, 0.82)",
                backdropFilter: "blur(8px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                padding: "20px"
            }}
            onClick={(e) => {
                if (e.target === e.currentTarget && !isSaving) onClose();
            }}
        >
            <div
                style={{
                    position: "relative",
                    width: "100%",
                    maxWidth: "520px",
                    background: "linear-gradient(#070C14, #070C14) padding-box, linear-gradient(135deg, #00D0FF 0%, rgba(0, 208, 255, 0.4) 30%, rgba(255, 149, 0, 0.4) 70%, #FF9500 100%) border-box",
                    border: "1.5px solid transparent",
                    borderRadius: "22px",
                    boxShadow: "0 0 35px rgba(0, 208, 255, 0.25), 0 0 35px rgba(255, 149, 0, 0.2), 0 25px 60px rgba(0, 0, 0, 0.85)",
                    overflow: "hidden"
                }}
            >
                {/* Header with Faceted Delta & Dual Glow */}
                <div style={{
                    padding: "20px 24px 16px 24px",
                    borderBottom: "1px solid rgba(255, 255, 255, 0.08)",
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "flex-start",
                    background: "rgba(10, 16, 25, 0.7)"
                }}>
                    <div style={{ display: "flex", alignItems: "center", gap: "12px" }}>
                        {/* Chrome Delta Icon */}
                        <div style={{
                            width: "36px",
                            height: "36px",
                            borderRadius: "10px",
                            background: "rgba(0, 208, 255, 0.12)",
                            border: "1px solid rgba(0, 208, 255, 0.35)",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            boxShadow: "0 0 15px rgba(0, 208, 255, 0.3)"
                        }}>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                                <path d="M12 3L20 20L12 16L4 20L12 3Z" fill="url(#personModalDeltaGrad)" stroke="#E2E8F0" strokeWidth="1" />
                                <defs>
                                    <linearGradient id="personModalDeltaGrad" x1="4" y1="3" x2="20" y2="20">
                                        <stop offset="0%" stopColor="#FFFFFF" />
                                        <stop offset="50%" stopColor="#94A3B8" />
                                        <stop offset="100%" stopColor="#475569" />
                                    </linearGradient>
                                </defs>
                            </svg>
                        </div>

                        <div>
                            <h3 style={{
                                margin: 0,
                                fontSize: "1rem",
                                fontWeight: "800",
                                letterSpacing: "1.2px",
                                color: "#F8FAFC",
                                textTransform: "uppercase"
                            }}>
                                FORENSIC IDENTITY TAG
                            </h3>
                            <p style={{
                                margin: "3px 0 0 0",
                                fontSize: "0.74rem",
                                color: "var(--text-muted)",
                                letterSpacing: "0.3px"
                            }}>
                                Assign subject name, phone number tag, and role classification.
                            </p>
                        </div>
                    </div>

                    <button
                        type="button"
                        onClick={onClose}
                        disabled={isSaving}
                        style={{
                            background: "none",
                            border: "none",
                            color: "var(--text-muted)",
                            fontSize: "1.4rem",
                            cursor: isSaving ? "not-allowed" : "pointer",
                            lineHeight: 1,
                            padding: "2px 6px"
                        }}
                    >
                        &times;
                    </button>
                </div>

                {/* Body Form */}
                <form onSubmit={handleFormSubmit} style={{ padding: "20px 24px" }}>
                    {/* Identifier / Phone Badge */}
                    <div style={{
                        padding: "10px 14px",
                        borderRadius: "8px",
                        background: "rgba(255, 149, 0, 0.08)",
                        border: "1px solid rgba(255, 149, 0, 0.25)",
                        marginBottom: "16px",
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between"
                    }}>
                        <div>
                            <span style={{ fontSize: "0.7rem", color: "#FF9500", fontWeight: "700", textTransform: "uppercase", letterSpacing: "0.5px" }}>
                                RAW IDENTIFIER / PHONE NUMBER:
                            </span>
                            <div style={{ fontFamily: "var(--font-mono)", fontSize: "0.95rem", color: "#F8FAFC", fontWeight: "700", marginTop: "2px" }}>
                                {initialIdentifier || "Unknown Identifier"}
                            </div>
                        </div>
                        <span style={{
                            fontSize: "0.68rem",
                            fontWeight: "800",
                            color: "#00D0FF",
                            background: "rgba(0, 208, 255, 0.12)",
                            border: "1px solid rgba(0, 208, 255, 0.3)",
                            padding: "3px 8px",
                            borderRadius: "4px"
                        }}>
                            PHONE / SENDER
                        </span>
                    </div>

                    {/* Subject Full Name Input */}
                    <div style={{ marginBottom: "16px" }}>
                        <label style={{ display: "block", fontSize: "0.78rem", fontWeight: "800", color: "#00D0FF", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "6px" }}>
                            SUBJECT FULL NAME / FORENSIC TAG *
                        </label>
                        <input
                            type="text"
                            placeholder="e.g. John Doe, Suspect #1, Det. Marcus Vance, Informant X..."
                            value={name}
                            onChange={(e) => setName(e.target.value)}
                            autoFocus
                            required
                            style={{
                                width: "100%",
                                padding: "10px 14px",
                                background: "rgba(6, 11, 18, 0.85)",
                                border: "1.5px solid rgba(0, 208, 255, 0.35)",
                                borderRadius: "8px",
                                color: "#F8FAFC",
                                fontSize: "0.92rem",
                                fontWeight: "600",
                                outline: "none",
                                boxShadow: "0 0 14px rgba(0, 208, 255, 0.1), inset 0 0 10px rgba(0,0,0,0.5)"
                            }}
                        />
                    </div>

                    {/* Role Classification Dropdown */}
                    <div style={{ marginBottom: "16px" }}>
                        <label style={{ display: "block", fontSize: "0.78rem", fontWeight: "800", color: "#FF9500", letterSpacing: "0.8px", textTransform: "uppercase", marginBottom: "6px" }}>
                            INVESTIGATIVE ROLE / CLASSIFICATION
                        </label>
                        <select
                            value={role}
                            onChange={(e) => setRole(e.target.value)}
                            style={{
                                width: "100%",
                                padding: "10px 14px",
                                background: "#0A1019",
                                border: "1px solid rgba(255, 149, 0, 0.3)",
                                borderRadius: "8px",
                                color: "#F8FAFC",
                                fontSize: "0.88rem",
                                outline: "none",
                                cursor: "pointer"
                            }}
                        >
                            <option value="">-- No Classification Assigned --</option>
                            <option value="Primary Suspect">Primary Suspect</option>
                            <option value="Person of Interest">Person of Interest</option>
                            <option value="Victim">Victim</option>
                            <option value="Key Witness">Key Witness</option>
                            <option value="Law Enforcement / Officer">Law Enforcement / Officer</option>
                            <option value="Confidential Informant">Confidential Informant</option>
                            <option value="Associate / Contact">Associate / Contact</option>
                            <option value="Family / Personal">Family / Personal</option>
                            <option value="Subject">Subject</option>
                        </select>
                    </div>

                    {/* Known Aliases / Phone Numbers */}
                    <div style={{ marginBottom: "16px" }}>
                        <label style={{ display: "block", fontSize: "0.76rem", fontWeight: "700", color: "var(--text-light)", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "6px" }}>
                            KNOWN ALIASES / MONIKERS (COMMA-SEPARATED)
                        </label>
                        <input
                            type="text"
                            placeholder="e.g. Johnny, Ghost, JD, +15559876543..."
                            value={aliases}
                            onChange={(e) => setAliases(e.target.value)}
                            style={{
                                width: "100%",
                                padding: "8px 12px",
                                background: "rgba(6, 11, 18, 0.75)",
                                border: "1px solid rgba(255, 255, 255, 0.12)",
                                borderRadius: "6px",
                                color: "#F8FAFC",
                                fontSize: "0.84rem",
                                outline: "none"
                            }}
                        />
                    </div>

                    {/* Notes */}
                    <div style={{ marginBottom: "20px" }}>
                        <label style={{ display: "block", fontSize: "0.76rem", fontWeight: "700", color: "var(--text-light)", letterSpacing: "0.5px", textTransform: "uppercase", marginBottom: "6px" }}>
                            INVESTIGATIVE / CHAIN-OF-CUSTODY NOTES
                        </label>
                        <textarea
                            rows={3}
                            placeholder="e.g., Phone seized from vehicle console during search warrant on 10/12. Verified as primary burner number."
                            value={notes}
                            onChange={(e) => setNotes(e.target.value)}
                            style={{
                                width: "100%",
                                padding: "8px 12px",
                                background: "rgba(6, 11, 18, 0.75)",
                                border: "1px solid rgba(255, 255, 255, 0.12)",
                                borderRadius: "6px",
                                color: "#F8FAFC",
                                fontSize: "0.82rem",
                                lineHeight: "1.4",
                                outline: "none",
                                resize: "vertical"
                            }}
                        />
                    </div>

                    {/* Footer Actions */}
                    <div style={{ display: "flex", justifyContent: "flex-end", gap: "10px", borderTop: "1px solid rgba(255, 255, 255, 0.08)", paddingTop: "16px" }}>
                        <button
                            type="button"
                            onClick={onClose}
                            disabled={isSaving}
                            style={{
                                padding: "9px 18px",
                                background: "transparent",
                                border: "1px solid rgba(255, 255, 255, 0.15)",
                                borderRadius: "6px",
                                color: "var(--text-muted)",
                                fontSize: "0.82rem",
                                fontWeight: "600",
                                cursor: isSaving ? "not-allowed" : "pointer"
                            }}
                        >
                            Cancel
                        </button>

                        <button
                            type="submit"
                            disabled={!name.trim() || isSaving}
                            style={{
                                padding: "9px 24px",
                                background: name.trim() && !isSaving 
                                    ? "linear-gradient(135deg, #00D0FF 0%, #FF9500 100%)" 
                                    : "rgba(255, 255, 255, 0.08)",
                                border: "none",
                                borderRadius: "6px",
                                color: name.trim() && !isSaving ? "#05080E" : "var(--text-muted)",
                                fontSize: "0.84rem",
                                fontWeight: "800",
                                letterSpacing: "0.8px",
                                textTransform: "uppercase",
                                cursor: name.trim() && !isSaving ? "pointer" : "not-allowed",
                                boxShadow: name.trim() && !isSaving ? "0 0 20px rgba(0, 208, 255, 0.4)" : "none",
                                display: "flex",
                                alignItems: "center",
                                gap: "6px"
                            }}
                        >
                            {isSaving ? "SAVING TAG..." : "SAVE IDENTITY TAG"}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
}

export default PersonTagModal;
