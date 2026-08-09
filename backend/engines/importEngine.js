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

    const messages = parser(filePath);

    const conversations = buildConversations(messages);

    return new Archive({

        source: detection.type,

        platform: detection.type,

        confidence: detection.confidence,

        conversations,

        messages

    });

}

/*======================================================
                        EXPORTS
======================================================*/

module.exports = {

    processImport

};