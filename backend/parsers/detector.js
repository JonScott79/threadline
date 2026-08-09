/*======================================================
                        IMPORTS
======================================================*/

const fs = require("fs");

/*======================================================
                    DETECT FILE
======================================================*/

function detectFile(filePath){
    let fileSample = "";
    try {
        // Read only the first 50KB of the file to perform detection safely
        const fd = fs.openSync(filePath, "r");
        const buffer = Buffer.alloc(50 * 1024); // 50KB buffer
        const bytesRead = fs.readSync(fd, buffer, 0, 50 * 1024, 0);
        fs.closeSync(fd);
        fileSample = buffer.toString("utf8", 0, bytesRead);
    } catch (err) {
        console.error("Failed to read file sample for detection:", err);
        return { type: "Unknown", confidence: 0 };
    }

    /*------------------------------------------
        SMS Backup & Restore
    ------------------------------------------*/

    if(

        fileSample.includes("<smses") ||

        fileSample.includes("<sms ") ||
        
        fileSample.includes("<mms ")

    ){

        return{

            type:"SMS Backup & Restore",

            confidence:100

        };

    }

    /*------------------------------------------
        HTML Conversation Export
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
        Facebook Messenger
    ------------------------------------------*/

    if(

        fileSample.includes("\"participants\"") &&

        fileSample.includes("\"messages\"")

    ){

        return{

            type:"Facebook Messenger",

            confidence:100

        };

    }

    /*------------------------------------------
        Unknown
    ------------------------------------------*/

    return{

        type:"Unknown",

        confidence:0

    };

}

/*======================================================
                        EXPORTS
======================================================*/

module.exports={

    detectFile

};