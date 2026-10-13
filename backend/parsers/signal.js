/*
    signal.js

    Forensic parser for Signal chat exports (Text exports and JSON exports).
    Supports:
    - Signal Text format:
        "[YYYY-MM-DD HH:MM:SS] Sender: Message"
        "YYYY-MM-DD HH:MM:SS - Sender: Message"
        "[YYYY-MM-DD, HH:MM] Sender: Message"
        "YYYY-MM-DD HH:MM:SS Sender: Message"
    - Signal JSON format:
        [ { "source": "...", "timestamp": ..., "body": "...", "type": "incoming"|"outgoing" } ]
        { "conversation": "...", "messages": [ ... ] }
    - Attachments (<attachment: ...>, [Attached: ...], etc.)
    - Direction (sent vs received)
    - Strict forensic accounting (discoveredCount, skippedCount, failedCount, errors).
*/

const fs = require("fs");
const crypto = require("crypto");
const Message = require("../models/Message");

// Regex patterns for Signal text format
// [2026-10-12 14:30:15] Alice: Hey there
const SIGNAL_TXT_PATTERN_1 = /^\[(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})[,\s]+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)\]\s+([^:]+):\s*([\s\S]*)$/;

// 2026-10-12 14:30:15 - Alice: Hey there
const SIGNAL_TXT_PATTERN_2 = /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})[,\s]+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)\s+-\s+([^:]+):\s*([\s\S]*)$/;

// 2026-10-12 14:30:15 Alice: Hey there
const SIGNAL_TXT_PATTERN_3 = /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2})\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)\s+([^:]+):\s*([\s\S]*)$/;

function parseSignalDateTime(dateStr, timeStr) {
    const normalizedDate = dateStr.replace(/[-.]/g, "/");
    const parts = normalizedDate.split("/").map(p => parseInt(p, 10));
    if (parts.length !== 3) return null;

    let year = parts[0];
    let month = parts[1] - 1;
    let day = parts[2];

    const timeMatch = timeStr.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([APap][Mm]))?$/);
    if (!timeMatch) return null;

    let hours = parseInt(timeMatch[1], 10);
    const minutes = parseInt(timeMatch[2], 10);
    const seconds = timeMatch[3] ? parseInt(timeMatch[3], 10) : 0;
    const ampm = timeMatch[4] ? timeMatch[4].toUpperCase() : null;

    if (ampm === "PM" && hours < 12) hours += 12;
    if (ampm === "AM" && hours === 12) hours = 0;

    const dt = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
    const timestamp = dt.getTime();
    return isNaN(timestamp) ? null : timestamp;
}

function extractAttachments(body) {
    if (!body) return { cleanBody: "", attachments: [] };
    const attachments = [];
    let clean = body;

    const attachRegex = /(?:\[(?:Attached|Attachment|File):\s*([^\]]+)\]|<(?:attachment|file):\s*([^>]+)>|\((?:Attached|File):\s*([^)]+)\))/gi;
    let match;
    while ((match = attachRegex.exec(body)) !== null) {
        const fileName = (match[1] || match[2] || match[3] || "attachment").trim();
        attachments.push({
            id: crypto.randomUUID(),
            fileName,
            mimeType: "application/octet-stream",
            size: 0
        });
    }

    clean = clean.replace(attachRegex, "").trim();
    return { cleanBody: clean, attachments };
}

function parseSignalText(raw) {
    const lines = raw.split(/\r?\n/);
    const messages = [];
    const errors = [];
    const participants = new Set();
    let discoveredCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    let currentMessage = null;

    for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const trimmed = line.trim();
        if (!trimmed) continue;

        let match = trimmed.match(SIGNAL_TXT_PATTERN_1) ||
                    trimmed.match(SIGNAL_TXT_PATTERN_2) ||
                    trimmed.match(SIGNAL_TXT_PATTERN_3);

        if (match) {
            discoveredCount++;
            const dateStr = match[1];
            const timeStr = match[2];
            const rawSender = match[3].trim();
            const rawBody = match[4];

            const timestamp = parseSignalDateTime(dateStr, timeStr);
            if (!timestamp) {
                failedCount++;
                errors.push(`Line ${i + 1}: Unparseable timestamp "${dateStr} ${timeStr}".`);
                continue;
            }

            const isSent = /^(you|me|self)$/i.test(rawSender);
            const senderName = isSent ? "Me" : rawSender;
            if (!isSent) participants.add(senderName);

            const { cleanBody, attachments } = extractAttachments(rawBody);

            currentMessage = new Message({
                id: crypto.randomUUID(),
                platform: "Signal",
                type: attachments.length > 0 ? "media" : "text",
                direction: isSent ? "sent" : "received",
                sender: senderName,
                recipient: isSent ? "Participant" : "Me",
                timestamp,
                body: cleanBody,
                attachments,
                metadata: {
                    rawSender,
                    dateStr,
                    timeStr,
                    line: i + 1
                }
            });

            messages.push(currentMessage);
        } else if (currentMessage) {
            // Continuation line: check if it contains attachments or additional body
            const { cleanBody, attachments } = extractAttachments(line);
            if (attachments.length > 0) {
                currentMessage.attachments.push(...attachments);
                currentMessage.type = "media";
                if (cleanBody) {
                    currentMessage.body = currentMessage.body ? currentMessage.body + "\n" + cleanBody : cleanBody;
                }
            } else {
                currentMessage.body = currentMessage.body ? currentMessage.body + "\n" + line : line;
            }
        } else {
            skippedCount++;
        }
    }

    const participantList = Array.from(participants);
    const counterpartyName = participantList.length === 1 ? participantList[0] : (participantList.join(", ") || "Signal Contact");

    messages.forEach(msg => {
        if (msg.direction === "sent") {
            msg.recipient = counterpartyName;
        }
        if (!msg.body && msg.attachments.length > 0) {
            msg.body = `[Signal Attachment: ${msg.attachments[0].fileName}]`;
        }
        msg.metadata.threadTitle = counterpartyName;
        msg.metadata.counterparty = counterpartyName;
        msg.metadata.participants = ["Me", ...participantList];
    });

    messages.sort((a, b) => a.timestamp - b.timestamp);

    return {
        discoveredCount,
        messages,
        skippedCount,
        failedCount,
        errors
    };
}

function parseSignalJSON(raw) {
    let data;
    try {
        data = JSON.parse(raw);
    } catch (err) {
        throw new Error("Failed to parse Signal JSON export: " + err.message);
    }

    const rawList = Array.isArray(data) ? data : (data.messages || data.chats || []);
    if (!Array.isArray(rawList)) {
        throw new Error("Invalid Signal JSON structure: expected array or { messages: [...] }");
    }

    const messages = [];
    const errors = [];
    const participants = new Set();
    let discoveredCount = rawList.length;
    let skippedCount = 0;
    let failedCount = 0;

    rawList.forEach((item, idx) => {
        try {
            const rawSender = item.source || item.sender || item.author || item.from || (item.is_outgoing ? "Me" : "Contact");
            const rawBody = item.body || item.text || item.message || "";
            let timestamp = item.timestamp || item.sent_at || item.date;

            if (typeof timestamp === "string") {
                const parsed = Date.parse(timestamp);
                timestamp = isNaN(parsed) ? Date.now() : parsed;
            } else if (typeof timestamp === "number" && timestamp < 1e11) {
                timestamp = timestamp * 1000;
            }

            if (!timestamp) {
                timestamp = Date.now();
            }

            const isSent = Boolean(item.is_outgoing || item.type === "outgoing" || /^(you|me|self)$/i.test(rawSender));
            const senderName = isSent ? "Me" : (rawSender || "Contact");
            if (!isSent) participants.add(senderName);

            const attachments = [];
            if (Array.isArray(item.attachments)) {
                item.attachments.forEach(att => {
                    attachments.push({
                        id: crypto.randomUUID(),
                        fileName: att.fileName || att.name || "attachment",
                        mimeType: att.contentType || att.mimeType || "application/octet-stream",
                        size: att.size || 0
                    });
                });
            }

            messages.push(new Message({
                id: crypto.randomUUID(),
                platform: "Signal",
                type: attachments.length > 0 ? "media" : "text",
                direction: isSent ? "sent" : "received",
                sender: senderName,
                recipient: isSent ? "Participant" : "Me",
                timestamp,
                body: rawBody,
                attachments,
                metadata: {
                    source: rawSender,
                    index: idx
                }
            }));
        } catch (err) {
            failedCount++;
            errors.push(`Signal JSON item ${idx}: ${err.message}`);
        }
    });

    const participantList = Array.from(participants);
    const counterpartyName = participantList.length === 1 ? participantList[0] : (participantList.join(", ") || "Signal Contact");

    messages.forEach(msg => {
        if (msg.direction === "sent") {
            msg.recipient = counterpartyName;
        }
        msg.metadata.threadTitle = counterpartyName;
        msg.metadata.counterparty = counterpartyName;
        msg.metadata.participants = ["Me", ...participantList];
    });

    messages.sort((a, b) => a.timestamp - b.timestamp);

    return {
        discoveredCount,
        messages,
        skippedCount,
        failedCount,
        errors
    };
}

function parseSignalFile(filePath) {
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw || !raw.trim()) {
        throw new Error("Signal export file is empty.");
    }

    const trimmed = raw.trim();
    if (trimmed.startsWith("[") && trimmed.includes("{") || trimmed.startsWith("{")) {
        try {
            return parseSignalJSON(trimmed);
        } catch (e) {
            // Fallback to text parsing
        }
    }

    return parseSignalText(raw);
}

module.exports = {
    parseSignalFile,
    parseSignalText,
    parseSignalJSON
};
