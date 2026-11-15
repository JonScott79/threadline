const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

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

const PROD_URL = process.env.THREADLINE_PROD_URL || "https://threadline-production-1c28.up.railway.app";
const BACKUP_PATH = process.env.THREADLINE_DB_PATH || path.resolve(__dirname, "../database/threadline.db");
const EXPECTED_SIZE = 250212352;
const EXPECTED_SHA256 = "869b0678926e291e3c509e4e21548cf4ddf89fd7473eeee4082c5440055177c9";

function createSignedToken(uid = "local", expiresInMs = 5 * 60 * 1000) {
    const secret = getAuthSecret();
    const expiresAt = Date.now() + expiresInMs;
    const payload = `restore:${uid}:${expiresAt}`;
    const b64Payload = Buffer.from(payload, "utf8").toString("base64url");
    const hmac = crypto.createHmac("sha256", secret).update(payload).digest("hex");
    return `tl_${b64Payload}.${hmac}`;
}

async function uploadDatabase() {
    console.log("==================================================");
    console.log(" THREADLINE PRODUCTION DATABASE UPLOADER");
    console.log("==================================================");
    console.log("Target Server:", PROD_URL);
    console.log("Source File  :", BACKUP_PATH);

    if (!fs.existsSync(BACKUP_PATH)) {
        throw new Error(`Backup file does not exist at '${BACKUP_PATH}'`);
    }

    const stat = fs.statSync(BACKUP_PATH);
    console.log(`Payload Size : ${stat.size} bytes (${(stat.size / 1024 / 1024).toFixed(2)} MB)`);

    if (stat.size !== EXPECTED_SIZE) {
        throw new Error(`Size mismatch: expected ${EXPECTED_SIZE} bytes, got ${stat.size} bytes.`);
    }

    console.log("Verifying SHA-256 checksum of source database...");
    const fileHash = crypto.createHash("sha256").update(fs.readFileSync(BACKUP_PATH)).digest("hex");
    console.log("Source SHA-256:", fileHash);
    if (fileHash !== EXPECTED_SHA256) {
        throw new Error(`Checksum mismatch: expected ${EXPECTED_SHA256}, got ${fileHash}.`);
    }
    console.log("✓ Source database size and SHA-256 match authoritative master.");

    const token = createSignedToken("local");
    const headers = {
        "Authorization": `Bearer ${token}`
    };

    // 1. Check storage status
    console.log("\n[1/3] Inspecting remote storage status...");
    try {
        const statusRes = await fetch(`${PROD_URL}/api/admin/storage-status`, { headers });
        if (statusRes.ok) {
            const statusJson = await statusRes.json();
            console.log("Remote Storage Status:", JSON.stringify(statusJson, null, 2));
        } else {
            console.warn(`Storage status check returned HTTP ${statusRes.status}. Server might still be deploying.`);
        }
    } catch (e) {
        console.warn("Could not check storage status:", e.message);
    }

    // 2. Upload database
    console.log("\n[2/3] Reading database buffer and preparing multipart upload...");
    const fileBuffer = fs.readFileSync(BACKUP_PATH);
    const blob = new Blob([fileBuffer]);

    const formData = new FormData();
    formData.append("database", blob, "threadline.db");

    console.log("[3/3] Streaming database to /api/admin/restore-database...");
    const uploadRes = await fetch(`${PROD_URL}/api/admin/restore-database`, {
        method: "POST",
        headers: {
            "Authorization": `Bearer ${token}`
        },
        body: formData
    });

    const resText = await uploadRes.text();
    console.log("\nResponse Status:", uploadRes.status);
    try {
        const json = JSON.parse(resText);
        console.log("Upload & Verification Result:\n", JSON.stringify(json, null, 2));
    } catch (e) {
        console.log("Response Body:\n", resText);
    }

    if (!uploadRes.ok) {
        throw new Error(`Upload failed with HTTP ${uploadRes.status}`);
    }

    console.log("\n==================================================");
    console.log(" PRODUCTION DATABASE RESTORE COMPLETE! ✅");
    console.log("==================================================");
}

uploadDatabase().catch(err => {
    console.error("Upload error:", err.message);
    process.exit(1);
});
