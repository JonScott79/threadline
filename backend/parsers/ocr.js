/*
    ocr.js

    Forensic OCR parser for chat screenshots and image exports.
    Utilizes Tesseract.js to extract text from images (PNG, JPEG, WebP),
    identifies timestamp headers, contacts, and speech bubbles,
    and reconstructs normalized conversation timelines.
*/

const fs = require("fs");
const crypto = require("crypto");
const Tesseract = require("tesseract.js");
const Message = require("../models/Message");

// Relative and absolute timestamp patterns in mobile chat headers
const TIMESTAMP_PATTERNS = [
    /(?:Today|Yesterday|Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)[,\s]+(\d{1,2}:\d{2}(?:\s*[APap][Mm])?)/i,
    /(\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})[,\s]+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)/,
    /([A-Za-z]{3,9}\s+\d{1,2}(?:,\s+\d{4})?)[,\s]+(\d{1,2}:\d{2}(?:\s*[APap][Mm])?)/,
    /^(\d{1,2}:\d{2}(?:\s*[APap][Mm]))$/
];

function parseScreenshotTimestamp(rawText) {
    const cleaned = rawText.trim();

    // Check today/yesterday
    if (/Today/i.test(cleaned)) {
        const timeMatch = cleaned.match(/(\d{1,2}:\d{2}(?:\s*[APap][Mm])?)/);
        if (timeMatch) {
            const parsed = Date.parse(`Today ${timeMatch[1]}`);
            return isNaN(parsed) ? Date.now() : parsed;
        }
        return Date.now();
    }
    if (/Yesterday/i.test(cleaned)) {
        const timeMatch = cleaned.match(/(\d{1,2}:\d{2}(?:\s*[APap][Mm])?)/);
        const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
        return dayAgo;
    }

    const parsed = Date.parse(cleaned);
    if (!isNaN(parsed)) return parsed;

    return Date.now();
}

async function parseScreenshotOCR(filePath) {
    let result;
    try {
        result = await Tesseract.recognize(filePath, "eng", {
            logger: () => {} // quiet
        });
    } catch (err) {
        throw new Error("OCR extraction failed on image: " + err.message);
    }

    const fullText = result.data.text || "";
    if (!fullText.trim()) {
        throw new Error("No readable text found in screenshot.");
    }

    const lines = fullText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    const messages = [];
    const errors = [];
    let discoveredCount = 0;
    let skippedCount = 0;
    let failedCount = 0;

    let headerContact = "Screenshot Contact";
    let currentTimestamp = Date.now();
    let currentSender = "Contact";
    let messageBuffer = [];

    // Filter out status bar artifacts (e.g. "LTE", "5G", "100%", "Wi-Fi")
    const filteredLines = lines.filter(l => {
        if (/^(5G|LTE|4G|3G|\d{1,3}%|Wi-Fi|Carrier|Verizon|T-Mobile|AT&T)$/i.test(l)) return false;
        return true;
    });

    for (let i = 0; i < filteredLines.length; i++) {
        const line = filteredLines[i];

        // Check if top line represents header contact
        if (i === 0 && line.length < 30 && !/\d{1,2}:\d{2}/.test(line)) {
            headerContact = line;
            continue;
        }

        // Check if line represents a timestamp divider
        let isTimestamp = false;
        for (const pattern of TIMESTAMP_PATTERNS) {
            if (pattern.test(line)) {
                isTimestamp = true;
                currentTimestamp = parseScreenshotTimestamp(line);
                break;
            }
        }

        if (isTimestamp) {
            // Flush buffered message if any
            if (messageBuffer.length > 0) {
                discoveredCount++;
                messages.push(new Message({
                    id: crypto.randomUUID(),
                    platform: "Screenshot / OCR",
                    type: "text",
                    direction: currentSender === "Me" ? "sent" : "received",
                    sender: currentSender === "Me" ? "Me" : headerContact,
                    recipient: currentSender === "Me" ? headerContact : "Me",
                    timestamp: currentTimestamp,
                    body: messageBuffer.join("\n"),
                    attachments: [],
                    metadata: {
                        source: "OCR Screenshot",
                        ocrConfidence: result.data.confidence
                    }
                }));
                messageBuffer = [];
            }
            continue;
        }

        // Check for "Delivered", "Read", or "Sent" markers
        if (/^(Delivered|Read|Sent|Not Delivered)$/i.test(line)) {
            currentSender = "Me";
            continue;
        }

        // Otherwise it's message content
        messageBuffer.push(line);
    }

    // Flush final buffer
    if (messageBuffer.length > 0) {
        discoveredCount++;
        messages.push(new Message({
            id: crypto.randomUUID(),
            platform: "Screenshot / OCR",
            type: "text",
            direction: currentSender === "Me" ? "sent" : "received",
            sender: currentSender === "Me" ? "Me" : headerContact,
            recipient: currentSender === "Me" ? headerContact : "Me",
            timestamp: currentTimestamp,
            body: messageBuffer.join("\n"),
            attachments: [],
            metadata: {
                source: "OCR Screenshot",
                ocrConfidence: result.data.confidence
            }
        }));
    }

    messages.forEach(msg => {
        msg.metadata.threadTitle = headerContact;
        msg.metadata.counterparty = headerContact;
        msg.metadata.participants = ["Me", headerContact];
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

module.exports = {
    parseScreenshotOCR
};
