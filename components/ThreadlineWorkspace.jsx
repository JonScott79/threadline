/*
    ThreadlineWorkspace.jsx

    Main timeline workbench dashboard.
    Renders when a threadline is loaded. Integrates the zoomable heartbeat timeline,
    a split pane explorer for active threads and global search, and a viewer pane
    for chronologically inspecting days or individual conversation threads.

    Responsibilities:
    - Manage active navigation state (timeline zoom, selected day, active conversation).
    - Manage time frame date filtering state (Start / End Date).
    - Manage compared/pinned conversations list for multi-lane comparison.
    - Coordinate API requests to local SQLite endpoints with time boundaries and comparison targets.
    - Wire search results to jump the user directly to that moment in time,
      clearing boundaries if necessary, highlighting the target message bubble,
      and scrolling the target message directly into view.
    - Support toggling between filtered ranges and full message thread histories.
    - Constrain searches to the selected day if clicked on the timeline graph.
    - Handle native HTML5 drag-and-drop of conversations onto the timeline drop target.
*/

// =====================================
// Imports
// =====================================

import { useState, useEffect, useRef } from "react";
import axios from "axios";
import { API_BASE_URL } from "../src/apiConfig";
import SupportedImports from "./SupportedImports";
import UploadPanel from "./UploadPanel";
import ImportPreview from "./ImportPreview";
import Timeline from "./Timeline";

// =====================================
// Constants
// =====================================

const PINNED_COLORS = [
    "#3fd8ff", // Neon Cyan
    "#bf5aff", // Neon Purple
    "#ff9f0a", // Neon Orange
    "#30d158", // Neon Green
    "#ff453a", // Neon Red
    "#ffd60a"  // Neon Yellow
];

// =====================================
// Component
// =====================================

function ThreadlineWorkspace({ threadline, setThreadlines, setCurrentThreadline, uid }) {
    /*==============================================
                        STATE
    ==============================================*/

    const [importResult, setImportResult] = useState(null);
    const [stats, setStats] = useState({
        messageCount: threadline.messageCount || 0,
        conversationCount: threadline.conversationCount || 0
    });

    // Timeframe filter states
    const [startDateStr, setStartDateStr] = useState("");
    const [endDateStr, setEndDateStr] = useState("");
    
    // Parse timestamps (ms)
    // Parse timestamps (ms) explicitly in UTC to match SQLite groupings
    const startTimestamp = startDateStr ? Date.parse(startDateStr + "T00:00:00.000Z") : null;
    const endTimestamp = endDateStr ? Date.parse(endDateStr + "T23:59:59.999Z") : null;

    // Toggle to bypass timeframe filter in chat viewer
    const [showFullConversation, setShowFullConversation] = useState(false);

    // Compared conversations (pinned ids)
    const [pinnedConversationIds, setPinnedConversationIds] = useState([]);

    // Navigation and Zooming States
    const [zoom, setZoom] = useState("year");
    const [selectedYearMonth, setSelectedYearMonth] = useState(null);
    const [selectedDay, setSelectedDay] = useState(null);

    // Explorer (Left Pane) States
    const [activeTab, setActiveTab] = useState("threads"); // 'threads' | 'search'
    const [conversations, setConversations] = useState([]);
    const [conversationsLoading, setConversationsLoading] = useState(false);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);

    // Search matched message ID to jump/highlight
    const [activeSearchMessageId, setActiveSearchMessageId] = useState(null);

    // Viewer (Right Pane) States
    const [activeRightTab, setActiveRightTab] = useState("day"); // 'day' | 'conversation'
    const [activeConversation, setActiveConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [messagesLoading, setMessagesLoading] = useState(false);
    const [dayEvents, setDayEvents] = useState([]);
    const [dayEventsLoading, setDayEventsLoading] = useState(false);

    // Refs for auto scrolling
    const messagesEndRef = useRef(null);

    // Derive active pinned conversation objects
    const pinnedConversations = conversations.filter(c => pinnedConversationIds.includes(c.id));

    /*==============================================
                        EFFECTS
    ==============================================*/

    // Reset workspace states when active threadline changes
    useEffect(() => {
        setImportResult(null);
        setStats({
            messageCount: threadline.messageCount || 0,
            conversationCount: threadline.conversationCount || 0
        });
        setStartDateStr("");
        setEndDateStr("");
        setZoom("year");
        setSelectedYearMonth(null);
        setSelectedDay(null);
        setActiveConversation(null);
        setMessages([]);
        setDayEvents([]);
        setSearchResults([]);
        setSearchQuery("");
        setActiveRightTab("day");
        setActiveSearchMessageId(null);
        setShowFullConversation(false);
        setPinnedConversationIds([]);

        if (threadline.id && threadline.messageCount > 0) {
            fetchConversations();
        }
    }, [threadline]);

    // Reset full conversation toggle when active thread changes
    useEffect(() => {
        setShowFullConversation(false);
    }, [activeConversation]);

    // Fetch conversations list (dynamic filtering by start/end timestamps if set)
    async function fetchConversations() {
        setConversationsLoading(true);
        try {
            const response = await axios.get(
                `${API_BASE_URL}/threadlines/${threadline.id}/conversations`,
                {
                    params: {
                        start: startTimestamp,
                        end: endTimestamp,
                        ids: threadline.isCompare ? threadline.ids.join(",") : undefined
                    },
                    headers: {
                        "x-user-uid": uid
                    }
                }
            );
            if (response.data && response.data.status === "success") {
                setConversations(response.data.conversations || []);
            }
        } catch (error) {
            console.error("Failed to load conversations:", error);
        } finally {
            setConversationsLoading(false);
        }
    }

    // Reload conversations list when threadline or date filter changes
    useEffect(() => {
        if (threadline.id && threadline.messageCount > 0) {
            fetchConversations();
        }
    }, [threadline.id, startTimestamp, endTimestamp]);

    // Load messages when an active conversation is selected (dynamically filters by date range unless showFullConversation is checked)
    useEffect(() => {
        if (!activeConversation) return;

        async function fetchMessages() {
            setMessagesLoading(true);
            try {
                const response = await axios.get(
                    `${API_BASE_URL}/threadlines/${threadline.id}/conversations/${activeConversation.id}/messages`,
                    {
                        params: {
                            start: showFullConversation ? null : startTimestamp,
                            end: showFullConversation ? null : endTimestamp
                        },
                        headers: {
                            "x-user-uid": uid
                        }
                    }
                );
                if (response.data && response.data.status === "success") {
                    setMessages(response.data.messages || []);
                }
            } catch (error) {
                console.error("Failed to load messages:", error);
            } finally {
                setMessagesLoading(false);
            }
        }

        fetchMessages();
    }, [activeConversation, threadline.id, startTimestamp, endTimestamp, showFullConversation, uid]);

    // Scroll chat window to bottom when a conversation loads, UNLESS we are jumping to a search result
    useEffect(() => {
        if (activeSearchMessageId) return; // Skip standard bottom-scroll on search jump
        if (messagesEndRef.current && activeRightTab === "conversation") {
            messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
        }
    }, [messages, activeRightTab, activeSearchMessageId]);

    // Scroll-to and Highlight searched message bubble inside thread
    useEffect(() => {
        if (activeSearchMessageId && messages.length > 0 && activeRightTab === "conversation") {
            const timer = setTimeout(() => {
                const element = document.getElementById(`msg-${activeSearchMessageId}`);
                if (element) {
                    element.scrollIntoView({ behavior: "smooth", block: "center" });
                }
            }, 150); // Small timeout to ensure browser renders list

            // Clear glow animation highlight after 4 seconds
            const clearTimer = setTimeout(() => {
                setActiveSearchMessageId(null);
            }, 4000);

            return () => {
                clearTimeout(timer);
                clearTimeout(clearTimer);
            };
        }
    }, [messages, activeSearchMessageId, activeRightTab]);

    // Load day events when a day is selected on the timeline (filtered by pinned comparison threads if active)
    useEffect(() => {
        if (!selectedDay) return;

        async function fetchDayEvents() {
            setDayEventsLoading(true);
            try {
                const response = await axios.get(
                    `${API_BASE_URL}/threadlines/${threadline.id}/days/${selectedDay}`,
                    {
                        params: {
                            conversations: pinnedConversationIds.join(","),
                            ids: threadline.isCompare ? threadline.ids.join(",") : undefined
                        },
                        headers: {
                            "x-user-uid": uid
                        }
                    }
                );
                if (response.data && response.data.status === "success") {
                    setDayEvents(response.data.events || []);
                }
            } catch (error) {
                console.error("Failed to load day events:", error);
            } finally {
                setDayEventsLoading(false);
            }
        }

        fetchDayEvents();
    }, [selectedDay, threadline.id, pinnedConversationIds, uid]);

    // Execute keyword search (constrains search to selectedDay and pinned comparison threads if set)
    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResults([]);
            return;
        }

        const delayDebounce = setTimeout(async () => {
            setSearchLoading(true);
            try {
                const response = await axios.get(
                    `${API_BASE_URL}/threadlines/${threadline.id}/search`,
                    { 
                        params: { 
                            q: searchQuery,
                            day: selectedDay,
                            conversations: pinnedConversationIds.join(","),
                            ids: threadline.isCompare ? threadline.ids.join(",") : undefined
                        },
                        headers: {
                            "x-user-uid": uid
                        }
                    }
                );
                if (response.data && response.data.status === "success") {
                    setSearchResults(response.data.results || []);
                }
            } catch (error) {
                console.error("Search query failed:", error);
            } finally {
                setSearchLoading(false);
            }
        }, 300); // 300ms debounce to prevent spamming backend

        return () => clearTimeout(delayDebounce);
    }, [searchQuery, threadline.id, selectedDay, pinnedConversationIds, uid]);

    /*==============================================
                    EVENT HANDLERS
    ==============================================*/

    // Pin a conversation to comparison
    function handlePinConversation(convId) {
        if (!pinnedConversationIds.includes(convId)) {
            setPinnedConversationIds(prev => [...prev, convId]);
        }
    }

    // Unpin a conversation from comparison
    function handleUnpinConversation(convId) {
        setPinnedConversationIds(prev => prev.filter(id => id !== convId));
    }

    // Color mapper for pinned tags
    function getPinColor(id) {
        const index = pinnedConversationIds.indexOf(id);
        if (index === -1) return "var(--accent)";
        return PINNED_COLORS[index % PINNED_COLORS.length];
    }

    // Triggered after drag-drop or file upload finishes
    function handleImportSuccess(response) {
        if (response && response.status === "success") {
            setImportResult(response.archive);
            
            // Fetch metadata for the newly created SQLite threadline
            axios.get(`${API_BASE_URL}/threadlines/${response.threadlineId}`, {
                headers: {
                    "x-user-uid": uid
                }
            })
                .then(res => {
                    if (res.data && res.data.status === "success") {
                        const newThreadline = res.data.threadline;
                        
                        // Add to sidebar list
                        if (setThreadlines) {
                            setThreadlines(prev => {
                                // Filter out the current blank placeholder if applicable
                                const cleaned = prev.filter(t => t.id !== threadline.id);
                                return [...cleaned, newThreadline];
                            });
                        }
                        
                        // Set as current active threadline
                        if (setCurrentThreadline) {
                            setCurrentThreadline(newThreadline);
                        }
                    }
                })
                .catch(err => {
                    console.error("Failed to load new threadline metadata:", err);
                    setStats({
                        messageCount: response.archive.messageCount,
                        conversationCount: response.archive.conversationCount
                    });
                    fetchConversations();
                });
        }
    }

    // Handles clicking a search result: zooms timeline & scrolls to conversation
    function handleSearchResultClick(result) {
        // Clear active date range filter so it doesn't mask the message we want to jump to
        setStartDateStr("");
        setEndDateStr("");

        // Compute the date string from timestamp (YYYY-MM-DD) in UTC
        const dateObj = new Date(Number(result.timestamp));
        const yyyy = dateObj.getUTCFullYear();
        const mm = String(dateObj.getUTCMonth() + 1).padStart(2, "0");
        const dd = String(dateObj.getUTCDate()).padStart(2, "0");
        const dateStr = `${yyyy}-${mm}-${dd}`;
        const yearMonthStr = `${yyyy}-${mm}`;

        // Set message highlight target
        setActiveSearchMessageId(result.representativeMessageId || result.id);

        // 1. Jump timeline zoom & period
        setZoom("day");
        setSelectedYearMonth(yearMonthStr);
        setSelectedDay(dateStr);

        // 2. Select matching conversation
        const foundConv = conversations.find(c => c.id === result.conversationId) || {
            id: result.conversationId,
            title: result.conversationTitle,
            platform: result.platform
        };
        setActiveConversation(foundConv);
        setActiveRightTab("conversation");

        // 3. Scroll to target message bubble
        setTimeout(() => {
            const targetId = result.representativeMessageId || result.id;
            const el = document.getElementById(`msg-${targetId}`);
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
            }
        }, 400);
    }

    /*==============================================
                        RENDER
    ==============================================*/

    // 1. Render empty/importer view if no messages are present
    if (stats.messageCount === 0) {
        return (
            <div className="workspace-dashboard empty-state">
                <section className="panel hero">
                    <h2>{threadline.title}</h2>
                    <p style={{ color: "var(--text-muted)", marginTop: "8px" }}>
                        This Threadline is empty. Drag & drop a communication archive file below to begin.
                    </p>
                </section>

                <SupportedImports />

                <UploadPanel
                    setImportResult={handleImportSuccess}
                />

                <ImportPreview
                    result={importResult}
                />
            </div>
        );
    }

    // 2. Render primary communication timeline workspace
    return (
        <div className="workspace-dashboard">
            {/* Dashboard Header */}
            <div className="dashboard-header">
                <div>
                    <h2>{threadline.title.toUpperCase()}</h2>
                </div>
                <div className="dashboard-stats">
                    <span>THREADS: <strong>{stats.conversationCount}</strong></span>
                    <span>EVENTS: <strong>{stats.messageCount}</strong></span>
                    <span>SOURCE: <strong>{threadline.source}</strong></span>
                </div>
            </div>

            {/* Glowing Heartbeat Timeline component wrapped in drag drop listeners */}
            <div 
                className="timeline-dropzone"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                    e.preventDefault();
                    const convId = e.dataTransfer.getData("text/plain");
                    if (convId) {
                        handlePinConversation(convId);
                    }
                }}
            >
                <Timeline
                    threadlineId={threadline.id}
                    selectedDay={selectedDay}
                    onSelectDay={(day) => {
                        setSelectedDay(day);
                        setActiveRightTab("day");
                    }}
                    activeZoom={zoom}
                    onZoomChange={setZoom}
                    selectedYearMonth={selectedYearMonth}
                    onPeriodChange={setSelectedYearMonth}
                    startDate={startTimestamp}
                    endDate={endTimestamp}
                    conversations={pinnedConversationIds.join(",")}
                    compareIds={threadline.isCompare ? threadline.ids : null}
                    uid={uid}
                />
            </div>

            {/* Active Pinned Comparison swimlanes row */}
            {pinnedConversations.length > 0 && (
                <div className="pinned-comparison-bar">
                    <span className="comparison-title">ACTIVE COMPARISON:</span>
                    <div className="pinned-tags-list">
                        {pinnedConversations.map((c) => {
                            const color = getPinColor(c.id);
                            return (
                                <div 
                                    key={c.id} 
                                    className="pinned-tag-item"
                                    style={{ borderColor: color, background: `${color}14` }}
                                >
                                    <span className="color-indicator" style={{ background: color }} />
                                    <span className="tag-label" title={c.title}>{c.title}</span>
                                    <button 
                                        className="tag-remove-btn" 
                                        onClick={() => handleUnpinConversation(c.id)}
                                    >
                                        &times;
                                    </button>
                                </div>
                            );
                        })}
                        <button 
                            className="button-link" 
                            onClick={() => setPinnedConversationIds([])}
                            style={{ color: "var(--danger)", fontSize: "0.8rem", marginLeft: "10px" }}
                        >
                            CLEAR ALL
                        </button>
                    </div>
                </div>
            )}

            {/* Styled Time Filter Bar without nested panel container */}
            <div className="time-filter-row">
                <div className="date-range-container">
                    <span className="date-picker-label">TIME RANGE FILTER:</span>
                    <span className="date-picker-label">FROM</span>
                    <input 
                        type="date" 
                        className="date-picker-input" 
                        value={startDateStr} 
                        onChange={(e) => setStartDateStr(e.target.value)} 
                    />
                    <span className="date-range-arrow">&rarr;</span>
                    <span className="date-picker-label">TO</span>
                    <input 
                        type="date" 
                        className="date-picker-input" 
                        value={endDateStr} 
                        onChange={(e) => setEndDateStr(e.target.value)} 
                    />
                </div>
                {(startDateStr || endDateStr) && (
                    <button 
                        className="button-link" 
                        onClick={() => { setStartDateStr(""); setEndDateStr(""); }}
                        style={{ color: "var(--danger)", fontSize: "0.8rem", textTransform: "uppercase", fontWeight: "700" }}
                    >
                        RESET RANGE
                    </button>
                )}
            </div>

            {/* Lower dashboard splitscreen */}
            <div className="dashboard-content-split">
                {/* Left explorer pane */}
                <div className="explorer-pane">
                    <div className="pane-tabs">
                        <button 
                            className={`pane-tab-btn ${activeTab === "threads" ? "active" : ""}`}
                            onClick={() => setActiveTab("threads")}
                        >
                            Threads
                        </button>
                        <button 
                            className={`pane-tab-btn ${activeTab === "search" ? "active" : ""}`}
                            onClick={() => setActiveTab("search")}
                        >
                            Search
                        </button>
                    </div>

                    <div className="explorer-scroll-area">
                        {activeTab === "threads" ? (
                            conversationsLoading ? (
                                <div className="pane-loading-indicator">LOADING THREADS...</div>
                            ) : (
                                conversations.map(c => {
                                    const isActive = activeConversation?.id === c.id;
                                    const isPinned = pinnedConversationIds.includes(c.id);
                                    return (
                                        <div 
                                            key={c.id} 
                                            draggable="true"
                                            onDragStart={(e) => {
                                                e.dataTransfer.setData("text/plain", c.id);
                                            }}
                                            className={`conversation-item ${isActive ? "active" : ""}`}
                                            onClick={() => {
                                                setActiveConversation(c);
                                                setActiveRightTab("conversation");
                                            }}
                                        >
                                            <div className="conversation-header-row">
                                                <span className="conversation-title-text" title={c.title}>
                                                    {c.title}
                                                </span>
                                                <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                                    <button 
                                                        className={`pin-thread-btn ${isPinned ? "pinned" : ""}`}
                                                        title={isPinned ? "Remove from Comparison" : "Pin to Comparison"}
                                                        onClick={(e) => {
                                                            e.stopPropagation();
                                                            if (isPinned) {
                                                                handleUnpinConversation(c.id);
                                                            } else {
                                                                handlePinConversation(c.id);
                                                            }
                                                        }}
                                                        style={{ color: isPinned ? getPinColor(c.id) : "inherit" }}
                                                    >
                                                        📌
                                                    </button>
                                                    <span className="conversation-badge">
                                                        {c.messageCount}
                                                    </span>
                                                </div>
                                            </div>
                                            <div className="conversation-details-row">
                                                Platform: {c.platform}
                                            </div>
                                        </div>
                                    );
                                })
                            )
                        ) : (
                            /* Search interface */
                            <div style={{ height: "100%", display: "flex", flexDirection: "column" }}>
                                <div className="explorer-search-box">
                                    <input 
                                        className="input"
                                        placeholder="Type keywords to search..."
                                        value={searchQuery}
                                        onChange={(e) => setSearchQuery(e.target.value)}
                                        style={{ padding: "10px" }}
                                    />
                                    {selectedDay && (
                                        <div style={{ marginTop: "8px", padding: "6px 10px", background: "rgba(63,216,255,0.06)", border: "1px solid rgba(63,216,255,0.2)", borderRadius: "4px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.75rem" }}>
                                            <span style={{ color: "var(--accent)" }}>Searching only in: <strong>{selectedDay}</strong></span>
                                            <button 
                                                className="button-link" 
                                                onClick={() => setSelectedDay(null)} 
                                                style={{ color: "var(--text-light)", fontSize: "0.75rem", textDecoration: "underline" }}
                                            >
                                                Search Globally
                                            </button>
                                        </div>
                                    )}
                                </div>
                                <div className="explorer-scroll-area">
                                    {searchLoading ? (
                                        <div className="pane-loading-indicator">SEARCHING ARCHIVE...</div>
                                    ) : searchResults.length > 0 ? (
                                        searchResults.map(result => {
                                            const isPinned = pinnedConversationIds.includes(result.conversationId);
                                            return (
                                                <div 
                                                    key={`${result.conversationId}-${result.timestamp}`} 
                                                    className="search-result-card"
                                                    draggable="true"
                                                    onDragStart={(e) => {
                                                        e.dataTransfer.setData("text/plain", result.conversationId);
                                                    }}
                                                >
                                                    <div className="search-card-header">
                                                        <div className="search-card-date">{result.dateString}</div>
                                                        <span className={`relevance-badge ${result.relevance.toLowerCase()}`}>
                                                            {result.relevance} relevance
                                                        </span>
                                                    </div>
                                                    <h4 className="search-card-title">{result.conversationTitle}</h4>
                                                    <p className="search-card-reason">{result.reason}</p>
                                                    
                                                    {/* Context Window (before & after matched text) */}
                                                    <div className="search-card-context-window">
                                                        {result.contextWindow.map((msg) => (
                                                            <div 
                                                                key={msg.id} 
                                                                className={`context-message-bubble ${msg.contextRole}`}
                                                            >
                                                                <span className="context-message-sender">
                                                                    {msg.direction === "sent" ? "Me" : (msg.metadata?.contact || msg.sender)}:
                                                                </span>
                                                                <span className="context-message-body">{msg.body}</span>
                                                            </div>
                                                        ))}
                                                    </div>

                                                    <div className="search-card-actions">
                                                        <button 
                                                            className="search-card-btn view-btn"
                                                            onClick={() => handleSearchResultClick(result)}
                                                        >
                                                            [VIEW]
                                                        </button>
                                                        <button 
                                                            className="search-card-btn add-btn"
                                                            onClick={() => {
                                                                if (isPinned) {
                                                                    handleUnpinConversation(result.conversationId);
                                                                } else {
                                                                    handlePinConversation(result.conversationId);
                                                                }
                                                            }}
                                                            style={{ color: isPinned ? "var(--danger)" : "var(--accent)" }}
                                                        >
                                                            {isPinned ? "[REMOVE]" : "[ADD TO THREADLINE]"}
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })
                                    ) : searchQuery.trim() ? (
                                        <div className="pane-loading-indicator" style={{ color: "var(--text-muted)" }}>
                                            NO MATCHES FOUND
                                        </div>
                                    ) : (
                                        <div className="pane-loading-indicator" style={{ color: "var(--text-muted)" }}>
                                            ENTER TERMS TO SEARCH
                                        </div>
                                    )}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* Right detailed viewer pane */}
                <div className="viewer-pane">
                    <div className="pane-tabs">
                        <button 
                            className={`pane-tab-btn ${activeRightTab === "day" ? "active" : ""}`}
                            onClick={() => selectedDay && setActiveRightTab("day")}
                            disabled={!selectedDay}
                            style={{ opacity: selectedDay ? 1 : 0.4 }}
                        >
                            Day Activity
                        </button>
                        <button 
                            className={`pane-tab-btn ${activeRightTab === "conversation" ? "active" : ""}`}
                            onClick={() => activeConversation && setActiveRightTab("conversation")}
                            disabled={!activeConversation}
                            style={{ opacity: activeConversation ? 1 : 0.4 }}
                        >
                            Conversation Thread
                        </button>
                    </div>

                    <div className="viewer-body-scroll">
                        {activeRightTab === "day" && selectedDay ? (
                            /* Day chronological list */
                            dayEventsLoading ? (
                                <div className="pane-loading-indicator">RETRIEVING EVENTS...</div>
                            ) : dayEvents.length > 0 ? (
                                <div className="day-timeline-list">
                                    <div className="viewer-title-info" style={{ marginBottom: "10px", padding: "0 4px" }}>
                                        <h3>ACTIVITY REPORT FOR {formatLongDate(selectedDay)}</h3>
                                        <p>{dayEvents.length} events logged chronologically</p>
                                    </div>
                                    
                                    {dayEvents.map(e => (
                                        <div key={e.id} className="day-event-row">
                                            <div className="day-event-time">
                                                {formatTime(e.timestamp)}
                                            </div>
                                            <div className="day-event-body">
                                                <div className="day-event-title-line">
                                                    <span className="day-event-title">{e.title}</span>
                                                    <span className="day-event-platform">SMS</span>
                                                </div>
                                                <div className="day-event-text">
                                                    {e.description}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="viewer-empty">NO ACTIVITY RECORDED ON THIS DAY.</div>
                            )
                        ) : activeRightTab === "conversation" && activeConversation ? (
                            /* Conversation message bubble view */
                            messagesLoading ? (
                                <div className="pane-loading-indicator">LOADING MESSAGES...</div>
                            ) : (
                                <>
                                    <div className="viewer-title-info" style={{ marginBottom: "12px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                        <div>
                                            <h3>{activeConversation.title}</h3>
                                            <p>
                                                SMS Conversation Thread ({messages.length} messages
                                                {showFullConversation ? " - Complete History" : " - Filtered View"})
                                            </p>
                                        </div>
                                        <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                                            <button 
                                                className="search-card-btn view-btn"
                                                onClick={() => window.print()}
                                                title="Print Transcript (PDF)"
                                                style={{ border: "1px solid var(--border)", borderRadius: "4px", padding: "6px 12px", background: "rgba(255,255,255,0.03)", color: "var(--accent)", fontWeight: "700" }}
                                            >
                                                🖨️ PRINT
                                            </button>
                                            <button 
                                                className="search-card-btn view-btn"
                                                onClick={() => {
                                                    const headers = ["Timestamp", "Readable Date", "Sender", "Recipient", "Platform", "Direction", "Body"];
                                                    const rows = messages.map(m => [
                                                        m.timestamp,
                                                        new Date(Number(m.timestamp)).toLocaleString("en-US", { timeZone: "UTC" }),
                                                        m.sender,
                                                        m.recipient,
                                                        m.platform,
                                                        m.direction,
                                                        `"${m.body.replace(/"/g, '""').replace(/\n/g, ' ')}"`
                                                    ]);
                                                    const csvContent = "data:text/csv;charset=utf-8," 
                                                        + [headers.join(","), ...rows.map(e => e.join(","))].join("\n");
                                                    const encodedUri = encodeURI(csvContent);
                                                    const link = document.createElement("a");
                                                    link.setAttribute("href", encodedUri);
                                                    link.setAttribute("download", `${activeConversation.title.replace(/\s+/g, '_')}_transcript.csv`);
                                                    document.body.appendChild(link);
                                                    link.click();
                                                    document.body.removeChild(link);
                                                }}
                                                title="Export to CSV"
                                                style={{ border: "1px solid var(--border)", borderRadius: "4px", padding: "6px 12px", background: "rgba(255,255,255,0.03)", color: "var(--accent)", fontWeight: "700" }}
                                            >
                                                📥 EXPORT CSV
                                            </button>
                                            {(startTimestamp || endTimestamp) && (
                                                <label style={{ display: "flex", alignItems: "center", gap: "8px", fontSize: "0.8rem", color: "var(--text-light)", cursor: "pointer", background: "rgba(255,255,255,0.03)", padding: "6px 12px", borderRadius: "4px", border: "1px solid var(--border)", userSelect: "none" }}>
                                                    <input 
                                                        type="checkbox" 
                                                        checked={showFullConversation} 
                                                        onChange={(e) => setShowFullConversation(e.target.checked)} 
                                                    />
                                                    Show Full Conversation
                                                </label>
                                            )}
                                        </div>
                                    </div>
                                    
                                    {messages.map(m => (
                                        <div 
                                            key={m.id} 
                                            id={`msg-${m.id}`}
                                            className={`message-row ${activeSearchMessageId === m.id ? "highlighted" : ""}`}
                                        >
                                            <div className="message-header">
                                                <span className={`message-sender ${m.direction}`}>
                                                    {m.direction === "sent" ? "Me" : (m.metadata?.contact || m.sender)}
                                                </span>
                                                <span className="message-time">
                                                    {formatFullTimestamp(m.timestamp)}
                                                </span>
                                            </div>
                                            <div className="message-body">
                                                {m.body}
                                                {m.attachments && m.attachments.map((att, index) => (
                                                    <div 
                                                        key={index} 
                                                        className="message-attachment" 
                                                        style={{ 
                                                            marginTop: "8px",
                                                            borderRadius: "4px",
                                                            overflow: "hidden",
                                                            border: "1px solid var(--border)",
                                                            maxWidth: "100%",
                                                            maxHeight: "350px",
                                                            display: "flex",
                                                            justifyContent: "center",
                                                            background: "rgba(0,0,0,0.15)"
                                                        }}
                                                    >
                                                        {att.mimeType.startsWith("image/") ? (
                                                            <img 
                                                                src={`data:${att.mimeType};base64,${att.data}`} 
                                                                alt={att.fileName || "Attachment"} 
                                                                style={{ 
                                                                    maxWidth: "100%", 
                                                                    maxHeight: "350px",
                                                                    objectFit: "contain",
                                                                    display: "block"
                                                                }} 
                                                            />
                                                        ) : (
                                                            <div style={{ padding: "12px", fontSize: "0.8rem", color: "var(--text-muted)" }}>
                                                                📄 {att.fileName || "Document Attachment"}
                                                            </div>
                                                        )}
                                                    </div>
                                                ))}
                                            </div>
                                        </div>
                                    ))}
                                    <div ref={messagesEndRef} />
                                </>
                            )
                        ) : (
                            /* Default empty workspace screen */
                            <div className="viewer-empty">
                                <div className="viewer-empty-icon">──────•──────</div>
                                <h3>THREADLINE ANALYSIS CENTRE</h3>
                                <p>
                                    Select a data point on the heartbeat timeline wave above<br />
                                    or select a conversation thread from the left pane to explore.
                                </p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}

// =====================================
// Helpers
// =====================================

function formatTime(timestamp) {
    const date = new Date(Number(timestamp));
    return date.toLocaleTimeString("en-US", { timeZone: "UTC", hour12: false, hour: '2-digit', minute: '2-digit' });
}

function formatFullTimestamp(timestamp) {
    const date = new Date(Number(timestamp));
    return date.toLocaleString("en-US", { 
        timeZone: "UTC",
        month: 'short', 
        day: 'numeric', 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
    });
}

function formatLongDate(dateString) {
    const parts = dateString.split("-");
    const date = new Date(Date.UTC(parts[0], parseInt(parts[1], 10) - 1, parts[2]));
    return date.toLocaleDateString("en-US", { timeZone: "UTC", weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
}

// =====================================
// Exports
// =====================================

export default ThreadlineWorkspace;