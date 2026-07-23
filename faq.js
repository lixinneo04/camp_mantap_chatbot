// Camp Mantap FAQ Knowledge Base
// These are the official answers provided by Miss Jenny.
// Gemini will use these as the source of truth when answering customer questions.

const FAQ = [
    {
        topics: [
            "who are you", "siapa kamu", "siapa anda", "siapa jk", "what is this", "apa ini",
            "what service", "servis apa", "services", "perkhidmatan", "provide", "tawarkan",
            "about us", "tentang kami", "campsite", "tapak perkhemahan", "kemudahan"
        ],
        answer: `ABOUT US & SERVICES:
I am the virtual WhatsApp assistant for Camp Mantap.

Camp Mantap is a premium campsite located around 20-25 minutes drive from Bentong, Pahang, where all our campsites face a beautiful river.

We provide:
- Riverfront camping sites (all sites face the river)
- 24-hour electricity plug points at each campsite
- Firepits at each campsite
- Toilets with water heaters (+soap) and washing areas
- Self-service Mini Mart (selling ice, firewood, charcoal, snacks, drinks, etc.)
- Surau and close-by car parking
- WiFi (Celcom/Digi)
- Guided ATV tours (RM 70 per car), archery, and other seasonal activities`
    },
    {
        topics: [
            "location", "where", "mana", "address", "alamat",
            "camp mantap", "bentong", "how to get", "directions"
        ],
        answer: `CAMP MANTAP INFORMATION

Salam, terima kasih atas minat anda terhadap tapak perkhemahan kami @ Camp Mantap

Kami Camp Mantap terletak dari pekan Bentong, Pahang sekitar 20-25 minit memandu.

Semua Tapak di Campsite kami semua menghadap sungai.

Ada kemudahan:
- Plug Point disediakan di setiap tapak perkhemahan (24 jam untuk setiap tapak - penggunaan biasa)
- Camper diminta membawa extension cable sendiri untuk kegunaan di tapak
- Firepit setiap tapak
- Tandas + water heater (+sabun)
- Washing area (+sabun)
- Mini mart + kayu api
- Surau
- Car park dekat tapak
- WIFI disediakan (hanya celcom/digi ada signal)
- Nikmati aktiviti kami - ATV, memanah dan lain-lain. ATV Harga - RM 70.00 per car
- Camping Service Package Rental & etc
- Beli buah segar! (Bergantung pada musim)`
    },
    {
        topics: [
            "check in", "check out", "check-in", "check-out",
            "masa", "time", "what time", "pukul berapa",
            "earliest", "awal", "late check out"
        ],
        answer: `Official Time:

Check in 2pm and Check out 12noon.

But if the date before and after there is no occupied camper of your choice the night before or there is no maintenance work & others, we will inform you the earliest time you can check in before your arrival day.

Usually the earliest check in is after 10.30 am.

For Check-Out, if there is no campsite scheduled for your site, you can check-out anytime from normal hours until 4.00 pm.`
    },
    {
        topics: [
            "mini mart", "sell", "jual", "ice", "ais", "charcoal",
            "arang", "kayu api", "firewood", "snack", "drink",
            "mineral water", "gasoline", "battery", "ice cream",
            "beli", "shop", "kedai", "store"
        ],
        answer: `Campsite Mini Mart - Kami ada menjual / We sell:
- Ice
- Ice Cream
- Can Drink / Mineral Water
- Snacks / Titbits
- Kayu Arang or Api / Charcoal or Firewood
- Gasoline / Battery & etc

Jenis operasi: Layan Diri / Self Service
Mod pembayaran: TnG atau QR`
    },
    {
        topics: [
            "refund", "cancel", "reschedule", "tukar tarikh",
            "change date", "polisi", "policy", "bayar balik",
            "pembatalan", "postpone"
        ],
        answer: `Cancellation & Refund Policy:
100% Refund (more than 14 days before check-in)
50% Refund (14 - 7 days before check-in)
NO Refund (Less than 7 days before check-in)

Rescheduling Policy:
Notice must be made more than 14 days before check-in date.
Validity - new date must be within 1 month from the current check-in date.`
    },
    {
        topics: [
            "electricity", "elektrik", "plug", "plug point",
            "power", "watt", "EV", "electric car", "kereta EV",
            "portable power station", "charger", "cas", "extension"
        ],
        answer: `Usage of Electricity:

Suitable for basic usage such as phone charging, fan, hair dryer & rice cooker. (Below 1000 watt)

Do not use appliances that require high power capacity.

NOT ALLOWED: Charging EV cars
NOT ALLOWED: Portable Power Stations`
    },
    {
        topics: [
            "ATV", "atv ride", "quad bike", "harga ATV",
            "ATV price", "ATV cost", "how much ATV",
            "activities", "aktiviti", "archery", "memanah"
        ],
        answer: `ATV Ride Information:

ATV Harga - RM 70.00 per car

(Subject to total weight not exceeding 90kg for 125cc and 110kg for 180cc)

We offer guided tours only - 45 minutes.`
    },
    {
        topics: [
            "camper van", "motorhome", "RV", "motor home",
            "caravan", "big vehicle", "kenderaan besar",
            "van besar", "campervan"
        ],
        answer: `Camper Van / Motorhome Policy:

Camper Vans, Motorhomes, and RVs are generally not suitable for our campsite due to several factors:

- Our electrical infrastructure is based on a single-phase power supply, which may not be sufficient for the power requirements of larger camper vehicles.
- The access road includes narrow sections, uneven terrain, and areas that may be challenging for larger vehicles to navigate safely.
- There are durian trees within the campsite and along the access route. Low-hanging branches and limited clearance may pose a risk of scratches or damage to larger vehicles.
- During wet weather, road conditions can become more difficult for camper vans and RVs.

We do not recommend bringing Camper Vans, Motorhomes, or RVs to Camp Mantap.`
    },
    {
        topics: [
            "river", "sungai", "flood", "banjir", "water level",
            "paras air", "rain", "hujan", "lebat", "heavy rain",
            "safe", "selamat", "dangerous", "bahaya"
        ],
        answer: `Regarding the River / Sungai:

During heavy rain, water levels can rise significantly and we have seen a highest level of 7 feet. Our compound is 10 feet above and so far we have not encountered water overflowing into our area.

We cannot say that our area will never flood as Nature is very hard to predict. Therefore, we have installed a siren warning system and we will monitor the river when it rains, even in the early hours.

Semasa hujan lebat, paras air akan meningkat dengan ketara dan kami telah melihat paras tertinggi iaitu 7 kaki. Perkarangan kami berada pada 10 kaki di atas dan setakat ini kami tidak menemui air melimpah ke kawasan kami.`
    }
];

/**
 * Build a comprehensive FAQ knowledge block to inject into the AI prompt.
 * @returns {string} Formatted FAQ knowledge base string
 */
function buildFAQKnowledge() {
    let knowledge = "=== CAMP MANTAP OFFICIAL FAQ (Use these exact answers when questions match) ===\n\n";
    FAQ.forEach((item, index) => {
        knowledge += `--- FAQ ${index + 1} (Keywords: ${item.topics.slice(0, 5).join(", ")}) ---\n`;
        knowledge += item.answer;
        knowledge += "\n\n";
    });
    knowledge += "=== END OF OFFICIAL FAQ ===\n";
    return knowledge;
}

/**
 * Return only the FAQ entries relevant to the customer's message.
 * Falls back to a short topic index if nothing matches.
 * @param {string} text - The customer's message
 * @returns {string} Compact FAQ block
 */
function getFAQForMessage(text) {
    const lower = text.toLowerCase();
    const matched = FAQ.filter(item =>
        item.topics.some(topic => lower.includes(topic.toLowerCase()))
    );

    if (matched.length > 0) {
        let block = "=== RELEVANT FAQ ===\n\n";
        matched.forEach(item => {
            block += item.answer + "\n\n";
        });
        block += "=== END FAQ ===";
        return block;
    }

    // No match — provide a short topic index so AI knows what we cover
    return `=== CAMP MANTAP TOPICS WE CAN ANSWER ===
Location & facilities | Check-in/out times | Mini mart items | Refund & cancellation policy | Electricity usage | ATV rides | Camper van policy | River & flood safety

If the customer asks about any of these, let them know you can provide details. For anything else, refer to Miss Jenny: +60 12-345 6789`;
}

module.exports = { FAQ, buildFAQKnowledge, getFAQForMessage };
