/*
    email.js

    Forensic parser for RFC 5322 Email (.eml) and Mailbox (.mbox) files.
    Extracts headers (From, To, Cc, Subject, Date, Message-ID, In-Reply-To),
    MIME multipart bodies (text/plain, text/html), and attachments.
*/

const fs = require("fs");
const crypto = require("crypto");
const Message = require("../models/Message");

/**
 * Decodes RFC 2047 encoded words (=?charset?encoding?encoded_text?=).
 */
function decodeRFC2047(header) {
    if (!header || !header.includes("=?")) return header || "";

    return header.replace(/=\?([^?]+)\?([BbQq])\?([^?]+)\?=/g, (match, charset, encoding, text) => {
        try {
            if (encoding.toUpperCase() === "B") {
                return Buffer.from(text, "base64").toString(charset.toLowerCase() === "utf-8" ? "utf8" : "latin1");
            } else if (encoding.toUpperCase() === "Q") {
                const unescaped = text.replace(/_/g, " ").replace(/=([A-Fa-f0-9]{2})/g, (m, hex) => {
                    return String.fromCharCode(parseInt(hex, 16));
                });
                return unescaped;
            }
        } catch (e) {
            return match;
        }
        return match;
    });
}

/**
 * Parses raw RFC 5322 headers into key-value pairs (unfolding multiline headers).
 */
function parseHeaders(rawHeaders) {
    const headers = {};
    const lines = rawHeaders.split(/\r?\n/);
    let currentKey = null;

    lines.forEach(line => {
        if (/^\s+/.test(line) && currentKey) {
            // Folded header continuation
            headers[currentKey] += " " + line.trim();
        } else {
            const colonIdx = line.indexOf(":");
            if (colonIdx > 0) {
                currentKey = line.substring(0, colonIdx).trim().toLowerCase();
                headers[currentKey] = line.substring(colonIdx + 1).trim();
            }
        }
    });

    // Decode RFC 2047 across values
    Object.keys(headers).forEach(k => {
        headers[k] = decodeRFC2047(headers[k]);
    });

    return headers;
}

/**
 * Extracts address and display name from an email address header.
 * e.g. "Alice Smith <alice@example.com>" -> name: "Alice Smith", address: "alice@example.com"
 */
function parseEmailAddress(addrStr) {
    if (!addrStr) return { name: "", address: "" };
    const clean = addrStr.trim();
    const match = clean.match(/^(?:"?([^"]*)"?\s+)?<([^>]+)>$/);
    if (match) {
        return {
            name: match[1] ? match[1].trim() : "",
            address: match[2].trim()
        };
    }
    return { name: clean, address: clean };
}

/**
 * Parses a single RFC 5322 message string into a normalized Message instance.
 */
function parseSingleEmail(rawMsg, index = 1) {
    // Separate headers from body (first blank line)
    const headerEndIdx = rawMsg.search(/\r?\n\r?\n/);
    if (headerEndIdx === -1) {
        throw new Error("Invalid email structure: No header/body boundary found.");
    }

    const rawHeaders = rawMsg.substring(0, headerEndIdx);
    const rawBody = rawMsg.substring(headerEndIdx).trim();
    const headers = parseHeaders(rawHeaders);

    const fromInfo = parseEmailAddress(headers["from"] || "Unknown");
    const toRaw = headers["to"] || "";
    const ccRaw = headers["cc"] || "";
    const subject = headers["subject"] || "(No Subject)";

    // Parse date
    const rawDate = headers["date"];
    let timestamp = rawDate ? Date.parse(rawDate) : null;
    if (!timestamp || isNaN(timestamp)) {
        timestamp = Date.now();
    }

    // Determine MIME boundary if multipart
    const contentType = headers["content-type"] || "text/plain";
    let bodyText = "";
    const attachments = [];

    const boundaryMatch = contentType.match(/boundary="?([^";]+)"?/i);
    if (boundaryMatch) {
        const boundary = boundaryMatch[1];
        const parts = rawBody.split(new RegExp(`--${boundary.replace(/[-/\\^$*+?.()|[\]{}]/g, '\\$&')}`));

        parts.forEach(part => {
            const trimmedPart = part.trim();
            if (!trimmedPart || trimmedPart.startsWith("--")) return; // skip prelude and end delimiter

            const partHeaderEnd = trimmedPart.search(/\r?\n\r?\n/);
            if (partHeaderEnd === -1) return;

            const partHeaders = parseHeaders(trimmedPart.substring(0, partHeaderEnd));
            const partBody = trimmedPart.substring(partHeaderEnd).trim();
            const partContentType = (partHeaders["content-type"] || "text/plain").toLowerCase();

            // Check Content-Disposition for attachments
            const contentDisp = (partHeaders["content-disposition"] || "").toLowerCase();
            const filenameMatch = (partHeaders["content-disposition"] || partHeaders["content-type"] || "")
                .match(/filename="?([^";\r\n]+)"?/i);

            if (contentDisp.includes("attachment") || filenameMatch) {
                attachments.push({
                    mimeType: partContentType.split(";")[0].trim(),
                    fileName: filenameMatch ? filenameMatch[1].trim() : `attachment_${Date.now()}`,
                    size: partBody.length
                });
            } else if (partContentType.includes("text/plain")) {
                bodyText = bodyText ? bodyText + "\n" + partBody : partBody;
            } else if (partContentType.includes("text/html") && !bodyText) {
                // Strip HTML tags for plain text preview
                bodyText = partBody.replace(/<br\s*\/?>/gi, "\n").replace(/<\/?[^>]+(>|$)/g, "").trim();
            }
        });
    } else {
        bodyText = rawBody;
    }

    // Format body with subject header
    const formattedBody = subject ? `Subject: ${subject}\n\n${bodyText}` : bodyText;

    // Sender and recipient strings
    const sender = fromInfo.address || fromInfo.name;
    const recipient = toRaw || "Me";

    const messageId = headers["message-id"] || crypto.randomUUID();
    const inReplyTo = headers["in-reply-to"] || headers["references"] || null;

    return new Message({
        id: crypto.randomUUID(),
        platform: "Email",
        type: attachments.length > 0 ? "media" : "text",
        direction: /^(me|self|user)/i.test(fromInfo.name) ? "sent" : "received",
        sender,
        recipient,
        timestamp,
        body: formattedBody,
        attachments,
        metadata: {
            subject,
            from: fromInfo,
            to: toRaw,
            cc: ccRaw,
            messageId,
            inReplyTo,
            threadTitle: subject ? `Re: ${subject.replace(/^(re|fwd):\s*/i, "")}` : "Email Thread",
            threadId: inReplyTo || messageId
        }
    });
}

/**
 * Main parser for Email files (.eml and .mbox).
 */
function parseEmailFile(filePath) {
    const raw = fs.readFileSync(filePath, "utf8");
    if (!raw || !raw.trim()) {
        throw new Error("The uploaded email file is empty.");
    }

    const messages = [];
    let discoveredCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const errors = [];

    // Check if MBOX (starts with or contains "^From ")
    if (filePath.endsWith(".mbox") || /^From\s+[^\r\n]+/m.test(raw)) {
        // Split on MBOX separator lines (^From ...)
        const mboxMessages = raw.split(/^From\s+[^\r\n]+/m).filter(m => m.trim().length > 0);

        mboxMessages.forEach((msgRaw, idx) => {
            discoveredCount++;
            try {
                const msg = parseSingleEmail(msgRaw, idx + 1);
                messages.push(msg);
            } catch (err) {
                failedCount++;
                errors.push(`MBOX Message ${idx + 1}: ${err.message}`);
            }
        });
    } else {
        // Single .eml file
        discoveredCount++;
        try {
            const msg = parseSingleEmail(raw, 1);
            messages.push(msg);
        } catch (err) {
            failedCount++;
            errors.push(`Email: ${err.message}`);
        }
    }

    if (messages.length === 0) {
        throw new Error("Could not parse any valid email messages from this file. Ensure it contains valid RFC 5322 email headers.");
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
    parseEmailFile
};
