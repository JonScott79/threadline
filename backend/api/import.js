/*======================================================
                        IMPORTS
======================================================*/
// Core
const express = require("express");
const multer = require("multer");
const path = require("path");

// Models
const Message = require("../models/Message");
const Conversation = require("../models/Conversation");

// Parsers
const { detectFile } = require("../parsers/detector");
const { parseSMSBackup } = require("../parsers/smsbackup");

// Engines
const { buildConversations } = require("../engines/conversationBuilder");

// Utilities
//const logger = require("../utils/logger");

/*======================================================
                        VARIABLES
======================================================*/

const router = express.Router();

/*======================================================
                        STORAGE
======================================================*/

const storage = multer.diskStorage({

    destination: "./uploads",

    filename: (request, file, callback)=>{

        callback(

            null,

            Date.now() + path.extname(file.originalname)

        );

    }

});

const upload = multer({

    storage

});

/*======================================================
                        ROUTES
======================================================*/

router.get("/", (request,response)=>{

    response.json({

        status:"success",

        message:"Import endpoint is online."

    });

});

/*======================================================
                    FILE IMPORT
======================================================*/

router.post(

    "/",

    upload.single("archive"),

    (request,response)=>{

        const detection = detectFile(

            request.file.path

        );

        let messages = [];

		let conversations = [];

        if(

            detection.type === "SMS Backup & Restore"

        ){

            messages = parseSMSBackup(

                request.file.path

            );
			conversations = buildConversations(messages);

        }

        response.json({

            status:"success",

            originalName:request.file.originalname,

            detected:detection.type,

            confidence:detection.confidence,

			conversationCount: conversations.length,

			messageCount: messages.length,

			preview: conversations.slice(0,3)

        });

    }

);

/*======================================================
                        EXPORTS
======================================================*/

module.exports = router;