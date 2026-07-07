require("dotenv").config();

// Supabase Connection
const { createClient } = require('@supabase/supabase-js');
const supabase = createClient(
    process.env.SUPABASE_URL,
    process.env.SUPABASE_SERVICE_KEY
);

const express = require("express");
const axios = require("axios");

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);

// Camp Mantap FAQ Knowledge Base (Miss Jenny's official answers)
const { getFAQForMessage } = require("./faq");

// Welcome message sent to first-time customers only
const WELCOME_MESSAGE = `👋 Hi! Selamat datang ke *Camp Mantap* 🏕️

This is our official WhatsApp channel. Feel free to ask us anything about our campsite, bookings, or activities and we'll be happy to help! 😊`;

const app = express();
const ACCESS_TOKEN = process.env.WHATSAPP_TOKEN;

// Parse JSON payloads from Meta
app.use(express.json());

// Choose any token you want
const VERIFY_TOKEN = process.env.VERIFY_TOKEN;

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

// Privacy Policy page
app.get('/privacy', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'privacy-policy.html'));
});

// Health check
app.get('/health', (req, res) => {
    res.status(200).send('OK');
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
                const timeout = setTimeout(async () => {
                    await sendTextMessage(
                        sender,
                        "⏳ Reading your request, please wait a moment..."
                    );
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

                aiReply = await getAIReply(
                    text,
                    sender,
                    existingHistory
                );

                clearTimeout(timeout);

                await supabase
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
                // Log full error details for debugging
                console.error("=== AI REPLY ERROR ===");
                console.error("Status:", err?.status || err?.response?.status);
                console.error("Message:", err?.message);
                console.error("Body:", JSON.stringify(err?.response?.data || err?.error, null, 2));
                console.error("======================");

                // Send fallback message so customer isn't left hanging
                try {
                    await sendTextMessage(
                        sender,
                        `Sorry, I'm having some technical difficulties right now. 😔\n\nPlease contact Miss Jenny directly for assistance:\n📞 +60 12-345 6789\n💬 https://wa.me/60123456789`
                    );
                } catch (sendErr) {
                    console.error("Failed to send fallback message:", sendErr.message);
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

async function getAIReply(userMessage, phoneNumber, cachedHistory = null) {

    const history = cachedHistory !== null
        ? cachedHistory
        : await getConversationHistory(phoneNumber);

    // Smart FAQ: only inject entries relevant to this specific message (~600 token saving)
    const faqKnowledge = getFAQForMessage(userMessage);

    // System prompt — keep concise to save tokens
    const systemPrompt = `You are a WhatsApp assistant for Camp Mantap campsite (near Bentong, Pahang).
Be helpful and professional. Keep a neutral, matter-of-fact tone.
Reply in the customer's language (Malay or English).
If the customer has stated a preferred name during this conversation, use that name — not any other name — for the rest of the conversation.

STRICT RULE — when a question is not covered, output EXACTLY this and nothing else after it:
"For further details, please contact us directly:
📞 +60 12-345 6789
💬 https://wa.me/60123456789"

NEVER add phrases like "She'll be happy to help", "happy to assist", "pasti dapat membantu", or any similar cheerful filler after the contact details.

${faqKnowledge}`;

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

    // Add current user message
    messages.push({ role: "user", content: userMessage });

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
        model: "gemini-2.5-flash",
        systemInstruction: systemPrompt
    });

    let result;

    for (let i = 0; i < 3; i++) {

        try {

            const chat = model.startChat({ history: geminiHistory });
            result = await chat.sendMessage(userMessage);

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