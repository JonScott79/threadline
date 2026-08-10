/*
    htmlbackup.js

    Parser for HTML conversation exports.
    Extracts type, date, contact info, and message contents from HTML tables,
    and supports extracting inline base64 images as message attachments.
*/

const fs = require("fs");
const Message = require("../models/Message");

function parseHTMLBackup(filePath) {
    const html = fs.readFileSync(filePath, "utf8");
    if (!html || !html.trim()) {
        throw new Error("The uploaded HTML file is empty.");
    }

    // Check for conversational table structure
    if (!html.includes("<th>Type</th>") && !html.includes("<th>Date</th>")) {
        throw new Error("Invalid HTML layout. Missing conversation table headers.");
    }

    const rowRegex = /<tr>\s*<td>(Received|Sent)<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<td(?: class='dont-break-out')?>(.*?)<\/td>\s*<\/tr>/gs;

    let match;
    const messages = [];
    let discoveredCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const errors = [];

    // Parse row matches
    while ((match = rowRegex.exec(html)) !== null) {
        discoveredCount++;
        const [_, type, dateStr, contactStr, bodyHtml] = match;

        // Verify sender contact is present
        const cleanContact = contactStr.trim();
        if (!cleanContact) {
            skippedCount++;
            errors.push(`Row ${discoveredCount}: Missing sender contact info. Record skipped.`);
            continue;
        }

        // Parse date string (strict check, no Date.now() fallback)
        const cleanDate = dateStr.trim();
        let timestamp = Date.parse(cleanDate);
        if (isNaN(timestamp)) {
            skippedCount++;
            errors.push(`Row ${discoveredCount}: Invalid historical date format "${cleanDate}". Record skipped.`);
            continue;
        }

        // Parse contact info (e.g. "Darcy Gilleo (+17818661187)")
        let name = cleanContact;
        let phoneNumber = "";

        const phoneMatch = cleanContact.match(/\(([^)]+)\)/);
        if (phoneMatch) {
            phoneNumber = phoneMatch[1].trim();
            name = cleanContact.replace(phoneMatch[0], "").trim();
        }

        // Extract base64 inline images
        const attachments = [];
        const imgMatches = bodyHtml.matchAll(/src="data:([^;]+);base64,([^"]+)"/g);
        for (const imgMatch of imgMatches) {
            attachments.push({
                mimeType: imgMatch[1],
                data: imgMatch[2],
                fileName: `image_${timestamp}.${imgMatch[1].split("/")[1] || "jpg"}`
            });
        }

        // Strip HTML tags from body text
        let body = bodyHtml
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/?[^>]+(>|$)/g, "")
            .replace(/&nbsp;/g, " ")
            .trim();

        messages.push(
            new Message({
                platform: "SMS",
                direction: type.toLowerCase() === "sent" ? "sent" : "received",
                sender: phoneNumber || name || "Unknown",
                recipient: "",
                timestamp,
                body,
                attachments,
                metadata: {
                    contact: name,
                    readableDate: cleanDate
                }
            })
        );
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
    parseHTMLBackup
};
