/*
    DateTimePromptModal.jsx

    Threadline Temporal Verification & Prompt Modal.
    Styled with the full Lanzar Brand Logo Aesthetic:
    Deep Space Navy, Orbit Sky Glow, Rocket Orange Flames, Starlight Gold,
    and Cockpit Bezel Instrumentation.
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
                    fontWeight: isSelected ? "800" : "500",
                    borderRadius: "7px",
                    border: isSelected ? "1px solid #ffffff" : isToday ? "1px solid #E2B84D" : "1px solid transparent",
                    background: isSelected 
                        ? "linear-gradient(135deg, #FF8A63 0%, #F46B45 100%)" 
                        : isToday 
                        ? "rgba(226, 184, 77, 0.15)" 
                        : "rgba(255, 255, 255, 0.03)",
                    color: isSelected ? "#ffffff" : isToday ? "#FFE587" : "#F8FAFC",
                    cursor: "pointer",
                    boxShadow: isSelected 
                        ? "0 0 16px rgba(244, 107, 69, 0.7), inset 0 1px 1px rgba(255, 255, 255, 0.4)" 
                        : isToday 
                        ? "0 0 10px rgba(226, 184, 77, 0.3)" 
                        : "none",
                    transform: isSelected ? "scale(1.06)" : "scale(1)",
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
                background: "radial-gradient(circle at 50% 30%, rgba(16, 42, 67, 0.88) 0%, rgba(10, 24, 38, 0.96) 100%)",
                backdropFilter: "blur(10px)",
                WebkitBackdropFilter: "blur(10px)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                zIndex: 999999,
                padding: "20px"
            }}
        >
            <div 
                style={{
                    width: "100%",
                    maxWidth: "620px",
                    background: "linear-gradient(180deg, #102A43 0%, #0A1826 100%)",
                    border: "2px solid #20596E",
                    borderRadius: "14px",
                    boxShadow: 
                        "0 25px 60px -10px rgba(0, 0, 0, 0.85), 0 0 35px rgba(56, 189, 248, 0.25), inset 0 1px 1px rgba(255, 255, 255, 0.18)",
                    color: "#F8FAFC",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden",
                    position: "relative"
                }}
            >
                {/* Decorative Cockpit Corner Screws */}
                <div style={screwStyle("tl")} />
                <div style={screwStyle("tr")} />
                <div style={screwStyle("bl")} />
                <div style={screwStyle("br")} />

                {/* Outer Orbit Ellipse Watermark */}
                <div 
                    style={{
                        position: "absolute",
                        top: "-50px",
                        right: "-50px",
                        width: "220px",
                        height: "220px",
                        borderRadius: "50%",
                        border: "1.5px dashed rgba(74, 151, 179, 0.35)",
                        pointerEvents: "none",
                        transform: "rotate(-25deg)"
                    }} 
                />

                {/* Header Deck */}
                <div 
                    style={{
                        padding: "20px 26px 16px",
                        background: "linear-gradient(180deg, rgba(42, 114, 143, 0.35) 0%, rgba(16, 42, 67, 0.2) 100%)",
                        borderBottom: "2px solid #20596E",
                        position: "relative"
                    }}
                >
                    <span 
                        style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: "6px",
                            fontSize: "0.72rem",
                            fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                            fontWeight: "700",
                            letterSpacing: "1.2px",
                            textTransform: "uppercase",
                            padding: "4px 10px",
                            borderRadius: "4px",
                            background: "rgba(226, 184, 77, 0.14)",
                            border: "1px solid #E2B84D",
                            color: "#FFE587",
                            boxShadow: "0 0 14px rgba(226, 184, 77, 0.3)",
                            marginBottom: "8px"
                        }}
                    >
                        ✦ THREADLINE TEMPORAL GATE ✦
                    </span>
                    <h3 style={{ margin: 0, fontSize: "1.3rem", fontWeight: "800", letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: "10px", color: "#FFFFFF", textShadow: "0 2px 10px rgba(0, 0, 0, 0.5)" }}>
                        <span style={{ color: "#F46B45", filter: "drop-shadow(0 0 8px rgba(244, 107, 69, 0.65))" }}>🚀</span> 
                        TIMESTAMP VERIFICATION REQUIRED
                    </h3>
                    <p style={{ margin: "5px 0 0", fontSize: "0.84rem", color: "#CBD5E1", lineHeight: "1.45" }}>
                        Threadline analyzes chronological timelines. This submission lacks verified dates and times. Specify the temporal baseline below.
                    </p>
                </div>

                {/* Target Information Banner */}
                <div 
                    style={{
                        background: "rgba(8, 18, 28, 0.9)",
                        borderLeft: "4px solid #F46B45",
                        borderRight: "1px dashed #2A728F",
                        padding: "10px 18px",
                        margin: "14px 24px 4px",
                        borderRadius: "0 8px 8px 0",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "0.82rem",
                        fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                        boxShadow: "inset 0 1px 4px rgba(0, 0, 0, 0.6)"
                    }}
                >
                    <span style={{ color: "#38BDF8", fontWeight: "700", letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: "6px" }}>
                        <span>✦</span> {metadata?.sourceName || "SOURCE CONTENT"}
                    </span>
                    <span style={{ color: "#E2B84D", fontWeight: "600", fontSize: "0.78rem" }}>
                        {metadata?.reason || "No timestamps detected"}
                    </span>
                </div>

                {/* Body Deck */}
                <div style={{ padding: "14px 24px", display: "flex", flexDirection: "column", gap: "16px", maxHeight: "68vh", overflowY: "auto" }}>
                    {/* Custom Calendar Grid */}
                    <div 
                        style={{
                            background: "#142132",
                            border: "1.5px solid #20596E",
                            borderRadius: "10px",
                            padding: "14px",
                            boxShadow: "inset 0 2px 8px rgba(0, 0, 0, 0.45)"
                        }}
                    >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px", borderBottom: "1px solid rgba(42, 114, 143, 0.35)", paddingBottom: "8px" }}>
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
                                    fontSize: "1.05rem", 
                                    fontWeight: "800", 
                                    color: "#38BDF8", 
                                    letterSpacing: "1px",
                                    textShadow: "0 0 12px rgba(56, 189, 248, 0.5)"
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
                                <div key={d} style={{ fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)", fontSize: "0.72rem", color: "#4A97B3", fontWeight: "700", paddingBottom: "6px", letterSpacing: "1px" }}>
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
                                <span style={{ color: "#E2B84D", fontWeight: "900", fontFamily: "monospace", fontSize: "1rem" }}>:</span>
                                <select 
                                    value={minute} 
                                    onChange={(e) => setMinute(e.target.value)}
                                    style={selectStyle}
                                >
                                    {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map(m => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                </select>
                                <span style={{ color: "#E2B84D", fontWeight: "900", fontFamily: "monospace", fontSize: "1rem" }}>:</span>
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

                    {/* Presets Bar with Glowing Neon Chips */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <label style={labelStyle}>
                            Rapid Presets
                        </label>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <button
                                type="button"
                                onClick={handlePresetNow}
                                style={presetFlameStyle}
                            >
                                ⚡ CURRENT TIME (NOW)
                            </button>
                            <button
                                type="button"
                                onClick={handlePresetStartOfDay}
                                style={presetGoldStyle}
                            >
                                🌅 START OF DAY (00:00)
                            </button>
                            <button
                                type="button"
                                onClick={handlePresetEndOfDay}
                                style={presetSkyStyle}
                            >
                                🌃 END OF DAY (23:59)
                            </button>
                        </div>
                    </div>

                    {/* Batch Scope Option */}
                    <div 
                        style={{
                            background: "rgba(10, 24, 38, 0.8)",
                            border: "1px dashed #20596E",
                            borderRadius: "8px",
                            padding: "10px 14px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center"
                        }}
                    >
                        <div>
                            <div style={{ fontSize: "0.84rem", fontWeight: "700", color: "#F8FAFC" }}>
                                Apply timestamp to entire conversation payload
                            </div>
                            <div style={{ fontSize: "0.72rem", color: "#94A3B8", fontFamily: "monospace" }}>
                                Enforces uniform temporal indexing across all messages in this archive
                            </div>
                        </div>
                        <input
                            type="checkbox"
                            checked={applyToAll}
                            onChange={(e) => setApplyToAll(e.target.checked)}
                            style={{ 
                                width: "19px", 
                                height: "19px", 
                                accentColor: "#F46B45", 
                                cursor: "pointer" 
                            }}
                        />
                    </div>

                    {/* Live Canonical ISO Readout */}
                    <div 
                        style={{
                            background: "#08121C",
                            border: "1.5px solid #20596E",
                            borderRadius: "8px",
                            padding: "11px 16px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                            boxShadow: "inset 0 2px 6px rgba(0, 0, 0, 0.6)"
                        }}
                    >
                        <span style={{ fontSize: "0.72rem", color: "#E2B84D", fontWeight: "700", letterSpacing: "1px" }}>
                            CANONICAL ISO-8601 OUTPUT:
                        </span>
                        <span 
                            style={{ 
                                fontSize: "0.92rem", 
                                color: "#38BDF8", 
                                fontWeight: "800",
                                textShadow: "0 0 10px rgba(56, 189, 248, 0.5)",
                                letterSpacing: "0.5px"
                            }}
                        >
                            {canonicalIso}
                        </span>
                    </div>
                </div>

                {/* Footer Actions */}
                <div 
                    style={{
                        padding: "16px 24px 18px",
                        background: "rgba(10, 24, 38, 0.96)",
                        borderTop: "2px solid #20596E",
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: "12px"
                    }}
                >
                    <button
                        type="button"
                        onClick={onCancel}
                        style={{
                            padding: "10px 20px",
                            fontSize: "0.82rem",
                            fontWeight: "700",
                            fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                            letterSpacing: "0.5px",
                            background: "transparent",
                            border: "1.5px solid #20596E",
                            color: "#94A3B8",
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
                            padding: "10px 26px",
                            fontSize: "0.85rem",
                            fontWeight: "800",
                            fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
                            letterSpacing: "0.8px",
                            background: "linear-gradient(135deg, #FF8A63 0%, #F46B45 50%, #D95737 100%)",
                            border: "none",
                            color: "#FFFFFF",
                            borderRadius: "8px",
                            cursor: "pointer",
                            boxShadow: "0 4px 18px rgba(244, 107, 69, 0.55), 0 0 25px rgba(244, 107, 69, 0.3)",
                            textShadow: "0 1px 2px rgba(0, 0, 0, 0.4)",
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

// Decorative metallic screw style helper
function screwStyle(pos) {
    const isTop = pos.startsWith("t");
    const isLeft = pos.endsWith("l");
    return {
        position: "absolute",
        top: isTop ? "9px" : "auto",
        bottom: !isTop ? "9px" : "auto",
        left: isLeft ? "9px" : "auto",
        right: !isLeft ? "9px" : "auto",
        width: "10px",
        height: "10px",
        borderRadius: "50%",
        background: "radial-gradient(circle at 35% 35%, #4F6E96, #23374E)",
        border: "1px solid #142132",
        boxShadow: "inset 0 1px 1px rgba(255, 255, 255, 0.3), 0 1px 2px rgba(0, 0, 0, 0.5)",
        zIndex: 5,
        pointerEvents: "none"
    };
}

const labelStyle = {
    fontSize: "0.74rem",
    fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
    fontWeight: "700",
    color: "#4A97B3",
    textTransform: "uppercase",
    letterSpacing: "1px"
};

const navBtnStyle = {
    background: "linear-gradient(180deg, #1B3957, #13273E)",
    border: "1px solid #2A728F",
    color: "#F8FAFC",
    borderRadius: "6px",
    width: "32px",
    height: "32px",
    cursor: "pointer",
    fontWeight: "800",
    fontSize: "0.95rem",
    boxShadow: "0 2px 5px rgba(0, 0, 0, 0.3)",
    transition: "all 0.18s ease"
};

const selectStyle = {
    flex: 1,
    background: "#0A1826",
    border: "1.5px solid #20596E",
    color: "#F8FAFC",
    fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
    fontSize: "0.9rem",
    fontWeight: "700",
    padding: "7px 5px",
    borderRadius: "7px",
    outline: "none",
    cursor: "pointer",
    boxShadow: "inset 0 1px 4px rgba(0, 0, 0, 0.5)",
    transition: "border-color 0.2s, box-shadow 0.2s"
};

const presetFlameStyle = {
    background: "rgba(244, 107, 69, 0.15)",
    border: "1px solid #F46B45",
    color: "#FF8A63",
    fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
    fontSize: "0.75rem",
    fontWeight: "700",
    padding: "5px 12px",
    borderRadius: "16px",
    cursor: "pointer",
    boxShadow: "0 0 12px rgba(244, 107, 69, 0.35)",
    transition: "all 0.18s ease"
};

const presetGoldStyle = {
    background: "rgba(226, 184, 77, 0.12)",
    border: "1px solid #E2B84D",
    color: "#FFE587",
    fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
    fontSize: "0.75rem",
    fontWeight: "700",
    padding: "5px 12px",
    borderRadius: "16px",
    cursor: "pointer",
    boxShadow: "0 0 10px rgba(226, 184, 77, 0.25)",
    transition: "all 0.18s ease"
};

const presetSkyStyle = {
    background: "rgba(56, 189, 248, 0.12)",
    border: "1px solid #38BDF8",
    color: "#38BDF8",
    fontFamily: "var(--font-mono, 'JetBrains Mono', monospace)",
    fontSize: "0.75rem",
    fontWeight: "700",
    padding: "5px 12px",
    borderRadius: "16px",
    cursor: "pointer",
    boxShadow: "0 0 10px rgba(56, 189, 248, 0.25)",
    transition: "all 0.18s ease"
};

export default DateTimePromptModal;
