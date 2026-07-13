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

    const parser = new XMLParser({

        ignoreAttributes:false,

        attributeNamePrefix:""

    });

    const data = parser.parse(xml);

    const smsList = data.smses?.sms || [];

    const messages = [];

    const smsArray = Array.isArray(smsList)

        ? smsList

        : [smsList];

    for(const sms of smsArray){

        messages.push(

            new Message({

                platform:"SMS",

                direction:sms.type === "1"

                    ? "received"

                    : "sent",

                sender:sms.address,

                recipient:"",

                timestamp:Number(sms.date),

                body:sms.body,

                metadata:{

                    contact:sms.contact_name,

                    readableDate:sms.readable_date

                }

            })

        );

    }

    return messages;

}

/*======================================================
                        EXPORTS
======================================================*/

module.exports={

    parseSMSBackup

};