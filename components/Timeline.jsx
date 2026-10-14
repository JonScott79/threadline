/*
    Timeline.jsx

    Interactive Temporal Explorer visualization for Threadline.
    Uses vis-timeline for continuous zoom/pan through communication history.
    
    Enhanced Multi-Track Swimlanes & Forensic HUD:
    - Multi-line swimlanes:
        * 'log' (default): Dedicated horizontal lane for each uploaded extraction / log file.
        * 'conversation': Dedicated horizontal lane for each conversation thread.
        * 'unified': Consolidated single stream with aggregate density.
    - Zero-latency Forensic Hover Popover HUD:
        * Floating glassmorphic card on item hover with exact timestamp, sender, direction,
          investigative role badge (SUSPECT, COURIER, etc.), and message body preview.
    - Directional node styling (Outgoing ↗ vs Incoming ↙) and curated neon track palettes.
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
} from "vis-timeline/standalone";
import "vis-timeline/styles/vis-timeline-graph2d.min.css";

// =====================================
// Constants
// =====================================

const ZOOM_ORDER = ["year", "month", "week", "day", "hour", "minute", "second"];
const FETCH_DEBOUNCE_MS = 250;

const TRACK_PALETTE = [
    "#00D0FF", // Electric Cyan
    "#FF9500", // Amber Gold
    "#A855F7", // Purple / Violet
    "#10B981", // Emerald Green
    "#EC4899", // Neon Rose / Pink
    "#06B6D4", // Sky Blue
    "#F59E0B", // Bright Amber
    "#8B5CF6", // Lavender
];

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
    onClearTemporalRange = null,
    onCorrelateTimestamp = null
}, ref) {
    /*==============================================
                        STATE
    ==============================================*/

    const [trackMode, setTrackMode] = useState("log"); // 'log' | 'conversation' | 'unified'
    const trackModeRef = useRef("log");
    trackModeRef.current = trackMode;

    const [serverZoom, setServerZoom] = useState(activeZoom);
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState(null);

    const [rangeSelectMode, setRangeSelectMode] = useState(false);
    const rangeSelectModeRef = useRef(false);
    rangeSelectModeRef.current = rangeSelectMode;

    const dragStartRef = useRef(null);

    // Track groups returned by the server
    const [activeGroups, setActiveGroups] = useState([]);

    // Hover Popover HUD state
    const [hoverHud, setHoverHud] = useState(null);

    // Synchronized Cross-Track Laser Cursor state
    const [laserEnabled, setLaserEnabled] = useState(true);
    const laserEnabledRef = useRef(true);
    laserEnabledRef.current = laserEnabled;

    const [laserLocked, setLaserLocked] = useState(false);
    const laserLockedRef = useRef(false);
    laserLockedRef.current = laserLocked;

    const [laserPos, setLaserPos] = useState(null); // { x: number, time: number, group: string }
    const laserPosRef = useRef(null);
    laserPosRef.current = laserPos;

    // Metadata: full data span
    const [dataEarliest, setDataEarliest] = useState(null);
    const [dataLatest, setDataLatest] = useState(null);

    // Refs for vis-timeline instance
    const containerRef = useRef(null);
    const timelineRef = useRef(null);
    const itemsRef = useRef(null);
    const groupsRef = useRef(null);
    const fetchTimerRef = useRef(null);
    const isInitializedRef = useRef(false);

    // Stable refs for event handlers
    const handleItemClickRef = useRef();
    const onSelectMessageRef = useRef(onSelectMessage);
    onSelectMessageRef.current = onSelectMessage;
    const onSelectTemporalRangeRef = useRef(onSelectTemporalRange);
    onSelectTemporalRangeRef.current = onSelectTemporalRange;

    // Suppress rangechanged events during programmatic moves
    const suppressRangeRef = useRef(false);

    // Cache current raw data
    const currentBucketsRef = useRef([]);
    const currentEventsRef = useRef([]);
    const isIndividualEventsRef = useRef(false);
    const currentZoomRef = useRef(activeZoom);

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

        // Create DataSets for items and swimlane groups
        const items = new DataSet();
        itemsRef.current = items;

        const groups = new DataSet();
        groupsRef.current = groups;

        // Compute initial range with 5% padding
        const span = dataLatest - dataEarliest || 86400000;
        const padding = span * 0.05;
        const rangeStart = new Date(dataEarliest - padding);
        const rangeEnd = new Date(dataLatest + padding);

        // Timeline options with multi-track swimlanes & custom tooltips
        const options = {
            start: rangeStart,
            end: rangeEnd,
            min: new Date(dataEarliest - span * 2),
            max: new Date(dataLatest + span * 2),
            zoomMin: 2000,        // 2 seconds minimum zoom
            zoomMax: span * 10,   // 10x the data span maximum zoom
            height: "260px",
            stack: true,          // Clean vertical stacking of simultaneous events within lane
            showCurrentTime: false,
            showMajorLabels: true,
            showMinorLabels: true,
            selectable: true,
            multiselect: false,
            snap: null,
            orientation: { axis: "bottom", item: "bottom" },
            margin: { item: { horizontal: 2, vertical: 4 }, axis: 5 },
            showTooltips: false,  // Handled via zero-latency Forensic Hover Popover HUD
            groupOrder: "order"
        };

        // Create timeline instance
        const timeline = new VisTimeline(containerRef.current, items, groups, options);
        timelineRef.current = timeline;
        isInitializedRef.current = true;

        // Pointer down/up for exact timeline range dragging
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
                if (Math.abs(endT - startT) > 500) {
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

        // Hover Popover HUD listeners
        timeline.on("itemover", (props) => {
            if (!props.item || props.item === "temporal-selection-bg") return;
            const item = itemsRef.current?.get(props.item);
            if (!item) return;

            const nativeEvt = props.event;
            const clientX = nativeEvt.clientX || (nativeEvt.touches && nativeEvt.touches[0]?.clientX) || 0;
            const clientY = nativeEvt.clientY || (nativeEvt.touches && nativeEvt.touches[0]?.clientY) || 0;

            setHoverHud({
                item,
                x: clientX,
                y: clientY
            });
        });

        timeline.on("itemout", () => {
            setHoverHud(null);
        });

        function handleMouseMove(e) {
            setHoverHud(prev => {
                if (!prev) return null;
                return {
                    ...prev,
                    x: e.clientX,
                    y: e.clientY
                };
            });

            // Synchronized Cross-Track Laser Tracking
            if (laserEnabledRef.current && !laserLockedRef.current && timelineRef.current && domContainer) {
                const rect = domContainer.getBoundingClientRect();
                const clientX = e.clientX;
                const relX = clientX - rect.left;
                if (relX >= 0 && relX <= rect.width) {
                    const props = timelineRef.current.getEventProperties(e);
                    if (props && props.time) {
                        const newPos = {
                            x: relX,
                            time: props.time.getTime(),
                            group: props.group || null
                        };
                        laserPosRef.current = newPos;
                        setLaserPos(newPos);
                    }
                }
            }
        }

        function handleMouseLeave() {
            if (!laserLockedRef.current) {
                laserPosRef.current = null;
                setLaserPos(null);
            }
        }

        function handleKeyDown(e) {
            if (e.target && (e.target.tagName === "INPUT" || e.target.tagName === "TEXTAREA")) return;
            if (e.key === "l" || e.key === "L") {
                if (laserPosRef.current) {
                    setLaserLocked(prev => !prev);
                }
            }
        }

        domContainer.addEventListener("mousemove", handleMouseMove, { passive: true });
        domContainer.addEventListener("mouseleave", handleMouseLeave, { passive: true });
        window.addEventListener("keydown", handleKeyDown);

        // Track range changes to fetch new aggregated data
        timeline.on("rangechanged", (props) => {
            if (suppressRangeRef.current) return;
            const start = props.start.getTime();
            const end = props.end.getTime();
            debouncedFetch(start, end);
        });

        // On item select -> drill down or jump to message
        timeline.on("select", (props) => {
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

        return () => {
            domContainer.removeEventListener("pointerdown", handlePointerDown);
            domContainer.removeEventListener("mousemove", handleMouseMove);
            domContainer.removeEventListener("mouseleave", handleMouseLeave);
            window.removeEventListener("pointerup", handlePointerUp);
            window.removeEventListener("keydown", handleKeyDown);
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
                end: Math.ceil(vEnd),
                trackMode: trackModeRef.current
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
                const groups = response.data.groups || [];
                const newZoom = response.data.zoom || "day";

                setServerZoom(newZoom);
                setActiveGroups(groups);

                if (onZoomChange && newZoom !== activeZoom) {
                    onZoomChange(newZoom);
                }

                updateTimelineData(buckets, newZoom, isIndividualEvents, events, groups);
            }
        } catch (err) {
            console.error("Timeline data load error:", err);
            setError("Error loading timeline data.");
        } finally {
            setLoading(false);
        }
    }

    /*==============================================
                SWIMLANE & ITEM UPDATE
    ==============================================*/

    function updateTimelineData(buckets, zoom, isIndividualEvents = false, events = [], serverGroups = []) {
        if (!itemsRef.current || !groupsRef.current) return;

        currentBucketsRef.current = buckets || [];
        currentEventsRef.current = events || [];
        isIndividualEventsRef.current = isIndividualEvents;
        currentZoomRef.current = zoom;

        // 1. Update Groups (Swimlanes)
        const currentMode = trackModeRef.current;
        const formattedGroups = [];

        if (currentMode === "unified" || !serverGroups || serverGroups.length === 0) {
            formattedGroups.push({
                id: "unified",
                content: `
                    <div class="tl-group-lane-header unified">
                        <span class="tl-group-lane-badge" style="background: var(--accent); box-shadow: 0 0 8px var(--accent);"></span>
                        <span class="tl-group-lane-title">Unified Stream</span>
                    </div>
                `,
                order: 0,
                className: "tl-group-lane-unified"
            });
        } else {
            serverGroups.forEach((g, idx) => {
                const icon = currentMode === "log" ? "📱" : "💬";
                const cleanTitle = g.title || (currentMode === "log" ? "Extraction Log" : "Conversation");
                formattedGroups.push({
                    id: String(g.id),
                    content: `
                        <div class="tl-group-lane-header" style="border-left: 3px solid ${g.color};">
                            <span class="tl-group-lane-icon">${icon}</span>
                            <span class="tl-group-lane-title" title="${escapeHtml(cleanTitle)}">${escapeHtml(cleanTitle)}</span>
                            <span class="tl-group-lane-count">${g.count > 0 ? g.count.toLocaleString() : ""}</span>
                        </div>
                    `,
                    order: idx,
                    className: `tl-group-row tl-group-row-${idx % 8}`
                });
            });
        }

        groupsRef.current.clear();
        groupsRef.current.add(formattedGroups);

        // Adjust timeline container height dynamically based on active swimlane count
        if (timelineRef.current) {
            const laneCount = formattedGroups.length || 1;
            const dynamicHeight = Math.max(220, Math.min(460, laneCount * 58 + 75)) + "px";
            timelineRef.current.setOptions({ height: dynamicHeight });
        }

        // 2. Prepare Match Identifiers for Search Highlighting
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

        // 3. Render Individual Events (Zoom Level: Seconds / Minutes)
        if (isIndividualEvents && events.length > 0) {
            const eventItems = events.map((ev, i) => {
                const evTime = Number(ev.timestamp);
                const evDate = new Date(evTime);
                const isMatch = matchMessageIds.has(ev.sourceId) || matchMessageIds.has(ev.id) ||
                    matchTimestamps.some(ts => Math.abs(ts - evTime) < 2000);

                let itemClass = "tl-event-item";
                if (isMatch) itemClass += " tl-event-match";

                const isSent = ev.direction === "sent";
                const dirIcon = isSent ? "↗" : "↙";
                const dirClass = isSent ? "sent" : "received";
                const senderName = isSent ? "Me" : (ev.participantName || ev.sender || "Them");
                const snippet = ev.body ? (ev.body.length > 26 ? ev.body.substring(0, 26) + "…" : ev.body) : (ev.title || "Message");
                const roleBadge = ev.roleTag ? `<span class="tl-pill-role-badge">${escapeHtml(ev.roleTag)}</span>` : "";

                const pillHtml = `
                    <div class="tl-event-pill ${dirClass}" style="--track-color: ${ev.color};">
                        <span class="tl-pill-dir">${dirIcon}</span>
                        <span class="tl-pill-sender">${escapeHtml(senderName)}:</span>
                        ${roleBadge}
                        <span class="tl-pill-snippet">${escapeHtml(snippet)}</span>
                    </div>
                `;

                return {
                    id: `ev-${ev.id || i}`,
                    group: currentMode === "unified" ? "unified" : String(ev.groupId || "unified"),
                    start: evDate,
                    type: "box",
                    content: pillHtml,
                    className: itemClass,
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
                    className: "tl-temporal-selection-window"
                });
            }
            itemsRef.current.add(eventItems);
            return;
        }

        // 4. Render Aggregated Buckets (Zoom Level: Hours / Days / Weeks / Months / Years)
        const maxCount = Math.max(...buckets.map(b => b.count), 1);

        const newItems = buckets.map((bucket, i) => {
            const { start: bStart, end: bEnd } = bucketToDateRange(bucket.period, zoom);
            const intensity = bucket.count / maxCount;

            let intensityClass = "tl-bar-low";
            if (intensity > 0.7) intensityClass = "tl-bar-high";
            else if (intensity > 0.35) intensityClass = "tl-bar-med";

            const isSelected = selectedDay === bucket.period || selectedYearMonth === bucket.period;

            const bStartTime = bStart.getTime();
            const bEndTime = bEnd.getTime();
            const hasSearchMatch = matchTimestamps.some(ts => ts >= bStartTime && ts < bEndTime);

            let itemClass = `tl-bar ${intensityClass}`;
            if (isSelected) itemClass += " tl-bar-selected";
            if (hasSearchMatch) itemClass += " tl-bar-match";

            return {
                id: `b-${i}`,
                group: currentMode === "unified" ? "unified" : String(bucket.groupId || "unified"),
                start: bStart,
                end: bEnd,
                type: "range",
                className: itemClass,
                isEvent: false,
                bucketData: bucket,
                hasSearchMatch,
                style: `background: ${bucket.color ? `${bucket.color}bb` : "var(--accent)"}; border-color: ${bucket.color || "var(--accent)"};`
            };
        });

        itemsRef.current.clear();
        if (temporalRange && temporalRange.start && temporalRange.end) {
            newItems.unshift({
                id: "temporal-selection-bg",
                start: new Date(temporalRange.start),
                end: new Date(temporalRange.end),
                type: "background",
                className: "tl-temporal-selection-window"
            });
        }
        itemsRef.current.add(newItems);
    }

    // Refetch when track mode changes
    useEffect(() => {
        if (!timelineRef.current || !isInitializedRef.current) return;
        const window = timelineRef.current.getWindow();
        fetchBuckets(window.start.getTime(), window.end.getTime());
    }, [trackMode]);

    // Re-render items if searchMatches or temporalRange changes
    useEffect(() => {
        if (isIndividualEventsRef.current && currentEventsRef.current.length > 0) {
            updateTimelineData([], currentZoomRef.current, true, currentEventsRef.current, activeGroups);
        } else if (currentBucketsRef.current.length > 0) {
            updateTimelineData(currentBucketsRef.current, currentZoomRef.current, false, [], activeGroups);
        }
    }, [searchMatches, selectedDay, selectedYearMonth, temporalRange]);

    /*==============================================
                    INTERACTION HANDLERS
    ==============================================*/

    function handleItemClick(bucket, hasSearchMatch = false) {
        const zoom = currentZoomRef.current || serverZoom;
        const period = bucket.period;

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

        if (zoom === "day" || /^\d{4}-\d{2}-\d{2}$/.test(period)) {
            if (onSelectDay) onSelectDay(period);
        } else if (zoom === "hour" || zoom === "minute" || zoom === "second") {
            const dayPart = period.substring(0, 10);
            if (onSelectDay) onSelectDay(dayPart);
        } else {
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

        if (startDate && endDate && startDate <= endDate) {
            const span = endDate - startDate || 86400000;
            const padding = Math.max(span * 0.05, 3600000);
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

    // Helper to calculate HUD popover viewport coordinates
    const hudCoords = hoverHud ? calculateHudPosition(hoverHud.x, hoverHud.y) : null;

    return (
        <section className="timeline-visualization">
            {/* Header controls with Multi-Track Mode Switcher */}
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
                                ⏱️ {new Date(temporalRange.start).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })} — {new Date(temporalRange.end).toLocaleDateString("en-US", { month: "short", day: "numeric", hour: "2-digit", minute: "2-digit" })}
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

                {/* Track Grouping Switcher */}
                <div className="tl-track-selector-bar">
                    <span className="tl-track-selector-label">SWIMLANES:</span>
                    <div className="tl-track-pills">
                        <button
                            type="button"
                            className={`tl-track-pill ${trackMode === "log" ? "active" : ""}`}
                            onClick={() => setTrackMode("log")}
                            title="Parallel swimlanes for each uploaded extraction / log file"
                        >
                            📱 BY LOG ({activeGroups.length || 0})
                        </button>
                        <button
                            type="button"
                            className={`tl-track-pill ${trackMode === "conversation" ? "active" : ""}`}
                            onClick={() => setTrackMode("conversation")}
                            title="Parallel swimlanes for each individual conversation thread"
                        >
                            💬 BY CONVERSATION
                        </button>
                        <button
                            type="button"
                            className={`tl-track-pill ${trackMode === "unified" ? "active" : ""}`}
                            onClick={() => setTrackMode("unified")}
                            title="Consolidated single-axis timeline"
                        >
                            📊 UNIFIED
                        </button>
                        <button
                            type="button"
                            className={`tl-track-pill ${laserEnabled ? "active" : ""}`}
                            onClick={() => {
                                setLaserEnabled(prev => !prev);
                                if (laserEnabled) {
                                    setLaserPos(null);
                                    setLaserLocked(false);
                                }
                            }}
                            title="Toggle Synchronized Cross-Track Laser Cursor across all swimlanes (Press 'L' to freeze)"
                            style={{
                                color: laserEnabled ? (laserLocked ? "#ff9f0a" : "#3fd8ff") : undefined,
                                borderColor: laserEnabled ? (laserLocked ? "rgba(255, 159, 10, 0.5)" : "rgba(63, 216, 255, 0.4)") : undefined
                            }}
                        >
                            {laserLocked ? "🔒 LASER LOCKED" : "⚡ LASER SYNC"}
                        </button>
                    </div>
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
                            + UPLOAD LOG / ARCHIVE
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
                        {rangeSelectMode ? "✕ CANCEL DRAG RANGE" : "⏱️ SELECT RANGE"}
                    </button>
                    <span className="timeline-resolution-label">
                        Resolution: <strong>{displayZoom}</strong>
                    </span>
                </div>
            </div>

            {/* vis-timeline container */}
            <div className="timeline-wave-container vis-timeline-container" style={{ position: "relative" }}>
                {loading && <div className="timeline-overlay">ANALYZING TEMPORAL DISTRIBUTION...</div>}
                {error && <div className="timeline-overlay error">{error}</div>}
                <div ref={containerRef} className="vis-timeline-mount" />

                {/* Synchronized Cross-Track Laser Cursor */}
                {laserEnabled && laserPos && (
                    <div
                        className={`tl-laser-cursor-line ${laserLocked ? "locked" : ""}`}
                        style={{
                            left: `${laserPos.x}px`,
                            pointerEvents: "none"
                        }}
                    >
                        <div
                            className="tl-laser-flag"
                            style={{ pointerEvents: "auto" }}
                            onClick={(e) => e.stopPropagation()}
                        >
                            <span className="tl-laser-indicator">{laserLocked ? "🔒" : "⚡"}</span>
                            <span className="tl-laser-time">
                                {new Date(laserPos.time).toISOString().replace("T", " ").replace("Z", " UTC")}
                            </span>
                            <button
                                type="button"
                                className="tl-laser-lock-btn"
                                onClick={() => setLaserLocked(prev => !prev)}
                                title={laserLocked ? "Unlock laser (resume tracking)" : "Lock laser at this timestamp (or press L)"}
                            >
                                {laserLocked ? "Unlock" : "Freeze"}
                            </button>
                            {onCorrelateTimestamp && (
                                <button
                                    type="button"
                                    className="tl-laser-correlate-btn"
                                    onClick={() => onCorrelateTimestamp({ timestamp: laserPos.time })}
                                    title="Scan contemporaneous activity across all devices within ±Δt of this laser timestamp"
                                >
                                    ⚡ Correlate
                                </button>
                            )}
                        </div>
                    </div>
                )}
            </div>

            {/* Zero-Latency Forensic Hover Popover HUD */}
            {hoverHud && hoverHud.item && hudCoords && (
                <div
                    className="tl-forensic-hud"
                    style={{
                        position: "fixed",
                        left: `${hudCoords.x}px`,
                        top: `${hudCoords.y}px`,
                        pointerEvents: "none",
                        zIndex: 9999
                    }}
                >
                    {hoverHud.item.isEvent ? (
                        <ForensicEventHudCard event={hoverHud.item.eventData} />
                    ) : (
                        <ForensicBucketHudCard bucket={hoverHud.item.bucketData} zoom={displayZoom} />
                    )}
                </div>
            )}
        </section>
    );
});

// =====================================
// Forensic HUD Popover Cards
// =====================================

function ForensicEventHudCard({ event }) {
    if (!event) return null;

    const isSent = event.direction === "sent";
    const senderName = isSent ? "Me" : (event.participantName || event.sender || "Unknown Sender");
    const recipientName = isSent ? (event.participantName || event.recipient || "Recipient") : "Me";
    const eventDate = new Date(Number(event.timestamp));
    const roleTag = event.roleTag || null;

    return (
        <div className="tl-hud-card" style={{ "--hud-accent": event.color || "var(--accent)" }}>
            <div className="tl-hud-header">
                <div className="tl-hud-meta">
                    <span className="tl-hud-platform">{event.platform || "SMS"}</span>
                    <span className="tl-hud-source" title={event.importFilename || event.conversationTitle}>
                        {event.importFilename ? `📄 ${event.importFilename}` : `💬 ${event.conversationTitle || "Thread"}`}
                    </span>
                </div>
                <div className="tl-hud-time">
                    {eventDate.toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", second: "2-digit" })}
                </div>
            </div>

            <div className="tl-hud-participants-row">
                <span className={`tl-hud-dir-badge ${isSent ? "sent" : "received"}`}>
                    {isSent ? "↗ OUTGOING" : "↙ INCOMING"}
                </span>
                <span className="tl-hud-sender-name">{senderName}</span>
                {roleTag && (
                    <span className={`tl-hud-role-tag ${roleTag.toLowerCase()}`}>
                        {roleTag}
                    </span>
                )}
                {!isSent && <span className="tl-hud-arrow">→ Me</span>}
                {isSent && <span className="tl-hud-arrow">→ {recipientName}</span>}
            </div>

            <div className="tl-hud-message-body">
                "{event.body || event.description || "No text content"}"
            </div>

            <div className="tl-hud-footer">
                <span className="tl-hud-action">⚡ Click item to inspect in Thread View</span>
                <span className="tl-hud-date">{eventDate.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })}</span>
            </div>
        </div>
    );
}

function ForensicBucketHudCard({ bucket, zoom }) {
    if (!bucket) return null;

    return (
        <div className="tl-hud-card bucket" style={{ "--hud-accent": bucket.color || "var(--accent)" }}>
            <div className="tl-hud-header">
                <div className="tl-hud-meta">
                    <span className="tl-hud-platform">TEMPORAL BUCKET</span>
                    <span className="tl-hud-source">
                        {bucket.groupTitle || "Activity Volume"}
                    </span>
                </div>
            </div>

            <div className="tl-hud-bucket-body">
                <div className="tl-hud-bucket-period">
                    📅 {formatTooltipPeriod(bucket.period, zoom)}
                </div>
                <div className="tl-hud-bucket-stat">
                    <span className="tl-hud-count">{bucket.count.toLocaleString()}</span>
                    <span className="tl-hud-count-label">Recorded Communications</span>
                </div>
            </div>

            <div className="tl-hud-footer">
                <span className="tl-hud-action">⚡ Click to zoom into this timeframe</span>
            </div>
        </div>
    );
}

// =====================================
// Helpers
// =====================================

function calculateHudPosition(x, y) {
    const cardWidth = 320;
    const cardHeight = 160;
    const padding = 16;

    let posX = x + 16;
    let posY = y + 16;

    // If it overflows bottom, flip above cursor
    if (posY + cardHeight > window.innerHeight - padding) {
        posY = Math.max(padding, y - cardHeight - 16);
    }
    // If it overflows right, flip left of cursor
    if (posX + cardWidth > window.innerWidth - padding) {
        posX = Math.max(padding, x - cardWidth - 16);
    }
    if (posX < padding) posX = padding;
    if (posY < padding) posY = padding;

    return { x: posX, y: posY };
}

function escapeHtml(str) {
    if (!str) return "";
    return String(str)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

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
