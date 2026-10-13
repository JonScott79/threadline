/*
    DateTimePromptModal.jsx

    Threadline Temporal Verification & Prompt Modal.
    100% Matched to the Official Threadline Emblem & Vector Identity:
    - Dual-Glow Neon Squircle Rim (Electric Cyan #00D0FF to Warm Amber #FF9500)
    - Faceted Brushed Chrome Delta Chevron
    - Radiant 4-Point Lens Flare Sparkle (✦)
    - Neon Waveform Pulse Line
    - Pitch Midnight Backdrop (#060B12 to #0B121C)
*/

import React, { useState } from "react";
import { formatCanonicalISO } from "../js/utilities/temporalVerifier";

function DateTimePromptModal({ isOpen, metadata, onConfirm, onCancel }) {
    if (!isOpen) return null;

    const now = new Date();

    const [selectedYear, setSelectedYear] = useState(now.getFullYear());
    const [selectedMonth, setSelectedMonth] = useState(now.getMonth()); // 0-11
    const [selectedDay, setSelectedDay] = useState(now.getDate());

    const initialHour = now.getHours() % 12 || 12;
    const initialAmPm = now.getHours() >= 12 ? "PM" : "AM";

    const [hour, setHour] = useState(String(initialHour).padStart(2, "0"));
    const [minute, setMinute] = useState(String(now.getMinutes()).padStart(2, "0"));
    const [second, setSecond] = useState(String(now.getSeconds()).padStart(2, "0"));
    const [ampm, setAmPm] = useState(initialAmPm);
    const [timezone, setTimezone] = useState(Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC");
    const [applyToAll, setApplyToAll] = useState(true);

    const monthNames = [
        "JANUARY", "FEBRUARY", "MARCH", "APRIL", "MAY", "JUNE",
        "JULY", "AUGUST", "SEPTEMBER", "OCTOBER", "NOVEMBER", "DECEMBER"
    ];

    const timezones = [
        Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC",
        "UTC",
        "America/New_York",
        "America/Chicago",
        "America/Denver",
        "America/Los_Angeles",
        "Europe/London",
        "Europe/Paris",
        "Asia/Tokyo",
        "Australia/Sydney"
    ];
    const uniqueTimezones = Array.from(new Set(timezones));

    // Calendar Navigation
    const handlePrevMonth = () => {
        if (selectedMonth === 0) {
            setSelectedMonth(11);
            setSelectedYear(y => y - 1);
        } else {
            setSelectedMonth(m => m - 1);
        }
    };

    const handleNextMonth = () => {
        if (selectedMonth === 11) {
            setSelectedMonth(0);
            setSelectedYear(y => y + 1);
        } else {
            setSelectedMonth(m => m + 1);
        }
    };

    // Presets
    const handlePresetNow = () => {
        const d = new Date();
        setSelectedYear(d.getFullYear());
        setSelectedMonth(d.getMonth());
        setSelectedDay(d.getDate());
        const h = d.getHours() % 12 || 12;
        setHour(String(h).padStart(2, "0"));
        setMinute(String(d.getMinutes()).padStart(2, "0"));
        setSecond(String(d.getSeconds()).padStart(2, "0"));
        setAmPm(d.getHours() >= 12 ? "PM" : "AM");
    };

    const handlePresetStartOfDay = () => {
        setHour("12");
        setMinute("00");
        setSecond("00");
        setAmPm("AM");
    };

    const handlePresetEndOfDay = () => {
        setHour("11");
        setMinute("59");
        setSecond("59");
        setAmPm("PM");
    };

    // Calculate Canonical ISO
    const canonicalIso = formatCanonicalISO(
        selectedYear,
        selectedMonth,
        selectedDay,
        hour,
        minute,
        second,
        ampm,
        timezone
    );

    // Render Calendar Days
    const firstDayOfWeek = new Date(selectedYear, selectedMonth, 1).getDay();
    const daysInMonth = new Date(selectedYear, selectedMonth + 1, 0).getDate();

    const calendarCells = [];
    for (let i = 0; i < firstDayOfWeek; i++) {
        calendarCells.push(<div key={`empty-${i}`} style={{ aspectRatio: "1" }} />);
    }
    for (let d = 1; d <= daysInMonth; d++) {
        const isSelected = selectedDay === d;
        const isToday = now.getFullYear() === selectedYear && now.getMonth() === selectedMonth && now.getDate() === d;
        calendarCells.push(
            <button
                key={`day-${d}`}
                type="button"
                onClick={() => setSelectedDay(d)}
                style={{
                    aspectRatio: "1",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: "0.85rem",
                    fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                    fontWeight: isSelected ? "800" : "600",
                    borderRadius: "7px",
                    border: isSelected 
                        ? "1.5px solid #FFFFFF" 
                        : isToday 
                        ? "1.5px solid #00D0FF" 
                        : "1px solid transparent",
                    background: isSelected 
                        ? "linear-gradient(135deg, #FFA01E 0%, #FF8500 50%, #E66A00 100%)" 
                        : isToday 
                        ? "rgba(0, 208, 255, 0.15)" 
                        : "rgba(255, 255, 255, 0.03)",
                    color: isSelected ? "#060B12" : isToday ? "#00D0FF" : "#E2E8F0",
                    cursor: "pointer",
                    boxShadow: isSelected 
                        ? "0 0 18px rgba(255, 149, 0, 0.8), inset 0 1px 1px rgba(255, 255, 255, 0.5)" 
                        : isToday 
                        ? "0 0 12px rgba(0, 208, 255, 0.4)" 
                        : "none",
                    transform: isSelected ? "scale(1.08)" : "scale(1)",
                    transition: "all 0.16s cubic-bezier(0.16, 1, 0.3, 1)"
                }}
            >
                {d}
            </button>
        );
    }

    const handleConfirm = () => {
        onConfirm({
            isoTimestamp: canonicalIso,
            datePart: `${selectedYear}-${String(selectedMonth + 1).padStart(2, "0")}-${String(selectedDay).padStart(2, "0")}`,
            timePart: `${hour}:${minute}:${second} ${ampm}`,
            timezone,
            applyToAll
        });
    };

    return (
        <div 
            style={{
                position: "fixed",
                inset: 0,
                background: "radial-gradient(circle at 50% 35%, rgba(6, 14, 26, 0.92) 0%, rgba(2, 6, 12, 0.98) 100%)",
                backdropFilter: "blur(12px)",
                WebkitBackdropFilter: "blur(12px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 999999,
                padding: "20px"
            }}
        >
            {/* Modal Card with Official Dual-Glow Border Rim */}
            <div 
                style={{
                    width: "100%",
                    maxWidth: "620px",
                    background: "linear-gradient(180deg, #0B1422 0%, #060B12 100%)",
                    border: "2px solid transparent",
                    backgroundClip: "padding-box",
                    borderRadius: "16px",
                    boxShadow: 
                        "0 0 35px rgba(0, 208, 255, 0.3), 0 0 35px rgba(255, 149, 0, 0.25), 0 25px 60px rgba(0, 0, 0, 0.9), inset 0 1px 1px rgba(255, 255, 255, 0.15)",
                    position: "relative",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden"
                }}
            >
                {/* Dual-Glow Border Rim Emulation */}
                <div 
                    style={{
                        position: "absolute",
                        inset: "-2px",
                        borderRadius: "16px",
                        background: "linear-gradient(135deg, #00D0FF 0%, rgba(0, 208, 255, 0.5) 30%, rgba(255, 149, 0, 0.5) 70%, #FF9500 100%)",
                        zIndex: -1,
                        pointerEvents: "none",
                        opacity: 0.9
                    }}
                />

                {/* Header Deck */}
                <div 
                    style={{
                        padding: "22px 28px 18px",
                        background: "linear-gradient(180deg, rgba(0, 208, 255, 0.12) 0%, rgba(6, 11, 18, 0.4) 100%)",
                        borderBottom: "1px solid rgba(0, 208, 255, 0.25)",
                        position: "relative"
                    }}
                >
                    <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "8px" }}>
                        <span 
                            style={{
                                display: "inline-flex",
                                alignItems: "center",
                                gap: "6px",
                                fontSize: "0.72rem",
                                fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                                fontWeight: "800",
                                letterSpacing: "1.4px",
                                textTransform: "uppercase",
                                padding: "4px 12px",
                                borderRadius: "20px",
                                background: "rgba(0, 208, 255, 0.12)",
                                border: "1px solid #00D0FF",
                                color: "#00D0FF",
                                boxShadow: "0 0 14px rgba(0, 208, 255, 0.4)"
                            }}
                        >
                            ✦ THREADLINE FORENSIC TEMPORAL GATE
                        </span>

                        {/* Top-right Lens Flare Sparkle */}
                        <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                            <span style={{ color: "#00D0FF", filter: "drop-shadow(0 0 8px #00D0FF)", fontSize: "1.1rem" }}>✦</span>
                            <span style={{ color: "#FF9500", filter: "drop-shadow(0 0 8px #FF9500)", fontSize: "0.85rem" }}>▲</span>
                        </div>
                    </div>

                    <h3 
                        style={{ 
                            margin: 0, 
                            fontSize: "1.35rem", 
                            fontWeight: "900", 
                            letterSpacing: "0.8px", 
                            display: "flex", 
                            alignItems: "center", 
                            gap: "10px", 
                            color: "#FFFFFF",
                            textShadow: "0 0 16px rgba(0, 208, 255, 0.45)" 
                        }}
                    >
                        {/* Chrome Delta Arrow Icon */}
                        <svg width="22" height="22" viewBox="0 0 40 40" fill="none" style={{ filter: "drop-shadow(0 0 8px #00D0FF)" }}>
                            <polygon points="20,4 6,36 20,28" fill="#E2E8F0" />
                            <polygon points="20,4 34,36 20,28" fill="#94A3B8" />
                            <line x1="20" y1="4" x2="20" y2="28" stroke="#FFFFFF" strokeWidth="1" opacity="0.8" />
                        </svg>
                        TIMESTAMP VERIFICATION REQUIRED
                    </h3>
                    <p style={{ margin: "6px 0 0", fontSize: "0.85rem", color: "#94A3B8", lineHeight: "1.45" }}>
                        Threadline requires verifiable dates and times to index conversational timelines. Please specify the temporal baseline below.
                    </p>
                </div>

                {/* Target Information Banner with Dual-Glow Accent */}
                <div 
                    style={{
                        background: "rgba(5, 10, 18, 0.95)",
                        borderLeft: "4px solid #00D0FF",
                        borderRight: "4px solid #FF9500",
                        padding: "11px 18px",
                        margin: "16px 28px 4px",
                        borderRadius: "8px",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "0.82rem",
                        fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                        boxShadow: "0 0 15px rgba(0, 208, 255, 0.1), inset 0 1px 4px rgba(0, 0, 0, 0.8)"
                    }}
                >
                    <span style={{ color: "#00D0FF", fontWeight: "800", letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: "6px" }}>
                        <span>▲</span> {metadata?.sourceName || "SOURCE ARCHIVE"}
                    </span>
                    <span style={{ color: "#FFA01E", fontWeight: "700", fontSize: "0.78rem" }}>
                        {metadata?.reason || "No timestamps detected"}
                    </span>
                </div>

                {/* Body Deck */}
                <div style={{ padding: "14px 28px", display: "flex", flexDirection: "column", gap: "16px", maxHeight: "68vh", overflowY: "auto" }}>
                    {/* Custom Calendar with Logo-Themed Grid */}
                    <div 
                        style={{
                            background: "#080F1B",
                            border: "1.5px solid rgba(0, 208, 255, 0.3)",
                            borderRadius: "10px",
                            padding: "16px",
                            boxShadow: "inset 0 2px 10px rgba(0, 0, 0, 0.6), 0 0 20px rgba(0, 208, 255, 0.08)"
                        }}
                    >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "14px", borderBottom: "1px solid rgba(0, 208, 255, 0.2)", paddingBottom: "10px" }}>
                            <button
                                type="button"
                                onClick={handlePrevMonth}
                                style={navBtnStyle}
                            >
                                «
                            </button>
                            <span 
                                style={{ 
                                    fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)", 
                                    fontSize: "1.1rem", 
                                    fontWeight: "900", 
                                    color: "#00D0FF", 
                                    letterSpacing: "1.5px",
                                    textShadow: "0 0 14px rgba(0, 208, 255, 0.6)"
                                }}
                            >
                                {monthNames[selectedMonth]} {selectedYear}
                            </span>
                            <button
                                type="button"
                                onClick={handleNextMonth}
                                style={navBtnStyle}
                            >
                                »
                            </button>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "5px", textAlign: "center" }}>
                            {["SU", "MO", "TU", "WE", "TH", "FR", "SA"].map(d => (
                                <div key={d} style={{ fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)", fontSize: "0.72rem", color: "#6487A5", fontWeight: "800", paddingBottom: "6px", letterSpacing: "1px" }}>
                                    {d}
                                </div>
                            ))}
                            {calendarCells}
                        </div>
                    </div>

                    {/* Time & Timezone Dropdowns */}
                    <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: "14px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <label style={labelStyle}>
                                Time of Event (HH:MM:SS)
                            </label>
                            <div style={{ display: "flex", alignItems: "center", gap: "5px" }}>
                                <select 
                                    value={hour} 
                                    onChange={(e) => setHour(e.target.value)}
                                    style={selectStyle}
                                >
                                    {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map(h => (
                                        <option key={h} value={h}>{h}</option>
                                    ))}
                                </select>
                                <span style={{ color: "#FFA01E", fontWeight: "900", fontFamily: "monospace", fontSize: "1rem", textShadow: "0 0 8px rgba(255, 160, 30, 0.6)" }}>:</span>
                                <select 
                                    value={minute} 
                                    onChange={(e) => setMinute(e.target.value)}
                                    style={selectStyle}
                                >
                                    {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map(m => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                </select>
                                <span style={{ color: "#FFA01E", fontWeight: "900", fontFamily: "monospace", fontSize: "1rem", textShadow: "0 0 8px rgba(255, 160, 30, 0.6)" }}>:</span>
                                <select 
                                    value={second} 
                                    onChange={(e) => setSecond(e.target.value)}
                                    style={selectStyle}
                                >
                                    {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map(s => (
                                        <option key={s} value={s}>{s}</option>
                                    ))}
                                </select>
                                <select 
                                    value={ampm} 
                                    onChange={(e) => setAmPm(e.target.value)}
                                    style={selectStyle}
                                >
                                    <option value="AM">AM</option>
                                    <option value="PM">PM</option>
                                </select>
                            </div>
                        </div>

                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <label style={labelStyle}>
                                Standardized Timezone
                            </label>
                            <select 
                                value={timezone} 
                                onChange={(e) => setTimezone(e.target.value)}
                                style={{ ...selectStyle, width: "100%" }}
                            >
                                {uniqueTimezones.map(tz => (
                                    <option key={tz} value={tz}>{tz}</option>
                                ))}
                            </select>
                        </div>
                    </div>

                    {/* Presets Bar with Logo Neon Glow */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <label style={labelStyle}>
                            Rapid Presets
                        </label>
                        <div style={{ display: "flex", gap: "10px", flexWrap: "wrap" }}>
                            <button
                                type="button"
                                onClick={handlePresetNow}
                                style={presetDualGlowStyle}
                            >
                                ⚡ CURRENT TIME (NOW)
                            </button>
                            <button
                                type="button"
                                onClick={handlePresetStartOfDay}
                                style={presetCyanStyle}
                            >
                                🌅 START OF DAY (00:00)
                            </button>
                            <button
                                type="button"
                                onClick={handlePresetEndOfDay}
                                style={presetAmberStyle}
                            >
                                🌃 END OF DAY (23:59)
                            </button>
                        </div>
                    </div>

                    {/* Batch Scope Option */}
                    <div 
                        style={{
                            background: "rgba(8, 15, 27, 0.8)",
                            border: "1px dashed rgba(0, 208, 255, 0.3)",
                            borderRadius: "8px",
                            padding: "12px 16px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center"
                        }}
                    >
                        <div>
                            <div style={{ fontSize: "0.85rem", fontWeight: "700", color: "#F8FAFC" }}>
                                Apply timestamp to entire conversation payload
                            </div>
                            <div style={{ fontSize: "0.72rem", color: "#829AB1", fontFamily: "monospace", marginTop: "2px" }}>
                                Enforces uniform chronological indexing across all messages in this archive
                            </div>
                        </div>
                        <input
                            type="checkbox"
                            checked={applyToAll}
                            onChange={(e) => setApplyToAll(e.target.checked)}
                            style={{ 
                                width: "20px", 
                                height: "20px", 
                                accentColor: "#FF9500", 
                                cursor: "pointer" 
                            }}
                        />
                    </div>

                    {/* Live Canonical ISO Readout with Pulse Wave Glow */}
                    <div 
                        style={{
                            background: "#040810",
                            border: "1.5px solid rgba(0, 208, 255, 0.35)",
                            borderRadius: "8px",
                            padding: "12px 18px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                            boxShadow: "inset 0 2px 8px rgba(0, 0, 0, 0.8), 0 0 15px rgba(0, 208, 255, 0.15)"
                        }}
                    >
                        <span style={{ fontSize: "0.74rem", color: "#FFA01E", fontWeight: "800", letterSpacing: "1px", display: "flex", alignItems: "center", gap: "6px" }}>
                            <span>✦</span> CANONICAL ISO-8601 OUTPUT:
                        </span>
                        <span 
                            style={{ 
                                fontSize: "0.95rem", 
                                color: "#00D0FF", 
                                fontWeight: "900",
                                textShadow: "0 0 12px rgba(0, 208, 255, 0.7)",
                                letterSpacing: "0.8px"
                            }}
                        >
                            {canonicalIso}
                        </span>
                    </div>
                </div>

                {/* Footer Actions */}
                <div 
                    style={{
                        padding: "18px 28px 20px",
                        background: "rgba(6, 11, 18, 0.98)",
                        borderTop: "1px solid rgba(0, 208, 255, 0.2)",
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: "14px"
                    }}
                >
                    <button
                        type="button"
                        onClick={onCancel}
                        style={{
                            padding: "10px 22px",
                            fontSize: "0.84rem",
                            fontWeight: "700",
                            fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                            letterSpacing: "0.6px",
                            background: "transparent",
                            border: "1.5px solid #1E344A",
                            color: "#829AB1",
                            borderRadius: "8px",
                            cursor: "pointer",
                            transition: "all 0.18s ease"
                        }}
                    >
                        DISCARD / CANCEL
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        style={{
                            padding: "11px 30px",
                            fontSize: "0.88rem",
                            fontWeight: "900",
                            fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                            letterSpacing: "1px",
                            background: "linear-gradient(135deg, #FFA01E 0%, #FF8500 50%, #E66A00 100%)",
                            border: "none",
                            color: "#060B12",
                            borderRadius: "8px",
                            cursor: "pointer",
                            boxShadow: "0 0 25px rgba(255, 149, 0, 0.65), 0 4px 14px rgba(0, 0, 0, 0.5)",
                            textShadow: "0 1px 1px rgba(255, 255, 255, 0.4)",
                            transition: "all 0.2s cubic-bezier(0.16, 1, 0.3, 1)"
                        }}
                    >
                        APPLY &amp; IMPORT
                    </button>
                </div>
            </div>
        </div>
    );
}

const labelStyle = {
    fontSize: "0.74rem",
    fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
    fontWeight: "800",
    color: "#00D0FF",
    textTransform: "uppercase",
    letterSpacing: "1px"
};

const navBtnStyle = {
    background: "linear-gradient(180deg, #10243C, #091524)",
    border: "1px solid #00D0FF",
    color: "#FFFFFF",
    borderRadius: "6px",
    width: "32px",
    height: "32px",
    cursor: "pointer",
    fontWeight: "900",
    fontSize: "1rem",
    boxShadow: "0 0 10px rgba(0, 208, 255, 0.3)",
    transition: "all 0.18s ease"
};

const selectStyle = {
    flex: 1,
    background: "#060B12",
    border: "1.5px solid #1E344A",
    color: "#FFFFFF",
    fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
    fontSize: "0.9rem",
    fontWeight: "700",
    padding: "8px 6px",
    borderRadius: "7px",
    outline: "none",
    cursor: "pointer",
    boxShadow: "inset 0 1px 4px rgba(0, 0, 0, 0.8)",
    transition: "border-color 0.2s, box-shadow 0.2s"
};

const presetDualGlowStyle = {
    background: "linear-gradient(135deg, rgba(0, 208, 255, 0.15) 0%, rgba(255, 149, 0, 0.15) 100%)",
    border: "1px solid #FFA01E",
    color: "#FFFFFF",
    fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
    fontSize: "0.76rem",
    fontWeight: "800",
    padding: "6px 14px",
    borderRadius: "18px",
    cursor: "pointer",
    boxShadow: "0 0 14px rgba(255, 149, 0, 0.45)",
    transition: "all 0.18s ease"
};

const presetCyanStyle = {
    background: "rgba(0, 208, 255, 0.12)",
    border: "1px solid #00D0FF",
    color: "#00D0FF",
    fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
    fontSize: "0.76rem",
    fontWeight: "800",
    padding: "6px 14px",
    borderRadius: "18px",
    cursor: "pointer",
    boxShadow: "0 0 12px rgba(0, 208, 255, 0.35)",
    transition: "all 0.18s ease"
};

const presetAmberStyle = {
    background: "rgba(255, 149, 0, 0.12)",
    border: "1px solid #FF9500",
    color: "#FFA01E",
    fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
    fontSize: "0.76rem",
    fontWeight: "800",
    padding: "6px 14px",
    borderRadius: "18px",
    cursor: "pointer",
    boxShadow: "0 0 12px rgba(255, 149, 0, 0.35)",
    transition: "all 0.18s ease"
};

export default DateTimePromptModal;
