/*
    smsbackup.js

    Forensic parser for SMS Backup & Restore XML conversation exports.
    Extracts 1-on-1 SMS and multi-party MMS messages, addresses, timestamps,
    multimedia attachments, and formats them into normalized Message instances.
*/

const fs = require("fs");
const { XMLParser } = require("fast-xml-parser");
const Message = require("../models/Message");

/**
 * Normalizes phone numbers / addresses for reliable deduplication and grouping.
 */
function normalizeAddress(addr) {
    if (!addr) return "";
    return String(addr).trim();
}

/**
 * Parses an SMS Backup & Restore XML file.
 * Handles both <sms> (1-on-1 SMS) and <mms> (MMS & Group Messages).
 */
function parseSMSBackup(filePath) {
    const xml = fs.readFileSync(filePath, "utf8");

    if (!xml || !xml.trim()) {
        throw new Error("The uploaded file is empty.");
    }

    const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "",
        parseAttributeValue: false
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

    const messages = [];
    let discoveredCount = 0;
    let skippedCount = 0;
    let failedCount = 0;
    const errors = [];

    /*--------------------------------------------------
        1. Process 1-on-1 SMS Messages (<sms>)
    --------------------------------------------------*/
    const smsList = data.smses.sms || [];
    const smsArray = Array.isArray(smsList) ? smsList : [smsList];

    smsArray.forEach((sms, idx) => {
        if (!sms) return;
        discoveredCount++;

        const address = normalizeAddress(sms.address);
        if (!address) {
            skippedCount++;
            errors.push(`SMS Node ${idx + 1}: Missing address/phone number. Record skipped.`);
            return;
        }

        const timestamp = Number(sms.date);
        if (isNaN(timestamp) || timestamp <= 0) {
            skippedCount++;
            errors.push(`SMS Node ${idx + 1}: Invalid or missing timestamp "${sms.date}". Record skipped.`);
            return;
        }

        // type="1" -> Received (counterparty sent to Me)
        // type="2" -> Sent (Me sent to counterparty)
        const isSent = sms.type === "2" || sms.type === 2;
        const contactName = sms.contact_name && sms.contact_name !== "(Unknown)" ? sms.contact_name.trim() : "";

        messages.push(
            new Message({
                platform: "SMS",
                type: "text",
                direction: isSent ? "sent" : "received",
                sender: isSent ? "Me" : address,
                recipient: isSent ? address : "Me",
                timestamp,
                body: sms.body || "",
                attachments: [],
                metadata: {
                    contact: contactName,
                    address: address,
                    readableDate: sms.readable_date || new Date(timestamp).toISOString(),
                    threadId: sms.thread_id ? String(sms.thread_id) : address,
                    counterparty: address,
                    counterpartyName: contactName,
                    participants: ["Me", address],
                    protocol: sms.protocol,
                    read: sms.read,
                    status: sms.status
                }
            })
        );
    });

    /*--------------------------------------------------
        2. Process MMS & Group Messages (<mms>)
    --------------------------------------------------*/
    const mmsList = data.smses.mms || [];
    const mmsArray = Array.isArray(mmsList) ? mmsList : [mmsList];

    mmsArray.forEach((mms, idx) => {
        if (!mms) return;
        discoveredCount++;

        // Parse timestamp (MMS dates can be 10 or 13 digits)
        let rawDate = String(mms.date || "").trim();
        let timestamp = Number(rawDate);
        if (!isNaN(timestamp) && rawDate.length === 10) {
            timestamp *= 1000;
        }

        if (isNaN(timestamp) || timestamp <= 0) {
            skippedCount++;
            errors.push(`MMS Node ${idx + 1}: Invalid or missing timestamp "${mms.date}". Record skipped.`);
            return;
        }

        // msg_box="1" -> Received, msg_box="2" -> Sent
        // m_type="128" -> Send-req (Sent)
        const isSent = mms.msg_box === "2" || mms.msg_box === 2 || mms.m_type === "128";
        const contactName = mms.contact_name && mms.contact_name !== "(Unknown)" ? mms.contact_name.trim() : "";

        // Extract parts (text and attachments)
        let bodyText = "";
        const attachments = [];
        const partsContainer = mms.parts;
        if (partsContainer && partsContainer.part) {
            const partsList = Array.isArray(partsContainer.part) ? partsContainer.part : [partsContainer.part];
            partsList.forEach(part => {
                if (!part) return;
                const ct = (part.ct || "").toLowerCase();

                if (ct === "text/plain") {
                    const text = part.text || "";
                    bodyText = bodyText ? bodyText + "\n" + text : text;
                } else if (ct && ct !== "application/smil") {
                    attachments.push({
                        mimeType: part.ct,
                        fileName: part.name || part.cl || `attachment_${timestamp}.${ct.split("/")[1] || "bin"}`,
                        data: part.data || null
                    });
                }
            });
        }

        if (!bodyText && attachments.length > 0) {
            bodyText = `[MMS Attachment: ${attachments.length} file(s)]`;
        }

        // Extract addresses (<addrs><addr .../></addrs>)
        // type="137" -> From (Sender)
        // type="151" -> To (Recipient)
        let senderAddr = "";
        const allParticipants = new Set();

        const addrsContainer = mms.addrs;
        if (addrsContainer && addrsContainer.addr) {
            const addrList = Array.isArray(addrsContainer.addr) ? addrsContainer.addr : [addrsContainer.addr];
            addrList.forEach(a => {
                if (!a) return;
                const cleanAddr = normalizeAddress(a.address);
                if (!cleanAddr || cleanAddr === "insert-address-token") return;

                const addrType = String(a.type);
                if (addrType === "137") {
                    senderAddr = cleanAddr;
                } else if (addrType === "151" || addrType === "130" || addrType === "129") {
                    allParticipants.add(cleanAddr);
                }
            });
        }

        // Fallback: MMS address attribute
        if (allParticipants.size === 0 && mms.address) {
            const splitAddrs = String(mms.address).split("~").map(normalizeAddress).filter(Boolean);
            splitAddrs.forEach(addr => allParticipants.add(addr));
        }

        if (!senderAddr) {
            senderAddr = isSent ? "Me" : (mms.address || contactName || "Unknown");
        }

        const sender = isSent ? "Me" : senderAddr;
        const remoteParticipants = Array.from(allParticipants).filter(p => p !== "Me");
        if (!isSent && senderAddr && senderAddr !== "Me" && !remoteParticipants.includes(senderAddr)) {
            remoteParticipants.push(senderAddr);
        }

        const isGroup = remoteParticipants.length > 1;
        const threadKey = isGroup
            ? remoteParticipants.sort().join(", ")
            : (remoteParticipants[0] || senderAddr || mms.address || "MMS Thread");

        const recipients = isSent ? (remoteParticipants.length > 0 ? remoteParticipants : [threadKey]) : ["Me"];

        messages.push(
            new Message({
                platform: "MMS",
                type: attachments.length > 0 ? "media" : "text",
                direction: isSent ? "sent" : "received",
                sender,
                recipient: recipients.join(", "),
                timestamp,
                body: bodyText,
                attachments,
                metadata: {
                    contact: contactName,
                    readableDate: mms.readable_date || new Date(timestamp).toISOString(),
                    threadId: mms.thread_id ? String(mms.thread_id) : threadKey,
                    counterparty: threadKey,
                    counterpartyName: contactName,
                    participants: ["Me", ...remoteParticipants],
                    isGroup
                }
            })
        );
    });

    // Chronological order
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
    parseSMSBackup
};
