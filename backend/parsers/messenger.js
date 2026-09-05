/*
    messenger.js

    Parser for Facebook Messenger JSON export files (message_1.json, etc.).
    Extracts participants, timestamps, content, and normalizes UTF-8 Mojibake into clean text.
*/

const fs = require("fs");
const Message = require("../models/Message");

/**
 * Fixes Facebook's known Latin-1 / UTF-8 encoding bug (e.g. \u00e2\u0080\u0099 -> apostrophe)
 */
function decodeFBString(str) {
    if (!str) return "";
    try {
        return Buffer.from(str, "latin1").toString("utf8");
    } catch (e) {
        return str;
    }
}

function parseMessengerJSON(filePath) {
    const raw = fs.readFileSync(filePath, "utf8");

    if (!raw || !raw.trim()) {
        throw new Error("The uploaded file is empty.");
    }

    let data;
    try {
        data = JSON.parse(raw);
    } catch (err) {
        throw new Error("Failed to parse JSON. The file may be corrupt or not a valid JSON document.");
    }

    if (!data.messages || !Array.isArray(data.messages)) {
        throw new Error("Invalid Messenger export format. Missing 'messages' array in JSON.");
    }

    const messages = [];
    let discoveredCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const errors = [];

    const threadTitle = decodeFBString(data.title) || "Messenger Chat";
    const participants = (data.participants || []).map(p => decodeFBString(p.name));

    data.messages.forEach((msg, idx) => {
        discoveredCount++;

        if (!msg) {
            skippedCount++;
            errors.push(`Messenger Record ${idx + 1}: Record is empty.`);
            return;
        }

        const rawSender = decodeFBString(msg.sender_name);
        const timestampMs = msg.timestamp_ms || (msg.timestamp ? msg.timestamp * 1000 : null);

        if (!timestampMs || isNaN(timestampMs)) {
            skippedCount++;
            errors.push(`Messenger Record ${idx + 1}: Missing or invalid timestamp.`);
            return;
        }

        // Decode message content, handle photos/attachments
        let bodyText = decodeFBString(msg.content) || "";
        const attachments = [];

        if (msg.photos && Array.isArray(msg.photos)) {
            msg.photos.forEach(p => {
                attachments.push({ type: "image", uri: p.uri });
            });
            if (!bodyText) {
                bodyText = `[Photo Attachment: ${msg.photos.length} image(s)]`;
            }
        }

        if (msg.audio_files && Array.isArray(msg.audio_files)) {
            if (!bodyText) bodyText = "[Audio Message]";
        }

        if (msg.videos && Array.isArray(msg.videos)) {
            if (!bodyText) bodyText = "[Video Attachment]";
        }

        if (!bodyText && attachments.length === 0) {
            // Might be a reaction or call event
            if (msg.type === "Call") {
                bodyText = `[Call Event: ${msg.call_duration || 0} seconds]`;
            } else {
                bodyText = "[Non-text event]";
            }
        }

        messages.push(
            new Message({
                platform: "Messenger",
                direction: rawSender === threadTitle ? "received" : "sent",
                sender: rawSender || "Participant",
                recipient: threadTitle,
                timestamp: timestampMs,
                body: bodyText,
                attachments: attachments,
                metadata: {
                    threadTitle,
                    participants,
                    reactions: msg.reactions || []
                }
            })
        );
    });

    // Messenger exports are newest-first, reverse to chronological order
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
    parseMessengerJSON
};
