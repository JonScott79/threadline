/*======================================================
                    IMPORT DETECTOR
======================================================*/

export async function detectImportType(file){

    if(!file){

        return null;

    }

    const extension = file.name.split(".").pop().toLowerCase();

    const text = await file.text();

    /*----------------------------------------------
                    SMS Backup & Restore
    ----------------------------------------------*/

    if(
        extension === "xml" &&
        text.includes("<smses")
    ){

        return "smsbackup";

    }

    /*----------------------------------------------
                    WhatsApp
    ----------------------------------------------*/

    if(
        extension === "zip"
    ){

        return "whatsapp";

    }

    /*----------------------------------------------
                    Messenger
    ----------------------------------------------*/

    if(
        extension === "json"
    ){

        return "messenger";

    }

    /*----------------------------------------------
                    Unknown
    ----------------------------------------------*/

    return null;

}