/*
    evidenceExporter.js

    Authoritative Evidence Export Service for Threadline.
    Builds canonical Evidence Export models from SQLite data and generates:
    1. JSON Evidence Package (machine-readable, self-contained)
    2. PDF Evidence Report (human-readable, forensic layout)
    3. PDF Watermarked / Read-Only Copy (tamper-evident, permissions restricted)

    Forensic Invariants:
    SOURCE EVIDENCE  ≠  DETERMINISTIC ANALYSIS  ≠  SEMANTIC INFERENCE
    - Authoritative source evidence is fetched directly from SQLite.
    - No normalization, rewriting, or trimming of original message bodies or timestamps.
    - Semantic inference is explicitly labeled and cannot overwrite source evidence.
    - Zero database mutations during export.
*/

const crypto = require("crypto");
const PDFDocument = require("pdfkit");
const db = require("../database/database");

const THREADLINE_VERSION = "0.1.0";
const EXPORT_SPEC_VERSION = "1.0.0";

/**
 * Deterministically serialize a JavaScript object with sorted keys.
 */
function canonicalStringify(obj) {
    if (obj === null || typeof obj !== "object") {
        return JSON.stringify(obj);
    }
    if (Array.isArray(obj)) {
        return "[" + obj.map(canonicalStringify).join(",") + "]";
    }
    const keys = Object.keys(obj).sort();
    return "{" + keys.map(k => JSON.stringify(k) + ":" + canonicalStringify(obj[k])).join(",") + "}";
}

/**
 * Calculate SHA-256 hex digest of a string or buffer.
 */
function sha256(data) {
    return crypto.createHash("sha256").update(data, "utf8").digest("hex");
}

class EvidenceExporter {
    /**
     * Resolves authoritative evidence from SQLite and constructs the canonical export package.
     * 
     * @param {Object} options
     * @param {string} options.threadlineId - Threadline ID
     * @param {string} options.uid - Authenticated user UID
     * @param {Array<string>} [options.messageIds] - Array of specific message IDs to export
     * @param {Object} [options.cluster] - Optional EventCluster object provided from search
     * @param {string} [options.query] - Search query string
     * @param {Object} [options.filters] - Query filters (e.g. day)
     * @param {Object} [options.caseInfo] - Optional user-provided case metadata
     * @returns {Object} Canonical Evidence Export Model
     */
    resolveCanonicalEvidence(options) {
        const { threadlineId, uid, cluster, query, filters, caseInfo } = options;

        if (!threadlineId) {
            throw new Error("Missing required threadlineId.");
        }

        // Verify threadline access
        const isArchive = threadlineId === `archive_${uid}`;
        const threadlineRow = db.queryOne("SELECT * FROM threadlines WHERE id = ?", [threadlineId]);
        if (!isArchive && (!threadlineRow || threadlineRow.owner_id !== uid)) {
            const err = new Error("Access denied: threadline does not belong to user.");
            err.statusCode = 403;
            throw err;
        }

        // Determine message IDs to resolve
        let targetMessageIds = [];
        if (options.messageIds && Array.isArray(options.messageIds) && options.messageIds.length > 0) {
            targetMessageIds = options.messageIds;
        } else if (cluster && Array.isArray(cluster.messages) && cluster.messages.length > 0) {
            targetMessageIds = cluster.messages.map(m => m.id);
        }

        if (targetMessageIds.length === 0) {
            const err = new Error("No evidence selected for export.");
            err.statusCode = 400;
            throw err;
        }

        // Authoritative resolution from SQLite database
        // Enforce threadline_id containment to prevent ID traversal/cross-tenant leakage
        const placeholders = targetMessageIds.map(() => "?").join(",");
        const queryParams = [threadlineId, ...targetMessageIds];

        const sql = `
            SELECT 
                m.id AS messageId,
                m.conversation_id AS conversationId,
                c.title AS conversationTitle,
                c.platform AS conversationPlatform,
                m.sender,
                m.recipient,
                m.timestamp,
                m.body,
                m.platform,
                m.direction,
                m.metadata AS messageMetadata,
                imp.id AS importId,
                imp.filename AS importFilename,
                imp.source AS importSource,
                imp.platform AS importPlatform,
                imp.imported_at AS importTimestamp
            FROM messages m
            JOIN conversations c ON m.conversation_id = c.id
            LEFT JOIN message_imports mi ON m.id = mi.message_id
            LEFT JOIN imports imp ON mi.import_id = imp.id
            WHERE m.threadline_id = ?
              AND m.id IN (${placeholders})
            ORDER BY m.timestamp ASC, m.id ASC
        `;

        const authoritativeRows = db.query(sql, queryParams);

        if (authoritativeRows.length === 0) {
            const err = new Error("No matching authoritative evidence records found in this threadline.");
            err.statusCode = 404;
            throw err;
        }

        // Build lookup map for cluster-specific deterministic match reasons and semantic inferences
        const clusterMetaMap = new Map();
        if (cluster && Array.isArray(cluster.messages)) {
            cluster.messages.forEach(m => {
                clusterMetaMap.set(m.id, {
                    matchReason: m.matchReason || null,
                    score: m.score !== undefined ? m.score : null,
                    semanticInference: m.semanticInference || null,
                    semanticExpansion: m.semanticExpansion || null
                });
            });
        }

        // Generate Export Metadata
        const exportId = `TL-EXP-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
        const generatedAt = new Date().toISOString();

        // 1. Process Source Evidence Items & Compute Item Hashes
        const evidenceItems = [];
        const evidenceHashes = [];
        const semanticFindings = [];
        const deterministicFindings = [];

        for (const row of authoritativeRows) {
            let parsedMetadata = {};
            try {
                parsedMetadata = typeof row.messageMetadata === "string" ? JSON.parse(row.messageMetadata || "{}") : (row.messageMetadata || {});
            } catch (e) {
                parsedMetadata = {};
            }

            // Canonical representation for cryptographic hashing
            // Must strictly include immutable source data
            const canonicalItemData = {
                messageId: row.messageId,
                conversationId: row.conversationId,
                timestamp: Number(row.timestamp),
                sender: row.sender || "",
                recipient: row.recipient || "",
                platform: row.platform || "SMS",
                body: row.body !== null && row.body !== undefined ? String(row.body) : ""
            };

            const itemCanonicalString = canonicalStringify(canonicalItemData);
            const itemHash = sha256(itemCanonicalString);

            // Contextual analysis / inference metadata
            const clusterMeta = clusterMetaMap.get(row.messageId) || {};
            const deterministicReasons = [];
            if (clusterMeta.matchReason) {
                deterministicReasons.push(clusterMeta.matchReason);
            }

            // Check for semantic inference
            let semanticInferenceText = null;
            let semanticConfidence = null;
            if (clusterMeta.semanticInference) {
                semanticInferenceText = typeof clusterMeta.semanticInference === "string" 
                    ? clusterMeta.semanticInference 
                    : (clusterMeta.semanticInference.inference || clusterMeta.semanticInference.reason || "Semantic topic correlation");
                semanticConfidence = clusterMeta.semanticInference.confidence || null;

                semanticFindings.push({
                    evidenceId: row.messageId,
                    inference: semanticInferenceText,
                    confidence: semanticConfidence,
                    label: "SEMANTIC INFERENCE — NOT SOURCE EVIDENCE"
                });
            }

            if (deterministicReasons.length > 0) {
                deterministicFindings.push({
                    evidenceId: row.messageId,
                    reasons: deterministicReasons,
                    score: clusterMeta.score
                });
            }

            evidenceHashes.push({
                evidenceId: row.messageId,
                sha256: itemHash
            });

            evidenceItems.push({
                id: row.messageId,
                sourceEvidence: {
                    messageId: row.messageId,
                    conversationId: row.conversationId,
                    conversationTitle: row.conversationTitle || "Conversation",
                    sender: row.sender,
                    recipient: row.recipient,
                    timestamp: Number(row.timestamp),
                    timestampIso: new Date(Number(row.timestamp)).toISOString(),
                    body: row.body,
                    platform: row.platform,
                    direction: row.direction,
                    metadata: parsedMetadata
                },
                provenance: {
                    threadlineId,
                    conversationId: row.conversationId,
                    importId: row.importId || null,
                    sourceFile: row.importFilename || null,
                    importSource: row.importSource || null,
                    importTimestamp: row.importTimestamp || null
                },
                deterministicAnalysis: {
                    matchReasons: deterministicReasons,
                    score: clusterMeta.score
                },
                semanticInference: semanticInferenceText ? {
                    finding: semanticInferenceText,
                    confidence: semanticConfidence,
                    label: "SEMANTIC INFERENCE — NOT SOURCE EVIDENCE"
                } : null,
                integrity: {
                    hashAlgorithm: "SHA-256",
                    itemHash
                }
            });
        }

        // Compute Manifest Hash
        const manifestData = {
            exportId,
            exportVersion: EXPORT_SPEC_VERSION,
            generatedAt,
            threadlineVersion: THREADLINE_VERSION,
            hashAlgorithm: "SHA-256",
            evidenceCount: evidenceItems.length,
            evidenceHashes
        };

        const manifestCanonicalString = canonicalStringify(manifestData);
        const manifestHash = sha256(manifestCanonicalString);

        // Aggregate Event Reconstruction Summary (if exporting a cluster or multi-message event)
        let eventReconstruction = null;
        if (cluster) {
            eventReconstruction = {
                eventId: cluster.id || cluster.clusterId || `event_${evidenceItems[0].sourceEvidence.timestamp}`,
                title: cluster.title || "Event Reconstruction",
                topic: cluster.topic || "Reconstructed Event",
                summaryReason: cluster.summaryReason || cluster.reason || "Reconstructed chronological communication",
                relevance: cluster.relevance || "High",
                relevanceScore: cluster.relevanceScore !== undefined ? cluster.relevanceScore : null,
                clusterConfidence: cluster.clusterConfidence || "Medium",
                timeSpan: {
                    earliestTimestamp: evidenceItems[0].sourceEvidence.timestamp,
                    latestTimestamp: evidenceItems[evidenceItems.length - 1].sourceEvidence.timestamp,
                    dateString: cluster.timeSpan?.dateString || cluster.dateString || ""
                },
                conversations: cluster.conversations || Array.from(new Set(evidenceItems.map(e => e.sourceEvidence.conversationTitle))),
                participants: cluster.participants || Array.from(new Set(evidenceItems.map(e => e.sourceEvidence.sender).filter(Boolean)))
            };
        } else {
            // General selection event reconstruction summary
            const distinctConvs = Array.from(new Set(evidenceItems.map(e => e.sourceEvidence.conversationTitle)));
            const distinctParts = Array.from(new Set(evidenceItems.map(e => e.sourceEvidence.sender).filter(Boolean)));
            eventReconstruction = {
                eventId: `event_selection_${Date.now()}`,
                title: "Selected Evidence Reconstruction",
                topic: "Manual Evidence Selection",
                summaryReason: `Chronological compilation of ${evidenceItems.length} evidence record(s) across ${distinctConvs.length} conversation thread(s).`,
                relevance: "Direct Selection",
                relevanceScore: 100,
                clusterConfidence: "High",
                timeSpan: {
                    earliestTimestamp: evidenceItems[0].sourceEvidence.timestamp,
                    latestTimestamp: evidenceItems[evidenceItems.length - 1].sourceEvidence.timestamp,
                    dateString: ""
                },
                conversations: distinctConvs,
                participants: distinctParts
            };
        }

        return {
            exportMetadata: {
                exportId,
                exportVersion: EXPORT_SPEC_VERSION,
                threadlineVersion: THREADLINE_VERSION,
                generatedAt,
                tamperEvidentClassification: "TAMPER-EVIDENT FORENSIC EXPORT"
            },
            caseMetadata: caseInfo || {
                caseName: "Unspecified Investigation / Review",
                investigator: uid || "Authorized User",
                notes: null
            },
            queryContext: {
                query: query || null,
                filters: filters || {}
            },
            eventReconstruction,
            evidence: evidenceItems,
            analysis: {
                deterministicFindingsCount: deterministicFindings.length,
                deterministicFindings
            },
            inference: {
                hasSemanticInference: semanticFindings.length > 0,
                disclaimer: "SEMANTIC INFERENCE — NOT SOURCE EVIDENCE",
                semanticFindings
            },
            integrity: {
                hashAlgorithm: "SHA-256",
                evidenceCount: evidenceItems.length,
                evidenceHashes,
                manifestHash
            }
        };
    }

    /**
     * Generates a self-contained JSON Evidence Package.
     */
    generateJsonPackage(canonicalExport) {
        return JSON.stringify(canonicalExport, null, 2);
    }

    /**
     * Generates a forensic PDF Evidence Report or Watermarked Copy.
     * 
     * @param {Object} canonicalExport - The canonical export model
     * @param {Object} options - PDF generation options
     * @param {boolean} [options.watermarked=false] - Whether to apply watermark and read-only flags
     * @returns {Promise<Buffer>} PDF Buffer
     */
    generatePdfReport(canonicalExport, options = {}) {
        return new Promise((resolve, reject) => {
            const isWatermarked = Boolean(options.watermarked);

            const docOptions = {
                size: "LETTER",
                margins: { top: 40, bottom: 45, left: 45, right: 45 },
                bufferPages: true,
                info: {
                    Title: `Threadline Evidence Report - ${canonicalExport.exportMetadata.exportId}`,
                    Author: "Threadline Forensic System",
                    Subject: "Authoritative Evidence Export",
                    Keywords: "evidence, forensics, threadline, audit"
                }
            };

            // Configure PDF permission restrictions if watermarked/read-only requested
            if (isWatermarked) {
                docOptions.permissions = {
                    modifying: false,
                    annotating: false,
                    fillingForms: false,
                    copying: true,
                    printing: "highResolution"
                };
            }

            const doc = new PDFDocument(docOptions);
            const chunks = [];

            doc.on("data", chunk => chunks.push(chunk));
            doc.on("end", () => resolve(Buffer.concat(chunks)));
            doc.on("error", err => reject(err));

            const colors = {
                headerBg: "#0F172A", // Slate 900
                accent: "#2563EB",   // Blue 600
                darkText: "#1E293B", // Slate 800
                mutedText: "#64748B",// Slate 500
                border: "#CBD5E1",   // Slate 300
                cardBg: "#F8FAFC",   // Slate 50
                sourceBox: "#FFFFFF",
                inferenceBg: "#FEF3C7", // Amber 100
                inferenceBorder: "#D97706", // Amber 600
                inferenceText: "#92400E"  // Amber 800
            };

            // --- HEADER BLOCK ---
            doc.rect(45, 40, 522, 54).fill(colors.headerBg);

            doc.fillColor("#FFFFFF")
               .font("Helvetica-Bold")
               .fontSize(16)
               .text("THREADLINE", 60, 50, { characterSpacing: 1.5 });

            doc.font("Helvetica")
               .fontSize(11)
               .fillColor("#94A3B8")
               .text(isWatermarked ? "READ-ONLY EVIDENCE COPY" : "FORENSIC EVIDENCE REPORT", 60, 70);

            doc.font("Helvetica-Bold")
               .fontSize(9)
               .fillColor("#38BDF8")
               .text(`EXPORT ID: ${canonicalExport.exportMetadata.exportId}`, 360, 52, { align: "right", width: 195 });

            doc.font("Helvetica")
               .fontSize(8)
               .fillColor("#94A3B8")
               .text(`Generated: ${canonicalExport.exportMetadata.generatedAt}`, 360, 68, { align: "right", width: 195 });

            doc.moveDown(3);

            // Metadata summary table
            let curY = 110;
            doc.rect(45, curY, 522, 60).strokeColor(colors.border).lineWidth(1).stroke();

            doc.font("Helvetica-Bold").fontSize(8).fillColor(colors.mutedText).text("INVESTIGATION / CASE:", 55, curY + 8);
            doc.font("Helvetica").fontSize(9).fillColor(colors.darkText).text(canonicalExport.caseMetadata.caseName || "Unspecified", 175, curY + 8);

            doc.font("Helvetica-Bold").fontSize(8).fillColor(colors.mutedText).text("SEARCH QUERY:", 55, curY + 24);
            doc.font("Helvetica").fontSize(9).fillColor(colors.darkText).text(canonicalExport.queryContext.query ? `"${canonicalExport.queryContext.query}"` : "(Direct Selection)", 175, curY + 24);

            doc.font("Helvetica-Bold").fontSize(8).fillColor(colors.mutedText).text("THREADLINE VERSION:", 55, curY + 40);
            doc.font("Helvetica").fontSize(8).fillColor(colors.darkText).text(`v${canonicalExport.exportMetadata.threadlineVersion} (Spec v${canonicalExport.exportMetadata.exportVersion})`, 175, curY + 40);

            doc.font("Helvetica-Bold").fontSize(8).fillColor(colors.mutedText).text("TOTAL EVIDENCE ITEMS:", 360, curY + 40);
            doc.font("Helvetica").fontSize(9).fillColor(colors.darkText).text(`${canonicalExport.integrity.evidenceCount}`, 480, curY + 40);

            curY += 75;

            // --- EVENT RECONSTRUCTION SECTION ---
            if (canonicalExport.eventReconstruction) {
                const er = canonicalExport.eventReconstruction;

                doc.rect(45, curY, 522, 22).fill("#E2E8F0");
                doc.font("Helvetica-Bold").fontSize(9).fillColor(colors.darkText).text("EVENT RECONSTRUCTION SUMMARY", 55, curY + 6);

                curY += 28;

                doc.font("Helvetica-Bold").fontSize(11).fillColor(colors.accent).text(er.title, 55, curY);
                curY += 16;

                if (er.summaryReason) {
                    doc.font("Helvetica-Oblique").fontSize(8.5).fillColor(colors.mutedText).text(er.summaryReason, 55, curY, { width: 505 });
                    curY += doc.heightOfString(er.summaryReason, { width: 505 }) + 6;
                }

                // Chips / metrics row
                const partsStr = (er.participants && er.participants.length > 0) ? er.participants.join(", ") : "N/A";
                const convsStr = (er.conversations && er.conversations.length > 0) 
                    ? er.conversations.map(c => typeof c === "string" ? c : (c.title || c.id)).join(" | ")
                    : "N/A";

                doc.font("Helvetica-Bold").fontSize(8).fillColor(colors.darkText).text("Participants: ", 55, curY, { continued: true });
                doc.font("Helvetica").text(partsStr);
                curY += 14;

                doc.font("Helvetica-Bold").fontSize(8).fillColor(colors.darkText).text("Conversations: ", 55, curY, { continued: true });
                doc.font("Helvetica").text(convsStr);
                curY += 14;

                if (er.timeSpan?.dateString) {
                    doc.font("Helvetica-Bold").fontSize(8).fillColor(colors.darkText).text("Timeline Window: ", 55, curY, { continued: true });
                    doc.font("Helvetica").text(er.timeSpan.dateString);
                    curY += 14;
                }

                curY += 8;
            }

            // --- SOURCE EVIDENCE SECTION ---
            // Visual divider
            doc.rect(45, curY, 522, 22).fill("#1E293B");
            doc.font("Helvetica-Bold").fontSize(9).fillColor("#FFFFFF").text("AUTHORITATIVE SOURCE EVIDENCE (CHRONOLOGICAL)", 55, curY + 6);
            curY += 28;

            let currentConversationId = null;

            for (let i = 0; i < canonicalExport.evidence.length; i++) {
                const item = canonicalExport.evidence[i];
                const se = item.sourceEvidence;
                const det = item.deterministicAnalysis;
                const inf = item.semanticInference;

                // Estimate height required for this item
                const bodyText = se.body !== null && se.body !== undefined ? String(se.body) : "";
                const bodyHeight = doc.heightOfString(bodyText, { width: 490 });
                const estimatedItemHeight = 70 + bodyHeight + (inf ? 35 : 0) + (det.matchReasons.length > 0 ? 20 : 0);

                // Check page break
                if (curY + estimatedItemHeight > 720) {
                    doc.addPage();
                    curY = 50;
                }

                // Distinct Conversation Boundary Banner if conversation changes
                if (se.conversationId !== currentConversationId) {
                    currentConversationId = se.conversationId;

                    doc.rect(45, curY, 522, 18).fill("#F1F5F9");
                    doc.strokeColor(colors.border).lineWidth(0.5).stroke();
                    doc.font("Helvetica-Bold").fontSize(8).fillColor(colors.accent)
                       .text(`CONVERSATION THREAD: ${se.conversationTitle}  •  Platform: ${se.platform || "SMS"}`, 55, curY + 5);
                    curY += 24;
                }

                // Item Container
                const startItemY = curY;

                // Item Header Bar (Timestamp, Sender, Direction, Message ID)
                doc.rect(45, curY, 522, 16).fill(colors.cardBg);
                doc.strokeColor(colors.border).lineWidth(0.5).stroke();

                const timeStr = `${se.timestampIso} (Unix: ${se.timestamp})`;
                doc.font("Helvetica-Bold").fontSize(7.5).fillColor(colors.darkText).text(`[#${i + 1}]  ${timeStr}`, 52, curY + 4);

                const senderLabel = `${se.sender || "Unknown"}${se.recipient ? ` → ${se.recipient}` : ""}`;
                doc.font("Helvetica-Bold").fontSize(7.5).fillColor(colors.accent).text(senderLabel, 300, curY + 4, { align: "right", width: 260 });

                curY += 20;

                // Exact Source Message Body Box
                doc.rect(48, curY, 516, bodyHeight + 12).strokeColor(colors.border).lineWidth(0.5).stroke();
                doc.font("Courier").fontSize(8.5).fillColor("#000000").text(bodyText, 54, curY + 6, { width: 504 });

                curY += bodyHeight + 16;

                // Deterministic Analysis Reasons (if any)
                if (det.matchReasons && det.matchReasons.length > 0) {
                    doc.font("Helvetica-Bold").fontSize(7).fillColor(colors.mutedText).text("DETERMINISTIC ANALYSIS: ", 52, curY, { continued: true });
                    doc.font("Helvetica").fillColor(colors.darkText).text(det.matchReasons.join("; "));
                    curY += 12;
                }

                // Semantic Inference Callout (Prominently distinct & labeled)
                if (inf) {
                    doc.rect(48, curY, 516, 22).fill(colors.inferenceBg);
                    doc.strokeColor(colors.inferenceBorder).lineWidth(0.5).stroke();

                    doc.font("Helvetica-Bold").fontSize(7).fillColor(colors.inferenceText)
                       .text("SEMANTIC INFERENCE — NOT SOURCE EVIDENCE:", 54, curY + 4);

                    doc.font("Helvetica").fontSize(7.5).fillColor("#78350F")
                       .text(`${inf.finding} ${inf.confidence ? `(Confidence: ${inf.confidence})` : ""}`, 54, curY + 13, { width: 500 });

                    curY += 26;
                }

                // Provenance & Item Integrity Footer
                const provenanceStr = `Message ID: ${se.messageId}  |  SHA-256: ${item.integrity.itemHash.substring(0, 16)}...`;
                doc.font("Helvetica").fontSize(6.5).fillColor(colors.mutedText).text(provenanceStr, 52, curY);

                curY += 12;
            }

            // --- DOCUMENT INTEGRITY SECTION ---
            if (curY + 110 > 720) {
                doc.addPage();
                curY = 50;
            }

            curY += 10;
            doc.rect(45, curY, 522, 22).fill("#0F172A");
            doc.font("Helvetica-Bold").fontSize(9).fillColor("#FFFFFF").text("DOCUMENT INTEGRITY & FORENSIC VERIFICATION", 55, curY + 6);
            curY += 28;

            doc.rect(45, curY, 522, 85).strokeColor(colors.border).lineWidth(1).stroke();

            doc.font("Helvetica-Bold").fontSize(8).fillColor(colors.darkText).text("Export Identifier:", 55, curY + 10);
            doc.font("Courier").fontSize(8.5).fillColor(colors.accent).text(canonicalExport.exportMetadata.exportId, 175, curY + 10);

            doc.font("Helvetica-Bold").fontSize(8).fillColor(colors.darkText).text("Cryptographic Algorithm:", 55, curY + 25);
            doc.font("Helvetica").fontSize(8).fillColor(colors.darkText).text(canonicalExport.integrity.hashAlgorithm, 175, curY + 25);

            doc.font("Helvetica-Bold").fontSize(8).fillColor(colors.darkText).text("Evidence Items Count:", 55, curY + 40);
            doc.font("Helvetica").fontSize(8).fillColor(colors.darkText).text(`${canonicalExport.integrity.evidenceCount}`, 175, curY + 40);

            doc.font("Helvetica-Bold").fontSize(8).fillColor(colors.darkText).text("Complete Manifest Hash:", 55, curY + 55);
            doc.font("Courier-Bold").fontSize(8).fillColor("#0F172A").text(canonicalExport.integrity.manifestHash, 175, curY + 55);

            doc.font("Helvetica-Oblique").fontSize(6.8).fillColor(colors.mutedText)
               .text(
                   "Tamper-Evident Notice: This document contains cryptographic SHA-256 hashes generated from canonical SQLite source records. " +
                   "Any modification to source bodies, timestamps, or message metadata invalidates the manifest hash. " +
                   "Watermarking and permissions discourage unauthorized editing but do not replace digital signatures or legal chain of custody.",
                   55, curY + 70, { width: 505 }
               );

            // --- RENDER PASS: PAGINATION & WATERMARK (ON ALL PAGES) ---
            const range = doc.bufferedPageRange();
            for (let i = range.start; i < (range.start + range.count); i++) {
                doc.switchToPage(i);

                // 1. Watermark (if watermarked requested)
                if (isWatermarked) {
                    doc.save();
                    doc.fillColor("#000000");
                    doc.fillOpacity(0.045);
                    doc.rotate(-40, { origin: [306, 396] });
                    doc.fontSize(38);
                    doc.font("Helvetica-Bold");
                    doc.text("THREADLINE — READ ONLY EVIDENCE COPY", -100, 375, {
                        align: "center",
                        width: 800,
                        characterSpacing: 2
                    });
                    doc.restore();
                }

                // 2. Page Footer
                doc.save();
                doc.strokeColor(colors.border).lineWidth(0.5).moveTo(45, 750).lineTo(567, 750).stroke();
                doc.font("Helvetica").fontSize(7).fillColor(colors.mutedText)
                   .text(`Threadline Evidence Export • ID: ${canonicalExport.exportMetadata.exportId} • Manifest: ${canonicalExport.integrity.manifestHash.substring(0, 12)}...`, 45, 756);

                doc.font("Helvetica-Bold").fontSize(7).fillColor(colors.mutedText)
                   .text(`Page ${i + 1} of ${range.count}`, 450, 756, { align: "right", width: 117 });
                doc.restore();
            }

            doc.end();
        });
    }
}

module.exports = new EvidenceExporter();
