/*
    htmlbackup.js

    Parser for HTML conversation exports.
    Extracts type, date, contact info, and message contents from HTML tables,
    and supports extracting inline base64 images as message attachments.

    Responsibilities:
    - Parse HTML table rows using a robust dotall regular expression.
    - Resolve relative dates to Unix timestamps.
    - Strip HTML wrapper elements while preserving linebreaks.
    - Extract inline base64 images into structured attachments.
*/

// =====================================
// Imports
// =====================================

const fs = require("fs");
const Message = require("../models/Message");

// =====================================
// Parser Function
// =====================================

function parseHTMLBackup(filePath) {
    const html = fs.readFileSync(filePath, "utf8");
    if (!html || !html.trim()) {
        throw new Error("The uploaded HTML file is empty.");
    }

    // Check for conversational table structure
    if (!html.includes("<th>Type</th>") && !html.includes("<th>Date</th>")) {
        throw new Error("Invalid HTML layout. Missing conversation table headers.");
    }

    // Combined dotall regex matching rows:
    // <tr><td>Type</td><td>Date</td><td>Name / Number</td><td class='dont-break-out'>Content</td></tr>
    const rowRegex = /<tr>\s*<td>(Received|Sent)<\/td>\s*<td>(.*?)<\/td>\s*<td>(.*?)<\/td>\s*<td(?: class='dont-break-out')?>(.*?)<\/td>\s*<\/tr>/gs;

    let match;
    const messages = [];

    while ((match = rowRegex.exec(html)) !== null) {
        const [_, type, dateStr, contactStr, bodyHtml] = match;

        // Parse date string
        let timestamp = Date.parse(dateStr.trim());
        if (isNaN(timestamp)) {
            timestamp = Date.now(); // Fallback if parsing fails
        }

        // Parse contact info (e.g. "Darcy Gilleo (+17818661187)" -> Name & Phone Number)
        let name = contactStr.trim();
        let phoneNumber = "";

        const phoneMatch = contactStr.match(/\(([^)]+)\)/);
        if (phoneMatch) {
            phoneNumber = phoneMatch[1].trim();
            name = contactStr.replace(phoneMatch[0], "").trim();
        }

        // Extract base64 inline images if present
        const attachments = [];
        const imgMatches = bodyHtml.matchAll(/src="data:([^;]+);base64,([^"]+)"/g);
        for (const imgMatch of imgMatches) {
            attachments.push({
                mimeType: imgMatch[1],
                data: imgMatch[2], // base64 string content
                fileName: `image_${timestamp}.${imgMatch[1].split("/")[1] || "jpg"}`
            });
        }

        // Strip HTML tags from body text, replacing breaks with newlines
        let body = bodyHtml
            .replace(/<br\s*\/?>/gi, "\n")
            .replace(/<\/?[^>]+(>|$)/g, "") // strip remaining html elements
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
                    readableDate: dateStr.trim()
                }
            })
        );
    }

    if (messages.length === 0) {
        throw new Error("No messages could be parsed from the HTML archive.");
    }

    // Sort chronologically (HTML exports are often generated in reverse)
    messages.sort((a, b) => a.timestamp - b.timestamp);

    return messages;
}

// =====================================
// Exports
// =====================================

module.exports = {
    parseHTMLBackup
};
