/*======================================================
                        IMPORTS
======================================================*/

const express = require("express");

const cors = require("cors");

const importRoutes = require("./api/import");
const threadlineRoutes = require("./api/threadlines");
const timelineRoutes = require("./api/timeline");
const searchRoutes = require("./api/search");

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
app.use("/api/threadlines", threadlineRoutes);
app.use("/api/threadlines/:id/timeline", timelineRoutes);
app.use("/api/threadlines/:id/search", searchRoutes);

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