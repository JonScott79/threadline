/*
    whatsapp.js

    Forensic parser for WhatsApp chat exports (TXT files and ZIP archives).
    Supports:
    - Android timestamp formats:
        "M/D/YY, H:MM - Name: Msg"
        "M/D/YYYY, H:MM AM/PM - Name: Msg"
        "DD/MM/YYYY, HH:MM - Name: Msg"
    - iOS timestamp formats:
        "[M/D/YY, H:MM:SS AM/PM] Name: Msg"
        "[DD/MM/YYYY, HH:MM:SS] Name: Msg"
    - 24-hour and 12-hour AM/PM representations.
    - System/status messages (encryption notices, group creation, member add/remove).
    - Multiline message continuations.
    - Attached media notifications (<attached: ...>, file attached, media omitted).
    - Sent vs. received direction resolution.
*/

const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const Message = require("../models/Message");

// Regex patterns for WhatsApp timestamps
// Pattern 1: iOS style [M/D/YY, H:MM:SS AM/PM] Sender: Body OR [DD/MM/YYYY, HH:MM:SS] Sender: Body
const IOS_REGEX = /^\[(\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)\]\s+([^:]+):\s*([\s\S]*)$/;

// Pattern 2: Android style M/D/YY, H:MM - Sender: Body OR DD/MM/YYYY, HH:MM AM/PM - Sender: Body
const ANDROID_REGEX = /^(\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)\s+-\s+([^:]+):\s*([\s\S]*)$/;

// Pattern 3: Android system message M/D/YY, H:MM - System notification (no colon after sender)
const ANDROID_SYSTEM_REGEX = /^(\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)\s+-\s+([^-:]+)$/;

// Pattern 4: iOS system message [M/D/YY, H:MM:SS AM/PM] System notification (no colon after sender)
const IOS_SYSTEM_REGEX = /^\[(\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}),?\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)\]\s+([^:]+)$/;

/**
 * Parses date and time strings into a Unix timestamp in milliseconds.
 * Tries standard US (M/D/Y) and European (D/M/Y) formats.
 */
function parseWhatsAppDateTime(dateStr, timeStr) {
    // Normalize date separators to /
    const normalizedDate = dateStr.replace(/[-.]/g, "/");
    const parts = normalizedDate.split("/").map(p => parseInt(p, 10));

    let year, month, day;
    if (parts[0] > 1000) {
        // YYYY/MM/DD
        year = parts[0];
        month = parts[1];
        day = parts[2];
    } else {
        let p3 = parts[2];
        if (p3 < 100) p3 += 2000;
        year = p3;

        // If first part > 12, it must be DD/MM/YYYY
        if (parts[0] > 12) {
            day = parts[0];
            month = parts[1];
        } else {
            // Default to MM/DD/YYYY
            month = parts[0];
            day = parts[1];
        }
    }

    // Parse time
    let hours = 0;
    let minutes = 0;
    let seconds = 0;

    const isPM = /pm/i.test(timeStr);
    const isAM = /am/i.test(timeStr);
    const cleanTime = timeStr.replace(/[ap]m/gi, "").trim();
    const tParts = cleanTime.split(":").map(p => parseInt(p, 10));

    hours = tParts[0] || 0;
    minutes = tParts[1] || 0;
    seconds = tParts[2] || 0;

    if (isPM && hours < 12) hours += 12;
    if (isAM && hours === 12) hours = 0;

    const d = new Date(year, month - 1, day, hours, minutes, seconds);
    const ts = d.getTime();
    return isNaN(ts) ? null : ts;
}

/**
 * Detects media attachment references inside WhatsApp messages.
 */
function extractMediaAttachments(bodyText) {
    const attachments = [];
    let cleanBody = bodyText;

    // Pattern: <attached: filename.ext>
    const attachMatch = bodyText.match(/<attached:\s*([^>]+)>/i);
    if (attachMatch) {
        const fileName = attachMatch[1].trim();
        attachments.push({
            mimeType: "media/whatsapp",
            fileName: fileName,
            data: null
        });
        cleanBody = cleanBody.replace(attachMatch[0], "").trim();
    }

    // Pattern: filename.ext (file attached)
    const fileAttachMatch = bodyText.match(/([^\s]+\.(?:jpg|jpeg|png|mp4|mov|mp3|ogg|pdf|webp))\s+\(file attached\)/i);
    if (fileAttachMatch) {
        const fileName = fileAttachMatch[1].trim();
        attachments.push({
            mimeType: "media/whatsapp",
            fileName: fileName,
            data: null
        });
        cleanBody = cleanBody.replace(fileAttachMatch[0], "").trim();
    }

    // Pattern: media omitted
    if (/image omitted|video omitted|audio omitted|sticker omitted|document omitted/i.test(bodyText)) {
        attachments.push({
            mimeType: "media/omitted",
            fileName: "omitted_media",
            data: null
        });
    }

    return { cleanBody, attachments };
}

/**
 * Main parser function for WhatsApp exports.
 * 
 * @param {string} filePath - Absolute path to WhatsApp text file
 * @returns {object} { discoveredCount, messages, skippedCount, failedCount, errors }
 */
function parseWhatsAppChat(filePath) {
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw || !raw.trim()) {
        throw new Error("The uploaded WhatsApp export file is empty.");
    }

    // Strip UTF-8 BOM if present
    const cleanRaw = raw.charCodeAt(0) === 0xFEFF ? raw.slice(1) : raw;
    const lines = cleanRaw.split(/\r?\n/);

    const messages = [];
    let discoveredCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const errors = [];

    // Track participants dynamically
    const participants = new Set();
    let currentMessage = null;

    lines.forEach((line, lineIdx) => {
        const trimmed = line.trim();
        if (!trimmed) return;

        // Try matching message patterns
        let match = trimmed.match(IOS_REGEX) || trimmed.match(ANDROID_REGEX);

        if (match) {
            discoveredCount++;
            const dateStr = match[1];
            const timeStr = match[2];
            const rawSender = match[3].trim();
            const rawContent = match[4].trim();

            const timestamp = parseWhatsAppDateTime(dateStr, timeStr);
            if (!timestamp) {
                skippedCount++;
                errors.push(`Line ${lineIdx + 1}: Unrecognized date/time format "${dateStr} ${timeStr}".`);
                return;
            }

            // Exclude system notices that leaked into sender match (e.g. "Messages and calls are end-to-end encrypted")
            if (/end-to-end encrypted|security code changed|created group|added|removed|left/i.test(rawSender)) {
                return;
            }

            const isSent = /^(you|me|self)$/i.test(rawSender);
            const senderName = isSent ? "Me" : rawSender;
            if (!isSent) participants.add(senderName);

            const { cleanBody, attachments } = extractMediaAttachments(rawContent);

            currentMessage = new Message({
                id: crypto.randomUUID(),
                platform: "WhatsApp",
                type: attachments.length > 0 ? "media" : "text",
                direction: isSent ? "sent" : "received",
                sender: senderName,
                recipient: isSent ? "Participant" : "Me",
                timestamp,
                body: cleanBody || (attachments.length > 0 ? `[WhatsApp Media: ${attachments[0].fileName}]` : ""),
                attachments,
                metadata: {
                    rawSender,
                    dateStr,
                    timeStr,
                    line: lineIdx + 1
                }
            });

            messages.push(currentMessage);
            return;
        }

        // Try matching system notification patterns
        let sysMatch = trimmed.match(IOS_SYSTEM_REGEX) || trimmed.match(ANDROID_SYSTEM_REGEX);
        if (sysMatch) {
            // System event (encryption status, group creation, etc.)
            return;
        }

        // Multiline continuation: append to previous message body if active
        if (currentMessage) {
            currentMessage.body += "\n" + trimmed;
        } else {
            skippedCount++;
        }
    });

    if (messages.length === 0) {
        throw new Error("Could not parse any WhatsApp messages from this file. Ensure lines start with standard WhatsApp timestamp formats.");
    }

    // Reconcile recipients based on discovered participants
    const participantList = Array.from(participants);
    const counterpartyName = participantList.length === 1 ? participantList[0] : participantList.join(", ");

    messages.forEach(msg => {
        if (msg.direction === "sent") {
            msg.recipient = counterpartyName;
        }
        msg.metadata.threadTitle = counterpartyName || "WhatsApp Chat";
        msg.metadata.counterparty = counterpartyName || "WhatsApp Contact";
        msg.metadata.participants = ["Me", ...participantList];
    });

    // Ensure strict chronological ordering
    messages.sort((a, b) => a.timestamp - b.timestamp);

    return {
        discoveredCount,
        messages,
        skippedCount,
        failedCount,
        errors
    };
}

module.exports = {
    parseWhatsAppChat
};
