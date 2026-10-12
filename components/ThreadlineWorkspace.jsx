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
import DeleteThreadlineModal from "./DeleteThreadlineModal";
import { uploadArchive } from "../js/imports/upload";

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

function ThreadlineWorkspace({ threadline, setThreadlines, setCurrentThreadline, uid, onImportSuccess, onDelete }) {
    const isArchive = threadline?.id?.startsWith("archive_") || false;

    /*==============================================
                        STATE
    ==============================================*/

    const [importResult, setImportResult] = useState(null);
    const [showImportOverlay, setShowImportOverlay] = useState(false);
    const [timelineRefreshKey, setTimelineRefreshKey] = useState(0);

    // Deletion Modal state for current threadline workspace
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [isDeletingWorkspace, setIsDeletingWorkspace] = useState(false);
    const [deleteWorkspaceError, setDeleteWorkspaceError] = useState(null);
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

    // Pinned comparison states
    const [pinnedConversationIds, setPinnedConversationIds] = useState([]);

    // Timeline layer visibility controls (selected conversations visible on timeline)
    const [visibleConversationIds, setVisibleConversationIds] = useState([]);

    // Curated saved segments states
    const [savedSegments, setSavedSegments] = useState([]);
    const [linkedSegments, setLinkedSegments] = useState([]);
    const [selectedMessageIds, setSelectedMessageIds] = useState([]);
    const [showSaveSegmentModal, setShowSaveSegmentModal] = useState(false);
    const [segmentTitle, setSegmentTitle] = useState("");
    const [segmentDescription, setSegmentDescription] = useState("");

    // Ingestion imports and participants states
    const [imports, setImports] = useState([]);
    const [importsLoading, setImportsLoading] = useState(false);
    const [participants, setParticipants] = useState([]);
    const [participantsLoading, setParticipantsLoading] = useState(false);

    // Navigation and Zooming States
    const [zoom, setZoom] = useState("year");
    const [selectedYearMonth, setSelectedYearMonth] = useState(null);
    const [selectedDay, setSelectedDay] = useState(null);

    // Explorer (Left Pane) States
    const [activeTab, setActiveTab] = useState(() => threadline.id.startsWith("archive_") ? "threads" : "segments");
    const [conversations, setConversations] = useState([]);
    const [conversationsLoading, setConversationsLoading] = useState(false);
    const [archiveConversations, setArchiveConversations] = useState([]);
    const [searchQuery, setSearchQuery] = useState("");
    const [searchResults, setSearchResults] = useState([]);
    const [searchLoading, setSearchLoading] = useState(false);
    const [isDraggingOver, setIsDraggingOver] = useState(false);
    const [timelineUploading, setTimelineUploading] = useState(false);

    // Search matched message ID to jump/highlight
    const [activeSearchMessageId, setActiveSearchMessageId] = useState(null);
    // Tracks expanded Event Clusters in the Search Explorer pane
    const [expandedClusterIds, setExpandedClusterIds] = useState([]);

    // Evidence Export Modal States
    const [exportModalCluster, setExportModalCluster] = useState(null);
    const [exportFormat, setExportFormat] = useState("pdf"); // 'pdf' | 'watermarked_pdf' | 'json'
    const [exportCaseName, setExportCaseName] = useState("");
    const [isExporting, setIsExporting] = useState(false);

    // In-App Modal States for Segment Deletion and Thread Renaming (replacing native confirm/prompt)
    const [segmentToDelete, setSegmentToDelete] = useState(null);
    const [isDeletingSegment, setIsDeletingSegment] = useState(false);
    const [renameConversationTarget, setRenameConversationTarget] = useState(null);
    const [renameConversationValue, setRenameConversationValue] = useState("");

    const [isExportingCase, setIsExportingCase] = useState(false);

    async function handleExportCaseFile() {
        if (!threadline?.id) return;
        setIsExportingCase(true);
        try {
            const currentUid = uid || 'local';
            const response = await axios.get(
                `${API_BASE_URL}/threadlines/${threadline.id}/casefile`,
                {
                    headers: { 'x-user-uid': currentUid },
                    responseType: 'blob'
                }
            );

            const blob = new Blob([response.data], { type: 'application/x-sqlite3' });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const sanitizedTitle = (threadline.title || 'case').replace(/[^a-zA-Z0-9_-]/g, '_');
            a.download = `${sanitizedTitle}.tl`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);
        } catch (error) {
            console.error('Export case file failed:', error);
            alert('Export case file failed: ' + (error.response?.data?.message || error.message));
        } finally {
            setIsExportingCase(false);
        }
    }

    async function handleExecuteExport() {
        if (!exportModalCluster) return;
        setIsExporting(true);
        try {
            const response = await axios.post(
                `${API_BASE_URL}/threadlines/${threadline.id}/export`,
                {
                    format: exportFormat,
                    cluster: exportModalCluster,
                    query: searchQuery,
                    caseInfo: {
                        caseName: exportCaseName.trim() || "Threadline Investigation",
                        investigator: uid,
                        notes: `Exported from Event Cluster: ${exportModalCluster.title || exportModalCluster.topic}`
                    }
                },
                {
                    headers: { "x-user-uid": uid },
                    responseType: "blob"
                }
            );

            // Trigger browser download
            const blob = new Blob([response.data], {
                type: exportFormat === "json" ? "application/json" : "application/pdf"
            });
            const url = window.URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = url;
            const ext = exportFormat === "json" ? "json" : (exportFormat === "watermarked_pdf" ? "READONLY.pdf" : "pdf");
            const clusterTitle = (exportModalCluster.title || "evidence").toLowerCase().replace(/[^a-z0-9]/g, "_").substring(0, 30);
            a.download = `threadline_export_${clusterTitle}.${ext}`;
            document.body.appendChild(a);
            a.click();
            window.URL.revokeObjectURL(url);
            document.body.removeChild(a);

            setExportModalCluster(null);
        } catch (error) {
            console.error("Export request failed:", error);
            alert("Export failed: " + (error.response?.data?.message || error.message));
        } finally {
            setIsExporting(false);
        }
    }

    async function handleConfirmDeleteWorkspace() {
        if (!onDelete || isArchive) return;
        setIsDeletingWorkspace(true);
        setDeleteWorkspaceError(null);
        try {
            await onDelete(threadline);
            setShowDeleteModal(false);
        } catch (err) {
            setDeleteWorkspaceError(err.message || "Failed to delete threadline.");
        } finally {
            setIsDeletingWorkspace(false);
        }
    }

    // Viewer (Right Pane) States
    const [activeRightTab, setActiveRightTab] = useState("day"); // 'day' | 'conversation' | 'temporal'
    const [activeConversation, setActiveConversation] = useState(null);
    const [messages, setMessages] = useState([]);
    const [messagesLoading, setMessagesLoading] = useState(false);
    const [dayEvents, setDayEvents] = useState([]);
    const [dayEventsLoading, setDayEventsLoading] = useState(false);

    // Temporal Selection States
    const [temporalRange, setTemporalRange] = useState(null); // { start: number, end: number }
    const [temporalMessages, setTemporalMessages] = useState([]);
    const [temporalMessagesLoading, setTemporalMessagesLoading] = useState(false);
    const [temporalSummary, setTemporalSummary] = useState(null);

    // Refs for auto scrolling and timeline imperative control
    const messagesEndRef = useRef(null);
    const timelineRef = useRef(null);
    const targetScrollMessageIdRef = useRef(null);
    const hasScrolledConversationRef = useRef(false);
    const skipScrollToBottomRef = useRef(false);

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
        setTemporalRange(null);
        setTemporalMessages([]);
        setTemporalSummary(null);
        setActiveConversation(null);
        setMessages([]);
        setDayEvents([]);
        setSearchResults([]);
        setSearchQuery("");
        setActiveRightTab("day");
        setActiveSearchMessageId(null);
        targetScrollMessageIdRef.current = null;
        hasScrolledConversationRef.current = false;
        skipScrollToBottomRef.current = false;
        setShowFullConversation(false);
        setPinnedConversationIds([]);
        setSelectedMessageIds([]);
        setActiveTab(threadline.id.startsWith("archive_") ? "threads" : "segments");

        if (threadline.id) {
            fetchConversations();
            // Fetch real database counts dynamically to keep client state synchronized
            axios.get(`${API_BASE_URL}/threadlines/${threadline.id}`, { headers: { "x-user-uid": uid } })
                .then(res => {
                    if (res.data && res.data.status === "success" && res.data.threadline) {
                        const tl = res.data.threadline;
                        setStats({
                            messageCount: tl.messageCount || 0,
                            conversationCount: tl.conversationCount || 0
                        });
                    }
                })
                .catch(err => {
                    console.error("Failed to fetch workspace metadata:", err);
                });
        }
    }, [threadline]);

    // Reset full conversation toggle when active thread changes
    useEffect(() => {
        setShowFullConversation(false);
        setSelectedMessageIds([]);
    }, [activeConversation]);

    // Fetch imports, participants or segment maps depending on workspace type
    useEffect(() => {
        if (threadline && threadline.id) {
            fetchConversations();
            fetchImports();
            if (threadline.id.startsWith("archive_")) {
                fetchParticipants();
                setSavedSegments([]);
                setLinkedSegments([]);
            } else {
                fetchSegmentsData();
                fetchParticipants();
            }
        } else {
            setImports([]);
            setParticipants([]);
            setSavedSegments([]);
            setLinkedSegments([]);
        }
    }, [threadline.id]);

    async function fetchImports() {
        setImportsLoading(true);
        try {
            const response = await axios.get(`${API_BASE_URL}/import`, {
                params: { threadlineId: threadline.id },
                headers: { "x-user-uid": uid }
            });
            if (response.data && response.data.status === "success") {
                setImports(response.data.imports || []);
            }
        } catch (error) {
            console.error("Failed to load imports:", error);
        } finally {
            setImportsLoading(false);
        }
    }

    async function fetchParticipants() {
        setParticipantsLoading(true);
        try {
            const response = await axios.get(`${API_BASE_URL}/threadlines/${threadline.id}/participants`, {
                headers: { "x-user-uid": uid }
            });
            if (response.data && response.data.status === "success") {
                setParticipants(response.data.participants || []);
            }
        } catch (error) {
            console.error("Failed to load participants:", error);
        } finally {
            setParticipantsLoading(false);
        }
    }

    async function fetchSegmentsData() {
        try {
            const [resSaved, resLinked] = await Promise.all([
                axios.get(`${API_BASE_URL}/saved-segments`, { headers: { "x-user-uid": uid } }),
                axios.get(`${API_BASE_URL}/threadlines/${threadline.id}/segments`, { headers: { "x-user-uid": uid } })
            ]);
            if (resSaved.data && resSaved.data.status === "success") {
                setSavedSegments(resSaved.data.segments || []);
            }
            if (resLinked.data && resLinked.data.status === "success") {
                setLinkedSegments(resLinked.data.segments || []);
            }
        } catch (error) {
            console.error("Failed to fetch segments details:", error);
        }
    }

    async function handleAddSegment(segmentId) {
        try {
            const response = await axios.post(`${API_BASE_URL}/threadlines/${threadline.id}/segments`, { segmentId }, {
                headers: { "x-user-uid": uid }
            });
            if (response.data && response.data.status === "success") {
                await fetchSegmentsData();
                await fetchConversations();
                setStats(prev => ({ ...prev }));
            }
        } catch (error) {
            console.error("Failed to add segment:", error);
        }
    }

    async function handleRemoveSegment(segmentId) {
        try {
            const response = await axios.delete(`${API_BASE_URL}/threadlines/${threadline.id}/segments/${segmentId}`, {
                headers: { "x-user-uid": uid }
            });
            if (response.data && response.data.status === "success") {
                await fetchSegmentsData();
                await fetchConversations();
                setStats(prev => ({ ...prev }));
            }
        } catch (error) {
            console.error("Failed to remove segment:", error);
        }
    }

    async function handleDeleteSegment(segment) {
        const segmentId = typeof segment === "object" ? segment.id : segment;
        setIsDeletingSegment(true);
        try {
            const response = await axios.delete(`${API_BASE_URL}/saved-segments/${segmentId}`, {
                headers: { "x-user-uid": uid }
            });
            if (response.data && response.data.status === "success") {
                if (threadline.id.startsWith("archive_")) {
                    const res = await axios.get(`${API_BASE_URL}/saved-segments`, { headers: { "x-user-uid": uid } });
                    if (res.data && res.data.status === "success") {
                        setSavedSegments(res.data.segments || []);
                    }
                } else {
                    await fetchSegmentsData();
                }
                setSegmentToDelete(null);
            }
        } catch (error) {
            console.error("Failed to delete segment:", error);
        } finally {
            setIsDeletingSegment(false);
        }
    }

    async function handleLinkSearchResultAsSegment(searchResult) {
        try {
            const title = `Snippet: "${searchResult.body.substring(0, 25)}${searchResult.body.length > 25 ? '...' : ''}"`;
            const description = `Saved from search match on ${searchResult.dateString}`;
            const messageIds = searchResult.contextWindow.map(m => m.id);
            
            const resSeg = await axios.post(`${API_BASE_URL}/saved-segments`, {
                conversationId: searchResult.conversationId,
                title,
                description,
                messageIds
            }, {
                headers: { "x-user-uid": uid }
            });
            
            if (resSeg.data && resSeg.data.status === "success") {
                if (threadline.id.startsWith("archive_")) {
                    const res = await axios.get(`${API_BASE_URL}/saved-segments`, { headers: { "x-user-uid": uid } });
                    if (res.data && res.data.status === "success") {
                        setSavedSegments(res.data.segments || []);
                    }
                } else {
                    const segmentId = resSeg.data.segmentId;
                    await handleAddSegment(segmentId);
                }
            }
        } catch (error) {
            console.error("Failed to link search result as segment:", error);
        }
    }

    async function handleLinkConversationAsSegment(convId, convTitle) {
        try {
            const archiveId = `archive_${uid || "local"}`;
            const resMsgs = await axios.get(`${API_BASE_URL}/threadlines/${archiveId}/conversations/${convId}/messages?full=true`, {
                headers: { "x-user-uid": uid }
            });
            
            if (resMsgs.data && resMsgs.data.status === "success") {
                const messageIds = resMsgs.data.messages.map(m => m.id);
                if (messageIds.length === 0) return;
                
                const resSeg = await axios.post(`${API_BASE_URL}/saved-segments`, {
                    conversationId: convId,
                    title: `Full Thread: ${convTitle}`,
                    description: `Entire conversation history (${messageIds.length} messages)`,
                    messageIds
                }, {
                    headers: { "x-user-uid": uid }
                });
                
                if (resSeg.data && resSeg.data.status === "success") {
                    const segmentId = resSeg.data.segmentId;
                    await handleAddSegment(segmentId);
                }
            }
        } catch (error) {
            console.error("Failed to link conversation as segment:", error);
        }
    }

    async function handleSaveSegmentSubmit(title, description) {
        try {
            const response = await axios.post(`${API_BASE_URL}/saved-segments`, {
                conversationId: activeConversation.id,
                title,
                description,
                messageIds: selectedMessageIds
            }, {
                headers: { "x-user-uid": uid }
            });
            if (response.data && response.data.status === "success") {
                setSelectedMessageIds([]);
                setShowSaveSegmentModal(false);
                setSegmentTitle("");
                setSegmentDescription("");
                if (threadline.id.startsWith("archive_")) {
                    const res = await axios.get(`${API_BASE_URL}/saved-segments`, { headers: { "x-user-uid": uid } });
                    if (res.data && res.data.status === "success") {
                        setSavedSegments(res.data.segments || []);
                    }
                } else {
                    await fetchSegmentsData();
                }
            }
        } catch (error) {
            console.error("Failed to save segment:", error);
        }
    }

    async function handleRenameConversation(newTitle) {
        try {
            const response = await axios.put(`${API_BASE_URL}/threadlines/${threadline.id}/conversations/${activeConversation.id}`, {
                title: newTitle
            }, {
                headers: { "x-user-uid": uid }
            });
            if (response.data && response.data.status === "success") {
                setActiveConversation(prev => ({ ...prev, title: newTitle }));
                fetchConversations();
            }
        } catch (error) {
            console.error("Failed to rename conversation:", error);
        }
    }

    // Fetch conversations list (dynamic filtering by start/end timestamps if set)
    async function fetchConversations() {
        setConversationsLoading(true);
        try {
            const isCustom = !threadline.id.startsWith("archive_");
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
                const convs = response.data.conversations || [];
                setConversations(convs);
                setVisibleConversationIds(prev => {
                    if (prev.length === 0) {
                        return convs.map(c => c.id);
                    }
                    // Keep valid IDs from previous state, add any new ones
                    const existingValid = prev.filter(id => convs.some(c => c.id === id));
                    return existingValid.length > 0 ? existingValid : convs.map(c => c.id);
                });
            }

            if (isCustom) {
                // Fetch full conversations list from user's global archive workspace
                const archiveId = `archive_${uid || "local"}`;
                const resArchive = await axios.get(
                    `${API_BASE_URL}/threadlines/${archiveId}/conversations`,
                    {
                        headers: {
                            "x-user-uid": uid
                        }
                    }
                );
                if (resArchive.data && resArchive.data.status === "success") {
                    setArchiveConversations(resArchive.data.conversations || []);
                }
            } else {
                setArchiveConversations([]);
            }
        } catch (error) {
            console.error("Failed to load conversations:", error);
        } finally {
            setConversationsLoading(false);
        }
    }

    // Reload conversations list when threadline or date filter changes
    useEffect(() => {
        if (threadline.id) {
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

    // Reset conversation scroll tracking when activeConversation changes
    useEffect(() => {
        hasScrolledConversationRef.current = false;
    }, [activeConversation?.id]);

    // Handle scroll positioning when messages render in conversation view
    useEffect(() => {
        if (activeRightTab !== "conversation" || messages.length === 0) return;

        // Path A: User explicitly selected a message -> scroll target into view and stop
        if (targetScrollMessageIdRef.current) {
            const targetId = targetScrollMessageIdRef.current;
            const tryScroll = () => {
                const element = document.getElementById(`msg-${targetId}`);
                if (element) {
                    element.scrollIntoView({ behavior: "smooth", block: "center" });
                    targetScrollMessageIdRef.current = null;
                    skipScrollToBottomRef.current = true;
                    hasScrolledConversationRef.current = true;
                }
            };

            // Execute after browser completes DOM layout
            requestAnimationFrame(() => {
                tryScroll();
                if (targetScrollMessageIdRef.current) {
                    setTimeout(tryScroll, 50);
                }
            });
            return;
        }

        // Path B: Normal conversation open without target message -> scroll to latest ONCE
        if (!skipScrollToBottomRef.current && !hasScrolledConversationRef.current) {
            if (messagesEndRef.current) {
                messagesEndRef.current.scrollIntoView({ behavior: "smooth" });
                hasScrolledConversationRef.current = true;
            }
        }
    }, [messages, activeRightTab]);

    // Independent visual glow highlight timer: fades highlight without triggering scroll
    useEffect(() => {
        if (!activeSearchMessageId) return;

        const clearTimer = setTimeout(() => {
            setActiveSearchMessageId(null);
        }, 4000);

        return () => clearTimeout(clearTimer);
    }, [activeSearchMessageId]);

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

    // Load cross-conversation chronological messages when a temporalRange is selected
    useEffect(() => {
        if (!temporalRange || !temporalRange.start || !temporalRange.end) {
            setTemporalMessages([]);
            setTemporalSummary(null);
            return;
        }

        async function fetchTemporalMessages() {
            setTemporalMessagesLoading(true);
            try {
                const params = {
                    start: temporalRange.start,
                    end: temporalRange.end
                };
                if (visibleConversationIds.length > 0 && visibleConversationIds.length < conversations.length) {
                    params.conversations = visibleConversationIds.join(",");
                } else if (visibleConversationIds.length === 0) {
                    params.conversations = "none_selected";
                }
                if (threadline.isCompare && threadline.ids) {
                    params.ids = threadline.ids.join(",");
                }

                const response = await axios.get(
                    `${API_BASE_URL}/threadlines/${threadline.id}/timeline/messages`,
                    {
                        params,
                        headers: { "x-user-uid": uid }
                    }
                );

                if (response.data && response.data.status === "success") {
                    setTemporalMessages(response.data.messages || []);
                    setTemporalSummary(response.data.summary || null);
                }
            } catch (err) {
                console.error("Failed to load temporal messages:", err);
            } finally {
                setTemporalMessagesLoading(false);
            }
        }

        fetchTemporalMessages();
    }, [temporalRange, threadline.id, visibleConversationIds, uid]);

    // Execute keyword search (constrains search to selectedDay, start/end date range, and pinned comparison threads if set)
    useEffect(() => {
        if (!searchQuery.trim()) {
            setSearchResults([]);
            return;
        }

        const delayDebounce = setTimeout(async () => {
            setSearchLoading(true);
            try {
                // Determine active time boundaries: timeline drag range takes precedence, then top-level date inputs
                const effectiveStart = temporalRange?.start || (startTimestamp && endTimestamp && startTimestamp > endTimestamp ? undefined : startTimestamp);
                const effectiveEnd = temporalRange?.end || (startTimestamp && endTimestamp && startTimestamp > endTimestamp ? undefined : endTimestamp);

                const response = await axios.get(
                    `${API_BASE_URL}/threadlines/${threadline.id}/search`,
                    { 
                        params: { 
                            q: searchQuery,
                            start: effectiveStart,
                            end: effectiveEnd,
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
    }, [searchQuery, threadline.id, selectedDay, pinnedConversationIds, uid, startTimestamp, endTimestamp, temporalRange]);

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

    // Toggle layer visibility for an individual conversation on the timeline
    function handleToggleConversationVisibility(convId) {
        setVisibleConversationIds(prev => {
            if (prev.includes(convId)) {
                return prev.filter(id => id !== convId);
            } else {
                return [...prev, convId];
            }
        });
    }

    // Select All / Deselect All conversations on the timeline
    function handleToggleAllConversations() {
        setVisibleConversationIds(prev => {
            if (prev.length === conversations.length) {
                return []; // Deselect All
            } else {
                return conversations.map(c => c.id); // Select All
            }
        });
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

                        // Refresh stats and extra tabs
                        setStats({
                            messageCount: newThreadline.messageCount,
                            conversationCount: newThreadline.conversationCount
                        });
                        setTimelineRefreshKey(k => k + 1);
                        fetchConversations();
                        if (newThreadline.id.startsWith("archive_")) {
                            fetchImports();
                            fetchParticipants();
                        }
                        if (onImportSuccess) {
                            onImportSuccess();
                        }
                    }
                })
                .catch(err => {
                    console.error("Failed to load new threadline metadata:", err);
                    setStats({
                        messageCount: response.archive.messageCount,
                        conversationCount: response.archive.conversationCount
                    });
                    setTimelineRefreshKey(k => k + 1);
                    fetchConversations();
                    if (threadline.id.startsWith("archive_")) {
                        fetchImports();
                        fetchParticipants();
                    }
                    if (onImportSuccess) {
                        onImportSuccess();
                    }
                });
        }
    }

    // Handles clicking an individual communication on the timeline
    function handleTimelineMessageSelect(event) {
        if (!event) return;
        const msgId = event.sourceId || event.id;
        const convId = event.conversationId;
        
        // 1. Register explicit target message scroll & highlight intent
        targetScrollMessageIdRef.current = msgId;
        skipScrollToBottomRef.current = true;
        setActiveSearchMessageId(msgId);

        // 2. Activate/reveal this conversation layer if hidden
        if (convId) {
            setVisibleConversationIds(prev =>
                prev.includes(convId) ? prev : [...prev, convId]
            );
        }

        // 3. Find or create conversation object and switch to Thread View
        const foundConv = conversations.find(c => c.id === convId) || {
            id: convId,
            title: event.conversationTitle || "Conversation",
            platform: event.platform || "SMS"
        };
        setActiveConversation(foundConv);
        setActiveRightTab("conversation");

        // 4. Immediate check if element is already mounted in DOM
        const el = document.getElementById(`msg-${msgId}`);
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            targetScrollMessageIdRef.current = null;
            hasScrolledConversationRef.current = true;
        }
    }

    // Toggles inline chronological messages transcript for an Event Cluster
    function handleToggleClusterExpand(clusterId) {
        setExpandedClusterIds(prev =>
            prev.includes(clusterId)
                ? prev.filter(id => id !== clusterId)
                : [...prev, clusterId]
        );
    }

    // Handles clicking an Event Cluster: highlights and centers timeline on the cluster time span
    function handleClusterClick(cluster) {
        setStartDateStr("");
        setEndDateStr("");

        const earliest = Number(cluster.earliestTimestamp || cluster.timestamp);
        const latest = Number(cluster.latestTimestamp || cluster.timestamp);

        // Center and fit the timeline to the cluster time window with 10% breathing room
        if (timelineRef.current) {
            if (timelineRef.current.setWindow && earliest && latest) {
                const span = latest - earliest;
                const padding = Math.max(span * 0.15, 3600000); // at least 1 hour padding
                timelineRef.current.setWindow(earliest - padding, latest + padding);
            } else if (timelineRef.current.moveToTimestamp) {
                timelineRef.current.moveToTimestamp(earliest);
            }
        }

        // Set target highlight message to dominant representative message
        const targetId = cluster.representativeMessageId || cluster.id;
        targetScrollMessageIdRef.current = targetId;
        skipScrollToBottomRef.current = true;
        setActiveSearchMessageId(targetId);

        // Ensure all participating conversations in this cluster are revealed on the timeline
        if (cluster.conversations && cluster.conversations.length > 0) {
            const clusterConvIds = cluster.conversations.map(c => c.id);
            setVisibleConversationIds(prev => {
                const missing = clusterConvIds.filter(id => !prev.includes(id));
                return missing.length > 0 ? [...prev, ...missing] : prev;
            });
        } else if (cluster.conversationId) {
            setVisibleConversationIds(prev =>
                prev.includes(cluster.conversationId) ? prev : [...prev, cluster.conversationId]
            );
        }

        // Select the primary conversation and switch to Thread View
        const foundConv = conversations.find(c => c.id === cluster.conversationId) || {
            id: cluster.conversationId,
            title: cluster.conversationTitle,
            platform: cluster.platform
        };
        setActiveConversation(foundConv);
        setActiveRightTab("conversation");

        // Immediate check if element is already mounted in DOM
        if (targetId) {
            const el = document.getElementById(`msg-${targetId}`);
            if (el) {
                el.scrollIntoView({ behavior: "smooth", block: "center" });
                targetScrollMessageIdRef.current = null;
                hasScrolledConversationRef.current = true;
            }
        }
    }

    // Alias for search result selection / fallback legacy cards
    const handleSearchResultClick = handleClusterClick;

    // Handles clicking an individual constituent source message inside an Event Cluster
    function handleClusterMessageClick(msg) {
        setStartDateStr("");
        setEndDateStr("");

        // Register explicit target message scroll & highlight intent
        targetScrollMessageIdRef.current = msg.id;
        skipScrollToBottomRef.current = true;
        setActiveSearchMessageId(msg.id);

        // 1. Move & center timeline on the exact message timestamp
        if (timelineRef.current && timelineRef.current.moveToTimestamp) {
            timelineRef.current.moveToTimestamp(msg.timestamp);
        }

        // 2. Ensure this message's conversation layer is visible on the timeline
        if (msg.conversationId) {
            setVisibleConversationIds(prev =>
                prev.includes(msg.conversationId) ? prev : [...prev, msg.conversationId]
            );
        }

        // 3. Select the specific conversation this message originated from
        const foundConv = conversations.find(c => c.id === msg.conversationId) || {
            id: msg.conversationId,
            title: msg.conversationTitle || "Conversation",
            platform: msg.platform || "SMS"
        };
        setActiveConversation(foundConv);
        setActiveRightTab("conversation");

        // Immediate check if element is already mounted in DOM
        const el = document.getElementById(`msg-${msg.id}`);
        if (el) {
            el.scrollIntoView({ behavior: "smooth", block: "center" });
            targetScrollMessageIdRef.current = null;
            hasScrolledConversationRef.current = true;
        }
    }

    /*==============================================
                        RENDER
    ==============================================*/

    // 1. Render empty/importer view if no messages are present in the global archive
    if (isArchive && stats.messageCount === 0) {
        return (
            <div className="workspace-dashboard empty-state" style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                justifyContent: "center",
                minHeight: "100%",
                padding: "40px 20px",
                gap: "0"
            }}>
                {/* Branding */}
                <div style={{ textAlign: "center", marginBottom: "12px" }}>
                    <h1 style={{
                        fontSize: "2.4rem",
                        fontWeight: "800",
                        color: "var(--accent)",
                        letterSpacing: "0.25rem",
                        marginBottom: "6px"
                    }}>
                        THREADLINE
                    </h1>
                    <p style={{
                        fontSize: "0.85rem",
                        color: "var(--text-muted)",
                        letterSpacing: "0.15rem",
                        textTransform: "uppercase"
                    }}>
                        Communication Forensics Workspace
                    </p>
                </div>

                {/* Large drop zone */}
                <div style={{ width: "100%", maxWidth: "640px" }}>
                    <UploadPanel
                        setImportResult={handleImportSuccess}
                        threadlineId={threadline.id}
                    />
                </div>

                {/* Import result */}
                {importResult && (
                    <div style={{ width: "100%", maxWidth: "640px" }}>
                        <ImportPreview result={importResult} />
                    </div>
                )}

                {/* Workflow description */}
                <div style={{
                    textAlign: "center",
                    maxWidth: "500px",
                    margin: "20px auto 0",
                    padding: "20px",
                    borderTop: "1px solid var(--border)"
                }}>
                    <p style={{
                        color: "var(--text-muted)",
                        fontSize: "0.88rem",
                        lineHeight: "1.7",
                        margin: "0 0 16px 0"
                    }}>
                        Import your communication archives to build a searchable,
                        zoomable historical timeline. Drop a backup file above or
                        click to browse.
                    </p>
                </div>

                {/* Supported formats */}
                <div style={{ width: "100%", maxWidth: "640px" }}>
                    <SupportedImports />
                </div>
            </div>
        );
    }

    // 2. Render primary communication timeline workspace
    return (
        <div className="workspace-dashboard">
            {/* Import Overlay — appears when clicking Import in populated workspace */}
            {showImportOverlay && (
                <div style={{
                    position: "absolute",
                    inset: 0,
                    zIndex: 100,
                    background: "rgba(11, 16, 22, 0.95)",
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: "20px",
                    padding: "40px"
                }}>
                    <button
                        className="button-link"
                        onClick={() => setShowImportOverlay(false)}
                        style={{
                            position: "absolute",
                            top: "20px",
                            right: "20px",
                            fontSize: "1.2rem",
                            color: "var(--text-muted)",
                            cursor: "pointer"
                        }}
                    >
                        ✕ CLOSE
                    </button>
                    <h2 style={{
                        color: "var(--accent)",
                        textTransform: "uppercase",
                        letterSpacing: "2px",
                        fontSize: "1.2rem"
                    }}>
                        IMPORT ADDITIONAL ARCHIVE
                    </h2>
                    <div style={{ width: "100%", maxWidth: "560px" }}>
                        <UploadPanel
                            setImportResult={(result) => {
                                handleImportSuccess(result);
                                setShowImportOverlay(false);
                            }}
                            threadlineId={threadline.id}
                        />
                    </div>
                    <div style={{ width: "100%", maxWidth: "560px" }}>
                        <SupportedImports />
                    </div>
                </div>
            )}

            {/* Dashboard Header */}
            <div className="dashboard-header">
                <div>
                    <h2>{threadline.title.toUpperCase()}</h2>
                </div>
                <div className="dashboard-stats">
                    <span>THREADS: <strong>{stats.conversationCount}</strong></span>
                    <span>EVENTS: <strong>{stats.messageCount}</strong></span>
                    <button
                        className="button-link"
                        onClick={handleExportCaseFile}
                        disabled={isExportingCase}
                        title="Save a portable copy of this complete case to your computer"
                        style={{
                            color: "var(--accent)",
                            fontWeight: "700",
                            fontSize: "0.75rem",
                            textTransform: "uppercase",
                            letterSpacing: "1px",
                            border: "1px solid var(--accent)",
                            padding: "4px 12px",
                            borderRadius: "3px",
                            cursor: isExportingCase ? "wait" : "pointer",
                            marginLeft: "8px"
                        }}
                    >
                        {isExportingCase ? "SAVING CASE..." : "📦 EXPORT CASE"}
                    </button>
                    <button
                        className="button-link"
                        onClick={() => setShowImportOverlay(true)}
                        style={{
                            color: "var(--accent)",
                            fontWeight: "700",
                            fontSize: "0.75rem",
                            textTransform: "uppercase",
                            letterSpacing: "1px",
                            border: "1px solid var(--accent)",
                            padding: "4px 12px",
                            borderRadius: "3px",
                            cursor: "pointer",
                            marginLeft: "8px"
                        }}
                    >
                        ＋ IMPORT
                    </button>
                    {!isArchive && (
                        <button
                            type="button"
                            className="threads-delete-action-btn"
                            onClick={() => {
                                setDeleteWorkspaceError(null);
                                setShowDeleteModal(true);
                            }}
                            title="Delete this Threadline workspace"
                            style={{ marginLeft: "4px" }}
                        >
                            DELETE THREADLINE
                        </button>
                    )}
                </div>
            </div>

            {/* Glowing Heartbeat Timeline component wrapped in drag drop listeners */}
            <div 
                className={`timeline-dropzone ${isDraggingOver ? "drag-active" : ""}`}
                onDragOver={(e) => {
                    e.preventDefault();
                    if (!isDraggingOver) setIsDraggingOver(true);
                }}
                onDragEnter={(e) => {
                    e.preventDefault();
                    setIsDraggingOver(true);
                }}
                onDragLeave={(e) => {
                    // Only unset if leaving the dropzone container itself
                    if (!e.currentTarget.contains(e.relatedTarget)) {
                        setIsDraggingOver(false);
                    }
                }}
                onDrop={async (e) => {
                    e.preventDefault();
                    setIsDraggingOver(false);

                    // 1. Direct OS file drop (e.g. .log, .txt, .xml, .html, .json)
                    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                        const file = e.dataTransfer.files[0];
                        const ext = file.name.split(".").pop().toLowerCase();
                        const allowedExts = ["xml", "html", "json", "log", "txt"];
                        if (!allowedExts.includes(ext)) {
                            alert(`Unsupported file format (.${ext}). Supported formats: .log, .txt, .xml, .html, .json`);
                            return;
                        }

                        try {
                            setTimelineUploading(true);
                            const response = await uploadArchive(file, { uid }, threadline.id);
                            handleImportSuccess(response);
                        } catch (err) {
                            console.error("Timeline drop upload error:", err);
                            alert(err.response?.data?.message || err.message || "Failed to upload log file.");
                        } finally {
                            setTimelineUploading(false);
                        }
                        return;
                    }

                    // 2. Internal Drag & Drop (segment, search result, or thread)
                    const dataStr = e.dataTransfer.getData("application/json");
                    if (dataStr) {
                        try {
                            const data = JSON.parse(dataStr);
                            if (data.type === "segment") {
                                handleAddSegment(data.id);
                                return;
                            }
                            if (data.type === "searchResult") {
                                handleLinkSearchResultAsSegment(data.result);
                                return;
                            }
                            if (data.type === "conversation") {
                                handleLinkConversationAsSegment(data.id, data.title);
                                return;
                            }
                        } catch (err) {
                            console.error("Drop parsing error:", err);
                        }
                    }
                    const convId = e.dataTransfer.getData("text/plain");
                    if (convId) {
                        handleLinkConversationAsSegment(convId, "Dragged Thread");
                    }
                }}
            >
                {/* Visual drag/upload overlay */}
                {isDraggingOver && (
                    <div className="timeline-dropzone-overlay">
                        <span>📥 DROP LOG / ARCHIVE TO INGEST INTO TIMELINE</span>
                        <span className="drop-sub">Supports .log, .txt, .json, .xml, .html</span>
                    </div>
                )}
                {timelineUploading && (
                    <div className="timeline-dropzone-overlay">
                        <span className="heartbeat-pulse">⚡ INGESTING COMMUNICATION LOG...</span>
                        <span className="drop-sub">Parsing timestamps & normalizing conversations</span>
                    </div>
                )}
                <Timeline
                    ref={timelineRef}
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
                    conversations={visibleConversationIds.length === conversations.length ? "" : (visibleConversationIds.length === 0 ? "none_selected" : visibleConversationIds.join(","))}
                    compareIds={threadline.isCompare ? threadline.ids : null}
                    uid={uid}
                    searchQuery={searchQuery}
                    searchMatches={searchResults}
                    refreshKey={timelineRefreshKey}
                    onUploadClick={() => setShowImportOverlay(true)}
                    onSelectMessage={handleTimelineMessageSelect}
                    onSelectSearchResult={handleSearchResultClick}
                    temporalRange={temporalRange}
                    onSelectTemporalRange={(range) => {
                        setTemporalRange(range);
                        setActiveRightTab("temporal");
                    }}
                    onClearTemporalRange={() => {
                        setTemporalRange(null);
                        setTemporalMessages([]);
                        setTemporalSummary(null);
                        if (activeRightTab === "temporal") {
                            setActiveRightTab(activeConversation ? "conversation" : "day");
                        }
                    }}
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
                {startTimestamp && endTimestamp && startTimestamp > endTimestamp && (
                    <span style={{ color: "var(--danger)", fontSize: "0.8rem", fontWeight: "600", marginLeft: "8px" }}>
                        ⚠️ Start date cannot be after end date
                    </span>
                )}
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
                            className={`pane-tab-btn ${activeTab === "imports" ? "active" : ""}`}
                            onClick={() => setActiveTab("imports")}
                        >
                            Imports
                        </button>
                        {!isArchive && (
                            <button 
                                className={`pane-tab-btn ${activeTab === "segments" ? "active" : ""}`}
                                onClick={() => setActiveTab("segments")}
                            >
                                Segments
                            </button>
                        )}
                        <button 
                            className={`pane-tab-btn ${activeTab === "threads" ? "active" : ""}`}
                            onClick={() => setActiveTab("threads")}
                        >
                            Threads
                        </button>
                        {isArchive && (
                            <button 
                                className={`pane-tab-btn ${activeTab === "people" ? "active" : ""}`}
                                onClick={() => setActiveTab("people")}
                            >
                                People
                            </button>
                        )}
                        <button 
                            className={`pane-tab-btn ${activeTab === "search" ? "active" : ""}`}
                            onClick={() => setActiveTab("search")}
                        >
                            Search
                        </button>
                    </div>

                    {activeTab === "search" && (
                        <div className="explorer-search-box">
                            <input 
                                type="text" 
                                className="input search-input" 
                                placeholder={isArchive ? "Search archive..." : "Search global archive to link matches..."} 
                                value={searchQuery}
                                onChange={(e) => setSearchQuery(e.target.value)}
                                style={{ width: "100%", padding: "8px" }}
                            />
                            <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "4px", textAlign: "left" }}>
                                {isArchive ? "Ask your communication history a question." : "Find relevant conversations in the Archive to plot here."}
                            </div>
                            {temporalRange && (
                                <div style={{ marginTop: "8px", padding: "6px 10px", background: "rgba(63,216,255,0.08)", border: "1px solid rgba(63,216,255,0.3)", borderRadius: "4px", display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: "0.75rem" }}>
                                    <span style={{ color: "var(--accent)" }}>
                                        ⏱ Searching only in range: <strong>{new Date(temporalRange.start).toLocaleDateString()} — {new Date(temporalRange.end).toLocaleDateString()}</strong>
                                    </span>
                                    <button 
                                        className="button-link" 
                                        onClick={() => {
                                            setTemporalRange(null);
                                            setTemporalMessages([]);
                                            setTemporalSummary(null);
                                        }} 
                                        style={{ color: "var(--text-light)", fontSize: "0.75rem", textDecoration: "underline" }}
                                        title="Clear timeline range filter"
                                    >
                                        Clear Range
                                    </button>
                                </div>
                            )}
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
                    )}

                    <div className="explorer-scroll-area">
                        {activeTab === "imports" ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "14px", padding: "10px 4px" }}>
                                <div style={{ border: "1px solid var(--border)", borderRadius: "6px", padding: "10px", background: "rgba(16, 24, 32, 0.4)" }}>
                                    <h4 style={{
                                        margin: "0 0 8px 0",
                                        fontSize: "0.78rem",
                                        color: "var(--accent)",
                                        textTransform: "uppercase",
                                        letterSpacing: "1px"
                                    }}>
                                        Add Archive to Threadline
                                    </h4>
                                    <UploadPanel
                                        setImportResult={handleImportSuccess}
                                        threadlineId={threadline.id}
                                    />
                                </div>

                                {importsLoading ? (
                                    <div className="pane-loading-indicator">LOADING IMPORTS...</div>
                                ) : imports.length > 0 ? (
                                    <div style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                        <h4 style={{
                                            margin: "4px 0 0 0",
                                            fontSize: "0.75rem",
                                            color: "var(--text-muted)",
                                            textTransform: "uppercase",
                                            letterSpacing: "1px"
                                        }}>
                                            Import History ({imports.length})
                                        </h4>
                                        {imports.map(imp => (
                                            <div key={imp.id} className="preview-card" style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border)", padding: "12px", borderRadius: "6px", textAlign: "left" }}>
                                                <strong style={{ display: "block", fontSize: "0.9rem", color: "var(--accent)", textTransform: "none", letterSpacing: "normal", marginBottom: "4px" }}>
                                                    📄 {imp.filename}
                                                </strong>
                                                <div style={{ display: "flex", flexDirection: "column", gap: "2px", fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                                    <span>Source: <strong>{imp.source}</strong> ({imp.platform})</span>
                                                    <span>Imported: <strong>{new Date(imp.importedAt).toLocaleString()}</strong></span>
                                                    <span>File Size: <strong>{(imp.fileSize / 1024).toFixed(1)} KB</strong></span>
                                                    <span>Messages Loaded: <strong>{imp.messageCount}</strong></span>
                                                    <span>Discovered Threads: <strong>{imp.threadCount}</strong></span>
                                                    {imp.earliestTimestamp && (
                                                        <span>Range: <strong>{formatDisplayDate(imp.earliestTimestamp)} — {formatDisplayDate(imp.latestTimestamp)}</strong></span>
                                                    )}
                                                    {imp.errors && JSON.parse(imp.errors).length > 0 && (
                                                        <div style={{ color: "var(--danger)", fontSize: "0.75rem", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "4px", marginTop: "4px" }}>
                                                            ⚠️ Errors: {JSON.parse(imp.errors).join(", ")}
                                                        </div>
                                                    )}
                                                </div>
                                            </div>
                                        ))}
                                    </div>
                                ) : (
                                    <div className="pane-loading-indicator" style={{ color: "var(--text-muted)" }}>NO IMPORTS LOGGED</div>
                                )}
                            </div>
                        ) : activeTab === "people" && isArchive ? (
                            participantsLoading ? (
                                <div className="pane-loading-indicator">LOADING PEOPLE...</div>
                            ) : participants.length > 0 ? (
                                <div style={{ display: "flex", flexDirection: "column", gap: "8px", padding: "10px 4px" }}>
                                    {participants.map(part => (
                                        <div key={part.id} className="preview-card" style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border)", padding: "10px", borderRadius: "6px", textAlign: "left", display: "flex", alignItems: "center", gap: "10px" }}>
                                            <div style={{ fontSize: "1.3rem" }}>👤</div>
                                            <div>
                                                <strong style={{ display: "block", fontSize: "0.85rem", color: "var(--text-light)" }}>{part.name}</strong>
                                                <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                                                    {part.phoneNumber || part.email || "No Identifier"}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            ) : (
                                <div className="pane-loading-indicator" style={{ color: "var(--text-muted)" }}>NO PARTICIPANTS FOUND</div>
                            )
                        ) : activeTab === "segments" && !isArchive ? (
                            <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "10px 4px" }}>
                                <div>
                                    <h4 style={{ margin: "0 0 8px 0", fontSize: "0.85rem", color: "var(--success)", letterSpacing: "1px", textTransform: "uppercase" }}>Linked Segments ({linkedSegments.length})</h4>
                                    {linkedSegments.length > 0 ? (
                                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                            {linkedSegments.map(seg => (
                                                <div key={seg.id} className="preview-card" style={{ background: "rgba(48, 209, 88, 0.08)", border: "1px solid rgba(48, 209, 88, 0.2)", padding: "10px", borderRadius: "6px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                                                    <div style={{ textAlign: "left" }}>
                                                        <strong style={{ display: "block", fontSize: "0.9rem" }}>{seg.title}</strong>
                                                        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                                            {seg.conversationTitle} ({seg.messageCount} msgs)
                                                        </span>
                                                    </div>
                                                    <div style={{ display: "flex", gap: "8px" }}>
                                                        <button 
                                                            className="button-link"
                                                            onClick={() => {
                                                                const foundC = conversations.find(c => c.id === seg.conversationId) || { id: seg.conversationId, title: seg.conversationTitle };
                                                                setActiveConversation(foundC);
                                                                setActiveRightTab("conversation");
                                                            }}
                                                            style={{ color: "var(--accent)", fontSize: "0.8rem", fontWeight: "700" }}
                                                        >
                                                            [VIEW]
                                                        </button>
                                                        <button 
                                                            onClick={() => handleRemoveSegment(seg.id)}
                                                            style={{ background: "none", border: "none", color: "var(--danger)", cursor: "pointer", fontSize: "1.2rem", padding: "0 4px" }}
                                                            title="Remove segment from Timeline"
                                                        >
                                                            &times;
                                                        </button>
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    ) : (
                                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>No segments linked. Add or drag segments below.</div>
                                    )}
                                </div>

                                <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
                                    <h4 style={{ margin: "0 0 8px 0", fontSize: "0.85rem", color: "var(--accent)", letterSpacing: "1px", textTransform: "uppercase" }}>Available Segments ({savedSegments.filter(s => !linkedSegments.some(l => l.id === s.id)).length})</h4>
                                    {savedSegments.filter(s => !linkedSegments.some(l => l.id === s.id)).length > 0 ? (
                                        <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                                            {savedSegments
                                                .filter(s => !linkedSegments.some(l => l.id === s.id))
                                                .map(seg => (
                                                    <div 
                                                        key={seg.id} 
                                                        className="preview-card" 
                                                        draggable="true"
                                                        onDragStart={(e) => {
                                                            e.dataTransfer.setData("application/json", JSON.stringify({ type: "segment", id: seg.id }));
                                                        }}
                                                        style={{ background: "rgba(255,255,255,0.03)", padding: "10px", borderRadius: "6px", cursor: "grab", display: "flex", justifyContent: "space-between", alignItems: "center" }}
                                                    >
                                                        <div style={{ textAlign: "left" }}>
                                                            <strong style={{ display: "block", fontSize: "0.9rem" }}>{seg.title}</strong>
                                                            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                                                {seg.conversationTitle} ({seg.messageCount} msgs)
                                                            </span>
                                                        </div>
                                                        <div style={{ display: "flex", gap: "8px" }}>
                                                            <button 
                                                                className="button-link"
                                                                onClick={() => handleAddSegment(seg.id)}
                                                                style={{ color: "var(--accent)", fontSize: "0.8rem", fontWeight: "700" }}
                                                            >
                                                                [ADD]
                                                            </button>
                                                            <button 
                                                                className="button-link"
                                                                onClick={() => setSegmentToDelete(seg)}
                                                                style={{ color: "var(--danger)", fontSize: "0.8rem", fontWeight: "700" }}
                                                                title="Delete saved segment"
                                                            >
                                                                [DEL]
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))}
                                        </div>
                                    ) : (
                                        <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>No other segments available. Save segments in the Archive view first.</div>
                                    )}
                                </div>
                            </div>
                        ) : activeTab === "threads" ? (
                            conversationsLoading ? (
                                <div className="pane-loading-indicator">LOADING THREADS...</div>
                            ) : (
                                <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>
                                    {/* Timeline Layer Visibility Controls Header */}
                                    {conversations.length > 0 && (
                                        <div className="threads-visibility-toolbar">
                                            <div style={{ display: "flex", alignItems: "center", gap: "10px" }}>
                                                <button
                                                    type="button"
                                                    className="layer-toggle-link"
                                                    onClick={() => setVisibleConversationIds(conversations.map(c => c.id))}
                                                    title="Show all conversation layers on timeline"
                                                >
                                                    SELECT ALL
                                                </button>
                                                <span style={{ color: "var(--border)", fontSize: "0.8rem" }}>|</span>
                                                <button
                                                    type="button"
                                                    className="layer-toggle-link"
                                                    onClick={() => setVisibleConversationIds([])}
                                                    title="Hide all conversation layers on timeline"
                                                >
                                                    DESELECT ALL
                                                </button>
                                            </div>
                                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                                <span className="threads-visibility-count" title="Number of visible layers on timeline">
                                                    {visibleConversationIds.length} / {conversations.length} VISIBLE
                                                </span>
                                                {!isArchive && (
                                                    <button
                                                        type="button"
                                                        className="threads-toolbar-delete-btn"
                                                        onClick={() => {
                                                            setDeleteWorkspaceError(null);
                                                            setShowDeleteModal(true);
                                                        }}
                                                        title="Delete this Threadline workspace"
                                                    >
                                                        🗑️ DELETE THREADLINE
                                                    </button>
                                                )}
                                            </div>
                                        </div>
                                    )}

                                    {isArchive ? (
                                        conversations.map(c => {
                                            const isActive = activeConversation?.id === c.id;
                                            const isPinned = pinnedConversationIds.includes(c.id);
                                            const isVisible = visibleConversationIds.includes(c.id);
                                            return (
                                                <div 
                                                    key={c.id} 
                                                    draggable="true"
                                                    onDragStart={(e) => {
                                                        e.dataTransfer.setData("application/json", JSON.stringify({ type: "conversation", id: c.id, title: c.title }));
                                                        e.dataTransfer.setData("text/plain", c.id);
                                                    }}
                                                    className={`conversation-item ${isActive ? "active" : ""} ${!isVisible ? "hidden-layer" : ""}`}
                                                    onClick={() => {
                                                        setActiveConversation(c);
                                                        setActiveRightTab("conversation");
                                                    }}
                                                >
                                                    <div className="conversation-header-row">
                                                        <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
                                                            <input 
                                                                type="checkbox"
                                                                className="conversation-visibility-checkbox"
                                                                checked={isVisible}
                                                                title={isVisible ? "Hide from Timeline" : "Show on Timeline"}
                                                                onClick={(e) => e.stopPropagation()}
                                                                onChange={() => handleToggleConversationVisibility(c.id)}
                                                            />
                                                            <span className="conversation-title-text" title={c.title}>
                                                                {c.title}
                                                            </span>
                                                        </div>
                                                        <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
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
                                                    <div className="conversation-details-row" style={{ display: "flex", flexDirection: "column", gap: "4px", fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "4px" }}>
                                                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                                                            <span>Platform: <strong>{c.platform}</strong></span>
                                                            {c.lastImported && (
                                                                <span>Imported: <strong>{formatDisplayDate(c.lastImported)}</strong></span>
                                                            )}
                                                        </div>
                                                        <div style={{ display: "flex", justifyContent: "space-between" }}>
                                                            <span>Range: <strong>{c.startDate ? formatDisplayDate(c.startDate) : "?"} — {c.endDate ? formatDisplayDate(c.endDate) : "?"}</strong></span>
                                                            {c.endDate && (
                                                                <span>Newest: <strong>{formatDisplayDate(c.endDate)}</strong></span>
                                                            )}
                                                        </div>
                                                        {c.sources && c.sources.length > 0 && (
                                                            <div style={{ fontSize: "0.75rem", borderTop: "1px solid rgba(255,255,255,0.05)", paddingTop: "3px", marginTop: "3px", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                                                                Sources: <span style={{ color: "var(--accent)" }}>{c.sources.map(s => s.filename).join(", ")}</span>
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            );
                                        })
                                    ) : (
                                        /* Curated Threadline: show linked and available threads */
                                        <div style={{ display: "flex", flexDirection: "column", gap: "16px", padding: "10px 4px" }}>
                                            <div>
                                                <h4 style={{ margin: "0 0 8px 0", fontSize: "0.85rem", color: "var(--success)", letterSpacing: "1px", textTransform: "uppercase" }}>Linked Threads ({conversations.length})</h4>
                                                {conversations.length > 0 ? (
                                                    conversations.map(c => {
                                                        const isActive = activeConversation?.id === c.id;
                                                        const isPinned = pinnedConversationIds.includes(c.id);
                                                        const isVisible = visibleConversationIds.includes(c.id);
                                                        return (
                                                            <div 
                                                                key={c.id} 
                                                                draggable="true"
                                                                onDragStart={(e) => {
                                                                    e.dataTransfer.setData("application/json", JSON.stringify({ type: "conversation", id: c.id, title: c.title }));
                                                                    e.dataTransfer.setData("text/plain", c.id);
                                                                }}
                                                                className={`conversation-item ${isActive ? "active" : ""} ${!isVisible ? "hidden-layer" : ""}`}
                                                                onClick={() => {
                                                                    setActiveConversation(c);
                                                                    setActiveRightTab("conversation");
                                                                }}
                                                                style={{ border: "1px solid rgba(48, 209, 88, 0.2)", background: "rgba(48, 209, 88, 0.03)", marginBottom: "8px", borderRadius: "6px" }}
                                                            >
                                                                <div className="conversation-header-row">
                                                                    <div style={{ display: "flex", alignItems: "center", gap: "10px", flex: 1, minWidth: 0 }}>
                                                                        <input 
                                                                            type="checkbox"
                                                                            className="conversation-visibility-checkbox"
                                                                            checked={isVisible}
                                                                            title={isVisible ? "Hide from Timeline" : "Show on Timeline"}
                                                                            onClick={(e) => e.stopPropagation()}
                                                                            onChange={() => handleToggleConversationVisibility(c.id)}
                                                                        />
                                                                        <span className="conversation-title-text" title={c.title}>
                                                                            {c.title}
                                                                        </span>
                                                                    </div>
                                                                    <div style={{ display: "flex", alignItems: "center", gap: "8px", flexShrink: 0 }}>
                                                                        <button 
                                                                            className={`pin-thread-btn ${isPinned ? "pinned" : ""}`}
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
                                                            </div>
                                                        );
                                                    })
                                                ) : (
                                                    <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>No threads linked. Drag threads from below or link segments.</div>
                                                )}
                                            </div>

                                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: "12px" }}>
                                        <h4 style={{ margin: "0 0 8px 0", fontSize: "0.85rem", color: "var(--accent)", letterSpacing: "1px", textTransform: "uppercase" }}>Available Threads ({archiveConversations.filter(ac => !conversations.some(c => c.id === ac.id)).length})</h4>
                                        {archiveConversations.filter(ac => !conversations.some(c => c.id === ac.id)).length > 0 ? (
                                            archiveConversations
                                                .filter(ac => !conversations.some(c => c.id === ac.id))
                                                .map(c => (
                                                    <div 
                                                        key={c.id} 
                                                        draggable="true"
                                                        onDragStart={(e) => {
                                                            e.dataTransfer.setData("application/json", JSON.stringify({ type: "conversation", id: c.id, title: c.title }));
                                                            e.dataTransfer.setData("text/plain", c.id);
                                                        }}
                                                        className="conversation-item"
                                                        style={{ background: "rgba(255,255,255,0.02)", marginBottom: "8px", borderRadius: "6px", cursor: "grab" }}
                                                    >
                                                        <div className="conversation-header-row">
                                                            <span className="conversation-title-text" title={c.title} style={{ flex: 1 }}>
                                                                {c.title}
                                                            </span>
                                                            <button 
                                                                className="button-link"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleLinkConversationAsSegment(c.id, c.title);
                                                                }}
                                                                style={{ color: "var(--accent)", fontSize: "0.8rem", fontWeight: "700", marginLeft: "10px" }}
                                                            >
                                                                [ADD]
                                                            </button>
                                                        </div>
                                                    </div>
                                                ))
                                        ) : (
                                            <div style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>No other threads available. Ingest more files in the Archive.</div>
                                        )}
                                    </div>
                                </div>
                            )}
                        </div>
                    )
                        ) : activeTab === "search" ? (
                            /* Search results list only */
                            <>
                                {searchLoading ? (
                                    <div className="pane-loading-indicator">SEARCHING ARCHIVE...</div>
                                ) : searchResults.length > 0 ? (
                                    searchResults.map(result => {
                                        const isPinned = pinnedConversationIds.includes(result.conversationId);
                                        const isEventCluster = result.type === "event_cluster" || (result.messages && result.messages.length > 0);
                                        const isExpanded = expandedClusterIds.includes(result.id || result.clusterId);

                                        if (isEventCluster) {
                                            const constituentMessages = result.messages || [];
                                            const participantsList = result.participants || [];
                                            const conversationsList = result.conversations || [];

                                            return (
                                                <div 
                                                    key={result.id || result.clusterId || `${result.conversationId}-${result.timestamp}`} 
                                                    className="search-result-card event-cluster-card"
                                                    draggable="true"
                                                    onDragStart={(e) => {
                                                        e.dataTransfer.setData("application/json", JSON.stringify({ type: "searchResult", result: result }));
                                                        e.dataTransfer.setData("text/plain", result.conversationId);
                                                    }}
                                                >
                                                    {/* Header Ribbon & Badges */}
                                                    <div className="search-card-header">
                                                        <span className="cluster-tag-ribbon">
                                                            <span>✦ EVENT CLUSTER</span>
                                                        </span>
                                                        <div style={{ display: "flex", gap: "6px", alignItems: "center" }}>
                                                            {result.clusterConfidence && (
                                                                <span className={`confidence-badge ${result.clusterConfidence.toLowerCase()}`} title="Cluster Confidence">
                                                                    {result.clusterConfidence} conf
                                                                </span>
                                                            )}
                                                            <span className={`relevance-badge ${result.relevance.toLowerCase()}`}>
                                                                {result.relevance}
                                                            </span>
                                                        </div>
                                                    </div>

                                                    {/* Title & Forensic Date Range */}
                                                    <h4 className="search-card-title" style={{ fontSize: "0.95rem", color: "var(--accent)" }}>
                                                        {result.title || result.conversationTitle}
                                                    </h4>
                                                    <div className="search-card-date" style={{ color: "var(--text-light)", marginBottom: "6px" }}>
                                                        📅 {result.timeSpan?.dateString || result.dateString}
                                                    </div>

                                                    {/* Forensic Metadata Chips */}
                                                    <div className="cluster-meta-chips">
                                                        <span className="cluster-chip">
                                                            💬 <strong>{constituentMessages.length}</strong> {constituentMessages.length === 1 ? 'Message' : 'Messages'}
                                                        </span>
                                                        {conversationsList.length > 0 && (
                                                            <span className="cluster-chip">
                                                                🧵 <strong>{conversationsList.length}</strong> {conversationsList.length === 1 ? 'Thread' : 'Threads'}
                                                            </span>
                                                        )}
                                                        {participantsList.length > 0 && (
                                                            <span className="cluster-chip" title={participantsList.join(", ")}>
                                                                👥 <strong>{participantsList.length}</strong> {participantsList.length === 1 ? 'Person' : 'People'}
                                                            </span>
                                                        )}
                                                    </div>

                                                    {/* Reason / Analysis summary */}
                                                    <p className="search-card-reason" style={{ marginBottom: "10px" }}>
                                                        {result.summaryReason || result.reason}
                                                    </p>

                                                    {/* Chronological Source Messages Reconstruction Box */}
                                                    <div className="cluster-reconstruction-box">
                                                        <div className="cluster-reconstruction-header">
                                                            <span>Reconstructed Chronology</span>
                                                            <button 
                                                                className="cluster-toggle-btn"
                                                                onClick={(e) => {
                                                                    e.stopPropagation();
                                                                    handleToggleClusterExpand(result.id || result.clusterId);
                                                                }}
                                                            >
                                                                {isExpanded ? "Collapse ▲" : `View All ${constituentMessages.length} Messages ▼`}
                                                            </button>
                                                        </div>

                                                        <div className="cluster-messages-timeline">
                                                            {(() => {
                                                                let previewMessages = constituentMessages;
                                                                if (!isExpanded && constituentMessages.length > 2) {
                                                                    // Find the anchor/representative message index to center the preview around
                                                                    let anchorIdx = -1;
                                                                    if (result.representativeMessageId) {
                                                                        anchorIdx = constituentMessages.findIndex(m => m.id === result.representativeMessageId);
                                                                    }
                                                                    if (anchorIdx === -1) {
                                                                        // Fallback to highest scored message in cluster
                                                                        let maxSc = -1;
                                                                        constituentMessages.forEach((m, idx) => {
                                                                            if ((m.score || 0) > maxSc) {
                                                                                maxSc = m.score || 0;
                                                                                anchorIdx = idx;
                                                                            }
                                                                        });
                                                                    }
                                                                    if (anchorIdx !== -1) {
                                                                        if (anchorIdx + 1 < constituentMessages.length) {
                                                                            previewMessages = [constituentMessages[anchorIdx], constituentMessages[anchorIdx + 1]];
                                                                        } else if (anchorIdx - 1 >= 0) {
                                                                            previewMessages = [constituentMessages[anchorIdx - 1], constituentMessages[anchorIdx]];
                                                                        } else {
                                                                            previewMessages = constituentMessages.slice(0, 2);
                                                                        }
                                                                    } else {
                                                                        previewMessages = constituentMessages.slice(0, 2);
                                                                    }
                                                                }

                                                                return (
                                                                    <>
                                                                        {previewMessages.map((m) => (
                                                                            <div 
                                                                                key={m.id} 
                                                                                className="cluster-message-item"
                                                                                onClick={() => handleClusterMessageClick(m)}
                                                                                title="Click to jump timeline & view message in thread"
                                                                            >
                                                                                <div className="cluster-msg-meta-row">
                                                                                    <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                                                                                        <span className="cluster-msg-sender">
                                                                                            {m.direction === "sent" ? "Me" : m.sender}
                                                                                        </span>
                                                                                        {m.conversationTitle && (
                                                                                            <span className="cluster-thread-badge" title={`Thread: ${m.conversationTitle}`}>
                                                                                                {m.conversationTitle}
                                                                                            </span>
                                                                                        )}
                                                                                    </div>
                                                                                    <span className="cluster-msg-time">
                                                                                         {formatFullTimestamp(m.timestamp)}
                                                                                     </span>
                                                                                </div>
                                                                                <div className="cluster-msg-body">{m.body}</div>
                                                                                {m.matchReason && (
                                                                                    <div className="cluster-match-reason">
                                                                                        ⚓ {m.matchReason}
                                                                                    </div>
                                                                                )}
                                                                            </div>
                                                                        ))}
                                                                        {!isExpanded && constituentMessages.length > previewMessages.length && (
                                                                            <div 
                                                                                style={{ fontSize: "0.72rem", color: "var(--accent)", textAlign: "center", cursor: "pointer", padding: "4px 0" }}
                                                                                onClick={() => handleToggleClusterExpand(result.id || result.clusterId)}
                                                                            >
                                                                                + {constituentMessages.length - previewMessages.length} more chronologically ordered messages
                                                                            </div>
                                                                        )}
                                                                    </>
                                                                );
                                                            })()}
                                                        </div>
                                                    </div>

                                                    {/* Actions: View on Timeline, Link, & Export Evidence */}
                                                    <div className="search-card-actions">
                                                        <button 
                                                            className="search-card-btn view-btn"
                                                            onClick={() => handleClusterClick(result)}
                                                            title="Center timeline on this event cluster window"
                                                        >
                                                            [NAVIGATE TIMELINE]
                                                        </button>
                                                        <button 
                                                            className="search-card-btn add-btn"
                                                            onClick={() => {
                                                                if (isArchive) {
                                                                    if (isPinned) {
                                                                        handleUnpinConversation(result.conversationId);
                                                                    } else {
                                                                        handlePinConversation(result.conversationId);
                                                                    }
                                                                } else {
                                                                    handleLinkSearchResultAsSegment(result);
                                                                }
                                                            }}
                                                            style={{ color: isPinned ? "var(--danger)" : "var(--accent)" }}
                                                        >
                                                            {isArchive ? (isPinned ? "[REMOVE]" : "[ADD TO THREADLINE]") : "[LINK TO TIMELINE]"}
                                                        </button>
                                                        <button 
                                                            className="search-card-btn export-btn"
                                                            onClick={() => {
                                                                setExportModalCluster(result);
                                                                setExportCaseName("");
                                                            }}
                                                            title="Export this reconstructed event as PDF or JSON evidence"
                                                        >
                                                            [⬇ EXPORT]
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        }

                                        // Fallback legacy individual search result card
                                        return (
                                            <div 
                                                key={`${result.conversationId}-${result.timestamp}`} 
                                                className="search-result-card"
                                                draggable="true"
                                                onDragStart={(e) => {
                                                    e.dataTransfer.setData("application/json", JSON.stringify({ type: "searchResult", result: result }));
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
                                                    {result.contextWindow && result.contextWindow.map((msg) => (
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
                                                            if (isArchive) {
                                                                if (isPinned) {
                                                                    handleUnpinConversation(result.conversationId);
                                                                } else {
                                                                    handlePinConversation(result.conversationId);
                                                                }
                                                            } else {
                                                                handleLinkSearchResultAsSegment(result);
                                                            }
                                                        }}
                                                        style={{ color: isPinned ? "var(--danger)" : "var(--accent)" }}
                                                    >
                                                        {isArchive ? (isPinned ? "[REMOVE]" : "[ADD TO THREADLINE]") : "[LINK TO TIMELINE]"}
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
                            </>
                        ) : null}
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
                            Thread View
                        </button>
                        <button 
                            className={`pane-tab-btn ${activeRightTab === "temporal" ? "active" : ""}`}
                            onClick={() => temporalRange && setActiveRightTab("temporal")}
                            disabled={!temporalRange}
                            style={{ 
                                opacity: temporalRange ? 1 : 0.4,
                                color: activeRightTab === "temporal" ? "var(--accent)" : undefined
                            }}
                        >
                            Temporal Window {temporalSummary ? `(${temporalSummary.count})` : (temporalRange ? "•" : "")}
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
                                        <div 
                                            key={e.id} 
                                            className="day-event-row"
                                            onClick={() => handleTimelineMessageSelect(e)}
                                            style={{ cursor: "pointer" }}
                                            title="Click to view message in thread"
                                        >
                                            <div className="day-event-time">
                                                {formatTime(e.timestamp)}
                                            </div>
                                            <div className="day-event-body">
                                                <div className="day-event-title-line">
                                                    <span className="day-event-title">{e.title}</span>
                                                    <span className="day-event-platform">{e.platform || "SMS"}</span>
                                                </div>
                                                <div className="day-event-text">
                                                    {e.body || e.description}
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
                                            <h3 style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                                {activeConversation.title}
                                                <button
                                                    onClick={() => {
                                                        setRenameConversationTarget(activeConversation);
                                                        setRenameConversationValue(activeConversation.title);
                                                    }}
                                                    title="Rename Thread"
                                                    style={{ background: "none", border: "none", cursor: "pointer", fontSize: "0.9rem" }}
                                                >
                                                    ✏️
                                                </button>
                                            </h3>
                                            <p>
                                                SMS Thread ({messages.length} messages
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
                                            <div className="message-header" style={{ display: "flex", alignItems: "center" }}>
                                                {threadline.id.startsWith("archive_") && (
                                                    <input 
                                                        type="checkbox"
                                                        checked={selectedMessageIds.includes(m.id)}
                                                        onChange={() => {
                                                            setSelectedMessageIds(prev => 
                                                                prev.includes(m.id) 
                                                                    ? prev.filter(id => id !== m.id) 
                                                                    : [...prev, m.id]
                                                            );
                                                        }}
                                                        style={{ marginRight: "10px", cursor: "pointer", width: "15px", height: "15px", accentColor: "var(--accent)" }}
                                                    />
                                                )}
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
                                    
                                    {selectedMessageIds.length > 0 && (
                                        <div className="save-segment-bar" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "rgba(63, 216, 255, 0.12)", border: "1px solid var(--accent)", padding: "12px 16px", borderRadius: "8px", position: "sticky", bottom: "16px", zIndex: 100, margin: "16px" }}>
                                            <span style={{ fontWeight: "600", color: "var(--text-light)" }}>{selectedMessageIds.length} messages selected</span>
                                            <div style={{ display: "flex", gap: "8px" }}>
                                                <button 
                                                    className="button"
                                                    onClick={() => setShowSaveSegmentModal(true)}
                                                    style={{ background: "var(--accent)", color: "#000", fontWeight: "700", border: "none", padding: "6px 12px", borderRadius: "4px", cursor: "pointer" }}
                                                >
                                                    💾 Save Segment
                                                </button>
                                                <button 
                                                    className="button button-outline"
                                                    onClick={() => setSelectedMessageIds([])}
                                                    style={{ color: "var(--danger)", borderColor: "var(--danger)", padding: "6px 12px", borderRadius: "4px", cursor: "pointer", background: "transparent" }}
                                                >
                                                    Cancel
                                                </button>
                                            </div>
                                        </div>
                                    )}

                                    {showSaveSegmentModal && (
                                        <div className="modal-overlay" style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, background: "rgba(0,0,0,0.85)", display: "flex", justifyContent: "center", alignItems: "center", zIndex: 1000 }}>
                                            <div className="panel" style={{ width: "400px", padding: "20px", borderRadius: "8px", background: "#1c1c1e", border: "1px solid var(--border)" }}>
                                                <h3 style={{ marginTop: 0, color: "var(--accent)" }}>SAVE SEGMENT</h3>
                                                <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginBottom: "16px" }}>
                                                    Save the {selectedMessageIds.length} selected messages as a named segment.
                                                </p>
                                                <div style={{ marginBottom: "12px" }}>
                                                    <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-light)", marginBottom: "4px" }}>Segment Title</label>
                                                    <input 
                                                        type="text" 
                                                        className="input" 
                                                        placeholder="e.g. Florida Shopping trip"
                                                        value={segmentTitle}
                                                        onChange={(e) => setSegmentTitle(e.target.value)}
                                                        style={{ width: "100%", padding: "8px" }}
                                                    />
                                                </div>
                                                <div style={{ marginBottom: "20px" }}>
                                                    <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-light)", marginBottom: "4px" }}>Description (Optional)</label>
                                                    <textarea 
                                                        className="input" 
                                                        rows="3"
                                                        placeholder="Enter context details..."
                                                        value={segmentDescription}
                                                        onChange={(e) => setSegmentDescription(e.target.value)}
                                                        style={{ width: "100%", padding: "8px", resize: "none" }}
                                                    />
                                                </div>
                                                <div style={{ display: "flex", justifyContent: "flex-end", gap: "8px" }}>
                                                    <button 
                                                        className="button button-outline"
                                                        onClick={() => {
                                                            setShowSaveSegmentModal(false);
                                                            setSegmentTitle("");
                                                            setSegmentDescription("");
                                                        }}
                                                        style={{ padding: "6px 12px", cursor: "pointer", background: "transparent" }}
                                                    >
                                                        Cancel
                                                    </button>
                                                    <button 
                                                        className="button"
                                                        disabled={!segmentTitle.trim()}
                                                        onClick={() => handleSaveSegmentSubmit(segmentTitle, segmentDescription)}
                                                        style={{ background: "var(--accent)", color: "#000", fontWeight: "700", padding: "6px 12px", borderRadius: "4px", cursor: "pointer" }}
                                                    >
                                                        Save
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    <div ref={messagesEndRef} />
                                </>
                            )
                        ) : activeRightTab === "temporal" && temporalRange ? (
                            /* Temporal Window: Cross-conversation chronological evidence view */
                            <div className="temporal-window-view">
                                <div className="temporal-window-banner" style={{
                                    padding: "16px",
                                    marginBottom: "16px",
                                    background: "rgba(63, 216, 255, 0.05)",
                                    border: "1px solid rgba(63, 216, 255, 0.25)",
                                    borderRadius: "6px"
                                }}>
                                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
                                        <div>
                                            <div style={{
                                                fontSize: "0.72rem",
                                                fontFamily: "var(--font-mono)",
                                                letterSpacing: "1.5px",
                                                color: "var(--accent)",
                                                textTransform: "uppercase",
                                                marginBottom: "4px"
                                            }}>
                                                SELECTED PERIOD
                                            </div>
                                            <h3 style={{ margin: "0 0 8px 0", fontSize: "1.1rem", color: "var(--text)" }}>
                                                {new Date(temporalRange.start).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })} — {new Date(temporalRange.end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                                            </h3>
                                            <div style={{
                                                fontSize: "0.85rem",
                                                color: "var(--text-light)",
                                                display: "flex",
                                                gap: "12px",
                                                flexWrap: "wrap"
                                            }}>
                                                <span>💬 <strong>{temporalSummary?.count ?? temporalMessages.length}</strong> messages</span>
                                                <span>•</span>
                                                <span>🧵 <strong>{temporalSummary?.conversationCount ?? new Set(temporalMessages.map(m => m.conversationId)).size}</strong> conversations</span>
                                                <span>•</span>
                                                <span>👥 <strong>{temporalSummary?.participantCount ?? new Set(temporalMessages.map(m => m.sender).filter(Boolean)).size}</strong> people</span>
                                            </div>
                                        </div>
                                        <div style={{ display: "flex", gap: "8px" }}>
                                            <button
                                                className="button-link"
                                                onClick={() => {
                                                    const intervalCluster = {
                                                        title: `Temporal Window (${new Date(temporalRange.start).toLocaleDateString()} – ${new Date(temporalRange.end).toLocaleDateString()})`,
                                                        topic: "Temporal Interval Evidence",
                                                        messages: temporalMessages,
                                                        conversations: Array.from(new Set(temporalMessages.map(m => m.conversationTitle || m.conversationId))),
                                                        timeSpan: {
                                                            start: temporalRange.start,
                                                            end: temporalRange.end,
                                                            dateString: `${new Date(temporalRange.start).toLocaleDateString()} — ${new Date(temporalRange.end).toLocaleDateString()}`
                                                        }
                                                    };
                                                    setExportModalCluster(intervalCluster);
                                                    setExportCaseName("");
                                                }}
                                                style={{
                                                    color: "var(--accent)",
                                                    border: "1px solid var(--accent)",
                                                    padding: "4px 10px",
                                                    borderRadius: "4px",
                                                    fontSize: "0.78rem",
                                                    fontWeight: "700"
                                                }}
                                                title="Forensically export this time window as PDF or JSON evidence"
                                            >
                                                ⚖️ EXPORT EVIDENCE
                                            </button>
                                        <button
                                            className="button-link"
                                            onClick={() => {
                                                setTemporalRange(null);
                                                setTemporalMessages([]);
                                                setTemporalSummary(null);
                                                setActiveRightTab(activeConversation ? "conversation" : "day");
                                            }}
                                            style={{
                                                color: "var(--text-muted)",
                                                border: "1px solid var(--border)",
                                                padding: "4px 10px",
                                                borderRadius: "4px",
                                                fontSize: "0.78rem"
                                            }}
                                        >
                                            ✕ CLEAR SELECTION
                                        </button>
                                        </div>
                                    </div>
                                </div>

                                {temporalMessagesLoading ? (
                                    <div className="pane-loading-indicator">LOADING COMMUNICATIONS IN INTERVAL...</div>
                                ) : temporalMessages.length > 0 ? (
                                    <div className="temporal-messages-list" style={{ display: "flex", flexDirection: "column", gap: "10px" }}>
                                        {temporalMessages.map((m, idx) => {
                                            const prevMsg = idx > 0 ? temporalMessages[idx - 1] : null;
                                            const isCrossConvBoundary = !prevMsg || prevMsg.conversationId !== m.conversationId;
                                            const convTitle = m.conversationTitle || "Thread";
                                            const isMe = m.direction === "sent";

                                            return (
                                                <div key={m.id || idx}>
                                                    {isCrossConvBoundary && (
                                                        <div style={{
                                                            margin: idx === 0 ? "0 0 10px 0" : "16px 0 10px 0",
                                                            display: "flex",
                                                            alignItems: "center",
                                                            gap: "8px"
                                                        }}>
                                                            <div style={{ height: "1px", flex: 1, background: "rgba(63, 216, 255, 0.2)" }} />
                                                            <span style={{
                                                                fontSize: "0.72rem",
                                                                fontFamily: "var(--font-mono)",
                                                                color: "var(--accent)",
                                                                background: "rgba(63, 216, 255, 0.1)",
                                                                padding: "2px 8px",
                                                                borderRadius: "3px",
                                                                border: "1px solid rgba(63, 216, 255, 0.25)"
                                                            }}>
                                                                🧵 {convTitle} ({m.platform || "SMS"})
                                                            </span>
                                                            <div style={{ height: "1px", flex: 1, background: "rgba(63, 216, 255, 0.2)" }} />
                                                        </div>
                                                    )}

                                                    <div 
                                                        id={`temporal-msg-${m.id}`}
                                                        className={`message-row ${activeSearchMessageId === m.id ? "highlighted" : ""}`}
                                                        style={{
                                                            padding: "10px 14px",
                                                            background: "rgba(255, 255, 255, 0.02)",
                                                            border: "1px solid var(--border)",
                                                            borderRadius: "6px"
                                                        }}
                                                    >
                                                        <div className="message-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "4px" }}>
                                                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                                                <span className={`message-sender ${m.direction}`} style={{ fontWeight: 600 }}>
                                                                    {isMe ? "Me" : (m.sender || "Them")}
                                                                </span>
                                                                <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                                                                    to {m.recipient || (isMe ? "them" : "me")}
                                                                </span>
                                                            </div>
                                                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                                                <span className="message-time" style={{ fontSize: "0.75rem", color: "var(--text-muted)", fontFamily: "var(--font-mono)" }}>
                                                                    {formatFullTimestamp(m.timestamp)}
                                                                </span>
                                                                <button
                                                                    className="button-link"
                                                                    onClick={() => {
                                                                        const targetMsg = {
                                                                            id: m.id,
                                                                            sourceId: m.id,
                                                                            conversationId: m.conversationId,
                                                                            conversationTitle: m.conversationTitle,
                                                                            platform: m.platform
                                                                        };
                                                                        handleTimelineMessageSelect(targetMsg);
                                                                    }}
                                                                    title="Open and highlight this message in Thread View"
                                                                    style={{
                                                                        color: "var(--accent)",
                                                                        fontSize: "0.72rem",
                                                                        padding: "2px 6px",
                                                                        border: "1px solid rgba(63, 216, 255, 0.3)",
                                                                        borderRadius: "3px"
                                                                    }}
                                                                >
                                                                    [VIEW IN THREAD]
                                                                </button>
                                                            </div>
                                                        </div>
                                                        <div className="message-body" style={{ fontSize: "0.9rem", color: "var(--text-light)", lineHeight: "1.4", wordBreak: "break-word" }}>
                                                            {m.body}
                                                        </div>
                                                    </div>
                                                </div>
                                            );
                                        })}
                                    </div>
                                ) : (
                                    <div className="viewer-empty" style={{ padding: "50px 20px", textAlign: "center" }}>
                                        <div style={{ color: "var(--text)", fontWeight: 700, letterSpacing: "1px", marginBottom: "8px" }}>
                                            NO COMMUNICATIONS FOUND
                                        </div>
                                        <div style={{ color: "var(--text-muted)", fontSize: "0.85rem", fontFamily: "var(--font-mono)" }}>
                                            {new Date(temporalRange.start).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })} — {new Date(temporalRange.end).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" })}
                                        </div>
                                    </div>
                                )}
                            </div>
                        ) : (
                            /* Default empty workspace screen */
                            isArchive ? (
                                <div className="viewer-empty" style={{ display: "flex", flexDirection: "column", gap: "20px", alignItems: "center", padding: "20px" }}>
                                    <div className="viewer-empty-icon" style={{ fontSize: "2.5rem" }}>📁</div>
                                    <h3 style={{ letterSpacing: "1px", textTransform: "uppercase", color: "var(--accent)" }}>COMMUNICATIONS ARCHIVE</h3>
                                    <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", textAlign: "center", lineHeight: "1.5" }}>
                                        Select a discovered Thread from the left pane list to inspect messages,<br />
                                        or use the Search tab to query history in plain English.
                                    </p>
                                    <div style={{ width: "100%", maxWidth: "500px", marginTop: "20px", borderTop: "1px solid var(--border)", paddingTop: "20px" }}>
                                        <div style={{ fontSize: "0.85rem", color: "var(--accent)", fontWeight: "700", marginBottom: "12px", textTransform: "uppercase", letterSpacing: "1px", textAlign: "center" }}>Import Additional Backup History:</div>
                                        <UploadPanel setImportResult={handleImportSuccess} threadlineId={threadline.id} />
                                        <ImportPreview result={importResult} />
                                    </div>
                                </div>
                            ) : (
                                <div className="viewer-empty" style={{ display: "flex", flexDirection: "column", gap: "20px", alignItems: "center", padding: "20px" }}>
                                    <div className="viewer-empty-icon" style={{ fontSize: "2.5rem" }}>📊</div>
                                    <h3 style={{ letterSpacing: "1px", textTransform: "uppercase", color: "var(--accent)" }}>THREADLINE ANALYSIS WORKSPACE</h3>
                                    <p style={{ color: "var(--text-muted)", fontSize: "0.9rem", textAlign: "center", lineHeight: "1.5" }}>
                                        This workspace is empty. To build your timeline:<br />
                                        1. Link entire conversations from the <strong>Threads</strong> tab.<br />
                                        2. Drag & drop Saved Segments from the <strong>Segments</strong> tab.<br />
                                        3. Use the <strong>Search</strong> tab to find specific matches, and click <strong>[LINK TO TIMELINE]</strong>.
                                    </p>
                                </div>
                            )
                        )}
                    </div>
                </div>
            </div>

            {/* Evidence Export Modal */}
            {exportModalCluster && (
                <div className="export-modal-backdrop" onClick={() => !isExporting && setExportModalCluster(null)}>
                    <div className="export-modal-card" onClick={(e) => e.stopPropagation()}>
                        <div className="export-modal-header">
                            <div className="export-modal-title">
                                <span>⚖️ EXPORT EVIDENCE</span>
                                <span className="export-modal-badge">TAMPER-EVIDENT</span>
                            </div>
                            <button 
                                className="button-link" 
                                style={{ color: "#94a3b8", fontSize: "1.2rem", lineHeight: 1 }}
                                onClick={() => !isExporting && setExportModalCluster(null)}
                                disabled={isExporting}
                            >
                                ✕
                            </button>
                        </div>

                        <div className="export-modal-body">
                            <div className="export-context-box">
                                <div className="export-context-title">
                                    {exportModalCluster.title || "Event Reconstruction"}
                                </div>
                                <div className="export-context-meta">
                                    <span>💬 <strong>{exportModalCluster.messages?.length || 0}</strong> messages</span>
                                    <span>🧵 <strong>{exportModalCluster.conversations?.length || 1}</strong> conversations</span>
                                    {exportModalCluster.timeSpan?.dateString && (
                                        <span>📅 {exportModalCluster.timeSpan.dateString}</span>
                                    )}
                                </div>
                            </div>

                            <div className="export-field-group">
                                <label className="export-field-label">Export Format</label>
                                <div className="export-format-options">
                                    <label className={`export-option-label ${exportFormat === "pdf" ? "active" : ""}`}>
                                        <input 
                                            type="radio" 
                                            name="exportFormat" 
                                            value="pdf" 
                                            checked={exportFormat === "pdf"} 
                                            onChange={() => setExportFormat("pdf")}
                                            className="export-option-radio"
                                        />
                                        <div className="export-option-text">
                                            <span className="export-option-name">PDF — Evidence Report</span>
                                            <span className="export-option-desc">Human-readable forensic report with complete chronology, provenance, and SHA-256 integrity manifest.</span>
                                        </div>
                                    </label>

                                    <label className={`export-option-label ${exportFormat === "watermarked_pdf" ? "active" : ""}`}>
                                        <input 
                                            type="radio" 
                                            name="exportFormat" 
                                            value="watermarked_pdf" 
                                            checked={exportFormat === "watermarked_pdf"} 
                                            onChange={() => setExportFormat("watermarked_pdf")}
                                            className="export-option-radio"
                                        />
                                        <div className="export-option-text">
                                            <span className="export-option-name">PDF — Watermarked / Read-Only Evidence Copy</span>
                                            <span className="export-option-desc">Includes background watermark, PDF permission restrictions, and tamper-evident cryptographic hash section.</span>
                                        </div>
                                    </label>

                                    <label className={`export-option-label ${exportFormat === "json" ? "active" : ""}`}>
                                        <input 
                                            type="radio" 
                                            name="exportFormat" 
                                            value="json" 
                                            checked={exportFormat === "json"} 
                                            onChange={() => setExportFormat("json")}
                                            className="export-option-radio"
                                        />
                                        <div className="export-option-text">
                                            <span className="export-option-name">JSON — Evidence Package</span>
                                            <span className="export-option-desc">Machine-readable package with per-item canonical hashes, event reconstruction, and complete integrity manifest.</span>
                                        </div>
                                    </label>
                                </div>
                            </div>

                            <div className="export-field-group">
                                <label className="export-field-label">Case / Investigation Name (Optional)</label>
                                <input 
                                    type="text" 
                                    className="export-field-input"
                                    placeholder="e.g. Case #2026-TL-09, Review, or Incident ID"
                                    value={exportCaseName}
                                    onChange={(e) => setExportCaseName(e.target.value)}
                                    disabled={isExporting}
                                />
                            </div>
                        </div>

                        <div className="export-modal-footer">
                            <button 
                                className="export-btn-cancel"
                                onClick={() => setExportModalCluster(null)}
                                disabled={isExporting}
                            >
                                Cancel
                            </button>
                            <button 
                                className="export-btn-submit"
                                onClick={handleExecuteExport}
                                disabled={isExporting}
                            >
                                {isExporting ? "GENERATING EXPORT..." : "EXPORT EVIDENCE"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Custom In-App Delete Confirmation Modal */}
            <DeleteThreadlineModal
                isOpen={showDeleteModal}
                threadline={threadline}
                onClose={() => {
                    if (!isDeletingWorkspace) {
                        setShowDeleteModal(false);
                        setDeleteWorkspaceError(null);
                    }
                }}
                onConfirm={handleConfirmDeleteWorkspace}
                isDeleting={isDeletingWorkspace}
                errorMessage={deleteWorkspaceError}
            />

            {/* Custom In-App Segment Deletion Modal */}
            {segmentToDelete && (
                <div
                    className="delete-modal-backdrop"
                    onClick={(e) => {
                        if (e.target === e.currentTarget && !isDeletingSegment) {
                            setSegmentToDelete(null);
                        }
                    }}
                    role="presentation"
                >
                    <div
                        className="delete-modal-card"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="delete-segment-title"
                    >
                        <div className="delete-modal-header">
                            <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                                <span className="delete-modal-danger-badge">PERMANENT ACTION</span>
                                <h3 id="delete-segment-title" style={{ margin: 0, fontSize: "1rem", color: "#f87171" }}>
                                    DELETE SAVED SEGMENT
                                </h3>
                            </div>
                            <button
                                type="button"
                                className="delete-modal-close-btn"
                                onClick={() => setSegmentToDelete(null)}
                                disabled={isDeletingSegment}
                                aria-label="Close dialog"
                            >
                                &times;
                            </button>
                        </div>

                        <div className="delete-modal-body">
                            <p style={{ margin: "0 0 12px 0", color: "#e2e8f0", fontSize: "0.9rem", lineHeight: "1.4" }}>
                                Are you sure you want to permanently delete this saved segment?
                            </p>
                            <div className="delete-modal-target-box">
                                <span className="delete-target-icon">📌</span>
                                <strong className="delete-target-name">{segmentToDelete.title || "Saved Segment"}</strong>
                            </div>
                            <p className="delete-modal-warning-text">
                                This will remove this curated segment from your library. <strong>This will not affect the underlying source messages.</strong>
                            </p>
                        </div>

                        <div className="delete-modal-footer">
                            <button
                                type="button"
                                className="delete-btn-cancel"
                                onClick={() => setSegmentToDelete(null)}
                                disabled={isDeletingSegment}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="delete-btn-confirm"
                                onClick={() => handleDeleteSegment(segmentToDelete)}
                                disabled={isDeletingSegment}
                            >
                                {isDeletingSegment ? "DELETING..." : "DELETE SEGMENT"}
                            </button>
                        </div>
                    </div>
                </div>
            )}

            {/* Custom In-App Thread Rename Modal */}
            {renameConversationTarget && (
                <div
                    className="delete-modal-backdrop"
                    onClick={(e) => {
                        if (e.target === e.currentTarget) {
                            setRenameConversationTarget(null);
                        }
                    }}
                    role="presentation"
                >
                    <div
                        className="delete-modal-card"
                        role="dialog"
                        aria-modal="true"
                        aria-labelledby="rename-thread-title"
                    >
                        <div className="delete-modal-header">
                            <h3 id="rename-thread-title" style={{ margin: 0, fontSize: "1rem", color: "var(--accent)" }}>
                                RENAME THREAD
                            </h3>
                            <button
                                type="button"
                                className="delete-modal-close-btn"
                                onClick={() => setRenameConversationTarget(null)}
                                aria-label="Close dialog"
                            >
                                &times;
                            </button>
                        </div>

                        <div className="delete-modal-body">
                            <label style={{ display: "block", fontSize: "0.8rem", color: "var(--text-light)", marginBottom: "6px" }}>
                                Thread Title
                            </label>
                            <input
                                type="text"
                                className="input"
                                value={renameConversationValue}
                                onChange={(e) => setRenameConversationValue(e.target.value)}
                                autoFocus
                                style={{ width: "100%", padding: "8px 10px" }}
                                onKeyDown={(e) => {
                                    if (e.key === "Enter") {
                                        const trimmed = renameConversationValue.trim();
                                        if (trimmed && trimmed !== renameConversationTarget.title) {
                                            handleRenameConversation(trimmed);
                                        }
                                        setRenameConversationTarget(null);
                                    } else if (e.key === "Escape") {
                                        setRenameConversationTarget(null);
                                    }
                                }}
                            />
                        </div>

                        <div className="delete-modal-footer">
                            <button
                                type="button"
                                className="delete-btn-cancel"
                                onClick={() => setRenameConversationTarget(null)}
                            >
                                Cancel
                            </button>
                            <button
                                type="button"
                                className="button"
                                style={{ background: "var(--accent)", color: "#000", fontWeight: "700", padding: "8px 16px", borderRadius: "6px", cursor: "pointer", border: "none" }}
                                onClick={() => {
                                    const trimmed = renameConversationValue.trim();
                                    if (trimmed && trimmed !== renameConversationTarget.title) {
                                        handleRenameConversation(trimmed);
                                    }
                                    setRenameConversationTarget(null);
                                }}
                                disabled={!renameConversationValue.trim()}
                            >
                                Save
                            </button>
                        </div>
                    </div>
                </div>
            )}
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

function formatDisplayDate(timestamp) {
    if (!timestamp) return "?";
    const date = new Date(Number(timestamp));
    return date.toLocaleDateString("en-US", { 
        timeZone: "UTC",
        year: 'numeric',
        month: 'numeric',
        day: 'numeric'
    });
}

function formatFullTimestamp(timestamp) {
    const date = new Date(Number(timestamp));
    return date.toLocaleString("en-US", { 
        timeZone: "UTC",
        year: 'numeric',
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