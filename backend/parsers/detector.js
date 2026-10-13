/*
    detector.js

    Forensic format detector for communication archives.
    Inspects magic bytes, file extensions, and structural content signatures.
*/

const fs = require("fs");

function detectFile(filePath) {
    let fileSample = "";
    let buffer;
    try {
        const fd = fs.openSync(filePath, "r");
        buffer = Buffer.alloc(50 * 1024); // 50KB buffer
        const bytesRead = fs.readSync(fd, buffer, 0, 50 * 1024, 0);
        fs.closeSync(fd);
        fileSample = buffer.toString("utf8", 0, bytesRead);
    } catch (err) {
        console.error("Failed to read file sample for detection:", err);
        return { type: "Unknown", confidence: 0 };
    }

    const lowerPath = filePath.toLowerCase();

    /*------------------------------------------
        0. ZIP Container (Magic bytes PK\x03\x04)
    ------------------------------------------*/
    if (buffer && buffer[0] === 0x50 && buffer[1] === 0x4B && buffer[2] === 0x03 && buffer[3] === 0x04) {
        return {
            type: "ZIP Container",
            confidence: 100
        };
    }
    if (lowerPath.endsWith(".zip")) {
        return {
            type: "ZIP Container",
            confidence: 90
        };
    }

    /*------------------------------------------
        1. PDF Document (%PDF-)
    ------------------------------------------*/
    if (buffer && buffer[0] === 0x25 && buffer[1] === 0x50 && buffer[2] === 0x44 && buffer[3] === 0x46) {
        return {
            type: "PDF Document",
            confidence: 100
        };
    }
    if (lowerPath.endsWith(".pdf")) {
        return {
            type: "PDF Document",
            confidence: 95
        };
    }

    /*------------------------------------------
        2. Screenshots / Images (PNG, JPEG, WebP)
    ------------------------------------------*/
    const isPng = buffer && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4E && buffer[3] === 0x47;
    const isJpeg = buffer && buffer[0] === 0xFF && buffer[1] === 0xD8 && buffer[2] === 0xFF;
    const isWebP = buffer && buffer.toString("ascii", 0, 4) === "RIFF" && buffer.toString("ascii", 8, 12) === "WEBP";
    const isImageExt = lowerPath.endsWith(".png") || lowerPath.endsWith(".jpg") || lowerPath.endsWith(".jpeg") || lowerPath.endsWith(".webp");

    if (isPng || isJpeg || isWebP || isImageExt) {
        return {
            type: "Screenshot / OCR",
            confidence: 100
        };
    }

    /*------------------------------------------
        3. SMS Backup & Restore
    ------------------------------------------*/
    if (
        fileSample.includes("<smses") ||
        fileSample.includes("<sms ") ||
        fileSample.includes("<mms ")
    ) {
        return {
            type: "SMS Backup & Restore",
            confidence: 100
        };
    }

    /*------------------------------------------
        4. HTML Conversation Export
    ------------------------------------------*/
    if (
        fileSample.includes("<h2>Conversation with:") ||
        (fileSample.includes("<th>Type</th>") && fileSample.includes("<th>Date</th>"))
    ) {
        return {
            type: "HTML Conversation Export",
            confidence: 100
        };
    }

    /*------------------------------------------
        5. Facebook Messenger
    ------------------------------------------*/
    if (
        fileSample.includes("\"participants\"") &&
        fileSample.includes("\"messages\"")
    ) {
        return {
            type: "Facebook Messenger",
            confidence: 100
        };
    }

    /*------------------------------------------
        6. Signal (Text & JSON)
    ------------------------------------------*/
    const hasSignalName = /signal/i.test(filePath);
    const hasSignalTxtPatterns = (
        /\[\d{4}[-/.]\d{1,2}[-/.]\d{1,2}[,\s]+\d{1,2}:\d{2}/.test(fileSample) ||
        /\d{4}[-/.]\d{1,2}[-/.]\d{1,2}\s+\d{1,2}:\d{2}(?::\d{2})?\s+-\s+/.test(fileSample)
    );
    const hasSignalJsonPatterns = (
        fileSample.includes("\"source\"") && (fileSample.includes("\"timestamp\"") || fileSample.includes("\"sent_at\""))
    );

    if (hasSignalName || hasSignalTxtPatterns || hasSignalJsonPatterns) {
        return {
            type: "Signal",
            confidence: hasSignalName ? 95 : 85
        };
    }

    /*------------------------------------------
        7. WhatsApp Export
    ------------------------------------------*/
    const hasWhatsAppPatterns = (
        /\[\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4},?\s+\d{1,2}:\d{2}/.test(fileSample) ||
        /\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4},?\s+\d{1,2}:\d{2}\s+-\s+/.test(fileSample)
    );
    const isWhatsAppName = /whatsapp|_chat\.txt/i.test(filePath);

    if (hasWhatsAppPatterns || isWhatsAppName) {
        return {
            type: "WhatsApp",
            confidence: hasWhatsAppPatterns ? 100 : 75
        };
    }

    /*------------------------------------------
        8. Email (.eml / .mbox)
    ------------------------------------------*/
    const hasEmailHeaders = (
        /^From:\s+/m.test(fileSample) &&
        (/^Date:\s+/m.test(fileSample) || /^Subject:\s+/m.test(fileSample))
    );
    const isEmailExt = lowerPath.endsWith(".eml") || lowerPath.endsWith(".mbox");

    if (hasEmailHeaders || isEmailExt) {
        return {
            type: "Email",
            confidence: hasEmailHeaders ? 100 : 80
        };
    }

    /*------------------------------------------
        9. Communication Log / Plaintext (.log / .txt)
    ------------------------------------------*/
    const hasTimestampedLines = /(?:\[?\d{4}[-/.]\d{2}[-/.]\d{2}[ T]\d{2}:\d{2}|\[\d{10,13}\]|[A-Za-z]{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})/.test(fileSample);
    const isTxtOrLog = lowerPath.endsWith(".log") || lowerPath.endsWith(".txt");

    if (hasTimestampedLines || isTxtOrLog) {
        return {
            type: "Log / Plaintext",
            confidence: hasTimestampedLines ? 90 : 50
        };
    }

    /*------------------------------------------
        Unknown
    ------------------------------------------*/
    return {
        type: "Unknown",
        confidence: 0
    };
}

module.exports = {
    detectFile
};
