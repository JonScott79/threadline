/*
    export.js

    Evidence Export API router for Threadline.
    Resolves authoritative evidence for a Threadline and generates:
    - JSON Evidence Package
    - PDF Evidence Report
    - PDF Watermarked / Read-Only Copy

    Endpoint:
    POST /api/threadlines/:id/export
*/

const express = require("express");
const evidenceExporter = require("../services/evidenceExporter");

const router = express.Router({ mergeParams: true });

/**
 * POST /api/threadlines/:id/export
 * 
 * Body parameters:
 * - format: 'json' | 'pdf' | 'watermarked_pdf' (default: 'json')
 * - cluster: EventCluster object (optional)
 * - messageIds: Array of string message IDs (optional)
 * - query: Search query (optional)
 * - filters: Search filters (optional)
 * - caseInfo: Case metadata (optional)
 */
router.post("/", async (request, response) => {
    try {
        const threadlineId = request.params.id;
        const uid = request.uid;
        const { format = "json", cluster, messageIds, query, filters, caseInfo } = request.body || {};

        if (!threadlineId) {
            return response.status(400).json({
                status: "error",
                message: "Missing threadline ID."
            });
        }

        // Build canonical export representation from authoritative SQLite store
        const canonicalExport = evidenceExporter.resolveCanonicalEvidence({
            threadlineId,
            uid,
            cluster,
            messageIds,
            query,
            filters,
            caseInfo
        });

        const safeExportId = canonicalExport.exportMetadata.exportId;

        if (format === "json") {
            const jsonOutput = evidenceExporter.generateJsonPackage(canonicalExport);
            response.setHeader("Content-Type", "application/json; charset=utf-8");
            response.setHeader("Content-Disposition", `attachment; filename="${safeExportId}.json"`);
            return response.send(jsonOutput);
        } else if (format === "pdf") {
            const pdfBuffer = await evidenceExporter.generatePdfReport(canonicalExport, { watermarked: false });
            response.setHeader("Content-Type", "application/pdf");
            response.setHeader("Content-Disposition", `attachment; filename="${safeExportId}.pdf"`);
            return response.send(pdfBuffer);
        } else if (format === "watermarked_pdf") {
            const pdfBuffer = await evidenceExporter.generatePdfReport(canonicalExport, { watermarked: true });
            response.setHeader("Content-Type", "application/pdf");
            response.setHeader("Content-Disposition", `attachment; filename="${safeExportId}_READONLY.pdf"`);
            return response.send(pdfBuffer);
        } else if (format === "csv") {
            const csvOutput = evidenceExporter.generateCsvTranscript(canonicalExport);
            response.setHeader("Content-Type", "text/csv; charset=utf-8");
            response.setHeader("Content-Disposition", `attachment; filename="${safeExportId}.csv"`);
            return response.send(csvOutput);
        } else {
            return response.status(400).json({
                status: "error",
                message: `Unsupported export format '${format}'. Valid options are: 'json', 'pdf', 'watermarked_pdf', 'csv'.`
            });
        }
    } catch (error) {
        console.error("Evidence export failed:", error);
        const status = error.statusCode || 500;
        return response.status(status).json({
            status: "error",
            message: error.message
        });
    }
});

module.exports = router;
