/*======================================================
                        IMPORTS
======================================================*/

const fs = require("fs");

const { XMLParser } = require("fast-xml-parser");

const Message = require("../models/Message");

/*======================================================
                    PARSE SMS BACKUP
======================================================*/

function parseSMSBackup(filePath){
    const xml = fs.readFileSync(
        filePath,
        "utf8"
    );

    if (!xml || !xml.trim()) {
        throw new Error("The uploaded file is empty.");
    }

    const parser = new XMLParser({
        ignoreAttributes:false,
        attributeNamePrefix:""
    });

    let data;
    try {
        data = parser.parse(xml);
    } catch (err) {
        throw new Error("Failed to parse XML. The file may be corrupt or contain syntax errors.");
    }

    if (!data || !data.smses) {
        throw new Error("Invalid XML layout. The file is missing the required root <smses> element.");
    }

    const smsList = data.smses.sms || [];
    const messages = [];

    const smsArray = Array.isArray(smsList)
        ? smsList
        : [smsList];

    for(const sms of smsArray){
        if (!sms || !sms.address) continue; // Skip malformed or empty nodes
        messages.push(
            new Message({
                platform:"SMS",
                direction:sms.type === "1"
                    ? "received"
                    : "sent",
                sender:sms.address,
                recipient:"",
                timestamp:Number(sms.date),
                body:sms.body || "",
                metadata:{
                    contact:sms.contact_name,
                    readableDate:sms.readable_date
                }
            })
        );
    }

    if (messages.length === 0) {
        throw new Error("No valid messages found inside the SMS backup archive.");
    }

    return messages;
}

/*======================================================
                        EXPORTS
======================================================*/

module.exports={

    parseSMSBackup

};