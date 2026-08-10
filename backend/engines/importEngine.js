const { detectFile } = require("../parsers/detector");

const { parseSMSBackup } = require("../parsers/smsbackup");
const { parseHTMLBackup } = require("../parsers/htmlbackup");

const { buildConversations } = require("./conversationBuilder");

const Archive = require("../models/Archive");

/*======================================================
                    PARSER REGISTRY
/*======================================================*/

const parsers = {

    "SMS Backup & Restore": parseSMSBackup,
    
    "HTML Conversation Export": parseHTMLBackup

    // "WhatsApp": parseWhatsApp,
    // "Messenger": parseMessenger,
    // "Signal": parseSignal

};

/*======================================================
                    PROCESS IMPORT
======================================================*/

function processImport(filePath){

    const detection = detectFile(filePath);

    const parser = parsers[detection.type];

    if(!parser){
        throw new Error(
            `Unsupported import type: ${detection.type}`
        );
    }

    const parseResult = parser(filePath);

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
                        EXPORTS
======================================================*/

module.exports = {

    processImport

};