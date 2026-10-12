/*
    Timeline.jsx

    Interactive Temporal Explorer visualization.
    Uses vis-timeline for continuous zoom/pan through communication history.
    Server-authoritative: the visible time range is sent to the API,
    which auto-selects the appropriate bucket granularity.

    Zoom levels: Years → Months → Weeks → Days → Hours → Minutes → Seconds

    Responsibilities:
    - Fetch metadata (earliest/latest timestamps) to initialize the visible range.
    - On range change, request aggregated buckets from the API with autoZoom=true.
    - Render items on a vis-timeline instance with Threadline's dark theme.
    - Provide breadcrumbs and zoom controls.
    - Preserve existing selection behavior (click bucket → drill-down, click day → select).
*/

// =====================================
// Imports
// =====================================

import { useState, useEffect, useRef, useCallback, forwardRef, useImperativeHandle } from "react";
import axios from "axios";
import { API_BASE_URL } from "../src/apiConfig";
import {
    Timeline as VisTimeline,
    DataSet
} from "vis-timeline/standalone/esm/vis-timeline-graph2d";
import "vis-timeline/styles/vis-timeline-graph2d.min.css";

// =====================================
// Constants
// =====================================

const ZOOM_ORDER = ["year", "month", "week", "day", "hour", "minute", "second"];

const FETCH_DEBOUNCE_MS = 300;

// =====================================
// Component
// =====================================

const Timeline = forwardRef(function Timeline({
    threadlineId,
    selectedDay,
    onSelectDay,
    activeZoom = "day",
    onZoomChange,
    selectedYearMonth = null,
    onPeriodChange,
    startDate = null,
    endDate = null,
    conversations = "",
    compareIds = null,
    uid = null,
    searchQuery = "",
    searchMatches = [],
    refreshKey = 0,
    onUploadClick = null,
    onSelectMessage = null,
    onSelectSearchResult = null,
    temporalRange = null,
    onSelectTemporalRange = null,
    onClearTemporalRange = null
}, ref) {
    /*==============================================
                        STATE
    ==============================================*/

    const [serverZoom, setServerZoom] = useState(activeZoom);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const [rangeSelectMode, setRangeSelectMode] = useState(false);
    const rangeSelectModeRef = useRef(false);
    rangeSelectModeRef.current = rangeSelectMode;

    const dragStartRef = useRef(null);

    // Metadata: full data span
    const [dataEarliest, setDataEarliest] = useState(null);
    const [dataLatest, setDataLatest] = useState(null);

    // Refs for vis-timeline instance
    const containerRef = useRef(null);
    const timelineRef = useRef(null);
    const itemsRef = useRef(null);
    const fetchTimerRef = useRef(null);
    const isInitializedRef = useRef(false);

    // Stable refs for event handlers to avoid stale closures in vis-timeline listeners
    const handleItemClickRef = useRef();
    const onSelectMessageRef = useRef(onSelectMessage);
    onSelectMessageRef.current = onSelectMessage;
    const onSelectTemporalRangeRef = useRef(onSelectTemporalRange);
    onSelectTemporalRangeRef.current = onSelectTemporalRange;

    // Suppress rangechanged events during programmatic moves
    const suppressRangeRef = useRef(false);

    /*==============================================
                    METADATA LOADING
    ==============================================*/

    useEffect(() => {
        if (!threadlineId) return;

        async function fetchMetadata() {
            try {
                const response = await axios.get(
                    `${API_BASE_URL}/threadlines/${threadlineId}/timeline/metadata`,
                    { headers: { "x-user-uid": uid } }
                );
                if (response.data && response.data.status === "success") {
                    const { earliest, latest } = response.data;
                    if (earliest != null && latest != null) {
                        setDataEarliest(earliest);
                        setDataLatest(latest);
                        // If already initialized and refreshKey fired, re-fetch active window
                        if (timelineRef.current && isInitializedRef.current) {
                            const window = timelineRef.current.getWindow();
                            fetchBuckets(window.start.getTime(), window.end.getTime());
                        }
                    }
                }
            } catch (err) {
                console.error("Timeline metadata load error:", err);
                setError("Failed to load timeline metadata.");
            }
        }

        fetchMetadata();
    }, [threadlineId, uid, refreshKey]);

    /*==============================================
                VIS-TIMELINE INITIALIZATION
    ==============================================*/

    useEffect(() => {
        if (!containerRef.current || !dataEarliest || !dataLatest) return;
        if (isInitializedRef.current) return;

        // Create DataSet
        const items = new DataSet();
        itemsRef.current = items;

        // Compute initial range with 5% padding
        const span = dataLatest - dataEarliest || 86400000;
        const padding = span * 0.05;
        const rangeStart = new Date(dataEarliest - padding);
        const rangeEnd = new Date(dataLatest + padding);

        // Timeline options
        const options = {
            start: rangeStart,
            end: rangeEnd,
            min: new Date(dataEarliest - span * 2),
            max: new Date(dataLatest + span * 2),
            zoomMin: 2000,        // 2 seconds minimum zoom
            zoomMax: span * 10,   // 10x the data span maximum zoom
            height: "180px",
            stack: false,
            showCurrentTime: false,
            showMajorLabels: true,
            showMinorLabels: true,
            selectable: true,
            multiselect: false,
            snap: null,
            orientation: { axis: "bottom", item: "bottom" },
            margin: { item: { horizontal: 0, vertical: 2 }, axis: 5 },
            type: "bar",
            tooltip: {
                followMouse: true,
                overflowMethod: "cap"
            }
        };

        // Create timeline
        const timeline = new VisTimeline(containerRef.current, items, options);
        timelineRef.current = timeline;
        isInitializedRef.current = true;

        // Pointer down/up for exact timeline range dragging when in rangeSelectMode or shiftKey
        const domContainer = containerRef.current;
        function handlePointerDown(e) {
            const isRangeMode = rangeSelectModeRef.current || e.shiftKey;
            if (!isRangeMode) return;
            const props = timeline.getEventProperties(e);
            if (props && props.time) {
                dragStartRef.current = props.time.getTime();
            }
        }

        function handlePointerUp(e) {
            if (!dragStartRef.current) return;
            const startT = dragStartRef.current;
            dragStartRef.current = null;
            const props = timeline.getEventProperties(e);
            if (props && props.time) {
                const endT = props.time.getTime();
                if (Math.abs(endT - startT) > 500) { // Minimum 500ms drag to differentiate from click
                    const normalizedStart = Math.min(startT, endT);
                    const normalizedEnd = Math.max(startT, endT);
                    if (onSelectTemporalRangeRef.current) {
                        onSelectTemporalRangeRef.current({
                            start: normalizedStart,
                            end: normalizedEnd
                        });
                    }
                    setRangeSelectMode(false);
                }
            }
        }

        domContainer.addEventListener("pointerdown", handlePointerDown, { passive: true });
        window.addEventListener("pointerup", handlePointerUp, { passive: true });

        // On range change → fetch new data
        timeline.on("rangechanged", (props) => {
            if (suppressRangeRef.current) return;
            const start = props.start.getTime();
            const end = props.end.getTime();
            debouncedFetch(start, end);
        });

        // On item select → drill down or select day or open message
        timeline.on("select", (props) => {
            // If user is selecting a range, do not trigger item select navigation
            if (rangeSelectModeRef.current) return;

            if (props.items && props.items.length > 0) {
                const itemId = props.items[0];
                if (itemId === "temporal-selection-bg") return;
                const item = items.get(itemId);
                if (item) {
                    if (item.isEvent && item.eventData) {
                        if (onSelectMessageRef.current) {
                            onSelectMessageRef.current(item.eventData);
                        }
                    } else if (item.bucketData) {
                        handleItemClickRef.current?.(item.bucketData, item.hasSearchMatch);
                    }
                }
            }
        });

        // Initial data load
        debouncedFetch(rangeStart.getTime(), rangeEnd.getTime());

        // Cleanup
        return () => {
            domContainer.removeEventListener("pointerdown", handlePointerDown);
            window.removeEventListener("pointerup", handlePointerUp);
            if (timelineRef.current) {
                timelineRef.current.destroy();
                timelineRef.current = null;
                isInitializedRef.current = false;
            }
        };
    }, [dataEarliest, dataLatest]);

    /*==============================================
                    DATA FETCHING
    ==============================================*/

    function debouncedFetch(start, end) {
        if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
        fetchTimerRef.current = setTimeout(() => {
            fetchBuckets(start, end);
        }, FETCH_DEBOUNCE_MS);
    }

    async function fetchBuckets(vStart, vEnd) {
        if (!threadlineId || vStart == null || vEnd == null) return;

        setLoading(true);
        setError(null);
        try {
            const params = {
                autoZoom: "true",
                start: Math.floor(vStart),
                end: Math.ceil(vEnd)
            };

            const isValidRange = (!startDate || !endDate || startDate <= endDate);
            if (isValidRange) {
                if (startDate) params.start = Math.max(params.start, startDate);
                if (endDate) params.end = Math.min(params.end, endDate);
            }
            if (conversations) params.conversations = conversations;
            if (compareIds) params.ids = compareIds.join(",");

            const response = await axios.get(
                `${API_BASE_URL}/threadlines/${threadlineId}/timeline`,
                {
                    params,
                    headers: { "x-user-uid": uid }
                }
            );

            if (response.data && response.data.status === "success") {
                const isIndividualEvents = Boolean(response.data.isIndividualEvents);
                const buckets = response.data.buckets || [];
                const events = response.data.events || [];
                const newZoom = response.data.zoom || "day";
                setServerZoom(newZoom);

                if (onZoomChange && newZoom !== activeZoom) {
                    onZoomChange(newZoom);
                }

                updateTimelineItems(buckets, newZoom, isIndividualEvents, events);
            }
        } catch (err) {
            console.error("Timeline data load error:", err);
            setError("Error loading timeline data.");
        } finally {
            setLoading(false);
        }
    }

    // Cache current buckets, events and zoom for re-rendering on selection / searchMatch changes
    const currentBucketsRef = useRef([]);
    const currentEventsRef = useRef([]);
    const isIndividualEventsRef = useRef(false);
    const currentZoomRef = useRef(activeZoom);

    /*==============================================
                    ITEM MANAGEMENT
    ==============================================*/

    function updateTimelineItems(buckets, zoom, isIndividualEvents = false, events = []) {
        if (!itemsRef.current) return;
        currentBucketsRef.current = buckets || [];
        currentEventsRef.current = events || [];
        isIndividualEventsRef.current = isIndividualEvents;
        currentZoomRef.current = zoom;

        // Normalize match timestamps and message IDs
        const matchTimestamps = [];
        const matchMessageIds = new Set();
        (searchMatches || []).forEach(m => {
            if (typeof m === "number") {
                matchTimestamps.push(m);
            } else if (m) {
                if (m.timestamp) matchTimestamps.push(Number(m.timestamp));
                if (m.representativeMessageId) matchMessageIds.add(m.representativeMessageId);
                if (m.id) matchMessageIds.add(m.id);
                if (Array.isArray(m.contextWindow)) {
                    m.contextWindow.forEach(cw => matchMessageIds.add(cw.id));
                }
            }
        });

        // When zoomed into individual events level (seconds or narrow range)
        if (isIndividualEvents && events.length > 0) {
            const eventItems = events.map((ev, i) => {
                const evTime = Number(ev.timestamp);
                const evDate = new Date(evTime);
                const isMatch = matchMessageIds.has(ev.sourceId) || matchMessageIds.has(ev.id) ||
                    matchTimestamps.some(ts => Math.abs(ts - evTime) < 2000);

                let itemClass = "tl-event-item";
                if (isMatch) itemClass += " tl-event-match";

                const senderName = ev.direction === "sent" ? "Me" : (ev.sender || "Them");
                const snippet = ev.body ? (ev.body.length > 30 ? ev.body.substring(0, 30) + "..." : ev.body) : ev.title;
                const label = `<strong>${senderName}:</strong> ${snippet}`;

                return {
                    id: `ev-${ev.id || i}`,
                    start: evDate,
                    type: "box",
                    content: label,
                    className: itemClass,
                    title: `${senderName} (${ev.conversationTitle || "Thread"}): ${ev.body || ev.description || ""}`,
                    isEvent: true,
                    eventData: ev,
                    hasSearchMatch: isMatch
                };
            });

            itemsRef.current.clear();
            if (temporalRange && temporalRange.start && temporalRange.end) {
                eventItems.unshift({
                    id: "temporal-selection-bg",
                    start: new Date(temporalRange.start),
                    end: new Date(temporalRange.end),
                    type: "background",
                    className: "tl-temporal-selection-window",
                    title: `Selected Period: ${new Date(temporalRange.start).toLocaleString()} - ${new Date(temporalRange.end).toLocaleString()}`
                });
            }
            itemsRef.current.add(eventItems);
            return;
        }

        const maxCount = Math.max(...buckets.map(b => b.count), 1);

        const newItems = buckets.map((bucket, i) => {
            const { start: bStart, end: bEnd } = bucketToDateRange(bucket.period, zoom);
            const intensity = bucket.count / maxCount;

            // CSS class based on intensity
            let intensityClass = "tl-bar-low";
            if (intensity > 0.7) intensityClass = "tl-bar-high";
            else if (intensity > 0.35) intensityClass = "tl-bar-med";

            const isSelected = selectedDay === bucket.period || selectedYearMonth === bucket.period;

            // Check if any search matches fall within this bucket period
            const bStartTime = bStart.getTime();
            const bEndTime = bEnd.getTime();
            const hasSearchMatch = matchTimestamps.some(ts => ts >= bStartTime && ts < bEndTime);

            let itemClass = `tl-bar ${intensityClass}`;
            if (isSelected) itemClass += " tl-bar-selected";
            if (hasSearchMatch) itemClass += " tl-bar-match";

            let tooltip = `${formatTooltipPeriod(bucket.period, zoom)}: ${bucket.count.toLocaleString()} events`;
            if (hasSearchMatch) {
                tooltip += " (Contains Search Match)";
            }

            return {
                id: i,
                start: bStart,
                end: bEnd,
                type: "range",
                className: itemClass,
                title: tooltip,
                isEvent: false,
                bucketData: bucket,
                hasSearchMatch
            };
        });

        // Clear and update DataSet (efficient: vis-timeline diffs internally)
        itemsRef.current.clear();
        
        // If there is an active temporalRange, add a background range item for visual highlight
        if (temporalRange && temporalRange.start && temporalRange.end) {
            newItems.unshift({
                id: "temporal-selection-bg",
                start: new Date(temporalRange.start),
                end: new Date(temporalRange.end),
                type: "background",
                className: "tl-temporal-selection-window",
                title: `Selected Period: ${new Date(temporalRange.start).toLocaleString()} - ${new Date(temporalRange.end).toLocaleString()}`
            });
        }

        itemsRef.current.add(newItems);
    }

    // Re-render items if searchMatches, selectedDay, selectedYearMonth, or temporalRange change without refetching
    useEffect(() => {
        if (isIndividualEventsRef.current && currentEventsRef.current.length > 0) {
            updateTimelineItems([], currentZoomRef.current, true, currentEventsRef.current);
        } else if (currentBucketsRef.current.length > 0) {
            updateTimelineItems(currentBucketsRef.current, currentZoomRef.current, false, []);
        }
    }, [searchMatches, selectedDay, selectedYearMonth, temporalRange]);

    /*==============================================
                    INTERACTION HANDLERS
    ==============================================*/

    function handleItemClick(bucket, hasSearchMatch = false) {
        const zoom = currentZoomRef.current || serverZoom;
        const period = bucket.period;

        // If in range selection mode, use clicked bucket bounds as the range
        if (rangeSelectModeRef.current) {
            const { start: bStart, end: bEnd } = bucketToDateRange(period, zoom);
            if (onSelectTemporalRangeRef.current && bStart && bEnd) {
                onSelectTemporalRangeRef.current({
                    start: bStart.getTime(),
                    end: bEnd.getTime()
                });
                setRangeSelectMode(false);
            }
            return;
        }

        // Standard bucket click: preserve existing drill-down / day navigation
        if (zoom === "day" || /^\d{4}-\d{2}-\d{2}$/.test(period)) {
            if (onSelectDay) onSelectDay(period);
        } else if (zoom === "hour" || zoom === "minute" || zoom === "second") {
            const dayPart = period.substring(0, 10);
            if (onSelectDay) onSelectDay(dayPart);
        } else {
            // For year/month/week: zoom into the bucket's time range
            if (bucket.minTimestamp && bucket.maxTimestamp && timelineRef.current) {
                const padding = (bucket.maxTimestamp - bucket.minTimestamp) * 0.05 || 3600000;
                suppressRangeRef.current = true;
                timelineRef.current.setWindow(
                    new Date(bucket.minTimestamp - padding),
                    new Date(bucket.maxTimestamp + padding),
                    { animation: { duration: 400, easingFunction: "easeInOutQuad" } },
                    () => { suppressRangeRef.current = false; }
                );
            }
            if (onPeriodChange) {
                onPeriodChange(period);
            }
        }
    }
    handleItemClickRef.current = handleItemClick;

    function handleFitAll() {
        if (dataEarliest != null && dataLatest != null && timelineRef.current) {
            const span = dataLatest - dataEarliest || 86400000;
            const padding = span * 0.05;
            suppressRangeRef.current = true;
            timelineRef.current.setWindow(
                new Date(dataEarliest - padding),
                new Date(dataLatest + padding),
                { animation: { duration: 400, easingFunction: "easeInOutQuad" } },
                () => { suppressRangeRef.current = false; }
            );
        }
    }

    function handleZoomOut() {
        if (timelineRef.current) {
            timelineRef.current.zoomOut(0.5);
        }
    }

    /*==============================================
            IMPERATIVE REF API (FOR SEARCH / CONTROLS)
    ==============================================*/

    useImperativeHandle(ref, () => ({
        moveToTimestamp(timestamp) {
            if (timelineRef.current && timestamp) {
                const targetTime = Number(timestamp);
                // Center timeline on timestamp with a comfortable window (e.g. 1 hour or day span)
                suppressRangeRef.current = true;
                timelineRef.current.moveTo(targetTime, {
                    animation: { duration: 500, easingFunction: "easeInOutQuad" }
                });
                setTimeout(() => {
                    suppressRangeRef.current = false;
                    const win = timelineRef.current.getWindow();
                    debouncedFetch(win.start.getTime(), win.end.getTime());
                }, 520);
            }
        },
        setWindow(start, end) {
            if (timelineRef.current && start && end) {
                suppressRangeRef.current = true;
                timelineRef.current.setWindow(new Date(start), new Date(end), {
                    animation: { duration: 400, easingFunction: "easeInOutQuad" }
                }, () => {
                    suppressRangeRef.current = false;
                    debouncedFetch(start, end);
                });
            }
        },
        fitAll() {
            handleFitAll();
        },
        getWindow() {
            if (timelineRef.current) {
                const win = timelineRef.current.getWindow();
                return { start: win.start.getTime(), end: win.end.getTime() };
            }
            return null;
        }
    }));

    /*==============================================
                REFETCH ON FILTER CHANGES
    ==============================================*/

    useEffect(() => {
        if (!timelineRef.current || !isInitializedRef.current) return;

        // If a valid date range is selected, adjust timeline window to display it
        if (startDate && endDate && startDate <= endDate) {
            const span = endDate - startDate || 86400000;
            const padding = Math.max(span * 0.05, 3600000); // at least 1 hour padding
            suppressRangeRef.current = true;
            timelineRef.current.setWindow(
                new Date(startDate - padding),
                new Date(endDate + padding),
                { animation: { duration: 400, easingFunction: "easeInOutQuad" } },
                () => {
                    suppressRangeRef.current = false;
                    fetchBuckets(startDate, endDate);
                }
            );
            return;
        }

        const window = timelineRef.current.getWindow();
        fetchBuckets(window.start.getTime(), window.end.getTime());
    }, [conversations, compareIds, startDate, endDate]);

    /*==============================================
                        RENDER
    ==============================================*/

    const displayZoom = serverZoom || activeZoom;

    return (
        <section className="timeline-visualization">
            {/* Header controls */}
            <div className="timeline-header">
                <div className="timeline-breadcrumbs">
                    <span className="breadcrumb-root">TIMELINE</span>
                    <span className="breadcrumb-separator">/</span>
                    <span className="breadcrumb-current">
                        {displayZoom.toUpperCase()} VIEW
                        {selectedYearMonth && ` (${selectedYearMonth})`}
                    </span>
                    {selectedDay && (
                        <>
                            <span className="breadcrumb-separator">/</span>
                            <span className="breadcrumb-day">{selectedDay}</span>
                        </>
                    )}
                    {temporalRange && temporalRange.start && temporalRange.end && (
                        <>
                            <span className="breadcrumb-separator">/</span>
                            <span 
                                className="breadcrumb-day" 
                                style={{ 
                                    color: "var(--accent)", 
                                    background: "rgba(63, 216, 255, 0.12)", 
                                    padding: "2px 8px", 
                                    borderRadius: "4px",
                                    border: "1px solid rgba(63, 216, 255, 0.3)",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "6px"
                                }}
                            >
                                ⏱ {new Date(temporalRange.start).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} — {new Date(temporalRange.end).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
                                {onClearTemporalRange && (
                                    <button 
                                        onClick={(e) => {
                                            e.stopPropagation();
                                            onClearTemporalRange();
                                        }}
                                        title="Clear Temporal Range Selection"
                                        style={{
                                            background: "none",
                                            border: "none",
                                            color: "var(--text-muted)",
                                            cursor: "pointer",
                                            padding: "0 2px",
                                            fontSize: "0.85rem",
                                            lineHeight: 1
                                        }}
                                    >
                                        ✕
                                    </button>
                                )}
                            </span>
                        </>
                    )}
                </div>

                <div className="timeline-controls">
                    {ZOOM_ORDER.indexOf(displayZoom) > 0 && (
                        <button className="button-link" onClick={handleZoomOut}>
                            ← ZOOM OUT
                        </button>
                    )}
                    <button className="button-link" onClick={handleFitAll} title="Fit entire timeline">
                        ⊞ FIT ALL
                    </button>
                    {onUploadClick && (
                        <button 
                            className="button-link" 
                            onClick={onUploadClick} 
                            title="Upload/Import communication log or archive file"
                            style={{ color: "var(--accent)", borderColor: "rgba(63, 216, 255, 0.4)" }}
                        >
                            ＋ UPLOAD LOG / ARCHIVE
                        </button>
                    )}
                    <button 
                        className={`button-link ${rangeSelectMode ? "active" : ""}`} 
                        onClick={() => setRangeSelectMode(prev => !prev)} 
                        title="Click to toggle drag-selection mode for a custom time range (or hold Shift while dragging)"
                        style={{
                            color: rangeSelectMode ? "#000" : "var(--accent)",
                            background: rangeSelectMode ? "var(--accent)" : "transparent",
                            borderColor: "var(--accent)",
                            fontWeight: 700
                        }}
                    >
                        {rangeSelectMode ? "✕ CANCEL DRAG RANGE" : "⏱ SELECT RANGE"}
                    </button>
                    <span className="timeline-resolution-label">
                        Resolution: <strong>{displayZoom}</strong>
                    </span>
                </div>
            </div>

            {/* vis-timeline container */}
            <div className="timeline-wave-container vis-timeline-container">
                {loading && <div className="timeline-overlay">ANALYZING TEMPORAL DISTRIBUTION...</div>}
                {error && <div className="timeline-overlay error">{error}</div>}
                <div ref={containerRef} className="vis-timeline-mount" />
            </div>
        </section>
    );
});

// =====================================
// Helpers
// =====================================

/**
 * Convert a bucket period string + zoom level into a Date range { start, end }.
 */
function bucketToDateRange(period, zoom) {
    if (zoom === "year") {
        const year = parseInt(period);
        return {
            start: new Date(Date.UTC(year, 0, 1)),
            end: new Date(Date.UTC(year + 1, 0, 1))
        };
    }
    if (zoom === "month") {
        const parts = period.split("-");
        const year = parseInt(parts[0]);
        const month = parseInt(parts[1]) - 1;
        return {
            start: new Date(Date.UTC(year, month, 1)),
            end: new Date(Date.UTC(year, month + 1, 1))
        };
    }
    if (zoom === "week") {
        // ISO week: "2024-W07" → approximate to Monday of that week
        const wParts = period.split("-W");
        const year = parseInt(wParts[0]);
        const week = parseInt(wParts[1]);
        const jan1 = new Date(Date.UTC(year, 0, 1));
        const dayOfWeek = jan1.getUTCDay() || 7;
        const weekStart = new Date(jan1.getTime() + ((week - 1) * 7 - (dayOfWeek - 1)) * 86400000);
        const weekEnd = new Date(weekStart.getTime() + 7 * 86400000);
        return { start: weekStart, end: weekEnd };
    }
    if (zoom === "day") {
        const parts = period.split("-");
        const d = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
        return {
            start: d,
            end: new Date(d.getTime() + 86400000)
        };
    }
    if (zoom === "hour") {
        // "2024-07-13 14:00"
        const [datePart, timePart] = period.split(" ");
        const dp = datePart.split("-");
        const hour = parseInt(timePart.split(":")[0]);
        const d = new Date(Date.UTC(parseInt(dp[0]), parseInt(dp[1]) - 1, parseInt(dp[2]), hour));
        return {
            start: d,
            end: new Date(d.getTime() + 3600000)
        };
    }
    if (zoom === "minute") {
        const [datePart, timePart] = period.split(" ");
        const dp = datePart.split("-");
        const tp = timePart.split(":");
        const d = new Date(Date.UTC(parseInt(dp[0]), parseInt(dp[1]) - 1, parseInt(dp[2]),
            parseInt(tp[0]), parseInt(tp[1])));
        return {
            start: d,
            end: new Date(d.getTime() + 60000)
        };
    }
    if (zoom === "second") {
        const [datePart, timePart] = period.split(" ");
        const dp = datePart.split("-");
        const tp = timePart.split(":");
        const d = new Date(Date.UTC(parseInt(dp[0]), parseInt(dp[1]) - 1, parseInt(dp[2]),
            parseInt(tp[0]), parseInt(tp[1]), parseInt(tp[2] || 0)));
        return {
            start: d,
            end: new Date(d.getTime() + 1000)
        };
    }

    // Fallback
    const d = new Date(period);
    return { start: d, end: new Date(d.getTime() + 86400000) };
}

function formatTooltipPeriod(period, zoom) {
    if (zoom === "year") return `Year ${period}`;
    if (zoom === "month") {
        const parts = period.split("-");
        const months = ["January", "February", "March", "April", "May", "June",
            "July", "August", "September", "October", "November", "December"];
        return `${months[parseInt(parts[1], 10) - 1]} ${parts[0]}`;
    }
    if (zoom === "week") {
        const wParts = period.split("-W");
        return wParts.length === 2 ? `Week ${wParts[1]}, ${wParts[0]}` : period;
    }
    if (zoom === "day") {
        const parts = period.split("-");
        const date = new Date(Date.UTC(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2])));
        return date.toLocaleDateString("en-US", {
            timeZone: "UTC", weekday: 'short', year: 'numeric', month: 'short', day: 'numeric'
        });
    }
    return period.replace(" ", " at ");
}

// =====================================
// Exports
// =====================================

export default Timeline;
