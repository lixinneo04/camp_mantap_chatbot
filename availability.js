// Camp Mantap — Booking Availability Module
// Queries Supabase views to provide real-time availability data to the AI assistant.

require("dotenv").config();

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

// ---------------------------------------------------------------------------
// Keyword detector — returns true if the customer is asking about availability
// ---------------------------------------------------------------------------
const AVAILABILITY_KEYWORDS = [
    // English — booking/availability
    "available", "availability", "book", "booking", "reserve", "reservation",
    "any spot", "any site", "free slot", "open slot", "open date",
    "slot available", "date available", "site available", "spot available",
    "still got", "got space", "got slot", "got site", "is there space",
    "can i camp", "can we camp", "want to camp", "plan to camp",
    "check availability", "check booking", "check slot", "check date",
    "any opening", "any vacancy", "vacancy", "pitch available",
    // English — time references
    "this weekend", "next weekend", "next week", "this week",
    "tonight", "tomorrow", "tmr", "tmrw", "next month", "what date", "which date",
    "how many", "how much site", "how much spot",
    // Informal shorthand
    "2day", "2moro", "nxt wknd", "nxt week",
    // Malay
    "ada tempat", "ada slot", "ada tapak", "boleh book", "nak book",
    "nak tempah", "tempah", "tempahan", "kosong", "masih ada",
    "dah penuh", "penuh tak", "full tak", "ada tak", "bila ada",
    "hujung minggu", "minggu depan", "bulan depan", "esok", "malam ini",
    "tarikh", "hari", "malam",
    "masih kosong", "ada ruang", "boleh tempah", "nak check", "semak"
];

/**
 * Fuzzy regex patterns to catch common typos and misspellings.
 * Each pattern targets a key concept, not a single exact word.
 */
const FUZZY_PATTERNS = [
    // "availability" — catches: avilability, availabilty, availibility, availbility, availablity
    /\bav[a-z]{0,3}il[a-z]{0,5}t[yi]\b/i,
    /\bav[ai]{0,2}l[a-z]{0,4}bil[a-z]{0,3}t[yi]\b/i,
    // "available" — catches: availble, avialable
    /\bav[a-z]{0,2}il[a-z]{0,2}ble?\b/i,
    // "booking" — catches: bookin, boking, bokking
    /\bbo{1,2}ki?n?g?\b/i,
    // "reservation" — catches: reservaton, reserrvation, rezervation
    /\bre[sz]e?r{1,2}v[a-z]{0,4}(?:on|tion)\b/i,
    // "vacancy" — catches: vacency, vacancey
    /\bvac[ae]nc[ey]\b/i,
];

/**
 * Returns true if the customer's message appears to be asking about availability.
 * Checks exact keywords first, then fuzzy patterns for typo tolerance.
 * @param {string} text - Customer message
 * @returns {boolean}
 */
function isAvailabilityQuestion(text) {
    const lower = text.toLowerCase();
    // 1. Exact keyword match (fast)
    if (AVAILABILITY_KEYWORDS.some(kw => lower.includes(kw))) return true;
    // 2. Fuzzy pattern match (catches typos)
    if (FUZZY_PATTERNS.some(pattern => pattern.test(lower))) return true;
    return false;
}

// ---------------------------------------------------------------------------
// Supabase query — with auto schema discovery
// ---------------------------------------------------------------------------

// Cache the discovered view name and date column so we only probe once per process
let _viewName = null;
let _dateCol = null;

/**
 * Probe the view schema: fetch 1 unfiltered row to find the real date column.
 * Tries view_availability_public first, then view_availability.
 * Returns { viewName, dateCol } or null on failure.
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

        // Detect the date column:
        // 1. Prefer a column whose VALUE looks like YYYY-MM-DD (most reliable)
        const dateCol =
            keys.find(k => /^\d{4}-\d{2}-\d{2}/.test(String(data[0][k]))) ||
            // 2. Name contains "stay_date", "date", "tarikh", "check" — but NOT "day_of_week"
            keys.find(k => !k.includes('_of_') && /stay_date|^date$|tarikh|check_in|check_out/i.test(k)) ||
            // 3. Generic: any column with "date" in the name, excluding _of_ patterns
            keys.find(k => !k.includes('_of_') && /date/i.test(k)) ||
            // 4. Last resort: "start" or "begin"
            keys.find(k => /start|begin/i.test(k));

        if (!dateCol) {
            console.warn(`[Availability] Could not detect a date column in ${view}. Columns: ${keys.join(", ")}`);
            continue;
        }

        console.log(`[Availability] Using view="${view}", dateCol="${dateCol}"`);
        return { viewName: view, dateCol };
    }

    return null; // both views unusable
}

/**
 * Query the availability view for a date range.
 * Auto-discovers the view name and date column on first call.
 * @param {string} dateFrom - ISO date string e.g. "2025-07-08"
 * @param {string} dateTo   - ISO date string e.g. "2025-08-07"
 * @returns {{ data: object[]|null, error: object|null, dateCol: string|null }}
 */
async function checkAvailability(dateFrom, dateTo) {
    // Discover schema once, then cache
    if (!_viewName || !_dateCol) {
        const schema = await discoverSchema();
        if (!schema) {
            return { data: null, error: new Error("Could not discover view schema"), dateCol: null };
        }
        _viewName = schema.viewName;
        _dateCol = schema.dateCol;
    }

    const { data, error } = await supabase
        .from(_viewName)
        .select("*")
        .gte(_dateCol, dateFrom)
        .lte(_dateCol, dateTo)
        .order(_dateCol, { ascending: true });

    if (error) {
        console.error(`[Availability] Filtered query on ${_viewName} failed:`, error.message);
        // Reset cache so next call retries discovery
        _viewName = null;
        _dateCol = null;
    } else {
        console.log(`[Availability] Fetched ${data.length} row(s) from ${_viewName} (${dateFrom} → ${dateTo})`);
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
    if (!rows || rows.length === 0) {
        return "No availability data found for the requested period.";
    }

    // Detect common column name patterns (prioritizing the known view schema)
    const sample = rows[0];
    const keys = Object.keys(sample);

    // Exact matches first, then regex fallbacks
    const dateKey = keys.find(k => k === 'stay_date') ||
        keys.find(k => !k.includes('_of_') && /date|tarikh/i.test(k));
    const siteKey = keys.find(k => k === 'room_type') ||
        // Exclude customer_name — only match site/room/tapak columns
        keys.find(k => !k.includes('customer') && /^room_type$|site|tapak|room/i.test(k));
    const statusKey = keys.find(k => k === 'status' || /^status$/i.test(k));

    // Additional fields (if using the internal view or if schema expands)
    const typeKey = keys.find(k => k !== 'room_type' && /type|jenis|category/i.test(k));
    const priceKey = keys.find(k => /price|harga|rate|cost/i.test(k));
    const capacityKey = keys.find(k => /capacity|pax|person|orang/i.test(k));
    const notesKey = keys.find(k => /note|notes|remark|catatan/i.test(k));

    // Filter to only AVAILABLE slots to save AI prompt tokens
    let availableRows = rows;
    if (statusKey) {
        availableRows = rows.filter(row =>
            String(row[statusKey]).trim().toUpperCase() === "AVAILABLE" ||
            String(row[statusKey]).trim().toUpperCase() === "OPEN"
        );
    }

    if (availableRows.length === 0) {
        return "All sites are FULLY BOOKED for the requested period.";
    }

    let block = "";

    // We only want to output available slots to save tokens and reduce noise
    for (const row of availableRows) {
        const parts = [];

        if (dateKey) parts.push(`Date: ${row[dateKey]}`);
        if (siteKey) parts.push(`Site: ${row[siteKey]}`);
        if (statusKey) parts.push(`Status: AVAILABLE`);
        if (typeKey) parts.push(`Type: ${row[typeKey]}`);
        if (priceKey) parts.push(`Price: RM ${row[priceKey]}`);
        if (capacityKey) parts.push(`Max pax: ${row[capacityKey]}`);
        if (notesKey && row[notesKey]) parts.push(`Notes: ${row[notesKey]}`);

        // If we couldn't detect standard columns, dump everything safe
        if (parts.length === 0) {
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
