/*======================================================
                        IMPORTS
======================================================*/

const express = require("express");

const cors = require("cors");

const importRoutes = require("./api/import");
const threadlineRoutes = require("./api/threadlines");
const timelineRoutes = require("./api/timeline");
const searchRoutes = require("./api/search");
const segmentRoutes = require("./api/segments");

/*======================================================
                        VARIABLES
======================================================*/

const app = express();

const PORT = process.env.PORT || 3001;

/*======================================================
                        MIDDLEWARE
======================================================*/

const allowedOrigins = [
    "https://threadline.lanzar.me",
    "http://localhost:5173",
    "http://localhost:5174"
];

app.use(cors({
    origin: function(origin, callback) {
        if (!origin) return callback(null, true);
        if (allowedOrigins.indexOf(origin) === -1) {
            const msg = "The CORS policy for this site does not allow access from the specified Origin.";
            return callback(new Error(msg), false);
        }
        return callback(null, true);
    }
}));

app.use(express.json());

const authMiddleware = require("./middleware/auth");

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

app.use("/api/import", authMiddleware, importRoutes);
app.use("/api/threadlines", authMiddleware, threadlineRoutes);
app.use("/api/threadlines/:id/timeline", authMiddleware, timelineRoutes);
app.use("/api/threadlines/:id/search", authMiddleware, searchRoutes);
app.use("/api", authMiddleware, segmentRoutes);

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