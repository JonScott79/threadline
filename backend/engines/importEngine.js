const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");

const { detectFile } = require("../parsers/detector");

const { parseSMSBackup } = require("../parsers/smsbackup");
const { parseHTMLBackup } = require("../parsers/htmlbackup");
const { parseMessengerJSON } = require("../parsers/messenger");
const { parseLogFile } = require("../parsers/logbackup");
const { parseWhatsAppChat } = require("../parsers/whatsapp");
const { parseEmailFile } = require("../parsers/email");
const { parseZipContainer } = require("../parsers/zip");
const { parseSignalFile } = require("../parsers/signal");
const { parsePDFDocument } = require("../parsers/pdf");
const { parseScreenshotOCR } = require("../parsers/ocr");

const { buildConversations } = require("./conversationBuilder");
const Archive = require("../models/Archive");

/*======================================================
                    PARSER REGISTRY
======================================================*/

const parsers = {
    "SMS Backup & Restore": parseSMSBackup,
    "HTML Conversation Export": parseHTMLBackup,
    "Facebook Messenger": parseMessengerJSON,
    "Log / Plaintext": parseLogFile,
    "WhatsApp": parseWhatsAppChat,
    "Email": parseEmailFile,
    "ZIP Container": parseZipContainer,
    "Signal": parseSignalFile,
    "PDF Document": parsePDFDocument,
    "Screenshot / OCR": parseScreenshotOCR
};

function finalizeArchive(detection, parseResult) {
    const conversations = buildConversations(parseResult.messages);

    // Compute exact inserted message counts
    let insertedCount = 0;
    conversations.forEach(c => {
        insertedCount += c.messages.length;
    });

    const unmappedCount = parseResult.messages.length - insertedCount;
    const totalSkipped = parseResult.skippedCount + unmappedCount;

    if (unmappedCount > 0) {
        parseResult.errors.push(`${unmappedCount} messages could not be mapped to any conversation.`);
    }

    const archive = new Archive({
        source: detection.type,
        platform: detection.type,
        confidence: detection.confidence,
        conversations,
        messages: parseResult.messages
    });

    // Attach strict accounting fields
    archive.stats = {
        discovered: parseResult.discoveredCount,
        imported: insertedCount,
        skipped: totalSkipped,
        failed: parseResult.failedCount
    };
    archive.errors = parseResult.errors;

    // Override helper counts to reflect actual database insertions
    archive.messageCount = insertedCount;
    archive.conversationCount = conversations.length;

    return archive;
}

/*======================================================
                    PROCESS IMPORT
======================================================*/

function processImport(filePath) {
    const detection = detectFile(filePath);

    const parser = parsers[detection.type];

    if (!parser) {
        throw new Error(
            `Unsupported import type: ${detection.type}`
        );
    }

    const parseResult = parser(filePath);

    if (parseResult && typeof parseResult.then === "function") {
        return parseResult.then(resolvedResult => finalizeArchive(detection, resolvedResult));
    }

    return finalizeArchive(detection, parseResult);
}

/**
 * Direct text paste processor:
 * Writes pasted text to a temporary buffer file, detects the format, and processes the import.
 */
async function processImportText(rawText, sourceHint = "Pasted Text") {
    if (!rawText || !rawText.trim()) {
        throw new Error("No text provided for import.");
    }

    const tempDir = os.tmpdir();
    const tempFile = path.join(tempDir, `threadline_paste_${crypto.randomUUID()}.txt`);
    fs.writeFileSync(tempFile, rawText, "utf8");

    try {
        const archive = await processImport(tempFile);
        archive.source = sourceHint;
        return archive;
    } finally {
        if (fs.existsSync(tempFile)) {
            try {
                fs.unlinkSync(tempFile);
            } catch (e) {}
        }
    }
}

/*======================================================
                        EXPORTS
======================================================*/

module.exports = {
    parsers,
    processImport,
    processImportText
};
