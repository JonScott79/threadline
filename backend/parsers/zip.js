/*
    zip.js

    Forensic ZIP container processor with Zip-Slip protection
    and automatic inner format identification.
*/

const fs = require("fs");
const path = require("path");
const os = require("os");
const crypto = require("crypto");
const AdmZip = require("adm-zip");

const { parseWhatsAppChat } = require("./whatsapp");
const { parseMessengerJSON } = require("./messenger");
const { parseSMSBackup } = require("./smsbackup");
const { parseHTMLBackup } = require("./htmlbackup");
const { parseEmailFile } = require("./email");

const MAX_UNCOMPRESSED_SIZE = 500 * 1024 * 1024; // 500 MB quota guard

/**
 * Validates that an archive entry cannot escape the target destination (Zip-Slip guard).
 */
function isSafePath(targetDir, entryName) {
    if (!entryName || entryName.includes("..") || path.isAbsolute(entryName)) {
        return false;
    }
    const resolvedPath = path.resolve(targetDir, entryName);
    return resolvedPath.startsWith(path.resolve(targetDir) + path.sep);
}

/**
 * Parses a ZIP container holding a supported communication archive.
 */
function parseZipContainer(filePath) {
    let zip;
    try {
        zip = new AdmZip(filePath);
    } catch (e) {
        throw new Error("Failed to open ZIP archive. The file may be corrupt or not a valid ZIP container.");
    }

    const zipEntries = zip.getEntries();
    if (zipEntries.length === 0) {
        throw new Error("The uploaded ZIP archive contains no files.");
    }

    // Check total uncompressed size (Zip Bomb guard)
    let totalUncompressedSize = 0;
    zipEntries.forEach(entry => {
        totalUncompressedSize += entry.header.size;
    });

    if (totalUncompressedSize > MAX_UNCOMPRESSED_SIZE) {
        throw new Error(`ZIP archive exceeds the maximum uncompressed size safety limit of 500 MB (Total: ${(totalUncompressedSize / (1024 * 1024)).toFixed(1)} MB).`);
    }

    // Create a temporary extraction directory
    const tempDir = path.join(os.tmpdir(), "threadline_zip_" + crypto.randomUUID());
    fs.mkdirSync(tempDir, { recursive: true });

    try {
        // Extract safely
        zipEntries.forEach(entry => {
            if (entry.isDirectory) return;
            if (!isSafePath(tempDir, entry.entryName)) {
                throw new Error(`Malicious path traversal detected in ZIP entry: ${entry.entryName}`);
            }
            const outPath = path.join(tempDir, entry.entryName);
            const parent = path.dirname(outPath);
            if (!fs.existsSync(parent)) fs.mkdirSync(parent, { recursive: true });
            fs.writeFileSync(outPath, entry.getData());
        });

        // Scan extracted files to determine inner format
        const extractedFiles = [];
        function walk(dir) {
            fs.readdirSync(dir).forEach(file => {
                const full = path.join(dir, file);
                if (fs.statSync(full).isDirectory()) {
                    walk(full);
                } else {
                    extractedFiles.push(full);
                }
            });
        }
        walk(tempDir);

        // 1. Check for WhatsApp chat (_chat.txt or *WhatsApp*.txt)
        const waFile = extractedFiles.find(f => /_chat\.txt$/i.test(f) || /WhatsApp.*\.txt$/i.test(f));
        if (waFile) {
            console.log("ZIP identified as WhatsApp export container:", waFile);
            return parseWhatsAppChat(waFile);
        }

        // 2. Check for Messenger JSON (message_1.json)
        const fbFile = extractedFiles.find(f => /message_\d+\.json$/i.test(f));
        if (fbFile) {
            console.log("ZIP identified as Facebook Messenger export container:", fbFile);
            return parseMessengerJSON(fbFile);
        }

        // 3. Check for SMS Backup XML
        const smsFile = extractedFiles.find(f => /\.xml$/i.test(f));
        if (smsFile) {
            const sample = fs.readFileSync(smsFile, "utf8").substring(0, 500);
            if (sample.includes("<smses") || sample.includes("<sms ")) {
                console.log("ZIP identified as SMS Backup XML container:", smsFile);
                return parseSMSBackup(smsFile);
            }
        }

        // 4. Check for HTML conversation export
        const htmlFile = extractedFiles.find(f => /\.html$/i.test(f));
        if (htmlFile) {
            const sample = fs.readFileSync(htmlFile, "utf8").substring(0, 1000);
            if (sample.includes("<th>Type</th>") && sample.includes("<th>Date</th>")) {
                console.log("ZIP identified as HTML export container:", htmlFile);
                return parseHTMLBackup(htmlFile);
            }
        }

        // 5. Check for Email (.eml / .mbox)
        const emailFile = extractedFiles.find(f => /\.eml$/i.test(f) || /\.mbox$/i.test(f));
        if (emailFile) {
            console.log("ZIP identified as Email container:", emailFile);
            return parseEmailFile(emailFile);
        }

        // Fallback: Check if any .txt file in zip is a WhatsApp chat
        const anyTxt = extractedFiles.find(f => /\.txt$/i.test(f));
        if (anyTxt) {
            try {
                return parseWhatsAppChat(anyTxt);
            } catch (e) {}
        }

        throw new Error("No supported communication records (WhatsApp _chat.txt, Messenger message_1.json, SMS XML, HTML, or EML) were found inside this ZIP container.");

    } finally {
        // Cleanup extracted temp directory
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch (cleanupErr) {
            console.warn("Failed to remove temp ZIP extraction dir:", cleanupErr.message);
        }
    }
}

module.exports = {
    parseZipContainer,
    isSafePath
};
