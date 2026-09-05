/*
    exportService.js

    Threadline — Forensic & Legal Export Service

    Responsibilities:
    - Export active timeline messages / segments into clean Excel (.xlsx) sheets
    - Generate formal, formatted Court & Police Investigation Exhibit documents with print/PDF styling
    - Include chronological metadata, Bates numbers, case information, and investigator notes
*/

import * as XLSX from 'xlsx';

/**
 * Format timestamp into standard readable UTC/Local strings
 */
function formatTimestamp(ts) {
    if (!ts) return 'N/A';
    const d = new Date(Number(ts));
    return d.toLocaleString('en-US', {
        timeZone: 'UTC',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: true
    }) + ' UTC';
}

/**
 * Export messages to an Excel (.xlsx) workbook
 */
export function exportToExcel({
    threadlineTitle = 'Threadline Investigation',
    messages = [],
    caseName = '',
    investigatorNotes = ''
}) {
    if (!messages || messages.length === 0) {
        alert('No messages selected to export.');
        return;
    }

    // 1. Prepare data rows
    const rows = messages.map((m, index) => ({
        'Item #': index + 1,
        'Timestamp (UTC)': formatTimestamp(m.timestamp),
        'Raw Timestamp (ms)': m.timestamp,
        'Sender': m.sender || m.senderName || (m.isSender ? 'Device Owner' : 'Participant'),
        'Direction': m.isSender ? 'OUTGOING' : 'INCOMING',
        'Recipient': m.recipient || m.conversationName || 'Direct Message',
        'Message Body': m.body || m.text || '',
        'Service / Source': m.service || 'SMS/MMS',
        'Message ID': m.id || ''
    }));

    // 2. Create worksheet
    const worksheet = XLSX.utils.json_to_sheet(rows);

    // Set column widths for readability
    worksheet['!cols'] = [
        { wch: 8 },   // Item #
        { wch: 24 },  // Timestamp
        { wch: 18 },  // Raw MS
        { wch: 20 },  // Sender
        { wch: 12 },  // Direction
        { wch: 20 },  // Recipient
        { wch: 60 },  // Message Body
        { wch: 16 },  // Source
        { wch: 20 }   // ID
    ];

    // 3. Create workbook and append sheet
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Timeline Evidence');

    // 4. Generate filename
    const safeTitle = (caseName || threadlineTitle).replace(/[^a-zA-Z0-9_-]/g, '_');
    const filename = `Threadline_Exhibit_${safeTitle}_${Date.now()}.xlsx`;

    // 5. Trigger download
    XLSX.writeFile(workbook, filename);
}

/**
 * Open a formatted, print-ready Court & Police Investigation Exhibit document
 */
export function exportToCourtPDF({
    threadlineTitle = 'Threadline Investigation',
    messages = [],
    caseName = '',
    docketNumber = '',
    parties = '',
    investigatorNotes = ''
}) {
    if (!messages || messages.length === 0) {
        alert('No messages selected to export.');
        return;
    }

    const printWindow = window.open('', '_blank');
    if (!printWindow) {
        alert('Please allow popups to generate the print-ready Court Exhibit.');
        return;
    }

    const firstDate = messages.length > 0 ? formatTimestamp(messages[0].timestamp) : 'N/A';
    const lastDate = messages.length > 0 ? formatTimestamp(messages[messages.length - 1].timestamp) : 'N/A';

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <title>Exhibit — ${caseName || threadlineTitle}</title>
    <style>
        @page {
            size: letter portrait;
            margin: 0.75in;
            @bottom-right {
                content: counter(page);
            }
        }
        body {
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
            color: #1a202c;
            background: #fff;
            margin: 0;
            padding: 24px;
            font-size: 11pt;
            line-height: 1.4;
        }
        .header-box {
            border: 2px solid #2d3748;
            padding: 16px 20px;
            margin-bottom: 24px;
            border-radius: 4px;
        }
        .header-title {
            font-size: 16pt;
            font-weight: 800;
            text-transform: uppercase;
            letter-spacing: 1px;
            margin: 0 0 8px 0;
            color: #1a202c;
            border-bottom: 1px solid #e2e8f0;
            padding-bottom: 8px;
        }
        .meta-grid {
            display: grid;
            grid-template-columns: 1fr 1fr;
            gap: 8px 24px;
            font-size: 10pt;
        }
        .meta-item strong {
            color: #4a5568;
            text-transform: uppercase;
            font-size: 8.5pt;
            display: inline-block;
            width: 120px;
        }
        .notes-section {
            background: #f7fafc;
            border-left: 4px solid #3182ce;
            padding: 12px 16px;
            margin-bottom: 24px;
            font-size: 10pt;
        }
        .notes-title {
            font-weight: 700;
            text-transform: uppercase;
            font-size: 8.5pt;
            color: #2b6cb0;
            margin-bottom: 4px;
        }
        .timeline-table {
            width: 100%;
            border-collapse: collapse;
            margin-top: 16px;
            font-size: 9.5pt;
        }
        .timeline-table th {
            background: #2d3748;
            color: #fff;
            text-align: left;
            padding: 8px 10px;
            font-weight: 600;
            text-transform: uppercase;
            font-size: 8pt;
            letter-spacing: 0.5px;
        }
        .timeline-table td {
            padding: 8px 10px;
            border-bottom: 1px solid #e2e8f0;
            vertical-align: top;
        }
        .timeline-table tr:nth-child(even) {
            background: #f8fafc;
        }
        .badge-out {
            color: #2b6cb0;
            font-weight: 700;
        }
        .badge-in {
            color: #2f855a;
            font-weight: 700;
        }
        .msg-text {
            word-break: break-word;
            white-space: pre-wrap;
        }
        .footer-bates {
            margin-top: 32px;
            text-align: right;
            font-size: 9pt;
            color: #718096;
            border-top: 1px solid #e2e8f0;
            padding-top: 8px;
        }
        .print-btn-bar {
            position: sticky;
            top: 0;
            background: #edf2f7;
            padding: 12px 24px;
            margin: -24px -24px 24px -24px;
            border-bottom: 1px solid #cbd5e0;
            display: flex;
            gap: 12px;
            align-items: center;
        }
        @media print {
            .print-btn-bar {
                display: none;
            }
        }
    </style>
</head>
<body>
    <div class="print-btn-bar">
        <button onclick="window.print()" style="background: #3182ce; color: #fff; border: none; padding: 8px 16px; font-weight: 700; border-radius: 4px; cursor: pointer;">🖨️ PRINT / SAVE AS PDF</button>
        <span style="color: #4a5568; font-size: 9pt;">Tip: Choose "Save as PDF" in your print dialog to save an official legal/police PDF exhibit.</span>
    </div>

    <div class="header-box">
        <div class="header-title">COMMUNICATION TIMELINE EXHIBIT</div>
        <div class="meta-grid">
            <div class="meta-item"><strong>Case / Title:</strong> ${caseName || threadlineTitle}</div>
            <div class="meta-item"><strong>Date Range:</strong> ${firstDate} — ${lastDate}</div>
            ${docketNumber ? `<div class="meta-item"><strong>Docket / File #:</strong> ${docketNumber}</div>` : ''}
            ${parties ? `<div class="meta-item"><strong>Parties / Subject:</strong> ${parties}</div>` : ''}
            <div class="meta-item"><strong>Total Records:</strong> ${messages.length} messages</div>
            <div class="meta-item"><strong>Generated Via:</strong> LANZAR Threadline</div>
        </div>
    </div>

    ${investigatorNotes ? `
    <div class="notes-section">
        <div class="notes-title">Investigator / Case Context Notes:</div>
        <div>${investigatorNotes.replace(/\n/g, '<br/>')}</div>
    </div>
    ` : ''}

    <table class="timeline-table">
        <thead>
            <tr>
                <th style="width: 45px;">#</th>
                <th style="width: 150px;">Timestamp</th>
                <th style="width: 120px;">Sender</th>
                <th style="width: 75px;">Dir</th>
                <th>Message Transcript</th>
            </tr>
        </thead>
        <tbody>
            ${messages.map((m, idx) => `
            <tr>
                <td style="color: #718096; font-size: 8.5pt;">${idx + 1}</td>
                <td style="white-space: nowrap; font-size: 8.5pt;">${formatTimestamp(m.timestamp)}</td>
                <td><strong>${m.sender || (m.isSender ? 'Device Owner' : 'Participant')}</strong></td>
                <td><span class="${m.isSender ? 'badge-out' : 'badge-in'}">${m.isSender ? 'OUT' : 'IN'}</span></td>
                <td class="msg-text">${m.body || m.text || ''}</td>
            </tr>
            `).join('')}
        </tbody>
    </table>

    <div class="footer-bates">
        Threadline Forensic Chronology Report • Page 1 of 1 • Verifiable Evidence Transcript
    </div>
</body>
</html>
    `;

    printWindow.document.open();
    printWindow.document.write(htmlContent);
    printWindow.document.close();
}
