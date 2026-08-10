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
const { ingestArchive } = require("../services/threadlines");

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
	console.log("UID:", request.uid);

	if(!request.uid){

		return response.status(401).json({

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

	console.log("Ingesting into Archive Pool...");

	const result = await ingestArchive(

		request.uid,

		archive,

		request.file.originalname,

		request.file.size

	);

	console.log("Archive Ingested successfully.");
	console.log("==========================================");

	// Include detailed stats in returned archive response
	archive.stats = result.stats;

	response.json({

		status:"success",

		threadlineId: result.archiveId,

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