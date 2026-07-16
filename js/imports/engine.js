/*======================================================
                        IMPORTS
======================================================*/

import { detectImportType } from "./detector";

/*======================================================
                        PARSERS
======================================================*/

// These will be added as we build them.
//
import * as smsbackup from "./parsers/smsbackup";
// import * as whatsapp from "./parsers/whatsapp";
// import * as messenger from "./parsers/messenger";
// import * as signal from "./parsers/signal";

/*======================================================
                    PARSER REGISTRY
======================================================*/

const parsers = {

    // whatsapp,
    // messenger,
    // signal,
	smsbackup

};

/*======================================================
                    PROCESS IMPORT
======================================================*/

export async function processImport(file){

    if(!file){

        throw new Error("No import file provided.");

    }

    /*----------------------------------------------
                    DETECT FORMAT
    ----------------------------------------------*/

    const type = await detectImportType(file);

    if(!type){

        throw new Error("Unsupported import format.");

    }

    /*----------------------------------------------
                    FIND PARSER
    ----------------------------------------------*/

    const parser = parsers[type];

    if(!parser){

        throw new Error(`Parser not implemented: ${type}`);

    }

    /*----------------------------------------------
                    PARSE FILE
    ----------------------------------------------*/

    const archive = await parser.parse(file);

    return archive;

}