const assert = require("assert");
const crypto = require("crypto");
const express = require("express");
const authMiddleware = require("../middleware/auth");

function b64url(input) {
    const buf = Buffer.isBuffer(input) ? input : Buffer.from(JSON.stringify(input), "utf8");
    return buf.toString("base64").replace(/=/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function signRs256(header, payload, privateKey) {
    const signingInput = `${b64url(header)}.${b64url(payload)}`;
    const sig = crypto.sign("RSA-SHA256", Buffer.from(signingInput, "utf8"), privateKey);
    return `${signingInput}.${b64url(sig)}`;
}

async function run() {
    console.log("=== Threadline NOVA OIDC Auth Middleware Tests ===");
    const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", { modulusLength: 2048 });
    const jwk = publicKey.export({ format: "jwk" });
    jwk.kid = "nova_test_kid_1";
    jwk.use = "sig";
    jwk.alg = "RS256";

    const mockFetch = async () => ({
        ok: true,
        status: 200,
        async json() {
            return { keys: [jwk] };
        }
    });

    const nowSec = Math.floor(Date.now() / 1000);
    const validTok = signRs256(
        { alg: "RS256", typ: "JWT", kid: "nova_test_kid_1" },
        {
            sub: "user_nova_123",
            iss: "https://auth.lanzar.me/nova",
            aud: "threadline",
            azp: "threadline",
            iat: nowSec,
            exp: nowSec + 900
        },
        privateKey
    );

    authMiddleware.clearJwksCache();
    const okRes = await authMiddleware.verifyOidcAccessToken(validTok, {
        authApiUrl: "https://auth-api-nova.lanzar.me",
        expectedIssuer: "https://auth.lanzar.me/nova",
        fetchFn: mockFetch
    });
    assert.strictEqual(okRes.valid, true);
    assert.strictEqual(okRes.uid, "user_nova_123");
    console.log("  ✓ Valid NOVA RS256 OIDC token verified");

    // Wrong issuer (production issuer rejected on NOVA)
    const prodIssTok = signRs256(
        { alg: "RS256", typ: "JWT", kid: "nova_test_kid_1" },
        { sub: "user_nova_123", iss: "https://auth.lanzar.me", aud: "threadline", iat: nowSec, exp: nowSec + 900 },
        privateKey
    );
    const badIss = await authMiddleware.verifyOidcAccessToken(prodIssTok, {
        authApiUrl: "https://auth-api-nova.lanzar.me",
        expectedIssuer: "https://auth.lanzar.me/nova",
        fetchFn: mockFetch
    });
    assert.strictEqual(badIss.valid, false);
    assert.strictEqual(badIss.reason, "INVALID_ISSUER");
    console.log("  ✓ Production issuer rejected on NOVA (INVALID_ISSUER)");

    // Wrong audience
    const badAudTok = signRs256(
        { alg: "RS256", typ: "JWT", kid: "nova_test_kid_1" },
        { sub: "user_nova_123", iss: "https://auth.lanzar.me/nova", aud: "portal", iat: nowSec, exp: nowSec + 900 },
        privateKey
    );
    const badAud = await authMiddleware.verifyOidcAccessToken(badAudTok, {
        authApiUrl: "https://auth-api-nova.lanzar.me",
        expectedIssuer: "https://auth.lanzar.me/nova",
        fetchFn: mockFetch
    });
    assert.strictEqual(badAud.valid, false);
    assert.strictEqual(badAud.reason, "INVALID_AUDIENCE");
    console.log("  ✓ Wrong audience rejected (INVALID_AUDIENCE)");

    // Expired token
    const expTok = signRs256(
        { alg: "RS256", typ: "JWT", kid: "nova_test_kid_1" },
        { sub: "user_nova_123", iss: "https://auth.lanzar.me/nova", aud: "threadline", iat: nowSec - 1800, exp: nowSec - 60 },
        privateKey
    );
    const expRes = await authMiddleware.verifyOidcAccessToken(expTok, {
        authApiUrl: "https://auth-api-nova.lanzar.me",
        expectedIssuer: "https://auth.lanzar.me/nova",
        fetchFn: mockFetch
    });
    assert.strictEqual(expRes.valid, false);
    assert.strictEqual(expRes.reason, "TOKEN_EXPIRED");
    console.log("  ✓ Expired token rejected (TOKEN_EXPIRED)");

    // Tampered signature
    const parts = validTok.split(".");
    const tampered = `${parts[0]}.${parts[1]}.AAAA`;
    const sigRes = await authMiddleware.verifyOidcAccessToken(tampered, {
        authApiUrl: "https://auth-api-nova.lanzar.me",
        expectedIssuer: "https://auth.lanzar.me/nova",
        fetchFn: mockFetch
    });
    assert.strictEqual(sigRes.valid, false);
    assert.strictEqual(sigRes.reason, "INVALID_SIGNATURE");
    console.log("  ✓ Tampered signature rejected (INVALID_SIGNATURE)");

    // Protected Express route rejects unauthenticated requests in production/cloud mode
    const prevEnv = process.env.NODE_ENV;
    const prevSecret = process.env.THREADLINE_AUTH_SECRET;
    process.env.NODE_ENV = "production";
    process.env.THREADLINE_AUTH_SECRET = "test_secret_32_bytes_long_enough_1234";
    try {
        const app = express();
        app.get("/api/protected", authMiddleware, (req, res) => res.json({ uid: req.uid }));
        const srv = await new Promise((resolve) => {
            const s = app.listen(0, "127.0.0.1", () => resolve(s));
        });
        try {
            const r = await fetch(`http://127.0.0.1:${srv.address().port}/api/protected`);
            assert.strictEqual(r.status, 401);
            console.log("  ✓ Unauthenticated access to protected route rejected (401)");
        } finally {
            srv.close();
        }
    } finally {
        process.env.NODE_ENV = prevEnv;
        if (prevSecret === undefined) delete process.env.THREADLINE_AUTH_SECRET;
        else process.env.THREADLINE_AUTH_SECRET = prevSecret;
    }

    console.log("ALL 6 THREADLINE NOVA AUTH TESTS PASSED.");
}

run().catch((err) => {
    console.error("TEST FAILED:", err);
    process.exit(1);
});
