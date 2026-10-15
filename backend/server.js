/*======================================================
                        IMPORTS
======================================================*/

const express = require("express");
const cors = require("cors");
const storageConfig = require("./config/storage");

const importRoutes = require("./api/import");
const threadlineRoutes = require("./api/threadlines");
const timelineRoutes = require("./api/timeline");
const searchRoutes = require("./api/search");
const segmentRoutes = require("./api/segments");
const exportRoutes = require("./api/export");
const adminRoutes = require("./api/admin");

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

app.use(express.json({ limit: "100mb" }));
app.use(express.urlencoded({ extended: true, limit: "100mb" }));

// Maintenance mode guard: allows health checks and admin restore endpoint while holding user traffic
app.use((req, res, next) => {
    if (storageConfig.isPendingRestore() && !req.path.startsWith("/api/admin") && req.path !== "/") {
        return res.status(503).json({
            status: "error",
            code: 503,
            message: "Threadline is running in Maintenance Mode awaiting database restore onto persistent volume. Please restore database via /api/admin/restore-database."
        });
    }
    next();
});

const authMiddleware = require("./middleware/auth");

/*======================================================
                    ROUTES
======================================================*/

app.get("/", (request, response) => {
    response.json({
        application: "Threadline",
        version: "0.1.0",
        status: storageConfig.isPendingRestore() ? "Backend Online (Awaiting Database Restore)" : "Backend Online",
        storage: {
            databaseConfigured: !!storageConfig.databasePath,
            mode: storageConfig.isProduction ? "production_volume" : "local_development",
            pendingRestore: storageConfig.isPendingRestore(),
            dataDir: storageConfig.dataDir
        }
    });
});

app.use("/api/import", authMiddleware, importRoutes);
app.use("/api/threadlines", authMiddleware, threadlineRoutes);
app.use("/api/threadlines/:id/timeline", authMiddleware, timelineRoutes);
app.use("/api/threadlines/:id/search", authMiddleware, searchRoutes);
app.use("/api/threadlines/:id/export", authMiddleware, exportRoutes);
app.use("/api/admin", authMiddleware, adminRoutes);
app.use("/api", authMiddleware, segmentRoutes);

/*======================================================
                        SERVER
======================================================*/

app.listen(PORT, () => {
    console.log("");
    console.log("==========================================");
    console.log(" Threadline Backend Started");
    console.log("==========================================");
    console.log(` Server        : http://localhost:${PORT}`);
    console.log(` Database Path : ${storageConfig.databasePath}`);
    console.log(` Uploads Path  : ${storageConfig.uploadsDir}`);
    console.log(` Storage Mode  : ${storageConfig.isProduction ? 'Production Volume' : 'Local Development'}`);
    console.log(` Status        : ${storageConfig.isPendingRestore() ? 'RESTORE_READY (Maintenance Mode)' : 'Ready'}`);
    console.log("==========================================");
    console.log("");
});
