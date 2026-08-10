/*
    smsbackup.js

    Parser for XML SMS Backup & Restore conversation exports.
    Extracts addresses, dates, body contents, and formats them into messages list.
*/

const fs = require("fs");
const { XMLParser } = require("fast-xml-parser");
const Message = require("../models/Message");

function parseSMSBackup(filePath) {
    const xml = fs.readFileSync(filePath, "utf8");

    if (!xml || !xml.trim()) {
        throw new Error("The uploaded file is empty.");
    }

    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: ""
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
    let discoveredCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const errors = [];

    const smsArray = Array.isArray(smsList) ? smsList : [smsList];

    smsArray.forEach((sms, idx) => {
        discoveredCount++;

        if (!sms) {
            skippedCount++;
            errors.push(`SMS Node ${idx + 1}: Node is empty. Record skipped.`);
            return;
        }

        // Validate address
        if (!sms.address) {
            skippedCount++;
            errors.push(`SMS Node ${idx + 1}: Missing address/phone number. Record skipped.`);
            return;
        }

        // Validate date/timestamp
        const timestamp = Number(sms.date);
        if (isNaN(timestamp) || timestamp <= 0) {
            skippedCount++;
            errors.push(`SMS Node ${idx + 1}: Invalid or missing timestamp "${sms.date}". Record skipped.`);
            return;
        }

        messages.push(
            new Message({
                platform: "SMS",
                direction: sms.type === "1" ? "received" : "sent",
                sender: sms.address,
                recipient: "",
                timestamp,
                body: sms.body || "",
                metadata: {
                    contact: sms.contact_name,
                    readableDate: sms.readable_date
                }
            })
        );
    });

    return {
        discoveredCount,
        messages,
        skippedCount,
        failedCount,
        errors
    };
}

module.exports = {
    parseSMSBackup
};