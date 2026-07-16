/*======================================================
                    SMS BACKUP PARSER
======================================================*/

export async function parse(file){

    const xml = await file.text();

    const parser = new DOMParser();

    const document = parser.parseFromString(xml, "text/xml");

    const smsNodes = document.querySelectorAll("sms");

    const messages = [];

    for(const sms of smsNodes){

        messages.push({

            id: crypto.randomUUID(),

            type: "sms",

            address: sms.getAttribute("address"),

            body: sms.getAttribute("body"),

            date: Number(sms.getAttribute("date")),

            sent: sms.getAttribute("type") === "2"

        });

    }

    return {

        metadata: {

            source: "SMS Backup & Restore",

            imported: new Date(),

            messageCount: messages.length

        },

        participants: [],

        conversations: [],

        attachments: [],

        messages

    };

}