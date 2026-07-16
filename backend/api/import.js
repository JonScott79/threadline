/*======================================================
                        IMPORTS
======================================================*/

// Core
const express = require("express");
const multer = require("multer");
const path = require("path");

// Engine
const { processImport } = require("../engines/importEngine");

// Services
const { createThreadline } = require("../services/threadlines");

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

    async (request,response)=>{

        try{

	if(!request.file){

		return response.status(400).json({

			status:"error",

			message:"No file uploaded."

		});

	}

	console.log("==========================================");
	console.log("IMPORT REQUEST");
	console.log("File:", request.file.originalname);
	console.log("UID:", request.body.uid);

	if(!request.body.uid){

		return response.status(400).json({

			status:"error",

			message:"Missing user id."

		});

	}

	console.log("Running Import Engine...");

	const archive = processImport(

		request.file.path

	);

	console.log("Archive created.");
	console.log("Messages:", archive.messageCount);
	console.log("Conversations:", archive.conversationCount);

	console.log("Saving Threadline...");

	const threadlineId = await createThreadline(

		request.body.uid,

		archive

	);

	console.log("Threadline ID:", threadlineId);
	console.log("==========================================");

	response.json({

		status:"success",

		threadlineId,

		archive

	});

        }
        catch (error) {

			console.error("");
			console.error("==========================================");
			console.error("IMPORT FAILED");
			console.error("==========================================");
			console.error(error);
			console.error(error.stack);
			console.error("==========================================");
			console.error("");

			response.status(500).json({

				status: "error",

				message: error.message

			});

		}

    }

);

/*======================================================
                        EXPORTS
======================================================*/

module.exports = router;