/*
    logbackup.js

    Forensic parser for plain-text communication logs (.log / .txt).
    Parses timestamped lines, standard syslog/chat formats, or key-value structures.
    Supports formats like:
      [2024-05-12 14:32:05] [Sender/User]: Message text
      2024-05-12T14:32:05Z - Sender: Message text
      May 12 14:32:05 Sender: Message text
      [1715524325000] Sender: Message text
*/

const fs = require("fs");
const Message = require("../models/Message");

// Regex patterns to capture timestamps, senders, and message bodies
const LOG_PATTERNS = [
    // Pattern 1: [2024-05-12 14:32:05] Sender: message OR [2024-05-12 14:32:05] <Sender> message
    /^\[?(\d{4}[-/.]\d{2}[-/.]\d{2}[ T]\d{2}:\d{2}(?::\d{2}(?:\.\d{1,6})?)?(?:Z|[+-]\d{2}:?\d{2})?)\]?\s*(?:<([^>]+)>|\[([^\]]+)\]|([^:]+)):\s*(.*)$/,

    // Pattern 2: [1715524325000] Sender: message (epoch ms)
    /^\[(\d{10,13})\]\s*(?:<([^>]+)>|\[([^\]]+)\]|([^:]+)):\s*(.*)$/,

    // Pattern 3: Month Day HH:MM:SS Sender: message (syslog style)
    /^([A-Za-z]{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s+([^:]+):\s*(.*)$/
];

function parseLogFile(filePath) {
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw || !raw.trim()) {
        throw new Error("The uploaded log file is empty.");
    }

    const lines = raw.split(/\r?\n/);
    const messages = [];
    let discoveredCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const errors = [];

    const currentYear = new Date().getUTCFullYear();

    lines.forEach((line, index) => {
        const trimmed = line.trim();
        if (!trimmed) return; // Skip blank lines

        discoveredCount++;
        let matched = false;

        for (let pIdx = 0; pIdx < LOG_PATTERNS.length; pIdx++) {
            const regex = LOG_PATTERNS[pIdx];
            const match = trimmed.match(regex);
            if (match) {
                matched = true;
                let rawDate = match[1];
                let rawSender = (match[2] || match[3] || match[4] || "").trim();
                let body = (match[5] !== undefined ? match[5] : (match[3] || "")).trim();

                // If pattern 3 (syslog: match[1]=date, match[2]=sender, match[3]=body)
                if (pIdx === 2) {
                    rawSender = match[2].trim();
                    body = match[3].trim();
                    rawDate = `${rawDate} ${currentYear}`;
                }

                let timestamp;
                if (/^\d{10,13}$/.test(rawDate)) {
                    timestamp = parseInt(rawDate, 10);
                    if (rawDate.length === 10) timestamp *= 1000;
                } else {
                    timestamp = Date.parse(rawDate);
                }

                if (isNaN(timestamp)) {
                    skippedCount++;
                    errors.push(`Line ${index + 1}: Unrecognized date/time format "${rawDate}".`);
                    break;
                }

                const senderName = rawSender || "System Log";
                const isSent = /^(me|user|self|out|outgoing)$/i.test(senderName);

                messages.push(new Message({
                    id: require("crypto").randomUUID(),
                    platform: "Log / Plaintext",
                    type: "text",
                    direction: isSent ? "sent" : "received",
                    sender: senderName,
                    recipient: isSent ? "Participant" : "Me",
                    timestamp,
                    body,
                    metadata: {
                        line: index + 1,
                        sourceFormat: "log"
                    }
                }));

                break;
            }
        }

        if (!matched) {
            // Append to previous message if this is a multiline continuation
            if (messages.length > 0) {
                messages[messages.length - 1].body += "\n" + trimmed;
            } else {
                skippedCount++;
            }
        }
    });

    if (messages.length === 0) {
        throw new Error("Could not parse any timestamped log entries from this file. Ensure lines start with a recognizable timestamp (e.g. [YYYY-MM-DD HH:MM:SS] Sender: Message).");
    }

    // Sort chronologically
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
    parseLogFile
};
