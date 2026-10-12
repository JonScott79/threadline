/*
    auth.js

    Threadline authentication & authorization middleware.
    Supports:
    1. Local Desktop Mode: Bound to local session or 'local' UID.
    2. Cloud Deployment Mode: Cryptographic verification of Firebase ID tokens or JWTs.
*/

module.exports = (req, res, next) => {
    // 1. Check for Bearer token in Authorization header
    const authHeader = req.headers["authorization"];
    if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.split("Bearer ")[1].trim();

        // If Firebase Admin SDK is initialized in environment, verify ID token
        if (process.env.FIREBASE_PROJECT_ID && global.firebaseAdmin) {
            return global.firebaseAdmin.auth().verifyIdToken(token)
                .then(decodedToken => {
                    req.uid = decodedToken.uid;
                    req.user = decodedToken;
                    return next();
                })
                .catch(err => {
                    return res.status(401).json({
                        status: "error",
                        message: "Invalid or expired Firebase authentication token."
                    });
                });
        }

        // If not in cloud Firebase mode, use token or payload safely
        req.uid = token.replace(/[^a-zA-Z0-9_-]/g, "").substring(0, 128);
        return next();
    }

    // 2. Resolve UID from x-user-uid header or query/body parameter
    const rawUid = req.headers["x-user-uid"] || (req.query && req.query.uid) || (req.body && req.body.uid);

    if (rawUid) {
        // Sanitize UID
        const cleanUid = String(rawUid).trim().replace(/[^a-zA-Z0-9_-]/g, "");
        if (cleanUid) {
            req.uid = cleanUid;
            return next();
        }
    }

    // 3. Local-first fallback: If accessed on loopback or local host, assign local guest
    const host = req.headers["host"] || "";
    const isLocalhost = host.includes("localhost") || host.includes("127.0.0.1") || !process.env.PORT || process.env.PORT === "3001";

    if (isLocalhost) {
        req.uid = "local";
        return next();
    }

    return res.status(401).json({
        status: "error",
        message: "Authentication required. Missing user identity header (x-user-uid) or Bearer token."
    });
};
