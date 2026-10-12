/*
    testPhase2And3.js

    Comprehensive test suite for Threadline Phase 2 (Parser Expansion)
    and Phase 3 (Case Persistence & Architecture Hardening).
*/

const assert = require("assert");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const AdmZip = require("adm-zip");

const { parseWhatsAppChat } = require("../parsers/whatsapp");
const { parseEmailFile } = require("../parsers/email");
const { parseZipContainer, isSafePath } = require("../parsers/zip");
const { processImport } = require("../engines/importEngine");
const { ingestArchive } = require("../services/threadlines");
const caseManager = require("../services/caseManager");
const db = require("../database/database");

console.log("==================================================");
console.log(" RUNNING: PHASE 2 & 3 ADVANCED PLATFORM TESTS");
console.log("==================================================");

// ----------------------------------------------------
// TEST 1: WhatsApp Parser (Android & iOS Formats)
// ----------------------------------------------------
console.log("1. Testing WhatsApp parser (Android, iOS, multiline & attachments)...");

const sampleWhatsAppTxt = `
10/12/2026, 10:30 - Messages and calls are end-to-end encrypted. No one outside of this chat can read or listen to them.
10/12/2026, 10:31 - Alice: Hey! Are you ready for the case review?
10/12/2026, 10:32 - You: Yes, I am reviewing the documents right now.
Here is the second page of notes.
10/12/2026, 10:33 - Alice: <attached: forensic_report.pdf>
[10/12/26, 10:34:15 AM] Alice: Also check this photo: crime_scene.jpg (file attached)
[10/12/26, 10:35:00 AM] You: Got it, downloading now.
`;

const tempWaPath = path.resolve(__dirname, "temp_whatsapp.txt");
fs.writeFileSync(tempWaPath, sampleWhatsAppTxt.trim(), "utf8");

try {
    const waResult = parseWhatsAppChat(tempWaPath);
    assert.strictEqual(waResult.messages.length, 5, `Expected 5 WhatsApp messages, got ${waResult.messages.length}`);

    // Message 1: Alice (received)
    assert.strictEqual(waResult.messages[0].sender, "Alice");
    assert.strictEqual(waResult.messages[0].direction, "received");
    assert(waResult.messages[0].body.includes("ready for the case review"));

    // Message 2: You (sent, multiline)
    assert.strictEqual(waResult.messages[1].sender, "Me");
    assert.strictEqual(waResult.messages[1].direction, "sent");
    assert(waResult.messages[1].body.includes("reviewing the documents"));
    assert(waResult.messages[1].body.includes("second page of notes"), "Multiline continuation must be captured");

    // Message 3: Media attachment
    assert.strictEqual(waResult.messages[2].attachments.length, 1);
    assert.strictEqual(waResult.messages[2].attachments[0].fileName, "forensic_report.pdf");

    // Message 4: iOS format with file attached
    assert.strictEqual(waResult.messages[3].sender, "Alice");
    assert.strictEqual(waResult.messages[3].attachments.length, 1);
    assert.strictEqual(waResult.messages[3].attachments[0].fileName, "crime_scene.jpg");

    // Message 5: iOS format sent by You
    assert.strictEqual(waResult.messages[4].sender, "Me");
    assert.strictEqual(waResult.messages[4].direction, "sent");

    console.log("✓ Test 1 Passed: WhatsApp Android/iOS formats, multiline continuations, and attachments parsed successfully.");
} finally {
    if (fs.existsSync(tempWaPath)) fs.unlinkSync(tempWaPath);
}

// ----------------------------------------------------
// TEST 2: RFC 5322 Email & MBOX Parser
// ----------------------------------------------------
console.log("2. Testing RFC 5322 Email (.eml) and MBOX parsing...");

const sampleEml = `From: "Dr. Evelyn Reed" <evelyn.reed@lab.org>
To: Investigator Smith <smith@threadline.internal>
Subject: =?UTF-8?B?Rm9yZW5zaWMgTGFiIFJlc3VsdHMg4oCTIENhc2UgIzQ0MDI=?=
Date: Mon, 12 Oct 2026 14:15:00 -0400
Message-ID: <msg_001@lab.org>
Content-Type: multipart/mixed; boundary="BOUNDARY_12345"
MIME-Version: 1.0

--BOUNDARY_12345
Content-Type: text/plain; charset=utf-8
Content-Disposition: inline

Hello Investigator,

The DNA analysis on evidence sample A-12 is complete.
Please see attached chain-of-custody report.

Best regards,
Dr. Reed
--BOUNDARY_12345
Content-Type: application/pdf
Content-Disposition: attachment; filename="dna_report_A12.pdf"

[BINARY_PAYLOAD_HERE]
--BOUNDARY_12345--
`;

const tempEmlPath = path.resolve(__dirname, "temp_email.eml");
fs.writeFileSync(tempEmlPath, sampleEml, "utf8");

try {
    const emailResult = parseEmailFile(tempEmlPath);
    assert.strictEqual(emailResult.messages.length, 1);

    const emailMsg = emailResult.messages[0];
    assert.strictEqual(emailMsg.platform, "Email");
    assert.strictEqual(emailMsg.sender, "evelyn.reed@lab.org");
    assert(emailMsg.body.includes("Forensic Lab Results"), "Decoded RFC 2047 subject must appear in body");
    assert(emailMsg.body.includes("DNA analysis on evidence sample A-12 is complete"));
    assert.strictEqual(emailMsg.attachments.length, 1);
    assert.strictEqual(emailMsg.attachments[0].fileName, "dna_report_A12.pdf");
    assert.strictEqual(emailMsg.metadata.messageId, "<msg_001@lab.org>");

    console.log("✓ Test 2 Passed: RFC 5322 Email with RFC 2047 decoding, MIME boundaries, and attachments verified.");
} finally {
    if (fs.existsSync(tempEmlPath)) fs.unlinkSync(tempEmlPath);
}

// ----------------------------------------------------
// TEST 3: ZIP Container Ingestion & Zip-Slip Protection
// ----------------------------------------------------
console.log("3. Testing ZIP container extraction and Zip-Slip guard...");

const tempZipPath = path.resolve(__dirname, "temp_archive.zip");
const zip = new AdmZip();
zip.addFile("_chat.txt", Buffer.from("10/12/2026, 12:00 - Bob: Meeting confirmed for 3pm.\n10/12/2026, 12:01 - You: See you then.", "utf8"));
zip.writeZip(tempZipPath);

try {
    const zipArchive = processImport(tempZipPath);
    assert.strictEqual(zipArchive.source, "ZIP Container");
    assert.strictEqual(zipArchive.messages.length, 2);
    assert.strictEqual(zipArchive.conversations.length, 1);

    // Test Zip-Slip path validation guard directly
    const testTarget = "C:\\sandbox\\extract";
    assert.strictEqual(isSafePath(testTarget, "file.txt"), true);
    assert.strictEqual(isSafePath(testTarget, "subfolder/file.txt"), true);
    assert.strictEqual(isSafePath(testTarget, "../../etc/passwd"), false, "Relative parent escaping must be rejected!");
    assert.strictEqual(isSafePath(testTarget, "../evil.txt"), false, "Parent traversal must be rejected!");
    assert.strictEqual(isSafePath(testTarget, "C:/Windows/System32"), false, "Absolute path must be rejected!");

    console.log("✓ Test 3 Passed: ZIP container parsed automatically and Zip-Slip path traversal safely blocked.");
} finally {
    if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);
}

// ----------------------------------------------------
// TEST 4: Standalone Portable .tl SQLite Case File
// ----------------------------------------------------
console.log("4. Testing portable .tl SQLite case file export, checksum integrity, and re-import...");

const testUid = `user_tl_case_${Date.now()}`;
const samplePath = path.resolve(__dirname, "../../../sample.xml");
const archive = processImport(samplePath);

ingestArchive(testUid, archive, "sample.xml", 958).then(ingestResult => {
    const threadlineId = ingestResult.threadlineId;

    // Export to .tl file
    const exportedCase = caseManager.exportCaseToFile(threadlineId, testUid);
    assert(fs.existsSync(exportedCase.filePath), ".tl case file must be created on disk");
    assert(exportedCase.filename.endsWith(".tl"), "Filename must have .tl extension");
    assert(exportedCase.manifest.integrityHash, "Manifest must contain SHA-256 checksum");
    assert.strictEqual(exportedCase.manifest.messageCount, 3);

    console.log("✓ Case exported successfully to .tl file with manifest hash:", exportedCase.manifest.integrityHash);

    // Import .tl into a new case
    const importUid = `user_tl_recipient_${Date.now()}`;
    const importedResult = caseManager.importCaseFromFile(exportedCase.filePath, importUid);

    assert(importedResult.threadlineId, "Re-imported case must receive valid threadline ID");
    assert.strictEqual(importedResult.messageCount, 3, "All messages must be restored from .tl");
    assert.strictEqual(importedResult.manifest.integrityHash, exportedCase.manifest.integrityHash, "Integrity hash matches");

    // Verify messages in SQLite for the new owner
    const importedMsgs = db.query("SELECT * FROM messages WHERE threadline_id = ? ORDER BY timestamp ASC", [importedResult.threadlineId]);
    assert.strictEqual(importedMsgs.length, 3, "Messages properly stored in SQLite");
    assert.strictEqual(importedMsgs[0].body, "Hey, are we still on for Friday?");

    // Test tamper resistance: corrupting a byte in .tl file should cause checksum failure!
    const corruptedTlPath = path.resolve(__dirname, "corrupted.tl");
    fs.copyFileSync(exportedCase.filePath, corruptedTlPath);

    const corruptDb = new (require("better-sqlite3"))(corruptedTlPath);
    corruptDb.exec("UPDATE messages SET body = 'TAMPERED EVIDENCE' WHERE rowid = 1;");
    corruptDb.close();

    let caughtTamper = false;
    try {
        caseManager.importCaseFromFile(corruptedTlPath, importUid);
    } catch (e) {
        if (e.message.includes("integrity verification failed") || e.message.includes("Checksum mismatch")) {
            caughtTamper = true;
        }
    } finally {
        if (fs.existsSync(corruptedTlPath)) fs.unlinkSync(corruptedTlPath);
        if (fs.existsSync(exportedCase.filePath)) fs.unlinkSync(exportedCase.filePath);
    }

    assert(caughtTamper, "Tampered .tl case file must be rejected by checksum integrity validation!");
    console.log("✓ Test 4 Passed: Portable .tl case files export, restore, and cryptographic tamper detection verified.");

    // Cleanup test threadlines
    db.run("DELETE FROM threadlines WHERE id = ?", [threadlineId]);
    db.run("DELETE FROM threadlines WHERE id = ?", [importedResult.threadlineId]);

    console.log("==================================================");
    console.log(" ALL PHASE 2 & 3 ADVANCED TESTS PASSED! ✅");
    console.log("==================================================");
}).catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
