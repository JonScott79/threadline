const assert = require("assert");
const fs = require("fs");
const path = require("path");
const os = require("os");
const PDFDocument = require("pdfkit");

const { parseSignalFile, parseSignalText, parseSignalJSON } = require("../parsers/signal");
const { parsePDFDocument } = require("../parsers/pdf");
const { processImport, processImportText } = require("../engines/importEngine");

console.log("==================================================");
console.log(" TESTING: PHASE 4 NEW FORMATS & PASTEABLE IMPORT");
console.log("==================================================");

async function runTests() {
    // ----------------------------------------------------
    // TEST 1: Signal Text and JSON Parser
    // ----------------------------------------------------
    console.log("1. Testing Signal parser (Text & JSON formats)...");

    const signalTxt = `
[2026-10-12 14:30:15] Alice: Hey Bob, are we on for tomorrow?
[2026-10-12 14:31:00] You: Yes, absolutely. See attached file.
[Attached: signal_doc.pdf]
[2026-10-12 14:32:45] Alice: Perfect, thanks!
`;
    const resTxt = parseSignalText(signalTxt);
    assert.strictEqual(resTxt.messages.length, 3, "Signal text must produce 3 messages");
    assert.strictEqual(resTxt.messages[0].sender, "Alice");
    assert.strictEqual(resTxt.messages[1].direction, "sent");
    assert.strictEqual(resTxt.messages[1].attachments.length, 1);
    assert.strictEqual(resTxt.messages[1].attachments[0].fileName, "signal_doc.pdf");
    console.log("✓ Signal text format verified.");

    const signalJson = JSON.stringify([
        { source: "+15551234", timestamp: 1791900000000, body: "Signal JSON incoming message", is_outgoing: false },
        { source: "Me", timestamp: 1791900060000, body: "Signal JSON outgoing message", is_outgoing: true }
    ]);
    const resJson = parseSignalJSON(signalJson);
    assert.strictEqual(resJson.messages.length, 2, "Signal JSON must produce 2 messages");
    assert.strictEqual(resJson.messages[0].sender, "+15551234");
    assert.strictEqual(resJson.messages[0].direction, "received");
    assert.strictEqual(resJson.messages[1].direction, "sent");
    console.log("✓ Signal JSON format verified.");

    // ----------------------------------------------------
    // TEST 2: Direct Text Paste Ingestion (processImportText)
    // ----------------------------------------------------
    console.log("2. Testing Direct Text Paste Ingestion...");

    const rawWhatsAppPaste = `
10/12/2026, 11:00 - Alice: Hey! Can you paste this chat directly?
10/12/2026, 11:01 - You: Yes, Threadline now supports direct text pasting!
`;
    const pasteArchive = await processImportText(rawWhatsAppPaste, "Pasted Snippet");
    assert.strictEqual(pasteArchive.messages.length, 2, "Pasted WhatsApp snippet must parse 2 messages");
    assert.strictEqual(pasteArchive.conversations.length, 1, "Must build 1 conversation");
    console.log("✓ Pasteable text import verified.");

    // ----------------------------------------------------
    // TEST 3: PDF Document Parser
    // ----------------------------------------------------
    console.log("3. Testing PDF Document Parser...");

    const testPdfPath = path.join(os.tmpdir(), `test_chat_${Date.now()}.pdf`);
    await new Promise((resolve, reject) => {
        const doc = new PDFDocument();
        const writeStream = fs.createWriteStream(testPdfPath);
        doc.pipe(writeStream);
        doc.fontSize(12).text("[10/12/2026, 10:00 AM] Detective Miller: Please provide your alibi.");
        doc.text("[10/12/2026, 10:05 AM] You: I was at the office all morning.");
        doc.text("[10/12/2026, 10:10 AM] Detective Miller: Understood. We will verify the logs.");
        doc.end();
        writeStream.on("finish", resolve);
        writeStream.on("error", reject);
    });

    try {
        const pdfArchive = await processImport(testPdfPath);
        assert.strictEqual(pdfArchive.source, "PDF Document");
        assert(pdfArchive.messages.length >= 3, "PDF must parse at least 3 messages");
        assert.strictEqual(pdfArchive.messages[0].sender, "Detective Miller");
        console.log("✓ PDF Document chat extraction verified.");
    } finally {
        if (fs.existsSync(testPdfPath)) {
            fs.unlinkSync(testPdfPath);
        }
    }

    console.log("==================================================");
    console.log(" ALL PHASE 4 TESTS PASSED! ✅");
    console.log("==================================================");
}

runTests().catch(err => {
    console.error("Test failed:", err);
    process.exit(1);
});
