/**
 * Threadline Temporal Verifier Utility
 * Validates presence of standardized dates and times in uploaded and pasted conversation archives.
 */

export const ISO_DATETIME_REGEX = /\b\d{4}-\d{2}-\d{2}[T\s]\d{2}:\d{2}(?::\d{2})?(?:\.\d{1,6})?(?:Z|[+-]\d{2}:?\d{2})?\b/i;
export const WHATSAPP_DATETIME_REGEX = /\[?\d{1,4}[-/.]\d{1,2}[-/.]\d{2,4},?\s+\d{1,2}:\d{2}(?::\d{2})?(?:\s*[AaPp][Mm])?\]?\s*[-:]?\s+/;
export const SIGNAL_DATETIME_REGEX = /\[\d{4}[-/.]\d{1,2}[-/.]\d{1,2}[,\s]+\d{1,2}:\d{2}(?::\d{2})?\]/;
export const GENERAL_LOG_DATETIME_REGEX = /(?:\[?\d{4}[-/.]\d{2}[-/.]\d{2}[ T]\d{2}:\d{2}|\[\d{10,13}\]|[A-Za-z]{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})/;

/**
 * Inspects pasted text or string content for temporal validity.
 * @param {string} text 
 * @returns {{ hasValidTimestamp: boolean, detectedFormat: string, reason: string }}
 */
export function inspectTemporalText(text) {
    if (!text || !text.trim()) {
        return {
            hasValidTimestamp: false,
            detectedFormat: "Empty",
            reason: "No content provided."
        };
    }

    const trimmed = text.trim();

    // 1. Structured archives with built-in schema
    if (trimmed.includes("<smses") || (trimmed.includes("<sms ") && trimmed.includes("date="))) {
        return {
            hasValidTimestamp: true,
            detectedFormat: "SMS Backup XML",
            reason: "XML attributes contain timestamp metadata"
        };
    }

    if (trimmed.includes("<h2>Conversation with:") && trimmed.includes("<th>Date</th>")) {
        return {
            hasValidTimestamp: true,
            detectedFormat: "HTML Conversation Export",
            reason: "HTML tables contain structured Date headers"
        };
    }

    if (trimmed.includes('"participants"') && trimmed.includes('"timestamp_ms"')) {
        return {
            hasValidTimestamp: true,
            detectedFormat: "Messenger JSON",
            reason: "JSON contains timestamp_ms millisecond fields"
        };
    }

    if (/^From:\s+/m.test(trimmed) && /^Date:\s+/m.test(trimmed)) {
        return {
            hasValidTimestamp: true,
            detectedFormat: "Email Headers",
            reason: "RFC headers include explicit Date: header"
        };
    }

    // 2. Chat formats with date/time prefixes
    if (WHATSAPP_DATETIME_REGEX.test(trimmed)) {
        return {
            hasValidTimestamp: true,
            detectedFormat: "WhatsApp Chat",
            reason: "Messages prefixed with WhatsApp timestamps"
        };
    }

    if (SIGNAL_DATETIME_REGEX.test(trimmed)) {
        return {
            hasValidTimestamp: true,
            detectedFormat: "Signal Export",
            reason: "Messages prefixed with Signal timestamps"
        };
    }

    if (ISO_DATETIME_REGEX.test(trimmed) || GENERAL_LOG_DATETIME_REGEX.test(trimmed)) {
        return {
            hasValidTimestamp: true,
            detectedFormat: "Timestamped Log",
            reason: "Log lines contain recognizable timestamps"
        };
    }

    // 3. Fallback: Content has NO timestamps or only dates without times
    const hasDateOnly = /\b(?:\d{4}[-/.]\d{1,2}[-/.]\d{1,2}|\d{1,2}[-/.]\d{1,2}[-/.]\d{2,4})\b/.test(trimmed);
    const hasTimeOnly = /\b\d{1,2}:\d{2}(?::\d{2})?\s*(?:AM|PM|am|pm)?\b/.test(trimmed);

    if (hasDateOnly && !hasTimeOnly) {
        return {
            hasValidTimestamp: false,
            detectedFormat: "Partial (Date Only)",
            reason: "Dates detected, but specific message times are missing"
        };
    }

    if (!hasDateOnly && hasTimeOnly) {
        return {
            hasValidTimestamp: false,
            detectedFormat: "Partial (Time Only)",
            reason: "Times detected, but calendar dates are missing"
        };
    }

    return {
        hasValidTimestamp: false,
        detectedFormat: "Plaintext / Untimed Chat",
        reason: "No dates or times detected in conversational text"
    };
}

/**
 * Inspects a File object by reading its initial slice if it is text-based.
 * @param {File} file 
 * @returns {Promise<{ hasValidTimestamp: boolean, detectedFormat: string, reason: string }>}
 */
export async function inspectTemporalFile(file) {
    if (!file) {
        return { hasValidTimestamp: false, detectedFormat: "None", reason: "No file provided" };
    }

    const ext = file.name.split(".").pop().toLowerCase();
    const textExtensions = ["xml", "html", "json", "log", "txt", "eml", "mbox", "csv"];

    // Structured formats with strict schemas usually have timestamps
    if (["xml", "html", "eml", "mbox"].includes(ext)) {
        return { hasValidTimestamp: true, detectedFormat: ext.toUpperCase(), reason: "Native structured schema" };
    }

    // For plain text, logs, or JSON, inspect a slice
    if (textExtensions.includes(ext)) {
        try {
            const slice = file.slice(0, 32 * 1024);
            const text = await slice.text();
            return inspectTemporalText(text);
        } catch (e) {
            return { hasValidTimestamp: true, detectedFormat: ext.toUpperCase(), reason: "Read error, proceeding to backend parser" };
        }
    }

    // ZIP, PDF, Images: allow pass-through to backend OCR / parsers
    return {
        hasValidTimestamp: true,
        detectedFormat: ext.toUpperCase(),
        reason: "Container or binary archive"
    };
}

/**
 * Normalizes user calendar + dropdown selections into strict ISO-8601 with timezone offset.
 * Format: YYYY-MM-DDTHH:mm:ss±HH:MM
 */
export function formatCanonicalISO(year, monthIndex, day, hour12, minute, second, ampm, timezone) {
    let h24 = parseInt(hour12, 10);
    if (ampm === "AM") {
        h24 = h24 === 12 ? 0 : h24;
    } else {
        h24 = h24 === 12 ? 12 : h24 + 12;
    }

    const y = String(year);
    const m = String(monthIndex + 1).padStart(2, "0");
    const d = String(day).padStart(2, "0");
    const h = String(h24).padStart(2, "0");
    const min = String(minute).padStart(2, "0");
    const s = String(second).padStart(2, "0");

    const localDate = new Date(year, monthIndex, day, h24, minute, second);
    const tzOffset = -localDate.getTimezoneOffset();
    const diff = tzOffset >= 0 ? "+" : "-";
    const pad = (num) => String(Math.floor(Math.abs(num))).padStart(2, "0");
    const offsetString = `${diff}${pad(tzOffset / 60)}:${pad(tzOffset % 60)}`;

    return `${y}-${m}-${d}T${h}:${min}:${s}${offsetString}`;
}

/**
 * Prepend or format timestamp into pasted conversation text.
 * When a user pastes untimed conversation, prepending the baseline timestamp header
 * ensures the backend parser indexes the conversation accurately.
 */
export function injectTimestampToText(text, canonicalIso) {
    const timestampBanner = `[TIMESTAMP: ${canonicalIso}]\n`;
    return `${timestampBanner}${text}`;
}
