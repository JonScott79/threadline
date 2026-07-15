/*======================================================
                        IMPORTS
======================================================*/

const express = require("express");

const cors = require("cors");

const importRoutes = require("./api/import");

/*======================================================
                        VARIABLES
======================================================*/

const app = express();

const PORT = 3001;

/*======================================================
                        MIDDLEWARE
======================================================*/

app.use(cors());

app.use(express.json());

/*======================================================
                    ROUTES
======================================================*/

app.get("/", (request, response) => {

    response.json({

        application: "Threadline",

        version: "0.1.0",

        status: "Backend Online"

    });

});

app.use("/api/import", importRoutes);

/*======================================================
                        SERVER
======================================================*/

app.listen(PORT, () => {

    console.log("");

    console.log("==========================================");

    console.log(" Threadline Backend Started");

    console.log("==========================================");

    console.log(` Server : http://localhost:${PORT}`);

    console.log("");

});