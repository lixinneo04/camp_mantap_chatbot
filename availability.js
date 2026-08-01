// Camp Mantap — Booking Availability Module
// Queries Supabase views to provide real-time availability data to the AI assistant.
require("dotenv").config();

if (typeof global.WebSocket === "undefined") {
    global.WebSocket = class {};
}

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY,
    {
        db: {
            schema: process.env.SUPABASE_SCHEMA || 'public'
        }
    }
);


// ---------------------------------------------------------------------------
// Keyword detector — returns true if the customer is asking about availability
// ---------------------------------------------------------------------------
const DIRECT_AVAILABILITY_PATTERNS = [
    /\bav[a-z]{0,3}il[a-z]{0,5}t[yi]\b/i,        // availability / availabiliti / avilability / availabilty
    /\bav[a-z]{0,2}il[a-z]{0,2}ble?\b/i,          // available / availble / avialable
    /\bbo{1,2}ki?n?g?\b/i,                        // book / booking / boking / bokking
    /\bre[sz]e?r{1,2}v[a-z]{0,4}(?:on|tion)\b/i, // reserve / reservation / reservaton
    /\bvac[ae]nc[ey]\b/i,                         // vacancy / vacancies
    /\btempah(an)?\b/i                            // tempah / tempahan
];

const CONTEXTUAL_AVAILABILITY_PATTERNS = [
    // English: combinations of inquiry/intent + slot terms
    /\b(?:any|free|open|got|check|still|want|plan|can|is\s+there|what|which)\s+(?:[a-z]+\s+)?(?:slot|site|spot|space|room|pitch|opening|date|day)s?\b/i,
    // English: slot terms + available
    /\b(?:slot|site|spot|space|room|pitch|opening|date|day)s?\s+(?:is\s+)?available\b/i,
    // English: "still got" or "got space/slot/site/spot"
    /\b(?:still\s+got|got\s+(?:space|slot|site|spot|room))\b/i,
    // English: camp intent
    /\b(?:can|want|plan)\s+(?:we|i)?\s*camp\b/i,
    
    // Malay: combinations of inquiry/status + slot terms
    /\b(?:ada|kosong|penuh|full|boleh|nak|check|semak|bila|masih)\s+(?:[a-z]+\s+)?(?:tempat|slot|tapak|ruang|tarikh|hari)s?\b/i,
    // Malay: specific availability indicators
    /\b(?:kosong|full|penuh)\s+tak\b/i,
    /\b(?:masih|ada)\s+kosong\b/i,
    /\bboleh\s+camp\b/i,
    /\bmasih\s+ada\b/i,
    /\bbila\s+ada\b/i
];

const DATE_FORMAT_PATTERNS = [
    // DD/MM or DD/MM/YYYY or DD-MM or DD-MM-YYYY or DD.MM.YYYY (e.g. 31/7, 25-07-2026, 31.7)
    /\b(?:0?[1-9]|[12]\d|3[01])[/\-.](?:0?[1-9]|1[0-2])(?:[/\-.](?:\d{4}|\d{2}))?\b/,
    
    // YYYY-MM-DD or YYYY/MM/DD (e.g. 2026-07-25, 2026/07/25)
    /\b\d{4}[/\-.](?:0?[1-9]|1[0-2])[/\-.](?:0?[1-9]|[12]\d|3[01])\b/,
    
    // Day followed by Month (e.g. 31 July, 31hb Julai, 31st of July)
    /\b(?:0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th|hb)?\s*(?:of\s+)?(?:jan(?:uary)?|januari|feb(?:ruary)?|februari|mar(?:ch)?|mac|apr(?:il)?|may|mei|jun(?:e)?|jul(?:y)?|julai|aug(?:ust)?|ogos|sept?(?:ember)?|oct(?:ober)?|oktober|nov(?:ember)?|november|dec(?:ember)?|disember)\b/i,
    
    // Month followed by Day (e.g. July 31st, Julai 31)
    /\b(?:jan(?:uary)?|januari|feb(?:ruary)?|februari|mar(?:ch)?|mac|apr(?:il)?|may|mei|jun(?:e)?|jul(?:y)?|julai|aug(?:ust)?|ogos|sept?(?:ember)?|oct(?:ober)?|oktober|nov(?:ember)?|november|dec(?:ember)?|disember)\s*(?:0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\b/i
];

/**
 * Returns true if the customer's message appears to be asking about availability.
 * Checks exact keywords first, then date formats, and then contextual patterns.
 * @param {string} text - Customer message
 * @returns {boolean}
 */
function isAvailabilityQuestion(text) {
    const lower = text.toLowerCase();

    // 1. Direct patterns (fast match for booking/availability words)
    for (let i = 0; i < DIRECT_AVAILABILITY_PATTERNS.length; i++) {
        if (DIRECT_AVAILABILITY_PATTERNS[i].test(lower)) return true;
    }

    // 2. Date format patterns
    for (let i = 0; i < DATE_FORMAT_PATTERNS.length; i++) {
        if (DATE_FORMAT_PATTERNS[i].test(lower)) return true;
    }

    // 3. Contextual patterns
    for (let i = 0; i < CONTEXTUAL_AVAILABILITY_PATTERNS.length; i++) {
        if (CONTEXTUAL_AVAILABILITY_PATTERNS[i].test(lower)) return true;
    }

    return false;
}

// ---------------------------------------------------------------------------
// Supabase query — with auto schema discovery
// ---------------------------------------------------------------------------

// Cache the discovered view name and column mappings so we only probe once per process
let _viewName = null;
let _dateCol = null;
let _siteCol = null;
let _statusCol = null;
let _typeCol = null;
let _priceCol = null;
let _capacityCol = null;
let _notesCol = null;

/**
 * Probe the view schema: fetch 1 unfiltered row to find the columns.
 * Tries view_availability_public first, then view_availability.
 * Returns the schema metadata or null on failure.
 */
async function discoverSchema() {
    const views = ["view_availability_public", "view_availability"];

    for (const view of views) {
        const { data, error } = await supabase
            .from(view)
            .select("*")
            .limit(1);

        if (error) {
            console.warn(`[Availability] Schema probe failed for ${view}:`, error.message);
            continue;
        }

        if (!data || data.length === 0) {
            console.warn(`[Availability] ${view} is empty — cannot discover schema.`);
            continue;
        }

        const keys = Object.keys(data[0]);
        console.log(`[Availability] ${view} columns:`, keys.join(", "));
        console.log(`[Availability] Sample row:`, JSON.stringify(data[0]));

        // Detect all columns once:
        const dateCol =
            keys.find(k => /^\d{4}-\d{2}-\d{2}/.test(String(data[0][k]))) ||
            keys.find(k => !k.includes('_of_') && /stay_date|^date$|tarikh|check_in|check_out/i.test(k)) ||
            keys.find(k => !k.includes('_of_') && /date/i.test(k)) ||
            keys.find(k => /start|begin/i.test(k));

        const siteCol = keys.find(k => k === 'room_type') ||
            keys.find(k => !k.includes('customer') && /^room_type$|site|tapak|room/i.test(k));

        const statusCol = keys.find(k => k === 'status' || /^status$/i.test(k));

        const typeCol = keys.find(k => k !== 'room_type' && /type|jenis|category/i.test(k));

        const priceCol = keys.find(k => /price|harga|rate|cost/i.test(k));

        const capacityCol = keys.find(k => /capacity|pax|person|orang/i.test(k));

        const notesCol = keys.find(k => /note|notes|remark|catatan/i.test(k));

        if (!dateCol) {
            console.warn(`[Availability] Could not detect a date column in ${view}. Columns: ${keys.join(", ")}`);
            continue;
        }

        console.log(`[Availability] Using view="${view}", dateCol="${dateCol}"`);
        return {
            viewName: view,
            dateCol,
            siteCol,
            statusCol,
            typeCol,
            priceCol,
            capacityCol,
            notesCol
        };
    }

    return null; // both views unusable
}

// Helper to apply discovered schema
function applySchema(schema) {
    if (!schema) return;
    _viewName = schema.viewName;
    _dateCol = schema.dateCol;
    _siteCol = schema.siteCol;
    _statusCol = schema.statusCol;
    _typeCol = schema.typeCol;
    _priceCol = schema.priceCol;
    _capacityCol = schema.capacityCol;
    _notesCol = schema.notesCol;
}

// Pre-discover schema at startup to eliminate latency on first request
discoverSchema().then(applySchema).catch(err => {
    console.warn("[Availability] Pre-discovery of schema failed:", err.message);
});

// ---------------------------------------------------------------------------
// Short-lived in-memory cache — avoids hitting Supabase on every message
// ---------------------------------------------------------------------------
const availabilityCache = {
    data: null,
    dateFrom: null,
    dateTo: null,
    fetchedAt: 0,
    TTL: 60 * 1000  // 60 seconds
};

/**
 * Query the availability view for a date range.
 * Results are cached for 60 seconds to avoid repeated Supabase round-trips.
 * Auto-discovers the view name and date column on first call.
 * @param {string} dateFrom - ISO date string e.g. "2025-07-08"
 * @param {string} dateTo   - ISO date string e.g. "2025-08-07"
 * @returns {{ data: object[]|null, error: object|null, dateCol: string|null }}
 */
async function checkAvailability(dateFrom, dateTo) {
    // Return cached result if still fresh
    const now = Date.now();
    if (
        availabilityCache.data !== null &&
        availabilityCache.dateFrom === dateFrom &&
        availabilityCache.dateTo === dateTo &&
        (now - availabilityCache.fetchedAt) < availabilityCache.TTL
    ) {
        const age = Math.round((now - availabilityCache.fetchedAt) / 1000);
        console.log(`[Availability] Using cached data (${age}s old, TTL ${availabilityCache.TTL / 1000}s)`);
        return { data: availabilityCache.data, error: null, dateCol: _dateCol };
    }

    // Discover schema once, then cache
    if (!_viewName || !_dateCol) {
        const schema = await discoverSchema();
        if (!schema) {
            return { data: null, error: new Error("Could not discover view schema"), dateCol: null };
        }
        applySchema(schema);
    }

    let query = supabase
        .from(_viewName)
        .select("*")
        .gte(_dateCol, dateFrom)
        .lte(_dateCol, dateTo);

    // Filter by status directly in the database to optimize network load and response speed
    if (_statusCol) {
        query = query.in(_statusCol, ["AVAILABLE", "Available", "available", "OPEN", "Open", "open"]);
    }

    const { data, error } = await query.order(_dateCol, { ascending: true });

    if (error) {
        console.error(`[Availability] Filtered query on ${_viewName} failed:`, error.message);
        // Reset cache so next call retries discovery
        _viewName = null;
        _dateCol = null;
    } else {
        console.log(`[Availability] Fetched ${data.length} row(s) from ${_viewName} (${dateFrom} → ${dateTo})`);
        // Store in cache
        availabilityCache.data = data;
        availabilityCache.dateFrom = dateFrom;
        availabilityCache.dateTo = dateTo;
        availabilityCache.fetchedAt = now;
    }

    return { data, error, dateCol: _dateCol };
}
// ---------------------------------------------------------------------------
// Formatter — turns raw Supabase rows into a readable AI prompt block
// ---------------------------------------------------------------------------

/**
 * Convert raw availability rows into a concise text block for the AI prompt.
 * Handles unknown column names gracefully by dumping all fields.
 * @param {object[]} rows
 * @returns {string}
 */
function formatAvailabilityForAI(rows) {
    if (!rows) return "No availability data found for the requested period.";
    if (rows.length === 0) {
        return "No availability data found for the requested period.";
    }

    // Fallback: If cache variables are not set, discover them dynamically from rows[0]
    const dateKey = _dateCol || Object.keys(rows[0]).find(k => /^\d{4}-\d{2}-\d{2}/.test(String(rows[0][k]))) || Object.keys(rows[0]).find(k => {
        if (k.includes('_of_')) return false;
        return /stay_date|^date$|tarikh/i.test(k);
    });
    
    const siteKey = _siteCol || Object.keys(rows[0]).find(k => k === 'room_type') || Object.keys(rows[0]).find(k => {
        if (k.includes('customer')) return false;
        return /^room_type$|site|tapak|room/i.test(k);
    });
    
    const typeKey = _typeCol || Object.keys(rows[0]).find(k => k !== 'room_type' && /type|jenis|category/i.test(k));
    const priceKey = _priceCol || Object.keys(rows[0]).find(k => /price|harga|rate|cost/i.test(k));
    const capacityKey = _capacityCol || Object.keys(rows[0]).find(k => /capacity|pax|person|orang/i.test(k));
    const notesKey = _notesCol || Object.keys(rows[0]).find(k => /note|notes|remark|catatan/i.test(k));

    let block = "";

    for (const row of rows) {
        const parts = [];

        if (dateKey) {
            if (row[dateKey]) {
                parts.push("Date: " + row[dateKey]);
            }
        }
        if (siteKey) {
            if (row[siteKey]) {
                parts.push("Site: " + row[siteKey]);
            }
        }
        parts.push("Status: AVAILABLE");
        if (typeKey) {
            if (row[typeKey]) {
                parts.push("Type: " + row[typeKey]);
            }
        }
        if (priceKey) {
            if (row[priceKey]) {
                parts.push("Price: RM " + row[priceKey]);
            }
        }
        if (capacityKey) {
            if (row[capacityKey]) {
                parts.push("Max pax: " + row[capacityKey]);
            }
        }
        if (notesKey) {
            if (row[notesKey]) {
                parts.push("Notes: " + row[notesKey]);
            }
        }

        // If we couldn't detect standard columns, dump everything safe
        if (parts.length === 0 || parts.length === 1) {
            parts.push(JSON.stringify(row));
        }

        block += "• " + parts.join(" | ") + "\n";
    }

    return block.trim();
}

// ---------------------------------------------------------------------------
// Orchestrator — called from getAIReply() in server.js
// ---------------------------------------------------------------------------

/**
 * If the customer is asking about availability, query Supabase and return
 * a formatted context block to inject into the AI prompt.
 * Returns an empty string if the message is not availability-related.
 *
 * @param {string} userMessage - The raw customer message
 * @returns {Promise<string>} - Formatted availability block or ""
 */
async function getAvailabilityContext(userMessage) {
    if (!isAvailabilityQuestion(userMessage)) {
        return "";
    }

    console.log("[Availability] Availability question detected — querying Supabase...");

    // Query the next 30 days by default
    const today = new Date();
    const dateFrom = today.toISOString().split("T")[0];

    const future = new Date(today);
    future.setDate(future.getDate() + 30);
    const dateTo = future.toISOString().split("T")[0];

    const { data, error } = await checkAvailability(dateFrom, dateTo);

    if (error || !data) {
        console.error("[Availability] Failed to fetch availability data.");
        return ""; // Silently skip — AI will fall back to FAQ / contact info
    }

    if (data.length === 0) {
        return `=== LIVE BOOKING AVAILABILITY (${dateFrom} to ${dateTo}) ===
No available slots found for the next 30 days. All sites may be fully booked.
=== END AVAILABILITY ===`;
    }

    const formatted = formatAvailabilityForAI(data);

    return `=== LIVE BOOKING AVAILABILITY (${dateFrom} to ${dateTo}) ===
Use the data below to answer the customer's availability question accurately.
Do NOT guess or make up dates — only refer to what is listed here.

${formatted}

=== END AVAILABILITY ===`;
}

module.exports = { isAvailabilityQuestion, checkAvailability, formatAvailabilityForAI, getAvailabilityContext };
