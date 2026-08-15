require("dotenv").config();

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

const express = require("express");
const axios = require("axios");
const path = require("path");

const { GoogleGenerativeAI } = require("@google/generative-ai");
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const GEMINI_MODEL = process.env.GEMINI_MODEL || "gemini-2.0-flash";

const fs = require("fs");
const KNOWLEDGE_BASE = fs.readFileSync(path.join(__dirname, "knowledge_base.md"), "utf8");

const { listDriveImages, driveImageUrl, getAuth } = require('./google-drive');
const { google } = require('googleapis');

const WELCOME_MESSAGE = `Hello! Welcome to Camp Mantap. I am your virtual assistant. 🏕️ Hai! Selamat datang ke Camp Mantap. Saya pembantu maya anda. 🏕️

Please select your preferred language / Sila pilih bahasa pilihan anda:
1. Bahasa Melayu 🇲🇾
2. English 🇬🇧`;

const FALLBACK_MESSAGE = `Sorry, I'm having some technical difficulties right now. 😔

Please try again later`;

const HUMAN_HANDOFF_MESSAGE = `Sorry, I'm unable to assist with that request at the moment. 😔

Please try again later or repeat your question in a clearer form.

---

Maaf, saya tidak dapat membantu dengan permintaan tersebut buat masa ini. 😔

Sila cuba lagi nanti atau ulang soalan anda dengan lebih jelas.`;

const MENUS = {
    en: {
        welcome: WELCOME_MESSAGE,
        mainMenu: `How can I help you today? Please choose a topic below:
1. ℹ️ General Info, Location & Facilities
2. ⛺ Campsites & Pricing (Tapak)
3. 🎪 Tent Rental Packages (Sewa Khemah)
4. 🎯 Activities & Mini Mart
5. 📜 Rules, Safety & Policies
6. 📅 Booking & Registration
7. 📸 Photos & Media
8. 📅 Availability`,
        
        general: {
            prompt: `What would you like to know about?
A. Location & Directions
B. Campsite Facilities
C. Check-In & Check-Out Times
D. Go Back`,
            answers: {
                A: `📍 *Location & Directions*\nCamp Mantap is located around 20-25 minutes drive from Bentong, Pahang. All our campsites face a beautiful river.`,
                B: `⛺ *Campsite Facilities*\nWe provide:\n- 24-hour electricity plug points at each campsite (campers must bring own extension cables)\n- Individual firepits at each campsite\n- Toilets with water heaters (+soap) and washing areas\n- Self-service Mini Mart (selling ice, firewood, charcoal, snacks, drinks, etc.)\n- Surau and car parking close to tapak\n- WiFi (Celcom/Digi signal is best)\n- Guided ATV tours, archery, and other seasonal activities.`,
                C: `⏰ *Check-In & Check-Out Times*\n- Official Check-In: 2:00 PM\n- Official Check-Out: 12:00 PM (noon)\n- Early Check-In: If the date before has no occupied camper at your chosen site (and there is no maintenance work), early check-in is usually possible after 10:30 AM. We will inform you of the earliest check-in time before your arrival day.\n- Late Check-Out: If there is no incoming booking scheduled for your site, check-out can be extended up to 4:00 PM.`
            }
        },
        campsites: {
            prompt: `Choose a campsite category to view pricing and details:
A. Standard (Campsite 2, 3)
B. Medium (Campsite 4, 6, 7, 8, 9)
C. Family (Campsite 1, 5)
D. Additional Pax & Tents Policy
E. Go Back`,
            answers: {
                A: `⛺ *Standard Campsite*\n- Campsites: Campsite 2, Campsite 3\n- Camp Size: 7m x 10m\n- Pax Included in Price: 4 Pax\n- Max Pax: 6 Pax\n- Max Vehicles: 2\n- Pricing: *RM 100 / night*`,
                B: `⛺ *Medium Campsite*\n- Campsites: Campsite 4, Campsite 6, Campsite 7, Campsite 8, Campsite 9\n- Camp Size: 8m x 11m\n- Pax Included in Price: 6 Pax\n- Max Pax: 8 Pax\n- Max Vehicles: 2\n- Pricing: *RM 130 / night*`,
                C: `⛺ *Family Campsite*\n- Campsites: Campsite 1, Campsite 5\n- Camp Size: 10m x 13m\n- Pax Included in Price: 8 Pax\n- Max Pax: 10 Pax\n- Max Vehicles: 3\n- Pricing: *RM 160 / night*`,
                D: `💵 *Additional Pax & Tents*\n- Additional Pax Charges: RM 50 / Pax\n- Infants (4 years old & below): FOC (Free of Charge)\n- Note: Tents in the pictures/gallery are for illustration purposes and size comparison only. Campers must bring their own tents unless renting a tent package.`
            }
        },
        tents: {
            prompt: `Select a tent rental package style (Campsite fee is NOT included):
A. Style A - Payung Village L (Max 4 pax)
B. Style B - Payung Village T (XL) (Max 8 pax)
C. Style C - Dome Style (Max 8 pax)
D. Included Amenities
E. Go Back`,
            answers: {
                A: `🎪 *Style A — Payung Village L*\n- Max pax: 4 people\n- Harga 1 Malam:\n  - 1-2 orang: *RM 250.00*\n  - 3-4 orang: *RM 300.00*\n- Harga Malam Tambahan:\n  - 1-2 orang: *RM 200.00*\n  - 3-4 orang: *RM 250.00*`,
                B: `🎪 *Style B — Payung Village T (XL)*\n- Max pax: 8 people\n- Harga 1 Malam:\n  - 1-4 orang: *RM 350.00*\n  - 5-8 orang: *RM 400.00*\n- Harga Malam Tambahan:\n  - 1-4 orang: *RM 300.00*\n  - 5-8 orang: *RM 350.00*`,
                C: `🎪 *Style C — Dome Style*\n- Max pax: 8 people\n- Harga 1 Malam:\n  - 1-4 orang: *RM 400.00*\n  - 5-8 orang: *RM 500.00*\n- Harga Malam Tambahan:\n  - 1-4 orang: *RM 350.00*\n  - 5-8 orang: *RM 450.00*`,
                D: `🎪 *Tent Rental Amenities*\nAll styles include:\n- Air Mattress / Foam\n- Foam Pillows\n- Fan & Light\n- Table & Chairs (Meja & Kerusi)\n*Note: Price does NOT include the campsite/tapak fee. Utensils are NOT included.*`
            }
        },
        activities: {
            prompt: `What would you like to know about activities?
A. Guided ATV Tours
B. Archery & Seasonal Fruits
C. Self-Service Mini Mart
D. Go Back`,
            answers: {
                A: `🏍️ *Guided ATV Tours*\n- Guided ATV tours only: 45 minutes duration.\n- Pricing: *RM 70.00 per car*\n- Weight limits: Max 90kg for 125cc ATVs, max 110kg for 180cc ATVs.`,
                B: `🎯 *Archery & Seasonal Fruits*\n- Archery: Archery and other seasonal activities are available on-site.\n- Fresh Fruits: You can buy fresh seasonal fruits (e.g. durians) depending on the season/harvest!`,
                C: `🛒 *Campsite Mini Mart*\n- We sell: Ice, Ice Cream, Can Drinks, Mineral Water, Snacks, Charcoal, Firewood, Gasoline, Batteries, etc.\n- Operation: Self-service / Layan Diri\n- Payment: Touch 'n Go or QR pay`
            }
        },
        rules: {
            prompt: `Please select a policy or safety topic:
A. Cancellation & Refund Policy
B. Rescheduling Policy
C. Electricity Usage Policy
D. River & Flood Safety
E. Camper Van, Motorhome & RV Policy
F. Go Back`,
            answers: {
                A: `📜 *Cancellation & Refund Policy*\n- More than 14 days before check-in: 100% Refund\n- 14 to 7 days before check-in: 50% Refund\n- Less than 7 days before check-in: NO Refund`,
                B: `📜 *Rescheduling Policy*\n- Notice must be given more than 14 days before the check-in date.\n- The new date must be within 1 month of the original check-in date.`,
                C: `⚡ *Electricity Usage Policy*\n- Electricity is suitable for basic usage such as phone charging, fan, hair dryer & rice cooker (below 1000 watts).\n- Do not use high-power appliances.\n- *NOT ALLOWED:* Charging EV (electric vehicle) cars.\n- *NOT ALLOWED:* Portable Power Stations.`,
                D: `🌊 *River & Flood Safety*\n- During heavy rain, water levels can rise significantly (historical high of 7 feet).\n- The camp compound is built 10 feet above the riverbed, and water has not overflowed into our compound.\n- We have installed a warning siren system and monitor the river closely when it rains, even in the early hours.`,
                E: `🚌 *Camper Van, Motorhome & RV Policy*\n- Camper vans, Motorhomes, and RVs are NOT recommended/suitable at Camp Mantap due to:\n  - Single-phase power supply limit (insufficient for large vehicle requirements).\n  - Narrow access roads, uneven terrain, and clearance challenges.\n  - Durian tree low clearance (risk of scratches/damage).\n  - Wet weather conditions.`
            }
        },
        booking: {
            prompt: `How would you like to proceed with booking?
A. Online Booking Platforms
B. Booking & Payment Policy
C. Go Back`,
            answers: {
                A: `📅 *Online Booking Platforms*\nTo check availability and book online directly:\n- BookTapak: https://booktapak.com/property/campmantap?locale=en\n- Escabee: https://escabee.com/campsites/camp-mantap`,
                B: `📜 *Booking & Payment Policy*\n- Full payment is required online to secure your campsite.\n- Check check-in/out times under General Info.\n- Cancellation & rescheduling policies can be viewed under Rules & Policies.`
            }
        },
        photos: {
            prompt: `Select a media category to view:
A. Campsite Photos (Tapak 1-9)
B. Camp Zone Photos (Camp A/B/C/D)
C. River & Scenery Photos
D. Activities & Fruit Photos
E. Video Policy
F. Go Back`,
            answers: {
                E: `🎥 *Video Policy*\nSorry, we are unable to send videos via WhatsApp as the file sizes are too large. 😔\n\nHowever, we do have plenty of *photos* available! You can view them by choosing the options A, B, C, or D in this menu.`
            }
        },
        availability: {
            prompt: `Here are our booking platforms to check real-time availability and make booking:
- BookTapak: https://booktapak.com/property/campmantap?locale=en
- Escabee: https://escabee.com/campsites/camp-mantap

Reply 0 to go back to the Main Menu.`
        }
    },
    bm: {
        welcome: WELCOME_MESSAGE,
        mainMenu: `Bagaimana saya boleh membantu anda hari ini? Sila pilih topik di bawah:
1. ℹ️ Maklumat Am, Lokasi & Kemudahan
2. ⛺ Tapak Perkhemahan & Harga (Tapak)
3. 🎪 Pakej Sewa Khemah
4. 🎯 Aktiviti & Mini Mart
5. 📜 Peraturan, Keselamatan & Polisi
6. 📅 Tempahan & Pendaftaran
7. 📸 Foto & Media
8. 📅 Semakan Kekosongan (Availability)`,
        
        general: {
            prompt: `Apakah yang anda ingin ketahui?
A. Lokasi & Arah Jalan
B. Kemudahan Campsite
C. Waktu Masuk & Keluar (Check-in/out)
D. Kembali`,
            answers: {
                A: `📍 *Lokasi & Arah Jalan*\nCamp Mantap terletak dari pekan Bentong, Pahang sekitar 20-25 minit memandu. Semua Tapak di Campsite kami semua menghadap sungai.`,
                B: `⛺ *Kemudahan Campsite*\nKami menyediakan:\n- Plug Point disediakan di setiap tapak perkhemahan (24 jam, bawa extension sendiri, kegunaan biasa bawah 1000W)\n- Firepit setiap tapak\n- Tandas + water heater (+sabun) & Washing area (+sabun)\n- Mini mart layan diri + kayu api ( Touch 'n Go atau QR pay)\n- Surau & Car park dekat tapak\n- WIFI disediakan (hanya celcom/digi ada signal)\n- Aktiviti ATV (RM 70 sekereta), memanah, dll.`,
                C: `⏰ *Waktu Masuk & Keluar*\n- Check-In Rasmi: 2:00 Petang\n- Check-Out Rasmi: 12:00 Tengah Hari\n- Early Check-In: Jika tiada pelanggan pada hari sebelum di tapak anda (dan tiada maintenance), masuk awal dibenarkan selepas 10:30 Pagi. Kami akan maklumkan waktu masuk terawal sebelum hari ketibaan.\n- Late Check-Out: Jika tiada tempahan seterusnya, check-out boleh dilanjutkan sehingga 4:00 Petang.`
            }
        },
        campsites: {
            prompt: `Pilih kategori tapak perkhemahan untuk harga & butiran:
A. Standard (Tapak 2, 3)
B. Medium (Tapak 4, 6, 7, 8, 9)
C. Family (Tapak 1, 5)
D. Caj Pax Tambahan & Polisi Khemah
E. Kembali`,
            answers: {
                A: `⛺ *Tapak Standard*\n- Tapak: Tapak 2, Tapak 3\n- Saiz: 7m x 10m\n- Pax Termasuk dalam Harga: 4 Pax\n- Maks Pax: 6 Pax\n- Maks Kenderaan: 2\n- Harga: *RM 100 / malam*`,
                B: `⛺ *Tapak Medium*\n- Tapak: Tapak 4, Tapak 6, Tapak 7, Tapak 8, Tapak 9\n- Saiz: 8m x 11m\n- Pax Termasuk dalam Harga: 6 Pax\n- Maks Pax: 8 Pax\n- Maks Kenderaan: 2\n- Harga: *RM 130 / malam*`,
                C: `⛺ *Tapak Family*\n- Tapak: Tapak 1, Tapak 5\n- Saiz: 10m x 13m\n- Pax Termasuk dalam Harga: 8 Pax\n- Maks Pax: 10 Pax\n- Maks Kenderaan: 3\n- Harga: *RM 160 / malam*`,
                D: `💵 *Caj Pax Tambahan & Polisi Khemah*\n- Caj Pax Tambahan: RM 50 / Pax\n- Kanak-kanak (4 tahun & ke bawah): Percuma (FOC)\n- Nota: Khemah di dalam gambar adalah untuk ilustrasi & perbandingan saiz sahaja. Pelanggan perlu membawa khemah sendiri melainkan menempah pakej sewa.`
            }
        },
        tents: {
            prompt: `Pilih gaya pakej sewa khemah (Harga TIDAK termasuk tapak):
A. Style A - Payung Village L (Maks 4 pax)
B. Style B - Payung Village T (XL) (Maks 8 pax)
C. Style C - Dome Style (Maks 8 pax)
D. Kemudahan Disediakan
E. Kembali`,
            answers: {
                A: `🎪 *Style A — Payung Village L*\n- Maks pax: 4 orang\n- Harga 1 Malam:\n  - 1-2 orang: *RM 250.00*\n  - 3-4 orang: *RM 300.00*\n- Harga Malam Tambahan:\n  - 1-2 orang: *RM 200.00*\n  - 3-4 orang: *RM 250.00*`,
                B: `🎪 *Style B — Payung Village T (XL)*\n- Maks pax: 8 orang\n- Harga 1 Malam:\n  - 1-4 orang: *RM 350.00*\n  - 5-8 orang: *RM 400.00*\n- Harga Malam Tambahan:\n  - 1-4 orang: *RM 300.00*\n  - 5-8 orang: *RM 350.00*`,
                C: `🎪 *Style C — Dome Style*\n- Maks pax: 8 orang\n- Harga 1 Malam:\n  - 1-4 orang: *RM 400.00*\n  - 5-8 orang: *RM 500.00*\n- Harga Malam Tambahan:\n  - 1-4 orang: *RM 350.00*\n  - 5-8 orang: *RM 450.00*`,
                D: `🎪 *Butiran Sewa Khemah*\nSemua pakej sewa termasuk:\n- Tilam Angin / Tilam Foam\n- Bantal Foam\n- Kipas & Lampu\n- Meja & Kerusi\n*Nota: Harga tidak termasuk yuran tapak perkhemahan. Peralatan memasak TIDAK disediakan.*`
            }
        },
        activities: {
            prompt: `Apakah yang anda ingin tahu tentang aktiviti?
A. Lawatan ATV Berpandu
B. Memanah & Buah-buahan Musiman
C. Mini Mart Layan Diri
D. Kembali`,
            answers: {
                A: `🏍️ *Lawatan ATV Berpandu*\n- Pemanduan berpandu sahaja: 45 minit.\n- Harga: *RM 70.00 sekereta*\n- Had berat: Maks 90kg untuk ATV 125cc, maks 110kg untuk ATV 180cc.`,
                B: `🎯 *Memanah & Buah-buahan*\n- Memanah: Aktiviti memanah dan aktiviti bermusim lain disediakan di tapak.\n- Buah Segar: Anda boleh beli buah segar (bergantung pada musim buah durian, dll)!`,
                C: `🛒 *Mini Mart Layan Diri*\n- Kami menjual: Ais, Ais Krim, Air Tin, Air Mineral, Makanan Ringan, Arang, Kayu Api, Petrol, Bateri, dll.\n- Operasi: Layan Diri / Self-service\n- Bayaran: Touch 'n Go atau QR pay`
            }
        },
        rules: {
            prompt: `Sila pilih polisi atau topik keselamatan:
A. Polisi Pembatalan & Pemulangan Wang (Refund)
B. Polisi Penjadualan Semula (Rescheduling)
C. Polisi Penggunaan Elektrik
D. Keselamatan Sungai & Banjir
E. Polisi Camper Van, Motorhome & RV
F. Kembali`,
            answers: {
                A: `📜 *Polisi Pembatalan & Refund*\n- Lebih 14 hari sebelum check-in: 100% Refund\n- 14 hingga 7 hari sebelum check-in: 50% Refund\n- Kurang 7 hari sebelum check-in: TIADA Refund`,
                B: `📜 *Polisi Rescheduling*\n- Notis mesti diberikan lebih 14 hari sebelum check-in.\n- Tarikh baru mesti dalam tempoh 1 bulan dari tarikh check-in asal.`,
                C: `⚡ *Polisi Penggunaan Elektrik*\n- Kuasa sesuai untuk cas telefon, kipas, pengering rambut & periuk nasi (bawah 1000W).\n- *TIDAK DIBENARKAN:* Mengecas kereta elektrik (EV).\n- *TIDAK DIBENARKAN:* Menggunakan Portable Power Station.`,
                D: `🌊 *Keselamatan Sungai & Banjir*\n- Semasa hujan lebat, paras air akan meningkat. Rekod tertinggi adalah 7 kaki.\n- Kawasan kem dibina 10 kaki di atas paras sungai, jadi air tidak melimpah ke kawasan kami.\n- Siren amaran dipasang dan sungai dipantau rapat apabila hujan lebat.`,
                E: `🚌 *Polisi Camper Van, Motorhome & RV*\n- Camper van, Motorhome, dan RV adalah TIDAK disyorkan/sesuai di Camp Mantap kerana:\n  - Had bekalan elektrik fasa tunggal.\n  - Jalan masuk sempit dan mencabar.\n  - Dahan pokok durian rendah (risiko calar/rosak).\n  - Keadaan cuaca basah.`
            }
        },
        booking: {
            prompt: `Bagaimanakah anda ingin meneruskan tempahan?
A. Platform Tempahan Dalam Talian
B. Polisi Tempahan & Bayaran
C. Kembali`,
            answers: {
                A: `📅 *Platform Tempahan Dalam Talian*\nUntuk semak kekosongan dan tempahan terus:\n- BookTapak: https://booktapak.com/property/campmantap?locale=en\n- Escabee: https://escabee.com/campsites/camp-mantap`,
                B: `📜 *Polisi Tempahan & Bayaran*\n- Bayaran penuh diperlukan secara atas talian untuk mengesahkan tapak.\n- Sila semak waktu check-in/out di bawah Maklumat Am.\n- Polisi pembatalan/penjadualan boleh disemak di bawah Peraturan & Polisi.`
            }
        },
        photos: {
            prompt: `Pilih kategori media untuk melihat gambar:
A. Foto Tapak Perkhemahan (Tapak 1-9)
B. Foto Kawasan Khemah (Camp A/B/C/D)
C. Foto Sungai & Pemandangan
D. Foto Aktiviti & Buah-buahan
F. Kembali`,
        },
        availability: {
            prompt: `Berikut adalah platform tempahan kami untuk menyemak kekosongan dan tempahan secara terus:
- BookTapak: https://booktapak.com/property/campmantap?locale=en
- Escabee: https://escabee.com/campsites/camp-mantap

Taip 0 untuk kembali ke Menu Utama.`
        }
    }
};

// ---------------------------------------------------------------------------
// Session management — language cache & inactivity tracking
// ---------------------------------------------------------------------------

/** How long of a silence (ms) before the next message restarts AI-first mode. */
const SESSION_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * In-memory language cache.  Survives within the current server process;
 * resets on restart (which correctly triggers AI-first for every user again).
 * { phoneNumber → 'en' | 'bm' }
 */
const langCache = new Map();

function getCachedLang(phoneNumber) {
    return langCache.get(phoneNumber) || null;
}

function setCachedLang(phoneNumber, lang) {
    langCache.set(phoneNumber, lang);
}

/**
 * Returns true if this is a "first message" — either:
 *   - No conversation history exists (brand-new customer), OR
 *   - More than SESSION_TTL_MS has elapsed since the last DB row.
 * Uses the DB timestamp so it survives server restarts.
 */
function isInactiveSession(history) {
    if (!history || history.length === 0) return true;
    const lastMsg = history[history.length - 1];
    if (!lastMsg.created_at) return false; // can't determine; assume active
    const lastActivityMs = new Date(lastMsg.created_at).getTime();
    return (Date.now() - lastActivityMs) > SESSION_TTL_MS;
}

/**
 * Returns the main FAQ menu string for the given language.
 * Always appended to AI replies so customers see their options.
 */
function buildFaqMenu(lang) {
    const safeLang = (lang === 'en') ? 'en' : 'bm';
    return MENUS[safeLang].mainMenu;
}

function getChatState(history) {
    for (let i = history.length - 1; i >= 0; i--) {
        if (history[i].role !== 'assistant') continue;
        const msg = history[i].message;

        // Level 0 Welcome
        if (msg.includes("Please select your preferred language") || msg.includes("Sila pilih bahasa pilihan anda")) {
            return { level: 0, lang: null, menu: null };
        }

        // Level 1 Main Menu
        if (msg.includes("How can I help you today? Please choose a topic below:") || msg.includes("Bagaimana saya boleh membantu anda hari ini? Sila pilih topik di bawah:")) {
            const isEn = msg.includes("How can I help you today?");
            return { level: 1, lang: isEn ? 'en' : 'bm', menu: null };
        }

        // Level 2 Sub-menus
        // 1. General Info
        if (msg.includes("What would you like to know about?") && msg.includes("Location & Directions")) {
            return { level: 2, lang: 'en', menu: 'general' };
        }
        if (msg.includes("Apakah yang anda ingin ketahui?") && msg.includes("Lokasi & Arah Jalan")) {
            return { level: 2, lang: 'bm', menu: 'general' };
        }

        // 2. Campsites & Pricing
        if (msg.includes("Choose a campsite category to view pricing") && msg.includes("Standard")) {
            return { level: 2, lang: 'en', menu: 'campsites' };
        }
        if (msg.includes("Pilih kategori tapak perkhemahan untuk harga") && msg.includes("Standard")) {
            return { level: 2, lang: 'bm', menu: 'campsites' };
        }

        // 3. Tent Rental
        if (msg.includes("Select a tent rental package style") && msg.includes("Payung Village L")) {
            return { level: 2, lang: 'en', menu: 'tents' };
        }
        if (msg.includes("Pilih gaya pakej sewa khemah") && msg.includes("Payung Village L")) {
            return { level: 2, lang: 'bm', menu: 'tents' };
        }

        // 4. Activities & Mini Mart
        if (msg.includes("What would you like to know about activities?") && msg.includes("Guided ATV Tours")) {
            return { level: 2, lang: 'en', menu: 'activities' };
        }
        if (msg.includes("Apakah yang anda ingin tahu tentang aktiviti?") && msg.includes("Lawatan ATV Berpandu")) {
            return { level: 2, lang: 'bm', menu: 'activities' };
        }

        // 5. Rules, Safety & Policies
        if (msg.includes("Please select a policy or safety topic:") && msg.includes("Cancellation")) {
            return { level: 2, lang: 'en', menu: 'rules' };
        }
        if (msg.includes("Sila pilih polisi atau topik keselamatan:") && msg.includes("Pembatalan")) {
            return { level: 2, lang: 'bm', menu: 'rules' };
        }

        // 6. Booking & Registration
        if (msg.includes("How would you like to proceed with booking?") && msg.includes("Online Booking Platforms")) {
            return { level: 2, lang: 'en', menu: 'booking' };
        }
        if (msg.includes("Bagaimanakah anda ingin meneruskan tempahan?") && msg.includes("Platform Tempahan Dalam Talian")) {
            return { level: 2, lang: 'bm', menu: 'booking' };
        }

        // 7. Photos & Media
        if (msg.includes("Select a media category to view:") && msg.includes("Campsite Photos")) {
            return { level: 2, lang: 'en', menu: 'photos' };
        }
        if (msg.includes("Pilih kategori media untuk melihat gambar:") && msg.includes("Foto Tapak Perkhemahan")) {
            return { level: 2, lang: 'bm', menu: 'photos' };
        }

        // 8. Availability
        if (msg.includes("Here are our booking platforms to check real-time availability:") || msg.includes("Berikut adalah platform tempahan kami untuk menyemak kekosongan")) {
            const isEn = msg.includes("Here are our booking platforms");
            return { level: 2, lang: isEn ? 'en' : 'bm', menu: 'availability' };
        }
    }

    return { level: 0, lang: null, menu: null };
}

function isGoBackCommand(input, menu) {
    const cleaned = input.trim().toLowerCase();
    if (cleaned === '0' || cleaned === '00' || cleaned === 'back' || cleaned === 'kembali' || cleaned === 'menu' || cleaned === 'main') {
        return true;
    }
    
    const goBackLetters = {
        general: 'd',
        campsites: 'e',
        tents: 'e',
        activities: 'd',
        rules: 'f',
        booking: 'c',
        photos: 'f',
        availability: '0'
    };

    return goBackLetters[menu] === cleaned;
}

function isRequestingHuman(text) {
    const lower = text.toLowerCase();
    const patterns = [
        /\b(talk|speak|chat|connect|contact|reach|get)\s+(to|with)\s+(a\s+)?(human|person|agent|staff|owner|someone|real\s*person)\b/i,
        /\b(talk|speak|chat|connect|reach|call|message)\s+(to|with)\s+(miss\s*jenny|jenny)\b/i,
        /\bcontact\s+(miss\s*jenny|jenny)\b/i,
        /\b(i\s+want|i'd\s+like|can\s+i|may\s+i|please)\s+(to\s+)?(talk|speak|chat|connect)\s+(to|with)\b/i,
        /\bconnect\s+me\s+to\s+(a[n]?\s+)?(human|person|agent|staff|someone)\b/i,
        /\b(transfer|escalate|forward)\s+(me\s+)?(to\s+)?(human|person|agent|miss\s*jenny|jenny)\b/i,
        /\bperson[\s-]?in[\s-]?charge\b/i,
        /\bpic\b/i,
        /\b(need|want)\s+to\s+(talk|speak|chat|contact|reach|call)\s+(to\s+|with\s+)?(miss\s*jenny|jenny)\b/i,
        /\b(nak|mahu|boleh|saya\s+nak)\s+(cakap|bercakap|hubungi|contact|jumpa)\s+(dengan\s+)?(miss\s*jenny|jenny|owner|tuan|puan|orang)\b/i,
        /\b(cakap|bercakap)\s+dengan\s+(manusia|orang\s+sebenar|staff|pekerja)\b/i,
        /\bhubungi\s+(miss\s*jenny|jenny|owner)\b/i,
        /\borang\s+yang\s+bertanggungjawab\b/i,
    ];
    return patterns.some(p => p.test(lower));
}

// ---------------------------------------------------------------------------
// Detect availability queries
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
    /\b(?:0?[1-9]|[12]\d|3[01])[/\-.](?:0?[1-9]|1[0-2])(?:[/\-.](?:\d{4}|\d{2}))?\b/,
    /\b\d{4}[/\-.](?:0?[1-9]|1[0-2])[/\-.](?:0?[1-9]|[12]\d|3[01])\b/,
    /\b(?:0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th|hb)?\s*(?:of\s+)?(?:jan(?:uary)?|januari|feb(?:ruary)?|februari|mar(?:ch)?|mac|apr(?:il)?|may|mei|jun(?:e)?|julai|aug(?:ust)?|ogos|sept?(?:ember)?|oct(?:ober)?|oktober|nov(?:ember)?|november|dec(?:ember)?|disember)\b/i,
    /\b(?:jan(?:uary)?|januari|feb(?:ruary)?|februari|mar(?:ch)?|mac|apr(?:il)?|may|mei|jun(?:e)?|julai|aug(?:ust)?|ogos|sept?(?:ember)?|oct(?:ober)?|oktober|nov(?:ember)?|november|dec(?:ember)?|disember)\s*(?:0?[1-9]|[12]\d|3[01])(?:st|nd|rd|th)?\b/i
];

function isAvailabilityQuestion(text) {
    const lower = text.toLowerCase();

    for (let i = 0; i < DIRECT_AVAILABILITY_PATTERNS.length; i++) {
        if (DIRECT_AVAILABILITY_PATTERNS[i].test(lower)) return true;
    }

    for (let i = 0; i < DATE_FORMAT_PATTERNS.length; i++) {
        if (DATE_FORMAT_PATTERNS[i].test(lower)) return true;
    }

    for (let i = 0; i < CONTEXTUAL_AVAILABILITY_PATTERNS.length; i++) {
        if (CONTEXTUAL_AVAILABILITY_PATTERNS[i].test(lower)) return true;
    }

    return false;
}

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

    // 3. ATV Ride / ATV car (e.g., "atv", "atv ride", "atv tour", "atv car", "gambar atv")
    const atvPatterns = [
        /\batv\b/i,
        /\bgambar\s+atv\b/i,
        /\b(atv\s+(ride|tour|car|price|photo|image|picture|detail|pic|foto)s?)\b/i
    ];
    if (atvPatterns.some(p => p.test(lower))) {
        return 'atv';
    }

    // 4. Camp zone photos (Camp A / B / C / D) — checked BEFORE campsite to avoid misrouting
    // Matches: "Camp A photo", "show me Camp B", "gambar Camp C", "Camp D pictures", etc.
    const campZonePatterns = [
        /\bcamp\s+[abcd]\b/i,                                                                  // "Camp A", "camp b"
        /\bcamp\s+[abcd]\s+(picture|photo|image|pic|foto|gambar|gallery)s?\b/i,               // "Camp A photos"
        /\b(picture|photo|image|pic|foto|gambar|gallery)s?\s+(of\s+)?camp\s+[abcd]\b/i,       // "photos of Camp B"
        /\bcamp\s+(picture|photo|image|pic|foto|gambar|gallery)s?\b/i,                         // "camp photos" (no specific letter)
        /\b(picture|photo|image|pic|foto|gambar|gallery)s?\s+(of\s+)?camp\b(?!\s*site)/i,     // "photos of camp" (not campsite)
        /\bgambar\s+camp\b(?!\s*site)/i,                                                       // "gambar camp" (not campsite)
        /\b(tunjuk|lihat|tengok)\s+camp\b(?!\s*site)/i,                                       // "tunjuk camp" (not campsite)
        /\bcamp\s+[abcd]\s+(area|zone|kawasan|bahagian)\b/i                                    // "Camp A area"
    ];
    if (campZonePatterns.some(p => p.test(lower))) {
        return 'camp';
    }

    // 5. Campsite (Tapak / numbered spots 1–9) photos
    // Matches: "campsite photo", "tapak picture", "gambar tapak", etc.
    const campsitePatterns = [
        /\bcampsite\s+(picture|photo|image|pic|foto|gambar|gallery)s?\b/i,
        /\b(picture|photo|image|pic|foto|gambar|gallery)s?\s+(of\s+)?campsite\b/i,
        /\bgambar\s+(tapak|campsite)\b/i,
        /\b(tunjuk|lihat|tengok)\s+(tapak|campsite)\b/i,
        /\btapak\s+(picture|photo|image|pic|foto|gambar|gallery)s?\b/i,
        /\btapak\s+[1-9]\b/i                                                                   // "tapak 3", "tapak 7"
    ];
    if (campsitePatterns.some(p => p.test(lower))) {
        return 'campsite';
    }

    // 6. Archery
    const archeryPatterns = [
        /\barchery\b/i,
        /\bmemanah\b/i,
        /\bpanah\b/i,
        /\b(archery|memanah|panah)\s+(photo|image|picture|pic|foto|gambar)s?\b/i
    ];
    if (archeryPatterns.some(p => p.test(lower))) {
        return 'archery';
    }

    // 7. Durian / Seasonal fruit
    const durianPatterns = [
        /\bdurian\b/i,
        /\bseasonal\s+fruit\b/i,
        /\bfruit\s+(collection|activity|season|photo|image|gambar)s?\b/i,
        /\b(gambar|foto)\s+(durian|buah)\b/i,
        /\bbuah\s+(durian|segar|musim)\b/i,
        /\bbeli\s+buah\b/i
    ];
    if (durianPatterns.some(p => p.test(lower))) {
        return 'durian';
    }

    // 8. River
    const riverPatterns = [
        /\briver\b/i,
        /\bsungai\b/i,
        /\b(river|sungai)\s+(photo|image|picture|pic|foto|gambar|view)s?\b/i
    ];
    if (riverPatterns.some(p => p.test(lower))) {
        return 'river';
    }

    // 9. Morning AND night combined — check before individual morning/night
    const morningAndNightPatterns = [
        /\bmorning\b.*\bnight\b/i,    // "morning and night", "morning & night"
        /\bnight\b.*\bmorning\b/i,    // "night and morning"
        /\bpagi\b.*\bmalam\b/i,
        /\bmalam\b.*\bpagi\b/i
    ];
    if (morningAndNightPatterns.some(p => p.test(lower))) {
        return 'scenery';
    }

    // 10. Morning scenery
    const morningPatterns = [
        /\bmorning\s+(view|sight|scene|scenery|sceneries|photo|image|picture|pic|foto|gambar)s?\b/i,
        /\b(show|send|share|see|view|display)\s+(me\s+)?(the\s+)?morning\b/i,  // "show me the morning"
        /\bgambar\s+pagi\b/i,
        /\bpemandangan\s+pagi\b/i,
        /\bsuasana\s+pagi\b/i
    ];
    if (morningPatterns.some(p => p.test(lower))) {
        return 'morning';
    }

    // 11. Night scenery
    const nightPatterns = [
        /\bnight\s+(view|sight|scene|scenery|sceneries|photo|image|picture|pic|foto|gambar)s?\b/i,
        /\b(show|send|share|see|view|display)\s+(me\s+)?(the\s+)?night\b/i,    // "show me the night"
        /\bgambar\s+malam\b/i,
        /\bpemandangan\s+malam\b/i,
        /\bsuasana\s+malam\b/i
    ];
    if (nightPatterns.some(p => p.test(lower))) {
        return 'night';
    }

    // 12. General scenery / environment (morning + night + river combined)
    const sceneryPatterns = [
        /\bsceneri(?:es|y)\b/i,         // "scenery" AND "sceneries" (plural fix)
        /\b(landscape|surrounding|environment|atmosphere|ambiance|ambience)\b/i,
        /\b(pemandangan|suasana|persekitaran)\b/i,
        /\b(nature|alam\s+semula\s+jadi)\b/i
    ];
    if (sceneryPatterns.some(p => p.test(lower))) {
        return 'scenery';
    }

    // 12. Payment return record (refund record lookup by name)
    const paymentReturnPatterns = [
        /\b(payment\s+return|return\s+payment|refund\s+record|rekod\s+bayaran\s+balik|rekod\s+refund)\b/i,
        /\b(refund|pulangan|bayaran\s+balik)\s+(record|rekod|status|slip|proof|bukti)\b/i,
        /\b(my|my\s+refund|semak|check)\s+(refund|payment\s+return|bayaran\s+balik)\b/i,
        /\b(payment\s+return|return|refund)\s+(record|rekod|saya|aku|my)\b/i,
    ];
    if (paymentReturnPatterns.some(p => p.test(lower))) {
        return 'payment_return';
    }

    // 13. Ingredients budget
    const ingredientsBudgetPatterns = [
        /\b(ingredients?|bahan|barang)\s+(budget|belanjawan|list|senarai)\b/i,
        /\b(budget|belanjawan)\s+(ingredients?|bahan|barang|masak)\b/i,
        /\bingredients?\s+budget\b/i,
    ];
    if (ingredientsBudgetPatterns.some(p => p.test(lower))) {
        return 'ingredients_budget';
    }

    // 14. Generic image request — ambiguous, ask the customer which type they want
    const genericImagePatterns = [
        /\b(show|send|share|see|view|look\s*at|display)\s+(me\s+)?(the\s+)?(images?|photos?|pictures?|pics?|gallery)\b/i,
        /\b(images?|photos?|pictures?|pics?|gallery)\b/i,
        /\b(gambar|foto|imej)\b/i
    ];
    if (genericImagePatterns.some(p => p.test(lower))) {
        return 'ask';
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

// ── Supabase diagnostic route (TEMPORARY — remove after debugging) ──────────
app.get('/test-db', async (req, res) => {
    const results = {};

    // 1. Try a SELECT from the conversations table
    const { data: selectData, error: selectError } = await supabase
        .from('conversations')
        .select('*')
        .limit(1);

    results.select = selectError
        ? { ok: false, code: selectError.code, message: selectError.message, details: selectError.details, hint: selectError.hint }
        : { ok: true, rowCount: selectData.length };

    // 2. Try an INSERT with the same fields the bot uses
    const { error: insertError } = await supabase
        .from('conversations')
        .insert([{ phone_number: 'TEST_DIAGNOSTIC', role: 'user', message: 'db connectivity test' }]);

    results.insert = insertError
        ? { ok: false, code: insertError.code, message: insertError.message, details: insertError.details, hint: insertError.hint }
        : { ok: true };

    // 3. If insert succeeded, clean up the test row
    if (!insertError) {
        await supabase
            .from('conversations')
            .delete()
            .eq('phone_number', 'TEST_DIAGNOSTIC');
        results.cleanup = 'test row deleted';
    }

    res.json(results);
});
// ────────────────────────────────────────────────────────────────────────────

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

// Proxy route to stream Google Drive images securely
app.get('/drive-image/:fileId', async (req, res) => {
    const { fileId } = req.params;
    if (!fileId) {
        return res.status(400).send('Missing fileId');
    }

    try {
        const auth = getAuth();
        const drive = google.drive({ version: 'v3', auth });

        // 1. Get metadata to retrieve the MIME type and name
        const metadata = await drive.files.get({
            fileId,
            fields: 'mimeType,name'
        });

        res.setHeader('Content-Type', metadata.data.mimeType);
        res.setHeader('Content-Disposition', `inline; filename="${metadata.data.name}"`);

        // 2. Fetch the file content as a stream
        const response = await drive.files.get(
            { fileId, alt: 'media' },
            { responseType: 'stream' }
        );

        response.data
            .on('error', (err) => {
                console.error(`[Drive Proxy] Stream error for file ${fileId}:`, err.message);
                if (!res.headersSent) {
                    res.status(500).send('Error streaming file');
                }
            })
            .pipe(res);

    } catch (err) {
        console.error(`[Drive Proxy] Failed to fetch file ${fileId}:`, err.message);
        if (!res.headersSent) {
            res.status(500).send('Failed to fetch image from Google Drive');
        }
    }
});

// Deduplicate incoming messages — WhatsApp can send the same webhook more than once
const processedMessageIds = new Set();

// Incoming WhatsApp messages
app.post("/webhook", async (req, res) => {
    try {
        const value = req.body.entry?.[0]?.changes?.[0]?.value;

        // Silently ignore delivery/read receipts
        if (value?.statuses) {
            return res.sendStatus(200);
        }

        if (value?.messages) {
            const message = value.messages[0];
            const sender = message.from;
            const text = message.text?.body;

            // Skip stale messages (older than 30 seconds)
            const msgTimestamp = parseInt(message.timestamp) * 1000;
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
            setTimeout(() => processedMessageIds.delete(message.id), 5 * 60 * 1000);

            console.log("Customer:", sender);
            console.log("Message:", text);

            let replyMsg;

            try {
                // Fetch conversation history
                const existingHistory = await getConversationHistory(sender);

                // ── 1. Human handoff check (highest priority) ─────────────────────────
                if (isRequestingHuman(text)) {
                    console.log(`[Handoff] Human contact request detected from ${sender}`);
                    replyMsg = HUMAN_HANDOFF_MESSAGE;
                } else {
                    const normalizedInput = text.trim().toLowerCase();
                    const state = getChatState(existingHistory);

                    // Effective language: in-memory cache → history-detected → default BM
                    const sessionLang = getCachedLang(sender) || state.lang || 'bm';

                    // ── 2. First-message / re-entry check ────────────────────────────────
                    // Triggers AI-first mode when:
                    //   a) Brand-new customer (no history), OR
                    //   b) Customer has been silent for > 1 hour.
                    const firstMsg = isInactiveSession(existingHistory);

                    if (firstMsg) {
                        // ── AI-FIRST MODE ───────────────────────────────────────────────
                        // Gemini answers the question naturally, detects EN/BM, then we
                        // append the FAQ main menu so the customer can drill deeper.
                        console.log(`[Flow] AI-first mode for ${sender} (new/inactive session)`);
                        const aiResult = await getAIReply(text, sender, existingHistory, true);
                        const detectedLang = aiResult.lang || 'bm';
                        setCachedLang(sender, detectedLang);
                        replyMsg = `${aiResult.text}\n\n---\n\n${buildFaqMenu(detectedLang)}`;

                    } else if (state.level === 1) {
                        // ── MAIN MENU: numbered option picks (1–8) ───────────────────────
                        const lang = state.lang || sessionLang;
                        if (normalizedInput === '1') {
                            replyMsg = MENUS[lang].general.prompt;
                        } else if (normalizedInput === '2') {
                            replyMsg = MENUS[lang].campsites.prompt;
                        } else if (normalizedInput === '3') {
                            replyMsg = MENUS[lang].tents.prompt;
                        } else if (normalizedInput === '4') {
                            replyMsg = MENUS[lang].activities.prompt;
                        } else if (normalizedInput === '5') {
                            replyMsg = MENUS[lang].rules.prompt;
                        } else if (normalizedInput === '6') {
                            replyMsg = MENUS[lang].booking.prompt;
                        } else if (normalizedInput === '7') {
                            replyMsg = MENUS[lang].photos.prompt;
                        } else if (normalizedInput === '8') {
                            replyMsg = MENUS[lang].availability.prompt;
                        } else {
                            // Free-text at main menu level → AI answers + FAQ menu
                            console.log(`[Flow] Free-text at main menu for ${sender} → AI`);
                            const aiText = await getAIReply(text, sender, existingHistory);
                            replyMsg = `${aiText}\n\n---\n\n${buildFaqMenu(lang)}`;
                        }

                    } else if (state.level === 2) {
                        // ── SUB-MENU: lettered option picks ──────────────────────────────
                        const lang = state.lang || sessionLang;
                        const menu = state.menu || 'general';

                        if (isGoBackCommand(text, menu)) {
                            replyMsg = MENUS[lang].mainMenu;
                        } else {
                            const subMenuObj = MENUS[lang][menu];
                            const optionKey = text.trim().toUpperCase();

                            if (subMenuObj && subMenuObj.answers && subMenuObj.answers[optionKey]) {
                                // Valid lettered pick → show answer then repeat the sub-menu
                                const answer = subMenuObj.answers[optionKey];
                                replyMsg = `${answer}\n\n---\n\n${subMenuObj.prompt}`;
                            } else if (menu === 'photos' && ['A', 'B', 'C', 'D'].includes(optionKey)) {
                                const imageTypeMap = { 'A': 'campsite', 'B': 'camp', 'C': 'scenery', 'D': 'atv' };
                                const type = imageTypeMap[optionKey];
                                console.log(`[Images Menu] Sending ${type} photos to ${sender}`);

                                if (optionKey === 'D') {
                                    await handleImageRequest(sender, 'atv', text);
                                    await new Promise(r => setTimeout(r, 800));
                                    await handleImageRequest(sender, 'archery', text);
                                    await new Promise(r => setTimeout(r, 800));
                                    await handleImageRequest(sender, 'durian', text);
                                } else {
                                    await handleImageRequest(sender, type, text);
                                }

                                await new Promise(r => setTimeout(r, 1500));
                                replyMsg = subMenuObj.prompt;
                            } else {
                                // Free-text or unrecognised option at sub-menu → AI + FAQ menu
                                console.log(`[Flow] Free-text at sub-menu for ${sender} → AI`);
                                const aiText = await getAIReply(text, sender, existingHistory);
                                replyMsg = `${aiText}\n\n---\n\n${buildFaqMenu(lang)}`;
                            }
                        }

                    } else {
                        // ── NO STATE / UNKNOWN — treat as a fresh first message ───────────
                        console.log(`[Flow] No prior state for ${sender} → AI-first fallback`);
                        const aiResult = await getAIReply(text, sender, existingHistory, true);
                        const detectedLang = aiResult.lang || 'bm';
                        setCachedLang(sender, detectedLang);
                        replyMsg = `${aiResult.text}\n\n---\n\n${buildFaqMenu(detectedLang)}`;
                    }
                }

                // Save conversation to Supabase
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
                            message: replyMsg
                        }
                    ]);

                if (dbError) {
                    console.error("=== SUPABASE INSERT ERROR ===");
                    console.error("Code:", dbError.code);
                    console.error("Message:", dbError.message);
                    console.error("============================");
                } else {
                    console.log("Supabase: conversation saved ✓");
                }

                // Send the reply message via WhatsApp
                await axios.post(
                    `https://graph.facebook.com/v25.0/${process.env.PHONE_NUMBER_ID}/messages`,
                    {
                        messaging_product: "whatsapp",
                        to: sender,
                        type: "text",
                        text: {
                            body: replyMsg
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
                console.error("=== WEBHOOK MESSAGE PROCESS ERROR ===");
                console.error("Message:", err?.message);
                console.error("=====================================");

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
                            message: FALLBACK_MESSAGE
                        }
                    ]);

                try {
                    await sendTextMessage(sender, FALLBACK_MESSAGE);
                } catch (sendErr) {
                    console.error("Failed to send fallback message:", sendErr.message);
                }

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
        console.error(err.response?.data || err.message);
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
async function handleImageRequest(to, type, text = "") {
    const BASE_URL = process.env.SERVER_URL || `http://localhost:${process.env.PORT || 3000}`;
    const imagesDir = path.join(__dirname, 'public', 'images');

    // Read all image files from the images directory
    const allFiles = fs.readdirSync(imagesDir);
    const imageFiles = allFiles.filter(f => /\.(jpe?g|png|webp|gif)$/i.test(f));

    if (imageFiles.length === 0) {
        console.log('[Images] No image files found in public/images');
        await sendTextMessage(to, "Sorry, no images are available at the moment. 😔\nPlease try again later or repeat your question in a clearer form.\n\n---\n\nMaaf, tiada gambar disediakan buat masa ini. 😔\nSila cuba lagi nanti atau ulang soalan anda dengan lebih jelas.");
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
    else if (type === 'atv') {
        const atvFiles = imageFiles.filter(f => /atv/i.test(f));
        if (atvFiles.length === 0) {
            await sendTextMessage(to, "Sorry, no ATV photos are available at the moment. 😔\nMaaf, tiada gambar ATV disediakan buat masa ini.");
            return;
        }

        await sendTextMessage(to,
            `Here are our ATV car photos! 🏍️🏕️\nBerikut adalah foto kenderaan ATV kami! 🏍️🏕️\n\n` +
            `Total: ${atvFiles.length} photos / foto`
        );

        for (let i = 0; i < atvFiles.length; i++) {
            const filename = atvFiles[i];
            const imageUrl = `${BASE_URL}/images/${encodeURIComponent(filename)}`;
            const caption = filename.replace(/\.[^.]+$/, '');
            console.log(`[Images] Sending ATV photo ${i + 1}/${atvFiles.length}: ${filename}`);
            await sendImageMessage(to, imageUrl, caption);
            if (i < atvFiles.length - 1) {
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
            `Here are our camp zone photos (Camp A/B/C/D)! 📸🏕️\nBerikut adalah foto kawasan perkhemahan kami (Camp A/B/C/D)! 📸🏕️\n\n` +
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
    else if (type === 'archery') {
        const archeryFiles = imageFiles.filter(f => /archery/i.test(f));
        if (archeryFiles.length === 0) {
            await sendTextMessage(to, "Sorry, no archery photos are available at the moment. 😔\nMaaf, tiada gambar memanah disediakan buat masa ini.");
            return;
        }
        await sendTextMessage(to,
            `Here are our archery activity photos! 🏹🎯\nBerikut adalah foto aktiviti memanah kami! 🏹🎯\n\nTotal: ${archeryFiles.length} photo(s) / foto`
        );
        for (let i = 0; i < archeryFiles.length; i++) {
            const filename = archeryFiles[i];
            const imageUrl = `${BASE_URL}/images/${encodeURIComponent(filename)}`;
            console.log(`[Images] Sending archery photo ${i + 1}/${archeryFiles.length}: ${filename}`);
            await sendImageMessage(to, imageUrl, '🏹 Archery Activity / Aktiviti Memanah — Camp Mantap');
            if (i < archeryFiles.length - 1) await new Promise(r => setTimeout(r, 500));
        }
    }
    else if (type === 'durian') {
        const durianFiles = imageFiles.filter(f => /durian/i.test(f));
        if (durianFiles.length === 0) {
            await sendTextMessage(to, "Sorry, no durian/fruit photos are available at the moment. 😔\nMaaf, tiada gambar durian/buah disediakan buat masa ini.");
            return;
        }
        await sendTextMessage(to,
            `Here are our seasonal durian fruit photos! 🍈🌿\nBerikut adalah foto aktiviti beli buah durian kami (mengikut musim)! 🍈🌿\n\nTotal: ${durianFiles.length} photo(s) / foto`
        );
        for (let i = 0; i < durianFiles.length; i++) {
            const filename = durianFiles[i];
            const imageUrl = `${BASE_URL}/images/${encodeURIComponent(filename)}`;
            console.log(`[Images] Sending durian photo ${i + 1}/${durianFiles.length}: ${filename}`);
            await sendImageMessage(to, imageUrl, '🍈 Seasonal Durian / Buah Musiman — Camp Mantap');
            if (i < durianFiles.length - 1) await new Promise(r => setTimeout(r, 500));
        }
    }
    else if (type === 'river') {
        const riverFiles = imageFiles.filter(f => /^river\./i.test(f));
        if (riverFiles.length === 0) {
            await sendTextMessage(to, "Sorry, no river photos are available at the moment. 😔\nMaaf, tiada gambar sungai disediakan buat masa ini.");
            return;
        }
        await sendTextMessage(to,
            `Here is our beautiful riverside view! 🌊🏕️\nBerikut adalah pemandangan tepi sungai kami! 🌊🏕️\n\nTotal: ${riverFiles.length} photo(s) / foto`
        );
        for (let i = 0; i < riverFiles.length; i++) {
            const filename = riverFiles[i];
            const imageUrl = `${BASE_URL}/images/${encodeURIComponent(filename)}`;
            console.log(`[Images] Sending river photo ${i + 1}/${riverFiles.length}: ${filename}`);
            await sendImageMessage(to, imageUrl, '🌊 Riverside View / Pemandangan Sungai — Camp Mantap');
            if (i < riverFiles.length - 1) await new Promise(r => setTimeout(r, 500));
        }
    }
    else if (type === 'morning') {
        const morningFiles = imageFiles.filter(f => /^morning/i.test(f));
        if (morningFiles.length === 0) {
            await sendTextMessage(to, "Sorry, no morning view photos are available at the moment. 😔\nMaaf, tiada gambar pemandangan pagi disediakan buat masa ini.");
            return;
        }
        await sendTextMessage(to,
            `Here are our morning scenery photos! 🌅🏕️\nBerikut adalah foto pemandangan pagi di Camp Mantap! 🌅🏕️\n\nTotal: ${morningFiles.length} photo(s) / foto`
        );
        for (let i = 0; i < morningFiles.length; i++) {
            const filename = morningFiles[i];
            const imageUrl = `${BASE_URL}/images/${encodeURIComponent(filename)}`;
            console.log(`[Images] Sending morning photo ${i + 1}/${morningFiles.length}: ${filename}`);
            await sendImageMessage(to, imageUrl, '🌅 Morning Scenery / Pemandangan Pagi — Camp Mantap');
            if (i < morningFiles.length - 1) await new Promise(r => setTimeout(r, 500));
        }
    }
    else if (type === 'night') {
        const nightFiles = imageFiles.filter(f => /^night/i.test(f));
        if (nightFiles.length === 0) {
            await sendTextMessage(to, "Sorry, no night view photos are available at the moment. 😔\nMaaf, tiada gambar pemandangan malam disediakan buat masa ini.");
            return;
        }
        await sendTextMessage(to,
            `Here are our night scenery photos! 🌙✨🏕️\nBerikut adalah foto pemandangan malam di Camp Mantap! 🌙✨🏕️\n\nTotal: ${nightFiles.length} photo(s) / foto`
        );
        for (let i = 0; i < nightFiles.length; i++) {
            const filename = nightFiles[i];
            const imageUrl = `${BASE_URL}/images/${encodeURIComponent(filename)}`;
            console.log(`[Images] Sending night photo ${i + 1}/${nightFiles.length}: ${filename}`);
            await sendImageMessage(to, imageUrl, '🌙 Night Scenery / Pemandangan Malam — Camp Mantap');
            if (i < nightFiles.length - 1) await new Promise(r => setTimeout(r, 500));
        }
    }
    else if (type === 'scenery') {
        const sceneryFiles = imageFiles.filter(f => /^(morning|night|river)/i.test(f));
        if (sceneryFiles.length === 0) {
            await sendTextMessage(to, "Sorry, no scenery photos are available at the moment. 😔\nMaaf, tiada gambar pemandangan disediakan buat masa ini.");
            return;
        }
        await sendTextMessage(to,
            `Here are our Camp Mantap scenery photos! 🌅🌙🌊\nBerikut adalah foto suasana dan pemandangan Camp Mantap! 🌅🌙🌊\n\nTotal: ${sceneryFiles.length} photo(s) / foto`
        );
        for (let i = 0; i < sceneryFiles.length; i++) {
            const filename = sceneryFiles[i];
            const imageUrl = `${BASE_URL}/images/${encodeURIComponent(filename)}`;
            const label = /^morning/i.test(filename) ? '🌅 Morning View' : /^night/i.test(filename) ? '🌙 Night View' : '🌊 River View';
            console.log(`[Images] Sending scenery photo ${i + 1}/${sceneryFiles.length}: ${filename}`);
            await sendImageMessage(to, imageUrl, `${label} / Pemandangan — Camp Mantap`);
            if (i < sceneryFiles.length - 1) await new Promise(r => setTimeout(r, 500));
        }
    }
    else if (type === 'payment_return') {
        const folderId = process.env.GDRIVE_FOLDER_PAYMENT_RETURN_RECORDS;
        if (!folderId || folderId === 'PASTE_FOLDER_ID_HERE') {
            await sendTextMessage(to, "Sorry, payment return records are not available at the moment. 😔\nPlease contact our admin directly.\n\n---\n\nMaaf, rekod bayaran balik tidak tersedia buat masa ini. Sila hubungi admin kami secara terus.");
            return;
        }

        // Extract a name from the message to filter records
        const nameMatch = text.match(/\b(?:for|of|nama|name|bagi)\s+([A-Za-z][A-Za-z\s]{1,30})/i)
            || text.match(/([A-Z][a-z]+(?:\s+[A-Z][a-z]+)+)/)  // capitalised proper name e.g. "Ahmad Bin Ali"
            || text.match(/\b([a-z]{3,})(?:'s)?\s+(?:record|refund|payment)/i);
        const searchName = nameMatch ? nameMatch[1].trim().toLowerCase() : null;

        const allFiles = await listDriveImages(folderId);
        if (allFiles.length === 0) {
            await sendTextMessage(to, "Sorry, no payment return records are available at the moment. 😔\n\nMaaf, tiada rekod bayaran balik tersedia buat masa ini.");
            return;
        }

        const matchedFiles = searchName
            ? allFiles.filter(f => f.name.toLowerCase().includes(searchName))
            : allFiles;

        if (matchedFiles.length === 0) {
            await sendTextMessage(to,
                `Sorry, I couldn't find a payment return record for *${nameMatch?.[1]?.trim()}*. 😔\n\n` +
                `Please double-check the name or contact our admin directly.\n\n---\n\n` +
                `Maaf, tiada rekod bayaran balik dijumpai untuk *${nameMatch?.[1]?.trim()}*. ` +
                `Sila semak semula nama atau hubungi admin kami.`
            );
            return;
        }

        await sendTextMessage(to,
            `Here are the payment return record(s) found 📄\n` +
            (searchName ? `Name / Nama: *${nameMatch?.[1]?.trim()}*\n` : '') +
            `Total: ${matchedFiles.length} record(s)`
        );
        for (let i = 0; i < matchedFiles.length; i++) {
            const f = matchedFiles[i];
            const imageUrl = driveImageUrl(f.id);
            console.log(`[Drive] Sending payment return record ${i + 1}/${matchedFiles.length}: ${f.name}`);
            await sendImageMessage(to, imageUrl, `💸 Payment Return Record — ${f.name}`);
            if (i < matchedFiles.length - 1) await new Promise(r => setTimeout(r, 500));
        }
    }
    else if (type === 'ingredients_budget') {
        const folderId = process.env.GDRIVE_FOLDER_INGREDIENTS_BUDGET;
        if (!folderId || folderId === 'PASTE_FOLDER_ID_HERE') {
            await sendTextMessage(to, "Sorry, the ingredients budget is not available at the moment. 😔\nPlease contact our admin directly.\n\n---\n\nMaaf, belanjawan bahan tidak tersedia buat masa ini. Sila hubungi admin kami secara terus.");
            return;
        }

        const allFiles = await listDriveImages(folderId);
        if (allFiles.length === 0) {
            await sendTextMessage(to, "Sorry, no ingredients budget files are available at the moment. 😔\n\nMaaf, tiada fail belanjawan bahan tersedia buat masa ini.");
            return;
        }

        await sendTextMessage(to,
            `Here are the ingredients budget file(s)! 🛒📋\nBerikut adalah fail belanjawan bahan kami! 🛒📋\n\nTotal: ${allFiles.length} file(s)`
        );
        for (let i = 0; i < allFiles.length; i++) {
            const f = allFiles[i];
            const imageUrl = driveImageUrl(f.id);
            console.log(`[Drive] Sending ingredients budget file ${i + 1}/${allFiles.length}: ${f.name}`);
            await sendImageMessage(to, imageUrl, `🛒 Ingredients Budget — ${f.name}`);
            if (i < allFiles.length - 1) await new Promise(r => setTimeout(r, 500));
        }
    }
    else if (type === 'ask') {
        await sendTextMessage(to,
            `Sure! We have photos available for the following 📸\n\n` +
            `*Facilities & Sites*\n` +
            `- Campsite photos (Tapak 1–9)\n` +
            `- Camp zone photos (Camp A / B / C / D)\n` +
            `- River view\n\n` +
            `*Scenery*\n` +
            `- Morning scenery\n` +
            `- Night scenery\n\n` +
            `*Activities*\n` +
            `- ATV ride photos\n` +
            `- Archery photos\n` +
            `- Seasonal durian fruit photos\n\n` +
            `*Pricing*\n` +
            `- Campsite pricelist poster\n` +
            `- Tent rental packages\n\n` +
            `Which would you like to see? 😊`
        );
        console.log(`[Images] Ambiguous image request from ${to} — sent clarification prompt`);
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

async function getAIReply(userMessage, phoneNumber, cachedHistory = null, detectLang = false) {

    // Expand informal abbreviations so the AI parses the intent correctly
    const normalizedMessage = normalizeMessage(userMessage);
    if (normalizedMessage !== userMessage) {
        console.log(`[Normalize] "${userMessage}" → "${normalizedMessage}"`);
    }

    const history = cachedHistory !== null
        ? cachedHistory
        : await getConversationHistory(phoneNumber);

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
4. **Booking Availability**: If the customer asks about booking slots, available dates, or site availability, explain that they can check real-time availability and book online directly through our official booking platforms (BookTapak or Escabee). Provide the links for them.
5. Answer other FAQs, rules, and campsite parameters using the Knowledge Base.
6. If a question is not covered in the provided Knowledge Base, output EXACTLY our standard fallback message asking them to try again later or repeat the question in a clearer form.

WHATSAPP FORMATTING RULES (MUST follow strictly):
- For bullet points and lists, ALWAYS use a dash (-) followed by a space. NEVER use asterisk (*) as a bullet point.
- To make text bold, wrap it with single asterisks like *this*. Only use bold for dates or important labels.
- Do NOT use double asterisks (**text**) — WhatsApp does not support this.
- Do NOT mix * as both bullet AND bold in the same message. Use - for bullets and *text* for bold only.
- Keep responses concise and well-spaced for easy reading on mobile.

CRITICAL INSTRUCTION: Your responses MUST be strictly based ONLY on the system prompt narrative (about yourself/services), and the provided Knowledge Base below. 
DO NOT make up any information, prices, policies, or facts. 
If the customer asks who you are or what general services Camp Mantap provides, answer using the "ABOUT CAMP MANTAP SERVICES & FACILITIES" section from this system prompt. 
For other specific questions, if the provided context does not contain the answer, you MUST NOT guess or use outside knowledge.

LANGUAGE RULE: Detect the language used in the customer's message. If they write in Bahasa Melayu, respond in Bahasa Melayu. If they write in English, respond in English. Apply this to ALL responses, including the fallback rules below.

STRICT RULES for unanswerable questions — follow exactly based on the situation:

RULE A — If the question is RELATED to Camp Mantap (e.g. about our packages, facilities, activities, pricing, policies, bookings, or anything about us) BUT the specific information is not available in the Knowledge Base, output EXACTLY the matching version below:

[If customer wrote in English]:
"Sorry, I'm unable to provide an answer to that question at the moment. 😔

Please try again later or repeat your question in a clearer form."

[If customer wrote in Bahasa Melayu]:
"Maaf, saya tidak dapat menjawab soalan tersebut buat masa ini. 😔

Sila cuba lagi nanti atau ulang soalan anda dengan lebih jelas."

RULE B — If the question is COMPLETELY UNRELATED to Camp Mantap (e.g. general knowledge, other topics, other businesses), output EXACTLY the matching version below:

[If customer wrote in English]:
"Thank you for your question! 😊 I'm Mantap Assistant, and I'm specifically here to help with anything related to Camp Mantap — such as our packages, facilities, activities, availability, and bookings.

I'm afraid I'm not able to assist with topics outside of Camp Mantap. Please try again later or repeat your question in a clearer form if it is about Camp Mantap!"

[If customer wrote in Bahasa Melayu]:
"Terima kasih atas soalan anda! 😊 Saya Mantap Assistant, dan saya di sini khusus untuk membantu dengan segala perkara berkaitan Camp Mantap — seperti pakej, kemudahan, aktiviti, ketersediaan, dan tempahan kami.

Saya tidak dapat membantu dengan topik di luar Camp Mantap. Sila cuba lagi nanti atau ulang soalan anda dengan lebih jelas jika ia mengenai Camp Mantap!"

=== CAMP MANTAP OFFICIAL KNOWLEDGE BASE ===
${KNOWLEDGE_BASE}
=== END OF KNOWLEDGE BASE ===`;

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

    // When detectLang=true, append a language-detection instruction so the AI
    // reveals whether the customer wrote in EN or BM on their first message.
    const langDetectAddendum = detectLang
        ? `\n\nLANGUAGE DETECTION (mandatory for this response only):\nAnalyse the language of the customer's message.\nAt the very end of your response — on a completely new line by itself — write EXACTLY one of the following (no text after it):\nLANG:en\nLANG:bm\nUse LANG:en ONLY if the customer clearly wrote in English. Use LANG:bm for Bahasa Melayu, mixed language, or any ambiguous/undetectable language.`
        : '';

    const model = genAI.getGenerativeModel({
        model: GEMINI_MODEL,
        systemInstruction: systemPrompt + langDetectAddendum
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

    const rawText = result.response.text();

    if (detectLang) {
        // Parse and strip the LANG: tag appended by the AI to detect language
        let aiText = rawText;
        let detectedLang = 'bm'; // safe default: BM

        // Primary: LANG: line at the very end (with optional trailing whitespace)
        const langMatch = aiText.match(/(\r?\n)(LANG:(en|bm))\s*$/i);
        if (langMatch) {
            detectedLang = langMatch[3].toLowerCase();
            aiText = aiText.slice(0, langMatch.index).trim();
        } else {
            // Fallback: inspect the last line of the response
            const lines = aiText.trimEnd().split('\n');
            const lastLine = lines[lines.length - 1].trim();
            if (/^LANG:en$/i.test(lastLine)) { detectedLang = 'en'; lines.pop(); }
            else if (/^LANG:bm$/i.test(lastLine)) { detectedLang = 'bm'; lines.pop(); }
            aiText = lines.join('\n').trim();
        }

        console.log(`[LangDetect] Detected: ${detectedLang} for ${phoneNumber}`);
        return { text: aiText, lang: detectedLang };
    }

    return rawText;
}

const PORT = process.env.PORT || 3000;

if (process.env.NODE_ENV !== 'test') {
    app.listen(PORT, () => {
        console.log(`Server running on port ${PORT}`);
    });
} else {
    module.exports = { MENUS, getChatState, isGoBackCommand, isRequestingHuman };
}