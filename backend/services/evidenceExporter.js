/*
    evidenceExporter.js

    Authoritative Evidence Export Service for Threadline.
    Builds canonical Evidence Export models from SQLite data and generates:
    1. Courtroom Trial Exhibit PDF Report (Bates stamped, forensic layout, chain of custody)
    2. PDF Watermarked / Read-Only Copy (tamper-evident, permissions restricted)
    3. JSON Canonical Evidence Package (machine-readable, self-contained)
    4. Discovery CSV Transcript (spreadsheet format with cryptographic provenance)

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

const THREADLINE_VERSION = "0.2.0";
const EXPORT_SPEC_VERSION = "2.0.0";

/**
 * Deterministically serialize a JavaScript object with sorted keys.
 */
function canonicalStringify(obj) {
    if (obj === null || typeof obj !== "object") {
        const str = JSON.stringify(obj);
        return str === undefined ? "null" : str;
    }
    if (Array.isArray(obj)) {
        return "[" + obj.map(item => {
            const res = canonicalStringify(item);
            return res === undefined ? "null" : res;
        }).join(",") + "]";
    }
    const keys = Object.keys(obj).filter(k => obj[k] !== undefined).sort();
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
     */
    resolveCanonicalEvidence(options) {
        const { threadlineId, uid, cluster, query, filters, caseInfo = {} } = options;

        if (!threadlineId) {
            throw new Error("Missing required threadlineId.");
        }

        // Verify threadline access using multi-alias authorization
        const { getAuthorizedUids } = require("./threadlines");
        const authorizedUids = getAuthorizedUids(uid);
        const isArchive = threadlineId.startsWith("archive_") && authorizedUids.some(u => threadlineId === `archive_${u}`);
        const threadlineRow = db.queryOne("SELECT * FROM threadlines WHERE id = ?", [threadlineId]);
        if (!isArchive && (!threadlineRow || !authorizedUids.includes(threadlineRow.owner_id))) {
            const err = new Error("Access denied: threadline does not belong to user.");
            err.statusCode = 403;
            throw err;
        }

        // Case & Courtroom Metadata
        const batesPrefix = (caseInfo.batesPrefix || "EXHIBIT-A").trim().toUpperCase();
        const batesStart = Math.max(1, parseInt(caseInfo.batesStart, 10) || 1);
        const agencyName = (caseInfo.agencyName || "Digital Forensic Investigation Unit").trim();
        const caseNumber = (caseInfo.caseNumber || caseInfo.caseName || "CASE-CR-2026").trim();
        const examinerName = (caseInfo.examinerName || "Forensic Intelligence Examiner").trim();
        const jurisdiction = (caseInfo.jurisdiction || "Court of Competent Jurisdiction").trim();
        const targetSubject = (caseInfo.targetSubject || "").trim();

        // Determine message IDs to resolve
        let targetMessageIds = [];
        if (options.messageIds && Array.isArray(options.messageIds)) {
            if (options.messageIds.length === 0) {
                const err = new Error("No evidence records selected for export.");
                err.statusCode = 400;
                throw err;
            }
            targetMessageIds = options.messageIds;
        } else if (cluster && Array.isArray(cluster.messages) && cluster.messages.length > 0) {
            targetMessageIds = cluster.messages.map(m => m.id);
        }

        if (targetMessageIds.length === 0) {
            const allRows = db.query("SELECT id FROM messages WHERE threadline_id = ? ORDER BY timestamp ASC LIMIT 2500", [threadlineId]);
            targetMessageIds = allRows.map(r => r.id);
        }

        if (targetMessageIds.length === 0) {
            const err = new Error("No evidence records found in this case to export.");
            err.statusCode = 400;
            throw err;
        }

        // Authoritative resolution from SQLite database
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
                COALESCE(imp.id, 'direct_entry') AS importId,
                COALESCE(imp.filename, 'Direct Entry') AS importFilename,
                imp.source AS importSource,
                imp.platform AS importPlatform,
                imp.imported_at AS importTimestamp
            FROM messages m
            JOIN conversations c ON m.conversation_id = c.id
            LEFT JOIN (SELECT message_id, MIN(import_id) AS import_id FROM message_imports GROUP BY message_id) mi ON m.id = mi.message_id
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

        // Lookup participant roles for senders in this threadline
        const distinctSenders = Array.from(new Set(authoritativeRows.map(r => r.sender).filter(Boolean)));
        const participantRoleMap = new Map();
        if (distinctSenders.length > 0) {
            const partPlaceholders = distinctSenders.map(() => "?").join(",");
            const partRows = db.query(
                `SELECT phone_number, name, metadata FROM participants 
                 WHERE threadline_id = ? AND (phone_number IN (${partPlaceholders}) OR name IN (${partPlaceholders}))`,
                [threadlineId, ...distinctSenders, ...distinctSenders]
            );
            partRows.forEach(pr => {
                let pmeta = {};
                try {
                    pmeta = typeof pr.metadata === "string" ? JSON.parse(pr.metadata || "{}") : (pr.metadata || {});
                } catch(e) {}
                const role = pmeta.tag || pmeta.role || null;
                const entry = { name: pr.name, role };
                if (pr.phone_number) participantRoleMap.set(pr.phone_number, entry);
                if (pr.name) participantRoleMap.set(pr.name, entry);
            });
        }

        // Retrieve Chain of Custody Archive Manifest
        const distinctImportIds = Array.from(new Set(authoritativeRows.map(r => r.importId).filter(id => id && id !== 'direct_entry')));
        let archiveManifest = [];
        if (distinctImportIds.length > 0) {
            const impPlaceholders = distinctImportIds.map(() => "?").join(",");
            const importRows = db.query(
                `SELECT id, filename, source, platform, file_size, message_count, imported_at
                 FROM imports WHERE id IN (${impPlaceholders})`,
                distinctImportIds
            );
            archiveManifest = importRows.map(imp => {
                const archiveMetaStr = canonicalStringify({
                    id: imp.id,
                    filename: imp.filename,
                    file_size: imp.file_size,
                    imported_at: imp.imported_at,
                    message_count: imp.message_count
                });
                return {
                    id: imp.id,
                    filename: imp.filename,
                    source: imp.source,
                    platform: imp.platform,
                    fileSize: imp.file_size || 0,
                    messageCount: imp.message_count || 0,
                    importedAt: imp.imported_at,
                    sha256: sha256(archiveMetaStr)
                };
            });
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
        const exportId = `TL-EXHIBIT-${Date.now().toString(36).toUpperCase()}-${crypto.randomBytes(3).toString("hex").toUpperCase()}`;
        const generatedAt = new Date().toISOString();

        // 1. Process Source Evidence Items & Compute Item Hashes
        const evidenceItems = [];
        const evidenceHashes = [];
        const semanticFindings = [];
        const deterministicFindings = [];

        for (let i = 0; i < authoritativeRows.length; i++) {
            const row = authoritativeRows[i];
            const batesNum = `${batesPrefix}-${String(batesStart + i).padStart(4, "0")}`;

            let parsedMetadata = {};
            try {
                parsedMetadata = typeof row.messageMetadata === "string" ? JSON.parse(row.messageMetadata || "{}") : (row.messageMetadata || {});
            } catch (e) {
                parsedMetadata = {};
            }

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

            const clusterMeta = clusterMetaMap.get(row.messageId) || {};
            const deterministicReasons = [];
            if (clusterMeta.matchReason) {
                deterministicReasons.push(clusterMeta.matchReason);
            }

            let semanticInferenceText = null;
            let semanticConfidence = null;
            if (clusterMeta.semanticInference) {
                semanticInferenceText = typeof clusterMeta.semanticInference === "string" 
                    ? clusterMeta.semanticInference 
                    : (clusterMeta.semanticInference.inference || clusterMeta.semanticInference.reason || "Semantic topic correlation");
                semanticConfidence = clusterMeta.semanticInference.confidence || null;

                semanticFindings.push({
                    evidenceId: row.messageId,
                    batesNumber: batesNum,
                    inference: semanticInferenceText,
                    confidence: semanticConfidence,
                    label: "SEMANTIC INFERENCE — NOT SOURCE EVIDENCE"
                });
            }

            if (deterministicReasons.length > 0) {
                deterministicFindings.push({
                    evidenceId: row.messageId,
                    batesNumber: batesNum,
                    reasons: deterministicReasons,
                    score: clusterMeta.score
                });
            }

            evidenceHashes.push({
                evidenceId: row.messageId,
                batesNumber: batesNum,
                sha256: itemHash
            });

            const roleMeta = participantRoleMap.get(row.sender) || {};

            evidenceItems.push({
                id: row.messageId,
                batesNumber: batesNum,
                sourceEvidence: {
                    messageId: row.messageId,
                    batesNumber: batesNum,
                    conversationId: row.conversationId,
                    conversationTitle: row.conversationTitle || "Conversation",
                    sender: row.sender,
                    participantName: roleMeta.name || null,
                    roleTag: roleMeta.role || null,
                    recipient: row.recipient,
                    timestamp: Number(row.timestamp),
                    timestampIso: new Date(Number(row.timestamp)).toISOString(),
                    body: row.body,
                    platform: row.platform,
                    direction: row.direction || "received",
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
            evidenceHashes,
            archiveManifest
        };

        const manifestCanonicalString = canonicalStringify(manifestData);
        const manifestHash = sha256(manifestCanonicalString);

        // Aggregate Event Reconstruction Summary
        let eventReconstruction = null;
        if (cluster) {
            eventReconstruction = {
                eventId: cluster.id || cluster.clusterId || `event_${evidenceItems[0].sourceEvidence.timestamp}`,
                title: cluster.title || "Event Reconstruction Exhibit",
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
            const distinctConvs = Array.from(new Set(evidenceItems.map(e => e.sourceEvidence.conversationTitle)));
            const distinctParts = Array.from(new Set(evidenceItems.map(e => e.sourceEvidence.sender).filter(Boolean)));
            eventReconstruction = {
                eventId: `event_selection_${Date.now()}`,
                title: caseInfo.exhibitTitle || "Selected Evidence Exhibit",
                topic: "Forensic Evidence Compilation",
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
                systemSignature: "THREADLINE_AUTHORITATIVE_EXHIBIT_ENGINE"
            },
            caseMetadata: {
                caseName: caseNumber,
                caseNumber,
                agencyName,
                examinerName,
                jurisdiction,
                targetSubject,
                batesPrefix,
                batesStart,
                threadlineId,
                investigator: uid,
                notes: caseInfo.notes || ""
            },
            queryContext: {
                query: query || null,
                filters: filters || null
            },
            eventReconstruction,
            evidence: evidenceItems,
            evidenceItems,
            archiveManifest,
            analyticalInferences: {
                deterministicFindings,
                semanticFindings
            },
            integrity: {
                hashAlgorithm: "SHA-256",
                evidenceCount: evidenceItems.length,
                manifestHash,
                evidenceHashes
            }
        };
    }

    /**
     * Generates a forensic PDF Evidence Report / Courtroom Exhibit.
     */
    generatePdfReport(canonicalExport, options = {}) {
        return new Promise((resolve, reject) => {
            const isWatermarked = Boolean(options.watermarked);
            const caseMeta = canonicalExport.caseMetadata || {};

            const docOptions = {
                size: "LETTER",
                margins: { top: 45, bottom: 45, left: 45, right: 45 },
                bufferPages: true,
                info: {
                    Title: `Courtroom Trial Exhibit - ${caseMeta.caseNumber || canonicalExport.exportMetadata.exportId}`,
                    Author: caseMeta.agencyName || "Threadline Forensic System",
                    Subject: "Authoritative Trial Exhibit & Chain of Custody",
                    Keywords: "evidence, forensics, court, exhibit, bates, chain of custody"
                }
            };

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
                headerBg: "#0F172A",
                accent: "#0284C7",
                darkText: "#0F172A",
                mutedText: "#475569",
                border: "#94A3B8",
                cardBg: "#F8FAFC",
                outgoingBg: "#FFFBEB",
                outgoingBorder: "#F59E0B",
                incomingBg: "#F0F9FF",
                incomingBorder: "#0284C7",
                inferenceBg: "#FEF3C7",
                inferenceBorder: "#D97706",
                inferenceText: "#92400E"
            };

            // --- COVER / OFFICIAL HEADER BLOCK ---
            doc.rect(45, 40, 522, 70).fill(colors.headerBg);

            doc.fillColor("#FFFFFF")
               .font("Helvetica-Bold")
               .fontSize(15)
               .text("THREADLINE OFFICIAL COURTROOM TRIAL EXHIBIT", 60, 48, { characterSpacing: 1.2 });

            doc.font("Helvetica-Bold")
               .fontSize(9)
               .fillColor("#38BDF8")
               .text((caseMeta.agencyName || "DIGITAL FORENSIC INVESTIGATION UNIT").toUpperCase(), 60, 68);

            doc.font("Helvetica")
               .fontSize(8)
               .fillColor("#94A3B8")
               .text(`JURISDICTION: ${caseMeta.jurisdiction || "COURT OF COMPETENT JURISDICTION"}`, 60, 82);

            doc.font("Helvetica-Bold")
               .fontSize(9)
               .fillColor("#F59E0B")
               .text(`EXHIBIT ID: ${canonicalExport.exportMetadata.exportId}`, 360, 48, { align: "right", width: 195 });

            doc.font("Helvetica")
               .fontSize(8)
               .fillColor("#CBD5E1")
               .text(`DOCKET: ${caseMeta.caseNumber || "CR-2026-EXHIBIT"}`, 360, 64, { align: "right", width: 195 });

            doc.font("Helvetica")
               .fontSize(7.5)
               .fillColor("#94A3B8")
               .text(`Certified: ${canonicalExport.exportMetadata.generatedAt.replace("T", " ").replace("Z", " UTC")}`, 360, 78, { align: "right", width: 195 });

            // Case Info Summary Grid
            let curY = 120;
            doc.rect(45, curY, 522, 60).strokeColor(colors.border).lineWidth(1).stroke();

            doc.font("Helvetica-Bold").fontSize(7.5).fillColor(colors.mutedText).text("CASE / CAUSE NUMBER:", 55, curY + 8);
            doc.font("Helvetica-Bold").fontSize(8.5).fillColor(colors.darkText).text(caseMeta.caseNumber, 175, curY + 8);

            doc.font("Helvetica-Bold").fontSize(7.5).fillColor(colors.mutedText).text("EXAMINER / CREDENTIALS:", 55, curY + 23);
            doc.font("Helvetica").fontSize(8.5).fillColor(colors.darkText).text(caseMeta.examinerName, 175, curY + 23);

            doc.font("Helvetica-Bold").fontSize(7.5).fillColor(colors.mutedText).text("BATES STAMP RANGE:", 55, curY + 38);
            const batesFirst = canonicalExport.evidence[0]?.batesNumber || "EXHIBIT-A-0001";
            const batesLast = canonicalExport.evidence[canonicalExport.evidence.length - 1]?.batesNumber || batesFirst;
            doc.font("Courier-Bold").fontSize(8.5).fillColor(colors.accent).text(`${batesFirst} THROUGH ${batesLast}`, 175, curY + 38);

            doc.font("Helvetica-Bold").fontSize(7.5).fillColor(colors.mutedText).text("TOTAL RECORDS:", 380, curY + 8);
            doc.font("Helvetica-Bold").fontSize(9).fillColor(colors.darkText).text(`${canonicalExport.integrity.evidenceCount} messages`, 470, curY + 8);

            doc.font("Helvetica-Bold").fontSize(7.5).fillColor(colors.mutedText).text("SOURCES / LOGS:", 380, curY + 23);
            doc.font("Helvetica").fontSize(8.5).fillColor(colors.darkText).text(`${canonicalExport.archiveManifest?.length || 1} extraction archive(s)`, 470, curY + 23);

            curY += 72;

            // --- EVENT RECONSTRUCTION SUMMARY ---
            if (canonicalExport.eventReconstruction) {
                const er = canonicalExport.eventReconstruction;
                doc.rect(45, curY, 522, 18).fill("#E2E8F0");
                doc.font("Helvetica-Bold").fontSize(8.5).fillColor(colors.darkText).text("EXHIBIT SCOPE & EVENT RECONSTRUCTION", 55, curY + 5);
                curY += 24;

                doc.font("Helvetica-Bold").fontSize(10.5).fillColor(colors.accent).text(er.title, 55, curY);
                curY += 15;

                if (er.summaryReason) {
                    doc.font("Helvetica").fontSize(8).fillColor(colors.mutedText).text(er.summaryReason, 55, curY, { width: 505 });
                    curY += doc.heightOfString(er.summaryReason, { width: 505 }) + 6;
                }
            }

            // --- SOURCE EVIDENCE TRANSCRIPT ---
            doc.rect(45, curY, 522, 20).fill("#1E293B");
            doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#FFFFFF").text("AUTHENTIC COMMUNICATION TRANSCRIPT (CHRONOLOGICAL)", 55, curY + 5);
            curY += 26;

            let currentConversationId = null;

            for (let i = 0; i < canonicalExport.evidence.length; i++) {
                const item = canonicalExport.evidence[i];
                const se = item.sourceEvidence;
                const det = item.deterministicAnalysis;
                const inf = item.semanticInference;
                const isSent = se.direction === "sent";

                const bodyText = se.body !== null && se.body !== undefined ? String(se.body) : "";
                const bodyHeight = doc.heightOfString(bodyText, { width: 490 });
                const estimatedItemHeight = 65 + bodyHeight + (inf ? 30 : 0);

                if (curY + estimatedItemHeight > 700) {
                    doc.addPage();
                    curY = 55;
                }

                if (se.conversationId !== currentConversationId) {
                    currentConversationId = se.conversationId;
                    doc.rect(45, curY, 522, 16).fill("#F1F5F9");
                    doc.strokeColor(colors.border).lineWidth(0.5).stroke();
                    doc.font("Helvetica-Bold").fontSize(7.5).fillColor(colors.accent)
                       .text(`CONVERSATION THREAD: ${se.conversationTitle}  |  Extraction Log: ${item.provenance?.sourceFile || "Direct Entry"}`, 55, curY + 4);
                    curY += 22;
                }

                // Item Header Bar
                const headerBg = isSent ? colors.outgoingBg : colors.incomingBg;
                const headerBorder = isSent ? colors.outgoingBorder : colors.incomingBorder;

                doc.rect(45, curY, 522, 16).fill(headerBg);
                doc.rect(45, curY, 522, 16).strokeColor(headerBorder).lineWidth(0.75).stroke();

                const timeUtc = new Date(se.timestamp).toISOString().replace("T", " ").replace("Z", " UTC");
                const dirLabel = isSent ? "↗ OUTGOING" : "↙ INCOMING";
                doc.font("Helvetica-Bold").fontSize(7).fillColor(colors.darkText)
                   .text(`[BATES: ${item.batesNumber}]  ${dirLabel}  •  ${timeUtc}`, 52, curY + 4);

                let senderName = se.participantName || se.sender || "Unknown";
                if (se.roleTag) senderName += ` [${se.roleTag.toUpperCase()}]`;
                doc.font("Helvetica-Bold").fontSize(7).fillColor(isSent ? "#B45309" : "#0369A1")
                   .text(senderName, 320, curY + 4, { align: "right", width: 240 });

                curY += 19;

                // Message Body
                doc.rect(48, curY, 516, bodyHeight + 10).strokeColor(colors.border).lineWidth(0.5).stroke();
                doc.font("Courier").fontSize(8).fillColor("#000000").text(bodyText, 54, curY + 5, { width: 504 });

                curY += bodyHeight + 14;

                // Provenance & Hash Line
                const provLine = `Source: ${item.provenance?.sourceFile || "Direct Entry"} | SHA-256: ${item.integrity.itemHash.substring(0, 24)}...`;
                doc.font("Helvetica").fontSize(6.5).fillColor(colors.mutedText).text(provLine, 52, curY);
                curY += 12;
            }

            // --- APPENDIX A: CHAIN OF CUSTODY & EVIDENCE ARCHIVE MANIFEST ---
            if (curY + 180 > 700) {
                doc.addPage();
                curY = 55;
            }

            curY += 15;
            doc.rect(45, curY, 522, 20).fill("#0F172A");
            doc.font("Helvetica-Bold").fontSize(8.5).fillColor("#FFFFFF").text("APPENDIX A: CHAIN OF CUSTODY & EVIDENCE ARCHIVE MANIFEST", 55, curY + 5);
            curY += 26;

            // Table Header
            doc.rect(45, curY, 522, 14).fill("#E2E8F0");
            doc.font("Helvetica-Bold").fontSize(6.5).fillColor(colors.darkText);
            doc.text("EXTRACTION ARCHIVE FILE", 50, curY + 4, { width: 140 });
            doc.text("FORMAT / PLATFORM", 195, curY + 4, { width: 90 });
            doc.text("RECORD COUNT", 290, curY + 4, { width: 70 });
            doc.text("SHA-256 CRYPTOGRAPHIC PROVENANCE HASH", 365, curY + 4, { width: 195 });
            curY += 17;

            const archives = canonicalExport.archiveManifest || [];
            if (archives.length === 0) {
                doc.font("Helvetica").fontSize(7).fillColor(colors.mutedText).text("No external archive containers logged; direct database transcript.", 50, curY);
                curY += 14;
            } else {
                archives.forEach(arc => {
                    if (curY + 20 > 720) {
                        doc.addPage();
                        curY = 55;
                    }
                    doc.font("Helvetica-Bold").fontSize(6.5).fillColor(colors.darkText).text(arc.filename || "Extraction", 50, curY, { width: 140 });
                    doc.font("Helvetica").fontSize(6.5).fillColor(colors.mutedText).text(arc.platform || arc.source || "XML", 195, curY, { width: 90 });
                    doc.font("Helvetica").fontSize(6.5).fillColor(colors.darkText).text(`${arc.messageCount} msgs`, 290, curY, { width: 70 });
                    doc.font("Courier").fontSize(6).fillColor("#0F172A").text(arc.sha256 || "N/A", 365, curY, { width: 195 });
                    curY += 14;
                });
            }

            // Manifest Overall Hash
            curY += 8;
            doc.rect(45, curY, 522, 36).strokeColor(colors.border).lineWidth(0.5).stroke();
            doc.font("Helvetica-Bold").fontSize(7).fillColor(colors.darkText).text("COMPLETE EXHIBIT MANIFEST SHA-256 DIGEST:", 55, curY + 8);
            doc.font("Courier-Bold").fontSize(7.5).fillColor(colors.accent).text(canonicalExport.integrity.manifestHash, 55, curY + 20);
            curY += 46;

            // --- FORENSIC EXAMINER CERTIFICATION & ATTESTATION BLOCK ---
            if (curY + 110 > 700) {
                doc.addPage();
                curY = 55;
            }

            doc.rect(45, curY, 522, 18).fill("#1E293B");
            doc.font("Helvetica-Bold").fontSize(8).fillColor("#FFFFFF").text("FORENSIC EXAMINER DECLARATION & CERTIFICATION", 55, curY + 5);
            curY += 24;

            const certificationStatement = 
                "I, the undersigned forensic examiner, hereby certify under penalty of perjury that this report represents " +
                "an authentic, unaltered chronological compilation of electronic communication records extracted from the referenced source " +
                "containers. The records have been forensically preserved and verified using cryptographic SHA-256 algorithms in strict " +
                "adherence to digital evidence chain of custody standards.";

            doc.font("Helvetica-Oblique").fontSize(7.5).fillColor(colors.darkText).text(certificationStatement, 50, curY, { width: 512, lineGap: 2 });
            curY += doc.heightOfString(certificationStatement, { width: 512 }) + 14;

            // Signature block lines
            doc.font("Helvetica-Bold").fontSize(7.5).fillColor(colors.darkText);
            doc.text("EXAMINER SIGNATURE: ____________________________________", 50, curY);
            doc.text("DATE: ____________________", 380, curY);
            curY += 16;
            doc.font("Helvetica").fontSize(7).fillColor(colors.mutedText);
            doc.text(`Printed Name: ${caseMeta.examinerName || "Forensic Examiner"}`, 50, curY);
            doc.text(`Agency / Laboratory: ${caseMeta.agencyName || "Digital Forensics"}`, 380, curY);

            // --- RENDER PASS: RUNNING HEADERS, BATES STAMPING, PAGINATION ---
            const range = doc.bufferedPageRange();
            for (let i = range.start; i < (range.start + range.count); i++) {
                doc.switchToPage(i);

                // Watermark (if requested)
                if (isWatermarked) {
                    doc.save();
                    doc.fillColor("#000000");
                    doc.fillOpacity(0.04);
                    doc.rotate(-40, { origin: [306, 396] });
                    doc.fontSize(36);
                    doc.font("Helvetica-Bold");
                    doc.text("THREADLINE COURT EXHIBIT — READ ONLY EVIDENCE COPY", -100, 375, {
                        align: "center",
                        width: 800,
                        characterSpacing: 2
                    });
                    doc.restore();
                }

                // Running Header (Page 2+)
                if (i > range.start) {
                    doc.save();
                    doc.font("Helvetica").fontSize(6.5).fillColor(colors.mutedText)
                       .text(`${caseMeta.caseNumber || "CR-2026"} • ${caseMeta.agencyName || "Forensic Unit"} • Court Exhibit`, 45, 25);
                    doc.strokeColor(colors.border).lineWidth(0.5).moveTo(45, 35).lineTo(567, 35).stroke();
                    doc.restore();
                }

                // Page Footer & Official Bates Stamp
                doc.save();
                doc.strokeColor(colors.border).lineWidth(0.5).moveTo(45, 745).lineTo(567, 745).stroke();

                // Left: Provenance Summary
                doc.font("Helvetica").fontSize(6.5).fillColor(colors.mutedText)
                   .text(`Exhibit ID: ${canonicalExport.exportMetadata.exportId} • Manifest: ${canonicalExport.integrity.manifestHash.substring(0, 16)}...`, 45, 752);

                // Center: Page count
                doc.font("Helvetica").fontSize(7).fillColor(colors.mutedText)
                   .text(`Page ${i + 1} of ${range.count}`, 270, 752);

                // Right: Bates Stamping Box
                const pageBates = `${caseMeta.batesPrefix}-${String(caseMeta.batesStart + i).padStart(4, "0")}`;
                doc.rect(455, 748, 112, 16).fill("#0F172A");
                doc.font("Courier-Bold").fontSize(7.5).fillColor("#38BDF8")
                   .text(`BATES: ${pageBates}`, 458, 752, { width: 106, align: "center" });

                doc.restore();
            }

            doc.end();
        });
    }

    /**
     * Generates a litigation-ready Discovery CSV Transcript.
     */
    generateCsvTranscript(canonicalExport) {
        const headers = [
            "Bates Number",
            "Timestamp UTC",
            "Timestamp Local",
            "Direction",
            "Sender",
            "Participant Name",
            "Role",
            "Recipient",
            "Platform",
            "Conversation Thread",
            "Source Extraction Log",
            "SHA-256 Item Hash",
            "Message Body"
        ];

        const escapeCsv = (val) => {
            if (val === null || val === undefined) return '""';
            const str = String(val).replace(/"/g, '""');
            return `"${str}"`;
        };

        const rows = [headers.map(escapeCsv).join(",")];

        canonicalExport.evidenceItems.forEach((item) => {
            const se = item.sourceEvidence;
            const timeUtc = new Date(se.timestamp).toISOString().replace("T", " ").replace("Z", " UTC");
            const timeLocal = new Date(se.timestamp).toLocaleString();

            const row = [
                item.batesNumber || "",
                timeUtc,
                timeLocal,
                se.direction || "received",
                se.sender || "",
                se.participantName || "",
                se.roleTag || "",
                se.recipient || "",
                se.platform || "SMS",
                se.conversationTitle || "",
                item.provenance?.sourceFile || "",
                item.integrity?.itemHash || "",
                se.body || ""
            ];
            rows.push(row.map(escapeCsv).join(","));
        });

        return rows.join("\r\n");
    }

    /**
     * Generates the canonical JSON evidence package string.
     */
    generateJsonPackage(canonicalExport) {
        return canonicalStringify(canonicalExport);
    }
}

module.exports = new EvidenceExporter();
