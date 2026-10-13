/*
    DateTimePromptModal.jsx

    Threadline Temporal Verification & Prompt Modal.
    Prompts the user with an interactive calendar date picker and time/timezone
    dropdowns when uploaded archives or pasted chats lack standardized timestamps.
*/

import React, { useState, useEffect } from "react";
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
                    fontSize: "0.82rem",
                    fontFamily: "var(--font-mono, monospace)",
                    fontWeight: isSelected ? "700" : "500",
                    borderRadius: "6px",
                    border: isSelected ? "1px solid var(--accent, #3FD8FF)" : isToday ? "1px solid var(--warning, #F7C94B)" : "1px solid transparent",
                    background: isSelected ? "var(--accent, #3FD8FF)" : isToday ? "rgba(247,201,75,0.12)" : "rgba(255,255,255,0.02)",
                    color: isSelected ? "#0B1016" : "var(--text, #F2F7FB)",
                    cursor: "pointer",
                    transition: "all 0.15s ease"
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
                background: "rgba(5, 9, 14, 0.85)",
                backdropFilter: "blur(8px)",
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
                    maxWidth: "580px",
                    background: "var(--panel, #141D26)",
                    border: "2px solid var(--border, #243445)",
                    borderRadius: "12px",
                    boxShadow: "0 25px 60px rgba(0, 0, 0, 0.8), 0 0 25px rgba(63, 216, 255, 0.15)",
                    color: "var(--text, #F2F7FB)",
                    display: "flex",
                    flexDirection: "column",
                    overflow: "hidden"
                }}
            >
                {/* Header */}
                <div 
                    style={{
                        padding: "18px 22px 14px",
                        background: "rgba(16, 24, 32, 0.8)",
                        borderBottom: "1px solid var(--border, #243445)"
                    }}
                >
                    <span 
                        style={{
                            display: "inline-block",
                            fontSize: "0.72rem",
                            fontFamily: "var(--font-mono, monospace)",
                            fontWeight: "700",
                            letterSpacing: "1px",
                            textTransform: "uppercase",
                            padding: "3px 8px",
                            borderRadius: "4px",
                            background: "rgba(247, 201, 75, 0.14)",
                            border: "1px solid var(--warning, #F7C94B)",
                            color: "var(--warning, #F7C94B)",
                            marginBottom: "8px"
                        }}
                    >
                        ✦ CHRONOLOGICAL INTEGRITY CHECK
                    </span>
                    <h3 style={{ margin: 0, fontSize: "1.2rem", fontWeight: "700", letterSpacing: "0.5px", display: "flex", alignItems: "center", gap: "8px" }}>
                        <span>📅</span> TIMESTAMP VERIFICATION REQUIRED
                    </h3>
                    <p style={{ margin: "4px 0 0", fontSize: "0.82rem", color: "var(--text-muted, #748191)", lineHeight: "1.4" }}>
                        Threadline organizes messages into chronological timelines. This upload lacks valid date and time context. Specify the baseline timestamp below.
                    </p>
                </div>

                {/* Target Information Banner */}
                <div 
                    style={{
                        background: "rgba(11, 16, 22, 0.9)",
                        borderLeft: "3px solid var(--accent, #3FD8FF)",
                        padding: "10px 16px",
                        margin: "14px 22px 4px",
                        borderRadius: "0 6px 6px 0",
                        display: "flex",
                        justifyContent: "space-between",
                        alignItems: "center",
                        fontSize: "0.8rem",
                        fontFamily: "var(--font-mono, monospace)"
                    }}
                >
                    <span style={{ color: "var(--accent, #3FD8FF)", fontWeight: "600" }}>
                        {metadata?.sourceName || "SOURCE CONTENT"}
                    </span>
                    <span style={{ color: "var(--warning, #F7C94B)", fontSize: "0.75rem" }}>
                        {metadata?.reason || "No timestamps detected"}
                    </span>
                </div>

                {/* Body Deck */}
                <div style={{ padding: "14px 22px", display: "flex", flexDirection: "column", gap: "16px", maxHeight: "68vh", overflowY: "auto" }}>
                    {/* Custom Calendar Grid */}
                    <div 
                        style={{
                            background: "rgba(16, 24, 32, 0.6)",
                            border: "1px solid var(--border, #243445)",
                            borderRadius: "8px",
                            padding: "14px"
                        }}
                    >
                        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "12px" }}>
                            <button
                                type="button"
                                onClick={handlePrevMonth}
                                style={{
                                    background: "rgba(255,255,255,0.05)",
                                    border: "1px solid var(--border, #243445)",
                                    color: "var(--text)",
                                    borderRadius: "6px",
                                    width: "28px",
                                    height: "28px",
                                    cursor: "pointer",
                                    fontWeight: "700"
                                }}
                            >
                                «
                            </button>
                            <span style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "0.95rem", fontWeight: "700", color: "var(--accent, #3FD8FF)", letterSpacing: "1px" }}>
                                {monthNames[selectedMonth]} {selectedYear}
                            </span>
                            <button
                                type="button"
                                onClick={handleNextMonth}
                                style={{
                                    background: "rgba(255,255,255,0.05)",
                                    border: "1px solid var(--border, #243445)",
                                    color: "var(--text)",
                                    borderRadius: "6px",
                                    width: "28px",
                                    height: "28px",
                                    cursor: "pointer",
                                    fontWeight: "700"
                                }}
                            >
                                »
                            </button>
                        </div>

                        <div style={{ display: "grid", gridTemplateColumns: "repeat(7, 1fr)", gap: "4px", textAlign: "center" }}>
                            {["SU", "MO", "TU", "WE", "TH", "FR", "SA"].map(d => (
                                <div key={d} style={{ fontFamily: "var(--font-mono, monospace)", fontSize: "0.7rem", color: "var(--text-muted, #748191)", fontWeight: "600", paddingBottom: "6px" }}>
                                    {d}
                                </div>
                            ))}
                            {calendarCells}
                        </div>
                    </div>

                    {/* Time & Timezone Dropdowns */}
                    <div style={{ display: "grid", gridTemplateColumns: "1.15fr 0.85fr", gap: "14px" }}>
                        <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                            <label style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono, monospace)", color: "var(--text-muted, #748191)", textTransform: "uppercase", letterSpacing: "1px" }}>
                                Time of Event (HH:MM:SS)
                            </label>
                            <div style={{ display: "flex", alignItems: "center", gap: "4px" }}>
                                <select 
                                    value={hour} 
                                    onChange={(e) => setHour(e.target.value)}
                                    style={selectStyle}
                                >
                                    {Array.from({ length: 12 }, (_, i) => String(i + 1).padStart(2, "0")).map(h => (
                                        <option key={h} value={h}>{h}</option>
                                    ))}
                                </select>
                                <span style={{ color: "var(--text-muted)", fontWeight: "700" }}>:</span>
                                <select 
                                    value={minute} 
                                    onChange={(e) => setMinute(e.target.value)}
                                    style={selectStyle}
                                >
                                    {Array.from({ length: 60 }, (_, i) => String(i).padStart(2, "0")).map(m => (
                                        <option key={m} value={m}>{m}</option>
                                    ))}
                                </select>
                                <span style={{ color: "var(--text-muted)", fontWeight: "700" }}>:</span>
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
                            <label style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono, monospace)", color: "var(--text-muted, #748191)", textTransform: "uppercase", letterSpacing: "1px" }}>
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

                    {/* Presets Bar */}
                    <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
                        <label style={{ fontSize: "0.72rem", fontFamily: "var(--font-mono, monospace)", color: "var(--text-muted, #748191)", textTransform: "uppercase", letterSpacing: "1px" }}>
                            Rapid Presets
                        </label>
                        <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
                            <button
                                type="button"
                                onClick={handlePresetNow}
                                style={presetChipStyle}
                            >
                                ⚡ CURRENT TIME (NOW)
                            </button>
                            <button
                                type="button"
                                onClick={handlePresetStartOfDay}
                                style={presetChipStyle}
                            >
                                🌅 START OF DAY (00:00)
                            </button>
                            <button
                                type="button"
                                onClick={handlePresetEndOfDay}
                                style={presetChipStyle}
                            >
                                🌃 END OF DAY (23:59)
                            </button>
                        </div>
                    </div>

                    {/* Batch Scope Option */}
                    <div 
                        style={{
                            background: "rgba(16, 24, 32, 0.4)",
                            border: "1px dashed var(--border, #243445)",
                            borderRadius: "6px",
                            padding: "10px 14px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center"
                        }}
                    >
                        <div>
                            <div style={{ fontSize: "0.82rem", fontWeight: "600" }}>Apply to entire conversation batch</div>
                            <div style={{ fontSize: "0.72rem", color: "var(--text-muted, #748191)" }}>Establishes uniform baseline timestamp for all untimed messages</div>
                        </div>
                        <input
                            type="checkbox"
                            checked={applyToAll}
                            onChange={(e) => setApplyToAll(e.target.checked)}
                            style={{ width: "18px", height: "18px", accentColor: "var(--accent, #3FD8FF)", cursor: "pointer" }}
                        />
                    </div>

                    {/* Live Canonical Preview */}
                    <div 
                        style={{
                            background: "rgba(11, 16, 22, 0.9)",
                            border: "1px solid var(--border, #243445)",
                            borderRadius: "6px",
                            padding: "10px 14px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center",
                            fontFamily: "var(--font-mono, monospace)"
                        }}
                    >
                        <span style={{ fontSize: "0.72rem", color: "var(--text-muted, #748191)" }}>CANONICAL ISO-8601 OUTPUT:</span>
                        <span style={{ fontSize: "0.85rem", color: "var(--accent, #3FD8FF)", fontWeight: "700" }}>
                            {canonicalIso}
                        </span>
                    </div>
                </div>

                {/* Footer Actions */}
                <div 
                    style={{
                        padding: "14px 22px",
                        background: "rgba(16, 24, 32, 0.9)",
                        borderTop: "1px solid var(--border, #243445)",
                        display: "flex",
                        justifyContent: "flex-end",
                        gap: "10px"
                    }}
                >
                    <button
                        type="button"
                        onClick={onCancel}
                        style={{
                            padding: "9px 18px",
                            fontSize: "0.82rem",
                            fontWeight: "600",
                            background: "transparent",
                            border: "1px solid var(--border, #243445)",
                            color: "var(--text-muted, #748191)",
                            borderRadius: "6px",
                            cursor: "pointer"
                        }}
                    >
                        DISCARD / CANCEL
                    </button>
                    <button
                        type="button"
                        onClick={handleConfirm}
                        style={{
                            padding: "9px 22px",
                            fontSize: "0.82rem",
                            fontWeight: "700",
                            background: "var(--accent, #3FD8FF)",
                            border: "none",
                            color: "#0B1016",
                            borderRadius: "6px",
                            cursor: "pointer",
                            boxShadow: "0 0 15px rgba(63, 216, 255, 0.3)"
                        }}
                    >
                        APPLY &amp; IMPORT
                    </button>
                </div>
            </div>
        </div>
    );
}

const selectStyle = {
    flex: 1,
    background: "#0B1016",
    border: "1px solid var(--border, #243445)",
    color: "var(--text, #F2F7FB)",
    fontFamily: "var(--font-mono, monospace)",
    fontSize: "0.85rem",
    fontWeight: "600",
    padding: "6px 4px",
    borderRadius: "6px",
    outline: "none",
    cursor: "pointer"
};

const presetChipStyle = {
    background: "rgba(63, 216, 255, 0.08)",
    border: "1px solid rgba(63, 216, 255, 0.25)",
    color: "var(--accent, #3FD8FF)",
    fontFamily: "var(--font-mono, monospace)",
    fontSize: "0.72rem",
    fontWeight: "600",
    padding: "4px 10px",
    borderRadius: "14px",
    cursor: "pointer",
    transition: "all 0.15s ease"
};

export default DateTimePromptModal;
