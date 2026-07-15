/*======================================================
                        IMPORTS
======================================================*/

const fs = require("fs");

/*======================================================
                    DETECT FILE
======================================================*/

function detectFile(filePath){

    const file = fs.readFileSync(

        filePath,

        "utf8"

    );

    /*------------------------------------------
        SMS Backup & Restore
    ------------------------------------------*/

    if(

        file.includes("<smses") ||

        file.includes("<sms ")

    ){

        return{

            type:"SMS Backup & Restore",

            confidence:100

        };

    }

    /*------------------------------------------
        Facebook Messenger
    ------------------------------------------*/

    if(

        file.includes("\"participants\"") &&

        file.includes("\"messages\"")

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