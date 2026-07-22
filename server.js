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

const { getFAQForMessage } = require("./faq");
const { getAvailabilityContext } = require("./availability");

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
            let timeout;

            try {
                timeout = setTimeout(async () => {
                    try {
                        await sendTextMessage(
                            sender,
                            "⏳ Reading your request, please wait a moment..."
                        );
                    } catch (err) {
                        console.error("Failed to send typing indicator:", err.message);
                    }
                }, 500);

                // Check if this is a new customer (no prior history)
                const existingHistory = await getConversationHistory(sender);
                const isNewCustomer = existingHistory.length === 0;

                // Send welcome message first for new customers
                if (isNewCustomer) {
                    console.log("New customer detected — sending welcome message");
                    await sendTextMessage(sender, WELCOME_MESSAGE);
                    // Small delay so messages arrive in order
                    await new Promise(resolve => setTimeout(resolve, 800));
                }

                // Check if customer is exclusively requesting to speak to a human
                if (isRequestingHuman(text)) {
                    console.log(`[Handoff] Human contact request detected from ${sender}`);
                    clearTimeout(timeout);
                    aiReply = HUMAN_HANDOFF_MESSAGE;
                } else {
                    aiReply = await getAIReply(
                        text,
                        sender,
                        existingHistory
                    );
                }

                clearTimeout(timeout);

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
                            message: aiReply
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
                            body: aiReply
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
                if (timeout) clearTimeout(timeout);
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

async function getAIReply(userMessage, phoneNumber, cachedHistory = null) {

    // Expand informal abbreviations so the AI parses the intent correctly
    const normalizedMessage = normalizeMessage(userMessage);
    if (normalizedMessage !== userMessage) {
        console.log(`[Normalize] "${userMessage}" → "${normalizedMessage}"`);
    }

    const history = cachedHistory !== null
        ? cachedHistory
        : await getConversationHistory(phoneNumber);

    // Run FAQ lookup and availability check using the normalized message
    const [faqKnowledge, availabilityContext] = await Promise.all([
        Promise.resolve(getFAQForMessage(normalizedMessage)),
        getAvailabilityContext(normalizedMessage)
    ]);

    // Build the availability section only when data was found
    const availabilitySection = availabilityContext
        ? `\n\n${availabilityContext}`
        : "";

    // System prompt — keep concise to save tokens
    const systemPrompt = `You are a WhatsApp assistant for Camp Mantap campsite (near Bentong, Pahang).
Be helpful and professional. Keep a neutral, matter-of-fact tone.
Reply in the customer's language (Malay or English).
If the customer has stated a preferred name during this conversation, use that name — not any other name — for the rest of the conversation.

WHATSAPP FORMATTING RULES (MUST follow strictly):
- For bullet points and lists, ALWAYS use a dash (-) followed by a space. NEVER use asterisk (*) as a bullet point.
- To make text bold, wrap it with single asterisks like *this*. Only use bold for dates or important labels.
- Do NOT use double asterisks (**text**) — WhatsApp does not support this.
- Do NOT mix * as both bullet AND bold in the same message. Use - for bullets and *text* for bold only.
- Keep responses concise and well-spaced for easy reading on mobile.

CRITICAL INSTRUCTION: Your responses MUST be strictly based ONLY on the provided FAQ and Availability Context below. 
DO NOT make up any information, prices, policies, or facts. 
If the provided context does not contain the answer, you MUST NOT guess or use outside knowledge.

STRICT RULE — when a question is not covered in the provided FAQ or Availability Context, output EXACTLY this and nothing else after it:
"Sorry, I'm unable to provide an answer to that question at the moment. 😔

For further details, please contact us directly:
📞 +60 12-345 6789
💬 https://wa.me/60123456789

Miss Jenny will be happy to assist you."

${faqKnowledge}${availabilitySection}`;

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