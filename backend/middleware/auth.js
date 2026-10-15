/*
    auth.js

    Threadline Authentication & Authorization Middleware.

    Security Architecture:
    1. Independent Identity Establishment:
       Client-controlled identity headers (x-user-uid, query.uid, body.uid) are NEVER
       trusted blindly. Identity must be established through cryptographically verified tokens
       or strictly bound to the authorized local environment.

    2. Cloud / Production Mode (NODE_ENV === 'production' or process.env.FIREBASE_PROJECT_ID):
       - Mandatory Cryptographic Token:
         Requires an 'Authorization: Bearer <token>' header.
         - If Firebase Admin is configured, verifies ID token against Firebase Auth.
         - Otherwise verifies server HMAC signature against THREADLINE_AUTH_SECRET.
       - Client-controlled headers (x-user-uid, query.uid, body.uid) are strictly ignored.
       - Any unauthenticated or invalid token request is rejected with HTTP 401 Unauthorized.

    3. Local Desktop Mode (Loopback Only, NODE_ENV !== 'production'):
       - If a valid Bearer token is provided, verify it cryptographically.
       - If no Bearer token is provided:
         - Default identity is established as 'local'.
         - If the caller supplies an x-user-uid header:
           - Check against authorized local developer aliases: getAuthorizedUids('local')
             ['local', 'hogUXhgQVEMRu3jgEIeEAQsBhz33', 'user_jonny_live_2_5gb']
           - If YES: Permitted for local developer workflows.
           - If NO: REJECT with HTTP 403 Forbidden!
             An unauthenticated client CANNOT claim an arbitrary or third-party UID.

    4. Token Signing API:
       - Exports createSignedToken(uid) and verifySignedToken(token) for internal sessions
         and automated multi-tenant test suites.
*/

const crypto = require("crypto");
const { getAuthorizedUids } = require("../services/threadlines");

// Server authentication secret (from environment or persistent local key)
const AUTH_SECRET = process.env.THREADLINE_AUTH_SECRET || "threadline_secure_local_hmac_secret_2026";

/**
 * Creates a cryptographically signed authentication token for a UID.
 * Format: tl_<base64url_payload>.<hmac_signature>
 */
function createSignedToken(uid, expiresInMs = 24 * 60 * 60 * 1000) {
    if (!uid || typeof uid !== "string") {
        throw new Error("Cannot create token without valid string UID.");
    }
    const cleanUid = uid.trim().replace(/[^a-zA-Z0-9_-]/g, "");
    const expiresAt = Date.now() + expiresInMs;
    const payload = `${cleanUid}:${expiresAt}`;
    const b64Payload = Buffer.from(payload, "utf8").toString("base64url");
    const hmac = crypto.createHmac("sha256", AUTH_SECRET).update(payload).digest("hex");
    return `tl_${b64Payload}.${hmac}`;
}

/**
 * Verifies a signed authentication token.
 * Returns the verified UID or null if invalid, expired, or tampered.
 */
function verifySignedToken(token) {
    if (!token || typeof token !== "string" || !token.startsWith("tl_")) {
        return null;
    }
    try {
        const parts = token.slice(3).split(".");
        if (parts.length !== 2) return null;
        const [b64Payload, signature] = parts;
        const payload = Buffer.from(b64Payload, "base64url").toString("utf8");
        const expectedHmac = crypto.createHmac("sha256", AUTH_SECRET).update(payload).digest("hex");

        const sigBuf = Buffer.from(signature, "hex");
        const expBuf = Buffer.from(expectedHmac, "hex");
        if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
            return null; // Signature mismatch / tampered
        }

        const [uid, expiresAtStr] = payload.split(":");
        const expiresAt = Number(expiresAtStr);
        if (isNaN(expiresAt) || Date.now() > expiresAt) {
            return null; // Expired
        }

        return uid;
    } catch (_) {
        return null;
    }
}

/**
 * Detects whether the incoming HTTP connection originates from the local loopback interface.
 */
function isLoopbackConnection(req) {
    const rawIp = req.socket?.remoteAddress || req.ip || "";
    return rawIp === "127.0.0.1" || rawIp === "::1" || rawIp === "::ffff:127.0.0.1" || rawIp.endsWith("127.0.0.1");
}

/**
 * Main Express authentication middleware.
 */
function authMiddleware(req, res, next) {
    const isProduction = process.env.NODE_ENV === "production" || !!process.env.FIREBASE_PROJECT_ID;
    const isLoopback = isLoopbackConnection(req);

    // 1. Check for Bearer token in Authorization header
    const authHeader = req.headers["authorization"];
    if (authHeader && authHeader.startsWith("Bearer ")) {
        const token = authHeader.split("Bearer ")[1].trim();

        // 1A. Firebase Admin verification (if configured in environment)
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

        // 1B. Cryptographic HMAC Token verification
        const verifiedUid = verifySignedToken(token);
        if (verifiedUid) {
            req.uid = verifiedUid;
            req.authMethod = "signed_token";
            return next();
        }

        // Invalid Bearer token
        return res.status(401).json({
            status: "error",
            message: "Invalid, expired, or tampered authentication token."
        });
    }

    // 2. Production or Remote connection without valid Bearer token -> REJECT
    if (isProduction || !isLoopback) {
        return res.status(401).json({
            status: "error",
            message: "Authentication required. Valid Bearer token must be provided."
        });
    }

    // 3. Local Desktop Development Mode (Loopback only):
    // Default authenticated identity for the local desktop instance is 'local'.
    const localAuthorizedUids = getAuthorizedUids("local");
    const rawClaimedUid = req.headers["x-user-uid"];

    if (rawClaimedUid) {
        const cleanClaimed = String(rawClaimedUid).trim().replace(/[^a-zA-Z0-9_-]/g, "");
        // Security check: An unauthenticated client on loopback can only claim authorized local aliases
        if (localAuthorizedUids.includes(cleanClaimed)) {
            req.uid = cleanClaimed;
            req.authMethod = "local_alias";
            return next();
        } else {
            // Unauthenticated attempt to impersonate an unverified or foreign UID
            return res.status(403).json({
                status: "error",
                message: `Access denied: Unauthenticated client cannot claim unverified UID '${cleanClaimed}'. Identity impersonation is forbidden.`
            });
        }
    }

    // Default to local desktop identity
    req.uid = "local";
    req.authMethod = "local_default";
    return next();
}

// Export middleware with token utility helpers
authMiddleware.createSignedToken = createSignedToken;
authMiddleware.verifySignedToken = verifySignedToken;
authMiddleware.isLoopbackConnection = isLoopbackConnection;

module.exports = authMiddleware;
