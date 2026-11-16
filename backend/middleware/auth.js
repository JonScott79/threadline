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
const fs = require("fs");
const path = require("path");
const { getAuthorizedUids } = require("../services/threadlines");

// Lazy-initialize Firebase Admin (lanzar-95ae3) when service account credentials or package are present
function ensureFirebaseAdminInitialized() {
    if (global.firebaseAdmin) return global.firebaseAdmin;
    try {
        let admin = null;
        try {
            admin = require("firebase-admin");
        } catch (_) {
            const fallbackModule = path.resolve(__dirname, "../../../../auth/auth-backend/node_modules/firebase-admin");
            if (fs.existsSync(fallbackModule)) {
                admin = require(fallbackModule);
            }
        }
        if (!admin) return null;

        if (!admin.apps || admin.apps.length === 0) {
            const rawJson = process.env.FIREBASE_SERVICE_ACCOUNT_KEY || process.env.FIREBASE_SERVICE_ACCOUNT_JSON;
            if (rawJson) {
                const parsed = typeof rawJson === "object" ? rawJson : JSON.parse(rawJson);
                admin.initializeApp({
                    credential: admin.credential.cert(parsed),
                    projectId: parsed.project_id || process.env.FIREBASE_PROJECT_ID || "lanzar-95ae3"
                });
            } else {
                const credFile = path.resolve(__dirname, "../../../../firebase-credentials/lanzar-95ae3-firebase-adminsdk-fbsvc-86e8ea5817.json");
                if (fs.existsSync(credFile)) {
                    const sa = require(credFile);
                    admin.initializeApp({
                        credential: admin.credential.cert(sa),
                        projectId: sa.project_id || "lanzar-95ae3"
                    });
                } else if (process.env.FIREBASE_PROJECT_ID) {
                    admin.initializeApp({ projectId: process.env.FIREBASE_PROJECT_ID });
                } else {
                    return null;
                }
            }
        }
        global.firebaseAdmin = admin;
        return global.firebaseAdmin;
    } catch (_) {
        return null;
    }
}

// Attempt initialization cleanly on startup without throwing in local offline mode
ensureFirebaseAdminInitialized();

// Cached JWKS keys for centralized LANZAR ID OIDC RS256 verification
let jwksCache = { keys: [], expiresAt: 0, url: null };
const JWKS_CACHE_TTL_MS = 60 * 1000;

function clearJwksCache() {
    jwksCache = { keys: [], expiresAt: 0, url: null };
}

function getAuthApiUrl() {
    return (process.env.LANZAR_AUTH_API_URL || "https://auth-api.lanzar.me").replace(/\/+$/, "");
}

function getExpectedOidcIssuer() {
    if (process.env.LANZAR_OIDC_ISSUER && process.env.LANZAR_OIDC_ISSUER.trim()) {
        return process.env.LANZAR_OIDC_ISSUER.trim().replace(/\/+$/, "");
    }
    const api = getAuthApiUrl();
    if (api.includes("auth-api-nova.lanzar.me")) {
        return "https://auth.lanzar.me/nova";
    }
    return "https://auth.lanzar.me";
}

async function fetchJwksKeys(jwksUrl, fetchFn = fetch) {
    const now = Date.now();
    if (jwksCache.url === jwksUrl && now < jwksCache.expiresAt && jwksCache.keys.length > 0) {
        return jwksCache.keys;
    }
    const res = await fetchFn(jwksUrl);
    if (!res.ok) {
        throw new Error(`JWKS fetch failed (${res.status})`);
    }
    const body = await res.json();
    const keys = Array.isArray(body && body.keys) ? body.keys : [];
    jwksCache = { keys, expiresAt: now + JWKS_CACHE_TTL_MS, url: jwksUrl };
    return keys;
}

/**
 * Verifies an RS256 OIDC JWT issued by LANZAR ID (e.g. NOVA) against its published JWKS.
 */
async function verifyOidcAccessToken(token, options = {}) {
    if (typeof token !== "string") return null;
    const parts = token.split(".");
    if (parts.length !== 3) return null;

    let header;
    let payload;
    try {
        header = JSON.parse(Buffer.from(parts[0], "base64url").toString("utf8"));
        payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    } catch (_) {
        return null;
    }

    if (!header || header.alg !== "RS256" || typeof header.kid !== "string" || !header.kid) {
        return null;
    }

    const authApiUrl = (options.authApiUrl || getAuthApiUrl()).replace(/\/+$/, "");
    const jwksUrl = options.jwksUrl || `${authApiUrl}/.well-known/jwks.json`;
    const expectedIssuer = (options.expectedIssuer || getExpectedOidcIssuer()).replace(/\/+$/, "");
    const expectedClientId = options.expectedClientId || "threadline";

    const keys = await fetchJwksKeys(jwksUrl, options.fetchFn || fetch);
    const jwk = keys.find((k) => k && k.kid === header.kid);
    if (!jwk) {
        return { valid: false, reason: "UNKNOWN_KID" };
    }

    const publicKey = crypto.createPublicKey({ key: jwk, format: "jwk" });
    const signingInput = `${parts[0]}.${parts[1]}`;
    const sigBuf = Buffer.from(parts[2], "base64url");
    const sigValid = crypto.verify("RSA-SHA256", Buffer.from(signingInput, "utf8"), publicKey, sigBuf);
    if (!sigValid) {
        return { valid: false, reason: "INVALID_SIGNATURE" };
    }

    const nowSec = Number.isFinite(options.nowSec) ? options.nowSec : Math.floor(Date.now() / 1000);
    if (!Number.isFinite(payload.exp) || nowSec >= payload.exp) {
        return { valid: false, reason: "TOKEN_EXPIRED" };
    }
    if (payload.nbf !== undefined && (!Number.isFinite(payload.nbf) || nowSec < payload.nbf)) {
        return { valid: false, reason: "TOKEN_NOT_YET_VALID" };
    }
    if (String(payload.iss || "").replace(/\/+$/, "") !== expectedIssuer) {
        return { valid: false, reason: "INVALID_ISSUER" };
    }

    const rawAud = payload.aud;
    const audList = typeof rawAud === "string" ? [rawAud] : (Array.isArray(rawAud) ? rawAud : []);
    const azp = payload.azp;
    if (!audList.includes(expectedClientId) && azp !== expectedClientId) {
        return { valid: false, reason: "INVALID_AUDIENCE" };
    }
    if (typeof payload.sub !== "string" || !payload.sub) {
        return { valid: false, reason: "MISSING_SUB" };
    }

    return { valid: true, uid: payload.sub, payload, header };
}

/**
 * Resolves the server HMAC authentication secret with fail-closed production enforcement.
 * In production (NODE_ENV === 'production' or RAILWAY_ENVIRONMENT), THREADLINE_AUTH_SECRET
 * MUST be set and non-empty. Hardcoded fallback is strictly prohibited in production.
 */
function getAuthSecret() {
    const isProd = process.env.NODE_ENV === "production" || !!process.env.RAILWAY_ENVIRONMENT;
    const secret = process.env.THREADLINE_AUTH_SECRET;
    if (isProd) {
        if (!secret || typeof secret !== "string" || secret.trim() === "") {
            throw new Error("CRITICAL SECURITY ERROR: THREADLINE_AUTH_SECRET must be configured and nonempty in production.");
        }
        return secret.trim();
    }
    return (secret && secret.trim()) || "threadline_secure_local_hmac_secret_2026";
}

/**
 * Creates a cryptographically signed authentication token.
 * Format: tl_<base64url_payload>.<hmac_signature>
 * @param {string} uid - User identifier
 * @param {number} expiresInMs - Lifetime in milliseconds (default: 5 minutes)
 * @param {string} scope - Token scope ('user' or 'database_restore')
 */
function createSignedToken(uid, expiresInMs = 5 * 60 * 1000, scope = "user") {
    if (!uid || typeof uid !== "string") {
        throw new Error("Cannot create token without valid string UID.");
    }
    const cleanUid = uid.trim().replace(/[^a-zA-Z0-9_-]/g, "");
    const expiresAt = Date.now() + expiresInMs;
    const payload = scope === "database_restore" ? `restore:${cleanUid}:${expiresAt}` : `${cleanUid}:${expiresAt}`;
    const b64Payload = Buffer.from(payload, "utf8").toString("base64url");
    const secret = getAuthSecret();
    const hmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    return `tl_${b64Payload}.${hmac}`;
}

/**
 * Verifies a signed authentication token.
 * Returns an object { uid, scope } or null if invalid, expired, tampered, or missing production secret.
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

        const secret = getAuthSecret();
        const expectedHmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");

        const sigBuf = Buffer.from(signature, "hex");
        const expBuf = Buffer.from(expectedHmac, "hex");
        if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
            return null; // Signature mismatch / tampered
        }

        const payloadParts = payload.split(":");
        let uid = null;
        let expiresAt = null;
        let scope = "user";

        if (payloadParts.length === 3 && payloadParts[0] === "restore") {
            scope = "database_restore";
            uid = payloadParts[1];
            expiresAt = Number(payloadParts[2]);
        } else if (payloadParts.length === 2) {
            uid = payloadParts[0];
            expiresAt = Number(payloadParts[1]);
        } else {
            return null; // Malformed payload
        }

        if (!uid || isNaN(expiresAt) || Date.now() > expiresAt) {
            return null; // Expired or invalid
        }

        return { uid, scope };
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

        // 1A. Firebase Admin verification (for Firebase ID tokens when configured).
        // If Firebase verification fails (e.g. token is a LANZAR ID OIDC RS256 access token),
        // fall through to 1B instead of rejecting immediately.
        const fbAdmin = !token.startsWith("tl_") ? ensureFirebaseAdminInitialized() : null;
        const tryFirebaseThenOidc = async () => {
            if (fbAdmin) {
                try {
                    const decodedToken = await fbAdmin.auth().verifyIdToken(token, true);
                    req.uid = decodedToken.uid;
                    req.user = decodedToken;
                    req.authMethod = "firebase";
                    return next();
                } catch (_) {
                    // Fall through to LANZAR ID OIDC / central session validation
                }
            }

            // 1B. Centralized LANZAR ID verification (OIDC RS256 JWKS or central session validation)
            if (!token.startsWith("tl_") && token.split(".").length === 3) {
                const authApiUrl = getAuthApiUrl();
                const oidcRes = await verifyOidcAccessToken(token, { authApiUrl });
                if (oidcRes && oidcRes.valid && oidcRes.uid) {
                    req.uid = oidcRes.uid;
                    req.user = oidcRes.payload;
                    req.authMethod = "lanzar_id_oidc";
                    return next();
                }
                if (oidcRes && oidcRes.valid === false && oidcRes.reason !== "UNKNOWN_KID") {
                    return res.status(401).json({
                        status: "error",
                        message: "Invalid, expired, or mismatched LANZAR ID OIDC token."
                    });
                }

                const valRes = await fetch(`${authApiUrl}/api/id/session/validate`, {
                    headers: { Authorization: `Bearer ${token}` }
                });
                if (!valRes.ok) {
                    return res.status(401).json({
                        status: "error",
                        message: "Invalid, expired, or revoked LANZAR ID authentication token."
                    });
                }
                const data = await valRes.json().catch(() => null);
                if (!data || !data.valid || !data.uid) {
                    return res.status(401).json({
                        status: "error",
                        message: "Invalid, expired, or revoked LANZAR ID authentication token."
                    });
                }
                req.uid = data.uid;
                req.user = data;
                req.authMethod = "lanzar_id";
                return next();
            }

            return res.status(401).json({
                status: "error",
                message: "Invalid, expired, or revoked authentication token."
            });
        };

        if (!token.startsWith("tl_") && token.split(".").length === 3) {
            return tryFirebaseThenOidc().catch(() => {
                return res.status(401).json({
                    status: "error",
                    message: "Unable to verify authentication token."
                });
            });
        }

        // 1C. Cryptographic HMAC Token verification
        const tokenAuth = verifySignedToken(token);
        if (tokenAuth) {
            req.uid = tokenAuth.uid;
            req.tokenScope = tokenAuth.scope;
            req.authMethod = "signed_token";

            // Scope enforcement:
            // A credential with scope 'database_restore' is strictly restricted to maintenance endpoints:
            // - /api/admin/storage-status
            // - /api/admin/restore-database
            // - /api/admin/rollback-database
            if (tokenAuth.scope === "database_restore") {
                const fullPath = (req.baseUrl || "") + (req.path || "");
                const allowedEndpoints = [
                    "/api/admin/storage-status",
                    "/api/admin/restore-database",
                    "/api/admin/rollback-database"
                ];
                if (!allowedEndpoints.some(ep => fullPath === ep || fullPath === ep + "/")) {
                    return res.status(403).json({
                        status: "error",
                        message: "Restore credential scope restricted to authorized database maintenance endpoints."
                    });
                }
            }

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
authMiddleware.verifyOidcAccessToken = verifyOidcAccessToken;
authMiddleware.clearJwksCache = clearJwksCache;

module.exports = authMiddleware;
