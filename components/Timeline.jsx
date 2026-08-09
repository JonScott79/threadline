/*
    Timeline.jsx

    Interactive timeline visualization.
    Renders message frequency over time as a pulsing heartbeat/ECG wave.
    Supports clicking points to zoom in/drill down (Years -> Months -> Days)
    and selecting specific days to inspect events.

    Responsibilities:
    - Load aggregated activity buckets from API.
    - Render interactive SVG visualization with smooth bezier waves and glowing points.
    - Provide breadcrumbs/navigation for zooming.
*/

// =====================================
// Imports
// =====================================

import { useState, useEffect, useRef } from "react";
import axios from "axios";

// =====================================
// Component
// =====================================

function Timeline({
    threadlineId,
    selectedDay,
    onSelectDay,
    activeZoom = "day",
    onZoomChange,
    selectedYearMonth = null, // e.g. "2026-07" or "2026"
    onPeriodChange,
    startDate = null,
    endDate = null,
    conversations = "",
    compareIds = null
}) {
    /*==============================================
                        STATE
    ==============================================*/

    const [buckets, setBuckets] = useState([]);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);
    const [hoveredIndex, setHoveredIndex] = useState(null);
    const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

    const containerRef = useRef(null);

    /*==============================================
                        LOAD DATA
    ==============================================*/

    useEffect(() => {
        if (!threadlineId) return;

        async function fetchTimelineData() {
            setLoading(true);
            setError(null);
            try {
                // Fetch timeline aggregation from Express backend
                const response = await axios.get(
                    `http://localhost:3001/api/threadlines/${threadlineId}/timeline`,
                    {
                        params: { 
                            zoom: activeZoom,
                            start: startDate,
                            end: endDate,
                            conversations: conversations,
                            ids: compareIds ? compareIds.join(",") : undefined
                        }
                    }
                );

                if (response.data && response.data.status === "success") {
                    let fetchedBuckets = response.data.buckets || [];

                    // Filter based on selected parent period for drilldown
                    if (activeZoom === "month" && selectedYearMonth) {
                        // Filter months belonging to selectedYearMonth (e.g. "2026")
                        fetchedBuckets = fetchedBuckets.filter(b => b.period.startsWith(selectedYearMonth));
                    } else if (activeZoom === "day" && selectedYearMonth) {
                        // Filter days belonging to selectedYearMonth (e.g. "2026-07")
                        fetchedBuckets = fetchedBuckets.filter(b => b.period.startsWith(selectedYearMonth));
                    }

                    setBuckets(fetchedBuckets);
                } else {
                    setError("Failed to parse timeline data.");
                }
            } catch (err) {
                console.error("Timeline load error:", err);
                setError("Error loading timeline. Ensure backend is running.");
            } finally {
                setLoading(false);
            }
        }

        fetchTimelineData();
    }, [threadlineId, activeZoom, selectedYearMonth, startDate, endDate, conversations, compareIds]);

    /*==============================================
                    NAVIGATION HANDLERS
    ==============================================*/

    function handleZoomOut() {
        if (activeZoom === "day") {
            // Zoom out to month view of current year
            onZoomChange("month");
            if (selectedYearMonth && selectedYearMonth.length > 4) {
                onPeriodChange(selectedYearMonth.substring(0, 4));
            }
        } else if (activeZoom === "month") {
            // Zoom out to year view
            onZoomChange("year");
            onPeriodChange(null);
        }
    }

    function handlePointClick(bucket, index) {
        const period = bucket.period;
        
        if (activeZoom === "year") {
            // Zoom in to months of this year
            onZoomChange("month");
            onPeriodChange(period); // e.g. "2026"
        } else if (activeZoom === "month") {
            // Zoom in to days of this month
            onZoomChange("day");
            onPeriodChange(period); // e.g. "2026-07"
        } else if (activeZoom === "day") {
            // Select this specific day
            onSelectDay(period); // e.g. "2026-07-13"
        }
    }

    /*==============================================
                    RENDER HELPERS
    ==============================================*/

    // SVG Layout Dimensions
    const svgWidth = 1000;
    const svgHeight = 160;
    const paddingX = 60;
    const paddingY = 30;

    // Calculate Coordinates for Heartbeat Curve
    let points = [];
    if (buckets.length > 0) {
        const counts = buckets.map(b => b.count);
        const maxCount = Math.max(...counts, 1); // Avoid division by zero
        
        buckets.forEach((b, i) => {
            // X coordinate distributed evenly
            const x = paddingX + (i / Math.max(buckets.length - 1, 1)) * (svgWidth - 2 * paddingX);
            
            // Y coordinate based on count (heartbeat monitor goes up for higher density)
            // Low counts are near baseline (height - paddingY), high counts spike upwards
            const ratio = b.count / maxCount;
            const y = svgHeight - paddingY - ratio * (svgHeight - 2 * paddingY);
            
            points.push({ x, y, bucket: b });
        });
    }

    // Build SVG Path (Bezier Curve) for Heartbeat Signal
    let dPath = "";
    if (points.length > 0) {
        if (points.length === 1) {
            dPath = `M ${paddingX} ${svgHeight / 2} L ${svgWidth - paddingX} ${svgHeight / 2}`;
        } else {
            dPath = `M ${points[0].x} ${points[0].y}`;
            for (let i = 0; i < points.length - 1; i++) {
                const p0 = points[i];
                const p1 = points[i + 1];
                // Control points to create smooth curves like an ECG
                const cpX1 = p0.x + (p1.x - p0.x) / 3;
                const cpY1 = p0.y;
                const cpX2 = p0.x + 2 * (p1.x - p0.x) / 3;
                const cpY2 = p1.y;
                
                dPath += ` C ${cpX1} ${cpY1}, ${cpX2} ${cpY2}, ${p1.x} ${p1.y}`;
            }
        }
    }

    /*==============================================
                        RENDER
    ==============================================*/

    return (
        <section className="timeline-visualization">
            {/* Header controls */}
            <div className="timeline-header">
                <div className="timeline-breadcrumbs">
                    <span className="breadcrumb-root">TIMELINE</span>
                    <span className="breadcrumb-separator">/</span>
                    <span className="breadcrumb-current">
                        {activeZoom.toUpperCase()} VIEW 
                        {selectedYearMonth && ` (${selectedYearMonth})`}
                    </span>
                    {selectedDay && (
                        <>
                            <span className="breadcrumb-separator">/</span>
                            <span className="breadcrumb-day">{selectedDay}</span>
                        </>
                    )}
                </div>

                <div className="timeline-controls">
                    {activeZoom !== "year" && (
                        <button className="button-link" onClick={handleZoomOut}>
                            ← ZOOM OUT
                        </button>
                    )}
                    <span className="timeline-resolution-label">
                        Resolution: <strong>{activeZoom}</strong>
                    </span>
                </div>
            </div>

            {/* SVG Wave Area */}
            <div className="timeline-wave-container" ref={containerRef}>
                {loading && <div className="timeline-overlay">ANALYZING TEMPORAL DISTRIBUTION...</div>}
                {error && <div className="timeline-overlay error">{error}</div>}
                
                {!loading && !error && buckets.length === 0 && (
                    <div className="timeline-overlay">NO COMMUNICATION DATA FOUND IN SELECTED PERIOD.</div>
                )}

                {!loading && !error && buckets.length > 0 && (
                    <svg viewBox={`0 0 ${svgWidth} ${svgHeight}`} width="100%" height="100%" preserveAspectRatio="none">
                        {/* Glow Filter */}
                        <defs>
                            <filter id="neon-glow" x="-20%" y="-20%" width="140%" height="140%">
                                <feGaussianBlur stdDeviation="3" result="blur" />
                                <feComposite in="SourceGraphic" in2="blur" operator="over" />
                            </filter>
                        </defs>

                        {/* Flat Baseline (Dull background grid line) */}
                        <line 
                            x1={paddingX} 
                            y1={svgHeight - paddingY} 
                            x2={svgWidth - paddingX} 
                            y2={svgHeight - paddingY} 
                            stroke="rgba(63, 216, 255, 0.15)" 
                            strokeWidth="1.5" 
                        />

                        {/* Heartbeat Signal Path */}
                        {dPath && (
                            <>
                                {/* Background glow wave */}
                                <path
                                    d={dPath}
                                    fill="none"
                                    stroke="rgba(63, 216, 255, 0.3)"
                                    strokeWidth="4"
                                />
                                {/* Primary crisp wave */}
                                <path
                                    d={dPath}
                                    fill="none"
                                    stroke="var(--accent)"
                                    strokeWidth="2"
                                    filter="url(#neon-glow)"
                                />
                            </>
                        )}

                        {/* Nodes / Spikes */}
                        {points.map((p, index) => {
                            const isHovered = hoveredIndex === index;
                            const isSelected = selectedDay === p.bucket.period || selectedYearMonth === p.bucket.period;
                            
                            return (
                                <g key={index}>
                                    {/* Vertical ECG grid lines */}
                                    <line
                                        x1={p.x}
                                        y1={svgHeight - paddingY}
                                        x2={p.x}
                                        y2={p.y}
                                        stroke={isHovered ? "rgba(63, 216, 255, 0.4)" : "rgba(63, 216, 255, 0.08)"}
                                        strokeWidth="1"
                                        strokeDasharray="2,2"
                                    />

                                    {/* Interaction Hotspot circle (invisible, larger) */}
                                    <circle
                                        cx={p.x}
                                        cy={p.y}
                                        r="12"
                                        fill="transparent"
                                        className="timeline-hotspot"
                                        onMouseEnter={(e) => {
                                            setHoveredIndex(index);
                                            // Get bounding rect for coordinates
                                            if (containerRef.current) {
                                                const rect = containerRef.current.getBoundingClientRect();
                                                const scaleX = rect.width / svgWidth;
                                                const scaleY = rect.height / svgHeight;
                                                setTooltipPos({
                                                    x: p.x * scaleX,
                                                    y: p.y * scaleY - 10
                                                });
                                            }
                                        }}
                                        onMouseLeave={() => setHoveredIndex(null)}
                                        onClick={() => handlePointClick(p.bucket, index)}
                                    />

                                    {/* Visual Circle Indicator */}
                                    <circle
                                        cx={p.x}
                                        cy={p.y}
                                        r={isHovered ? "6" : isSelected ? "5" : "3.5"}
                                        fill={isSelected ? "var(--success)" : "var(--accent)"}
                                        stroke="#0B1016"
                                        strokeWidth="1.5"
                                        filter={isHovered ? "url(#neon-glow)" : ""}
                                        style={{ transition: "all 0.15s ease", cursor: "pointer" }}
                                    />

                                    {/* X Axis Labels */}
                                    {/* Render labels for first, last, and every few elements depending on data size */}
                                    {(index === 0 || index === points.length - 1 || points.length < 15 || index % Math.ceil(points.length / 8) === 0) && (
                                        <text
                                            x={p.x}
                                            y={svgHeight - 10}
                                            fill="var(--text-muted)"
                                            fontSize="9"
                                            textAnchor="middle"
                                            fontFamily="var(--font-mono)"
                                        >
                                            {formatLabel(p.bucket.period, activeZoom)}
                                        </text>
                                    )}
                                </g>
                            );
                        })}
                    </svg>
                )}
            </div>

            {/* Hover Tooltip */}
            {hoveredIndex !== null && buckets[hoveredIndex] && (
                <div 
                    className="timeline-tooltip"
                    style={{ 
                        left: `${tooltipPos.x}px`, 
                        top: `${tooltipPos.y}px`
                    }}
                >
                    <div className="tooltip-period">{formatTooltipPeriod(buckets[hoveredIndex].period, activeZoom)}</div>
                    <div className="tooltip-value"><strong>{buckets[hoveredIndex].count}</strong> events</div>
                </div>
            )}
        </section>
    );
}

// =====================================
// Helpers
// =====================================

function formatLabel(period, zoom) {
    if (zoom === "year") {
        return period; // "2026"
    }
    if (zoom === "month") {
        const parts = period.split("-");
        const months = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
        const monthIdx = parseInt(parts[1], 10) - 1;
        return `${months[monthIdx]} ${parts[0].substring(2)}`; // "Jul 26"
    }
    if (zoom === "day") {
        const parts = period.split("-");
        return parts[2]; // Day number "13"
    }
    return period;
}

function formatTooltipPeriod(period, zoom) {
    if (zoom === "year") {
        return `Year ${period}`;
    }
    if (zoom === "month") {
        const parts = period.split("-");
        const months = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
        const monthIdx = parseInt(parts[1], 10) - 1;
        return `${months[monthIdx]} ${parts[0]}`;
    }
    if (zoom === "day") {
        const parts = period.split("-");
        const date = new Date(parts[0], parseInt(parts[1], 10) - 1, parts[2]);
        return date.toLocaleDateString("en-US", { weekday: 'short', year: 'numeric', month: 'short', day: 'numeric' });
    }
    return period;
}

// =====================================
// Exports
// =====================================

export default Timeline;
