/*
    pdf.js

    Forensic parser for PDF communication transcripts and legal discovery exports.
    Extracts text streams from PDF documents, normalizes chat transcripts,
    and resolves timestamps, speakers, and message contents.
*/

const fs = require("fs");
const crypto = require("crypto");
const Message = require("../models/Message");

// Common chat transcript timestamp patterns found in PDF discovery documents
const PDF_CHAT_PATTERNS = [
    // [10/12/2026, 10:30 AM] Alice: Hey there
    /^\[(\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}[, ]+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)\]\s+([^:]+):\s*([\s\S]*)$/,
    // 10/12/2026, 10:30 AM - Alice: Hey there
    /^(\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}[, ]+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)\s+-\s+([^:]+):\s*([\s\S]*)$/,
    // Alice [10/12/2026 10:30]: Hey there
    /^([A-Za-z0-9\s_+'()-]{2,40})\s+\[(\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}[, ]+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)\]:\s*([\s\S]*)$/,
    // 2026-10-12 10:30:00 Alice: Hey there
    /^(\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)\s+([^:]+):\s*([\s\S]*)$/
];

function parseGenericDateTime(dateTimeStr) {
    const cleaned = dateTimeStr.trim().replace(/,/g, " ");
    const parsed = Date.parse(cleaned);
    if (!isNaN(parsed)) return parsed;

    // Try manual date/time split
    const match = cleaned.match(/^(\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4})\s+(\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)$/);
    if (match) {
        const dateParts = match[1].replace(/[-.]/g, "/").split("/").map(p => parseInt(p, 10));
        let year, month, day;
        if (dateParts[0] > 1000) {
            year = dateParts[0]; month = dateParts[1] - 1; day = dateParts[2];
        } else {
            month = dateParts[0] - 1; day = dateParts[1]; year = dateParts[2];
            if (year < 100) year += 2000;
        }

        const timeParts = match[2].match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?(?:\s*([APap][Mm]))?$/);
        if (timeParts) {
            let hours = parseInt(timeParts[1], 10);
            const minutes = parseInt(timeParts[2], 10);
            const seconds = timeParts[3] ? parseInt(timeParts[3], 10) : 0;
            const ampm = timeParts[4] ? timeParts[4].toUpperCase() : null;
            if (ampm === "PM" && hours < 12) hours += 12;
            if (ampm === "AM" && hours === 12) hours = 0;

            const dt = new Date(Date.UTC(year, month, day, hours, minutes, seconds));
            if (!isNaN(dt.getTime())) return dt.getTime();
        }
    }
    return null;
}

async function extractPDFText(dataBuffer) {
    const pdfLib = require("pdf-parse");
    if (typeof pdfLib === "function") {
        const res = await pdfLib(dataBuffer);
        return res.text || "";
    }
    if (pdfLib.PDFParse) {
        const parser = new pdfLib.PDFParse({ data: dataBuffer });
        const res = await parser.getText();
        return typeof res === "string" ? res : (res?.text || "");
    }
    throw new Error("Unable to initialize PDF text extractor.");
}

async function parsePDFDocument(filePath) {
    const dataBuffer = fs.readFileSync(filePath);
    let text = "";
    try {
        text = await extractPDFText(dataBuffer);
    } catch (err) {
        throw new Error("Failed to parse PDF document: " + err.message);
    }

    if (!text || !text.trim()) {
        throw new Error("PDF document contains no selectable text or is image-only.");
    }

    const lines = text.split(/\r?\n/);
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

        // Skip standard page headers/footers
        if (/^Page \d+( of \d+)?$/i.test(trimmed) || /^(Confidential|Attorney-Client Privilege)$/i.test(trimmed)) {
            continue;
        }

        let matched = false;

        for (const pattern of PDF_CHAT_PATTERNS) {
            const match = trimmed.match(pattern);
            if (match) {
                matched = true;
                discoveredCount++;

                let dateStr, rawSender, rawBody;
                if (pattern === PDF_CHAT_PATTERNS[2]) {
                    // Pattern 3: Sender [Date]: Body
                    rawSender = match[1].trim();
                    dateStr = match[2];
                    rawBody = match[3];
                } else {
                    dateStr = match[1];
                    rawSender = match[2].trim();
                    rawBody = match[3];
                }

                const timestamp = parseGenericDateTime(dateStr) || Date.now();
                const isSent = /^(you|me|self)$/i.test(rawSender);
                const senderName = isSent ? "Me" : rawSender;
                if (!isSent) participants.add(senderName);

                currentMessage = new Message({
                    id: crypto.randomUUID(),
                    platform: "PDF Document",
                    type: "text",
                    direction: isSent ? "sent" : "received",
                    sender: senderName,
                    recipient: isSent ? "Participant" : "Me",
                    timestamp,
                    body: rawBody,
                    attachments: [],
                    metadata: {
                        rawSender,
                        dateStr,
                        line: i + 1,
                        source: "PDF"
                    }
                });

                messages.push(currentMessage);
                break;
            }
        }

        if (!matched) {
            if (currentMessage) {
                currentMessage.body += "\n" + line;
            } else {
                skippedCount++;
            }
        }
    }

    // If no line-by-line chat patterns matched, check for Cellebrite/Discovery blocks
    if (messages.length === 0) {
        // Fallback: chunk paragraphs that have dates
        const paragraphs = text.split(/\n\s*\n/);
        for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
            const p = paragraphs[pIdx].trim();
            if (!p) continue;
            discoveredCount++;

            const dateMatch = p.match(/(\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4}[, ]+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[APap][Mm])?)/);
            const timestamp = dateMatch ? (parseGenericDateTime(dateMatch[1]) || Date.now()) : Date.now();

            messages.push(new Message({
                id: crypto.randomUUID(),
                platform: "PDF Document",
                type: "text",
                direction: "received",
                sender: "Document Record",
                recipient: "Me",
                timestamp,
                body: p,
                attachments: [],
                metadata: {
                    page: pIdx + 1,
                    source: "PDF Section"
                }
            }));
        }
    }

    const participantList = Array.from(participants);
    const counterpartyName = participantList.length === 1 ? participantList[0] : (participantList.join(", ") || "Document Counterparty");

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

module.exports = {
    parsePDFDocument
};
