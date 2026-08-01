require("dotenv").config();

const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const express = require("express");
const axios = require("axios");
const path = require("path");

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

const fs = require("fs");
const KNOWLEDGE_BASE = fs.readFileSync(path.join(__dirname, "knowledge_base.md"), "utf8");

const { isAvailabilityQuestion, getAvailabilityContext } = require("./availability");

const GEMINI_MODEL = "gemini-3.5-flash";
const WELCOME_MESSAGE = `Salam & Welcome to Camp Mantap! 🏕️

Terima kasih kerana menghubungi kami. Thank you for reaching out!

I'm the Camp Mantap virtual assistant. I can help you with:

📍 Location & facilities
📅 Booking & availability
⏰ Check-in / check-out times
💸 Cancellation & refund policy
⚡ Electricity usage
🛒 Mini mart items
🏍️ ATV rides & activities
🌊 River & flood safety info

Feel free to ask me anything in English or Bahasa Melayu!`;
const FALLBACK_MESSAGE = `Sorry, I'm having some technical difficulties right now. 😔

Please contact Miss Jenny directly for assistance:
📞 +60 12-345 6789
💬 https://wa.me/60123456789`;

const HUMAN_HANDOFF_MESSAGE = `Sure! You can reach our person-in-charge, *Miss Jenny*, directly:

📞 *Phone / WhatsApp:* +60 12-345 6789
💬 *WhatsApp Link:* https://wa.me/60123456789

She will be happy to assist you further. 😊`;

// ---------------------------------------------------------------------------
// Route incoming image requests to the correct categories
// ---------------------------------------------------------------------------
function getRequestedImageType(text) {
    const lower = text.toLowerCase();

    // 1. Pricelist / Poster (e.g., "pricelist image", "poster", "campsite pricelist", "gambar pricelist", "gambar poster")
    const pricelistPatterns = [
        /\bpricelist\b/i,
        /\bprice\s*list\b/i,
        /\bposter\b/i,
        /\bgambar\s+(harga|pricelist|price\s*list|yuran|kadar|poster)\b/i,
        /\b(campsite\s+pricelist|campsite\s+price\s+list)\b/i
    ];
    if (pricelistPatterns.some(p => p.test(lower))) {
        return 'pricelist';
    }

    // 2. Tent rent / Khemah rent (e.g., "tent rent", "sewa khemah", "tent package", "tent photo", "gambar khemah")
    const tentPatterns = [
        /\bsewa\s+khemah\b/i,
        /\bsewa\s+kemah\b/i,
        /\btent\s+(rent|pricing|price|rate|package|photo|image|picture)s?\b/i,
        /\b(khemah|kemah|tent)\s+(sewa|pakej|harga|gambar|foto)s?\b/i,
        /\b(rent|sewa)\s+(tent|khemah|kemah)s?\b/i
    ];
    if (tentPatterns.some(p => p.test(lower))) {
        return 'tent';
    }

    // 3. Campsite picture (with "Tapak")
    // Match "campsite picture", "campsite photo", "gambar tapak", "tunjuk tapak"
    const campsitePatterns = [
        /\b(campsite)\s+(picture|photo|image|pic|foto|gambar|gallery)s?\b/i,
        /\b(picture|photo|image|pic|foto|gambar|gallery)s?\s+(of\s+)?(campsite)\b/i,
        /\bgambar\s+(tapak|campsite)\b/i,
        /\b(tunjuk|lihat|tengok)\s+(tapak|campsite)\b/i,
        /\btapak\b/i
    ];
    if (campsitePatterns.some(p => p.test(lower))) {
        return 'campsite';
    }

    // 4. Camp picture (with "Camp A/B/C/D")
    // Match "camp picture", "camp photo", "gambar camp", "tunjuk camp"
    const campPatterns = [
        /\bcamp\s+(picture|photo|image|pic|foto|gambar|gallery)s?\b/i,
        /\b(picture|photo|image|pic|foto|gambar|gallery)s?\s+(of\s+)?(camp)\b/i,
        /\bgambar\s+camp\b/i,
        /\b(tunjuk|lihat|tengok)\s+camp\b/i
    ];
    if (campPatterns.some(p => p.test(lower))) {
        return 'camp';
    }

    // Generic fallback for any photo/image/picture/gallery/photo request
    const genericImagePatterns = [
        /\b(show|send|share|see|view|look\s*at|display)\s+(me\s+)?(the\s+)?(images?|photos?|pictures?|pics?|gallery)\b/i,
        /\b(images?|photos?|pictures?|pics?|gallery)\b/i,
        /\b(gambar|foto|imej)\b/i
    ];
    if (genericImagePatterns.some(p => p.test(lower))) {
        return 'campsite';
    }

    return null;
}

// ---------------------------------------------------------------------------
// Detect when customer exclusively wants to speak to a human / Miss Jenny
// ---------------------------------------------------------------------------
function isRequestingHuman(text) {
    const lower = text.toLowerCase();
    const patterns = [
        // Talk/speak/chat/connect to a person/human/agent/owner
        /\b(talk|speak|chat|connect|contact|reach|get)\s+(to|with)\s+(a\s+)?(human|person|agent|staff|owner|someone|real\s*person)\b/i,
        // Explicitly talk/speak to Miss Jenny (must have action verb before her name)
        /\b(talk|speak|chat|connect|reach|call|message)\s+(to|with)\s+(miss\s*jenny|jenny)\b/i,
        // 'contact miss jenny / contact jenny' standalone
        /\bcontact\s+(miss\s*jenny|jenny)\b/i,
        // 'i want/can i/please + talk/speak/chat to/with'
        /\b(i\s+want|i'd\s+like|can\s+i|may\s+i|please)\s+(to\s+)?(talk|speak|chat|connect)\s+(to|with)\b/i,
        // 'connect me to an agent/human/person'
        /\bconnect\s+me\s+to\s+(a[n]?\s+)?(human|person|agent|staff|someone)\b/i,
        // Transfer/escalate/forward to a human
        /\b(transfer|escalate|forward)\s+(me\s+)?(to\s+)?(human|person|agent|miss\s*jenny|jenny)\b/i,
        // person-in-charge / PIC
        /\bperson[\s-]?in[\s-]?charge\b/i,
        /\bpic\b/i,
        // 'need/want to talk/contact miss jenny'
        /\b(need|want)\s+to\s+(talk|speak|chat|contact|reach|call)\s+(to\s+|with\s+)?(miss\s*jenny|jenny)\b/i,
        // Malay patterns
        /\b(nak|mahu|boleh|saya\s+nak)\s+(cakap|bercakap|hubungi|contact|jumpa)\s+(dengan\s+)?(miss\s*jenny|jenny|owner|tuan|puan|orang)\b/i,
        /\b(cakap|bercakap)\s+dengan\s+(manusia|orang\s+sebenar|staff|pekerja)\b/i,
        /\bhubungi\s+(miss\s*jenny|jenny|owner)\b/i,
        /\borang\s+yang\s+bertanggungjawab\b/i,
    ];
    return patterns.some(p => p.test(lower));
}

const app = express();                  // ← app created here, BEFORE routes
const ACCESS_TOKEN = process.env.WHATSAPP_TOKEN;

app.use(express.json());

// Serve static files (images, etc.) from the public folder
app.use(express.static(path.join(__dirname, 'public')));

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

// Privacy Policy page
app.get('/privacy', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'privacy-policy.html'));
});

// Health Check page
app.get('/health', (req, res) => {
    res.status(200).send('OK');
});

// Home page
app.get("/", (req, res) => {
    res.send("WhatsApp Webhook Server Running");
});

// Webhook verification (Meta calls this)
app.get("/webhook", (req, res) => {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    console.log("Verification request received");

    if (mode === "subscribe" && token === VERIFY_TOKEN) {
        console.log("Webhook verified successfully");
        return res.status(200).send(challenge);
    }

    console.log("Webhook verification failed");
    return res.sendStatus(403);
});

// Deduplicate incoming messages — WhatsApp can send the same webhook more than once
const processedMessageIds = new Set();

// Incoming WhatsApp messages
app.post("/webhook", async (req, res) => {
    try {
        const value =
            req.body.entry?.[0]?.changes?.[0]?.value;

        // Silently ignore delivery/read receipts — they are very noisy
        if (value?.statuses) {
            return res.sendStatus(200);
        }

        if (value?.messages) {
            const message = value.messages[0];
            const sender = message.from;
            const text = message.text?.body;

            // Skip stale messages (older than 30 seconds) — e.g. queued messages from server downtime
            const msgTimestamp = parseInt(message.timestamp) * 1000; // convert to ms
            const ageSeconds = (Date.now() - msgTimestamp) / 1000;
            if (ageSeconds > 30) {
                console.log(`Skipping old message from ${sender} (${Math.round(ageSeconds)}s ago)`);
                return res.sendStatus(200);
            }

            if (message.type !== "text") {
                console.log("Non-text message received");
                return res.sendStatus(200);
            }

            // Skip already-processed messages (webhook deduplication)
            if (processedMessageIds.has(message.id)) {
                console.log(`Duplicate webhook ignored: ${message.id.slice(-8)}`);
                return res.sendStatus(200);
            }
            processedMessageIds.add(message.id);
            // Clean up old IDs after 5 minutes to prevent memory leak
            setTimeout(() => processedMessageIds.delete(message.id), 5 * 60 * 1000);

            console.log("Customer:", sender);
            console.log("Message:", text);

            let aiReply;

            try {
                // Normalize early so we can detect intent before fetching data
                const normalizedText = normalizeMessage(text);

                // Run history fetch + availability fetch in parallel (saves ~200-400ms)
                const looksLikeAvailability = isAvailabilityQuestion(normalizedText);
                const [existingHistory, preloadedAvailability] = await Promise.all([
                    getConversationHistory(sender),
                    looksLikeAvailability ? getAvailabilityContext(normalizedText) : Promise.resolve(undefined)
                ]);

                const isNewCustomer = existingHistory.length === 0;

                // Route image/pricing requests dynamically
                const requestedImageType = getRequestedImageType(text);
                if (requestedImageType) {
                    console.log(`[Images] Image request detected from ${sender} (Type: ${requestedImageType})`);
                    await handleImageRequest(sender, requestedImageType);
                    // Return early — images already sent, no text reply needed
                    return res.sendStatus(200);
                }

                // Check if customer is exclusively requesting to speak to a human
                if (isRequestingHuman(text)) {
                    console.log(`[Handoff] Human contact request detected from ${sender}`);
                    aiReply = HUMAN_HANDOFF_MESSAGE;
                } else {
                    aiReply = await getAIReply(
                        text,
                        sender,
                        existingHistory,
                        preloadedAvailability
                    );
                }

                // If new customer, prepend welcome message so it is sent as one single message bubble
                let finalReply = aiReply;
                if (isNewCustomer) {
                    console.log("New customer detected — prepending welcome message");
                    finalReply = `${WELCOME_MESSAGE}\n\n${aiReply}`;
                }

                const { error: dbError } = await supabase
                    .from("conversations")
                    .insert([
                        {
                            phone_number: sender,
                            role: "user",
                            message: text
                        },
                        {
                            phone_number: sender,
                            role: "assistant",
                            message: finalReply
                        }
                    ]);

                if (dbError) {
                    console.error("=== SUPABASE INSERT ERROR ===");
                    console.error("Code:", dbError.code);
                    console.error("Message:", dbError.message);
                    console.error("Details:", dbError.details);
                    console.error("Hint:", dbError.hint);
                    console.error("============================");
                } else {
                    console.log("Supabase: conversation saved ✓");
                }

                await axios.post(
                    `https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`,
                    {
                        messaging_product: "whatsapp",
                        to: sender,
                        type: "text",
                        text: {
                            body: finalReply
                        }
                    },
                    {
                        headers: {
                            Authorization: `Bearer ${ACCESS_TOKEN}`,
                            "Content-Type": "application/json"
                        }
                    }
                );

                console.log("Reply sent");

            } catch (err) {
                // Log full error details for debugging
                console.error("=== AI REPLY ERROR ===");
                console.error("Status:", err?.status || err?.response?.status);
                console.error("Message:", err?.message);
                console.error("Body:", JSON.stringify(err?.response?.data || err?.error, null, 2));
                console.error("======================");

                // Save fallback conversation to Supabase so history is maintained
                const { error: dbError } = await supabase
                    .from("conversations")
                    .insert([
                        {
                            phone_number: sender,
                            role: "user",
                            message: text
                        },
                        {
                            phone_number: sender,
                            role: "assistant",
                            message: FALLBACK_MESSAGE
                        }
                    ]);

                if (dbError) {
                    console.error("=== SUPABASE INSERT ERROR (FALLBACK) ===");
                    console.error("Code:", dbError.code);
                    console.error("Message:", dbError.message);
                    console.error("Details:", dbError.details);
                    console.error("Hint:", dbError.hint);
                    console.error("========================================");
                } else {
                    console.log("Supabase: fallback conversation saved ✓");
                }

                // Send fallback message so customer isn't left hanging
                try {
                    await sendTextMessage(
                        sender,
                        FALLBACK_MESSAGE
                    );
                } catch (sendErr) {
                    console.error("Failed to send fallback message:", sendErr.message);
                }

                // Alert admin about the error
                const alertNumber = process.env.ALERT_PHONE_NUMBER;
                if (alertNumber) {
                    try {
                        const now = new Date().toLocaleString("en-MY", { timeZone: "Asia/Kuala_Lumpur" });
                        const alertMsg =
                            `⚠️ *Camp Mantap Bot Alert*\n\n` +
                            `The bot encountered an error and sent a fallback message.\n\n` +
                            `👤 *Affected Customer:* +${sender}\n` +
                            `🕐 *Time:* ${now}\n` +
                            `❌ *Error:* ${err?.message || "Unknown error"}\n\n` +
                            `Please follow up with the customer directly.`;
                        await sendTextMessage(alertNumber, alertMsg);
                        console.log("Admin alert sent ✓");
                    } catch (alertErr) {
                        console.error("Failed to send admin alert:", alertErr.message);
                    }
                }
            }
        }

        res.sendStatus(200);

    } catch (err) {
        console.error(
            err.response?.data || err.message
        );
        res.sendStatus(500);
    }
});

// Store conversation history

async function getConversationHistory(phoneNumber) {

    const { data, error } = await supabase
        .from("conversations")
        .select("*")
        .eq("phone_number", phoneNumber)
        .order("created_at", { ascending: false })
        .limit(10); // Keep last 10 messages to reduce token usage per API call

    if (error) {
        console.error(error);
        return [];
    }

    return (data || []).reverse();
}

async function sendTextMessage(to, body) {
    await axios.post(
        `https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`,
        {
            messaging_product: "whatsapp",
            to,
            type: "text",
            text: {
                body
            }
        },
        {
            headers: {
                Authorization: `Bearer ${ACCESS_TOKEN}`,
                "Content-Type": "application/json"
            }
        }
    );
}

// ---------------------------------------------------------------------------
// Send a single image via WhatsApp
// ---------------------------------------------------------------------------
async function sendImageMessage(to, imageUrl, caption = "") {
    await axios.post(
        `https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`,
        {
            messaging_product: "whatsapp",
            to,
            type: "image",
            image: {
                link: imageUrl,
                caption
            }
        },
        {
            headers: {
                Authorization: `Bearer ${ACCESS_TOKEN}`,
                "Content-Type": "application/json"
            }
        }
    );
}

// ---------------------------------------------------------------------------
// Handle categorized image requests (English & Malay)
// ---------------------------------------------------------------------------
async function handleImageRequest(to, type) {
    const BASE_URL = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;
    const imagesDir = path.join(__dirname, 'public', 'images');

    // Read all image files from the images directory
    const allFiles = fs.readdirSync(imagesDir);
    const imageFiles = allFiles.filter(f => /\.(jpe?g|png|webp|gif)$/i.test(f));

    if (imageFiles.length === 0) {
        console.log('[Images] No image files found in public/images');
        await sendTextMessage(to, "Sorry, no images are available at the moment. 😔\nSila hubungi Miss Jenny untuk maklumat lanjut:\n📞 +60 12-345 6789\n💬 https://wa.me/60123456789");
        return;
    }

    if (type === 'pricelist') {
        const file = imageFiles.find(f => /Campsite Pricelist/i.test(f));
        if (file) {
            const imageUrl = `${BASE_URL}/images/${encodeURIComponent(file)}`;
            const caption = `Here is our campsite pricelist poster! 🏕️💵\nBerikut adalah poster senarai harga tapak kami! 🏕️💵`;
            console.log(`[Images] Sending pricelist poster: ${file}`);
            await sendImageMessage(to, imageUrl, caption);
        } else {
            await sendTextMessage(to, "Sorry, the campsite pricelist poster is currently unavailable. 😔\nMaaf, poster senarai harga tapak tidak tersedia buat masa ini.");
        }
    } 
    else if (type === 'tent') {
        const detailSheets = [
            { file: 'Tent Rent @ Style A.jpeg', caption: '🏕️ *Sewa Khemah Style A / Tent Rental Style A*\nPayung Village L | Max 4 pax\n1 malam: RM250 (1-2 org) / RM300 (3-4 org)\nMalam tambahan: RM200 (1-2 org) / RM250 (3-4 org)' },
            { file: 'Tent Rent @ Style B.jpeg', caption: '🏕️ *Sewa Khemah Style B / Tent Rental Style B*\nPayung Village T (XL) | Max 8 pax\n1 malam: RM350 (1-4 org) / RM400 (5-8 org)\nMalam tambahan: RM300 (1-4 org) / RM350 (5-8 org)' },
            { file: 'Tent Rent @ Style C.jpeg', caption: '🏕️ *Sewa Khemah Style C / Tent Rental Style C*\nDome Style | Max 8 pax\n1 malam: RM400 (1-4 org) / RM500 (5-8 org)\nMalam tambahan: RM350 (1-4 org) / RM450 (5-8 org)' },
        ];

        await sendTextMessage(to,
            `Here are our tent rental packages! 🏕️\nBerikut adalah pakej sewa khemah kami! 🏕️\n\n` +
            `All packages include / Semua pakej termasuk:\n` +
            `- Air Mattress or Foam / Tilam Angin atau Tilam Foam\n` +
            `- Foam Pillows / Bantal Foam\n` +
            `- Fan & Light / Kipas & Lampu\n` +
            `- Table & Chairs / Meja & Kerusi\n\n` +
            `*Note: Price does not include campsite fee (tapak)*\n` +
            `*Nota: Harga tidak termasuk caj tapak perkhemahan*`
        );

        for (let i = 0; i < detailSheets.length; i++) {
            const { file, caption } = detailSheets[i];
            const imageUrl = `${BASE_URL}/images/${encodeURIComponent(file)}`;
            console.log(`[Images] Sending tent rental sheet ${i + 1}/${detailSheets.length}: ${file}`);
            await sendImageMessage(to, imageUrl, caption);
            if (i < detailSheets.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
    } 
    else if (type === 'campsite') {
        const tapakFiles = imageFiles.filter(f => /Tapak/i.test(f));
        if (tapakFiles.length === 0) {
            await sendTextMessage(to, "Sorry, no campsite tapak photos are available at the moment. 😔\nMaaf, tiada gambar tapak perkhemahan disediakan buat masa ini.");
            return;
        }

        await sendTextMessage(to, 
            `Here are our campsite photos (Tapak)! 📸🏕️\nBerikut adalah foto tapak perkhemahan kami! 📸🏕️\n\n` +
            `Total: ${tapakFiles.length} photos / foto`
        );

        for (let i = 0; i < tapakFiles.length; i++) {
            const filename = tapakFiles[i];
            const imageUrl = `${BASE_URL}/images/${encodeURIComponent(filename)}`;
            const caption = filename.replace(/\.[^.]+$/, '');
            console.log(`[Images] Sending campsite photo ${i + 1}/${tapakFiles.length}: ${filename}`);
            await sendImageMessage(to, imageUrl, caption);
            if (i < tapakFiles.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
    } 
    else if (type === 'camp') {
        const campFiles = imageFiles.filter(f => f.toLowerCase().startsWith('camp ') && !f.toLowerCase().includes('pricelist'));
        if (campFiles.length === 0) {
            await sendTextMessage(to, "Sorry, no camp layout photos are available at the moment. 😔\nMaaf, tiada gambar kawasan perkhemahan (Camp) disediakan buat masa ini.");
            return;
        }

        await sendTextMessage(to, 
            `Here are our camp photos (Camp A/B/C/D)! 📸🏕️\nBerikut adalah foto kawasan perkhemahan kami (Camp A/B/C/D)! 📸🏕️\n\n` +
            `Total: ${campFiles.length} photos / foto`
        );

        for (let i = 0; i < campFiles.length; i++) {
            const filename = campFiles[i];
            const imageUrl = `${BASE_URL}/images/${encodeURIComponent(filename)}`;
            const caption = filename.replace(/\.[^.]+$/, '');
            console.log(`[Images] Sending camp photo ${i + 1}/${campFiles.length}: ${filename}`);
            await sendImageMessage(to, imageUrl, caption);
            if (i < campFiles.length - 1) {
                await new Promise(resolve => setTimeout(resolve, 500));
            }
        }
    }
}

// ---------------------------------------------------------------------------
// Normalize informal shorthand so the AI understands slang & abbreviations
// ---------------------------------------------------------------------------
function normalizeMessage(text) {
    return text
        // --- Typo corrections ---
        // "availability" variants: avilability, availabilty, availibility, availbility, availablity
        .replace(/\bav[a-z]{0,3}il[a-z]{0,5}t[yi]\b/gi, "availability")
        .replace(/\bav[ai]{0,2}l[a-z]{0,4}bil[a-z]{0,3}t[yi]\b/gi, "availability")
        // "available" variants: availble, avialable
        .replace(/\bav[a-z]{0,2}il[a-z]{0,2}ble?\b/gi, "available")
        // "reservation" variants: reservaton, reserrvation, rezervation
        .replace(/\bre[sz]e?r{1,2}v[a-z]{0,4}(?:on|tion)\b/gi, "reservation")
        // --- Time abbreviations ---
        .replace(/\btmr\b/gi, "tomorrow")
        .replace(/\btmrw\b/gi, "tomorrow")
        .replace(/\b2day\b/gi, "today")
        .replace(/\b2moro?w?\b/gi, "tomorrow")
        .replace(/\bnxt\b/gi, "next")
        .replace(/\bwknd\b/gi, "weekend")
        .replace(/\bsat\b/gi, "Saturday")
        .replace(/\bsun\b/gi, "Sunday")
        .replace(/\bmon\b/gi, "Monday")
        .replace(/\btue?s?\b/gi, "Tuesday")
        .replace(/\bwed\b/gi, "Wednesday")
        .replace(/\bthur?s?\b/gi, "Thursday")
        .replace(/\bfri\b/gi, "Friday")
        // --- Common shorthand ---
        .replace(/\bpls\b/gi, "please")
        .replace(/\bplz\b/gi, "please")
        .replace(/\bu\b/gi, "you")
        .replace(/\br\b/gi, "are");
}

async function getAIReply(userMessage, phoneNumber, cachedHistory = null, preloadedAvailability = undefined) {

    // Expand informal abbreviations so the AI parses the intent correctly
    const normalizedMessage = normalizeMessage(userMessage);
    if (normalizedMessage !== userMessage) {
        console.log(`[Normalize] "${userMessage}" → "${normalizedMessage}"`);
    }

    const history = cachedHistory !== null
        ? cachedHistory
        : await getConversationHistory(phoneNumber);

    // Use pre-fetched availability if available, otherwise fetch now
    const availabilityContext = preloadedAvailability !== undefined
        ? preloadedAvailability
        : await getAvailabilityContext(normalizedMessage);

    // Build the availability section only when data was found
    const availabilitySection = availabilityContext
        ? `\n\n${availabilityContext}`
        : "";

    // System prompt — narrative describing services, tasks, and constraints
    const systemPrompt = `You are a virtual WhatsApp assistant for Camp Mantap, a premium riverfront campsite nestled in the lush tropical valley of Bentong, Pahang (about 20-25 minutes drive from Bentong town). Our goal is to provide a refreshing, comfortable, and scenic nature escape for camping enthusiasts, family gatherings, and outdoor adventures.

ABOUT CAMP MANTAP SERVICES & FACILITIES:
- Riverfront Sites: Every single campsite directly faces a peaceful, scenic river.
- Essential Conveniences: 24-hour electricity plug points at each campsite (basic usage below 1000W; campers must bring extension cables), individual firepits, clean toilets with water heaters (+soap), and dishwashing areas.
- Self-Service Mini Mart: Operates via Touch 'n Go or QR pay, stocked with ice, ice cream, canned drinks, mineral water, snacks, charcoal, firewood, gasoline, batteries, and other essentials.
- On-Site Amenities: A surau for prayers, convenient parking spaces close to the campsite, and Wi-Fi connectivity (Celcom and Digi signals are strongest).
- Guided Activities: Exciting 45-minute guided ATV tours (priced at RM 70 per car, subject to weight capacity limits), archery, and seasonal fresh fruit purchasing.
- Gear & Services: Camping service package rentals and equipment setup are available.

IMPORTANT RULES & POLICIES:
- Vehicles: Camper vans, motorhomes, and RVs are not recommended due to narrow access roads, single-phase power limits, and low-hanging durian tree branches.
- Prohibited: Charging electric vehicles (EVs) and utilizing high-power portable power stations are strictly forbidden.
- Schedule: Official Check-in is at 2:00 PM, and Check-out is at 12:00 PM (noon). Flexible check-in (after 10:30 AM) and late check-out (up to 4:00 PM) are offered if no prior bookings exist.
- River Safety: The compound is safely positioned 10 feet above the riverbed. We feature a warning siren system and actively monitor river conditions during heavy rain.

YOUR TASKS:
1. Warmly greet guests, representing Camp Mantap with a helpful, polite, professional, and matter-of-fact tone.
2. Reply in the customer's language (Malay or English).
3. If the customer states a preferred name during the conversation, remember it and address them by that name exclusively.
4. **Booking Availability**: If the customer asks about booking slots, available dates, or site availability, you MUST check the "LIVE BOOKING AVAILABILITY" section first:
   - If the requested date(s) are listed as available, state that they are available and provide the details (site, price, etc.) listed. Do NOT state that they are unavailable or fully booked.
   - If the requested date(s) are NOT listed in the live availability data, or if the live availability data is empty, politely explain that those specific dates are fully booked or unavailable, and guide them to check real-time availability or book via the official links.
5. Answer other FAQs, rules, and campsite parameters using the Knowledge Base.
6. If a question is not covered in the provided Knowledge Base or Availability Context, output EXACTLY our standard fallback message and refer them to Miss Jenny.

WHATSAPP FORMATTING RULES (MUST follow strictly):
- For bullet points and lists, ALWAYS use a dash (-) followed by a space. NEVER use asterisk (*) as a bullet point.
- To make text bold, wrap it with single asterisks like *this*. Only use bold for dates or important labels.
- Do NOT use double asterisks (**text**) — WhatsApp does not support this.
- Do NOT mix * as both bullet AND bold in the same message. Use - for bullets and *text* for bold only.
- Keep responses concise and well-spaced for easy reading on mobile.

CRITICAL INSTRUCTION: Your responses MUST be strictly based ONLY on the system prompt narrative (about yourself/services), and the provided Knowledge Base and Availability Context below. 
DO NOT make up any information, prices, policies, or facts. 
If the customer asks about booking or date availability, prioritize the "LIVE BOOKING AVAILABILITY" section over general rules.
If the customer asks who you are or what general services Camp Mantap provides, answer using the "ABOUT CAMP MANTAP SERVICES & FACILITIES" section from this system prompt. 
For other specific questions, if the provided context does not contain the answer, you MUST NOT guess or use outside knowledge.

STRICT RULE — when a question is not covered in the provided system prompt narrative, Knowledge Base, or Availability Context, output EXACTLY this and nothing else after it:
"Sorry, I'm unable to provide an answer to that question at the moment. 😔

For further details, please contact us directly:
📞 +60 12-345 6789
💬 https://wa.me/60123456789

Miss Jenny will be happy to assist you."

=== CAMP MANTAP OFFICIAL KNOWLEDGE BASE ===
${KNOWLEDGE_BASE}
=== END OF KNOWLEDGE BASE ===${availabilitySection}`;

    // Build messages array from conversation history
    const messages = [
        { role: "system", content: systemPrompt }
    ];

    for (const msg of history) {
        messages.push({
            role: msg.role === "user" ? "user" : "assistant",
            content: msg.message
        });
    }

    // Add current user message (normalized for better AI understanding)
    messages.push({ role: "user", content: normalizedMessage });

    console.log(`[Gemini] Sending ${messages.length - 1} message(s) for ${phoneNumber}`);

    // Build Gemini chat history (all messages except system prompt and current user message)
    const geminiHistory = [];
    for (const msg of messages.slice(1, -1)) {
        geminiHistory.push({
            role: msg.role === "assistant" ? "model" : "user",
            parts: [{ text: msg.content }]
        });
    }

    // Gemini requires history to start with a 'user' turn — drop any leading model messages
    while (geminiHistory.length > 0 && geminiHistory[0].role === "model") {
        geminiHistory.shift();
    }

    const model = genAI.getGenerativeModel({
        model: GEMINI_MODEL,
        systemInstruction: systemPrompt
    });

    let result;

    for (let i = 0; i < 3; i++) {

        try {

            const chat = model.startChat({ history: geminiHistory });
            result = await chat.sendMessage(normalizedMessage);

            break;

        } catch (err) {

            const status = err?.status || err?.response?.status;

            if (status === 503 && i < 2) {
                console.log(`Gemini busy. Retrying... (attempt ${i + 1})`);
                await new Promise(resolve => setTimeout(resolve, 2000));
                continue;
            }

            throw err;
        }
    }

    return result.response.text();
}

const PORT = process.env.PORT || 3000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
});