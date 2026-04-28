import express from "express";
import dotenv from "dotenv";
import dns from "dns/promises";
import { getFaqReply, hotelKnowledge } from "./knowledge.js";
import { sendInquiryEmail } from "./mailer.js";
import { getAiReply } from "./ai.js";

dotenv.config();

const app = express();
app.use(express.json({ limit: "50kb" }));

const PORT = process.env.PORT || 3000;

const userLanguage = {};
const userInquiryState = {};

const chatRateLimit = {};
const inquiryRateLimit = {};

const CHAT_RATE_LIMIT_WINDOW_MS = 60 * 1000;
const CHAT_RATE_LIMIT_MAX_MESSAGES = 35;

const INQUIRY_RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const INQUIRY_RATE_LIMIT_MAX_EMAILS = 3;

const COMMANDS = {
  menu: ["menu", "мени", "meni"],
  language: ["language", "јазик", "jazik", "jezik", "gjuha"],
  reset: ["reset", "ресет"],
  cancel: ["cancel", "откажи", "otkazi", "stop", "стоп", "anulo"],
  contact: ["contact", "контакт", "kontakt"],
};

function hitRateLimit(key, store, maxHits, windowMs) {
  const now = Date.now();

  if (!store[key]) {
    store[key] = [];
  }

  store[key] = store[key].filter((timestamp) => now - timestamp < windowMs);

  if (store[key].length >= maxHits) {
    return true;
  }

  store[key].push(now);
  return false;
}

function normalizeCommand(text = "") {
  return text.trim().toLowerCase();
}

function matchesCommand(text, commandList = []) {
  return commandList.includes(normalizeCommand(text));
}

function containsAny(text = "", keywords = []) {
  return keywords.some((keyword) => text.includes(keyword));
}

function cleanBotReply(text = "") {
  return String(text || "")
    .replace(/\*\*/g, "")
    .replace(/#{1,6}\s?/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function getLanguageLabel(language = "en") {
  if (language === "mk") return "Macedonian";
  if (language === "sr") return "Serbian";
  if (language === "sq") return "Albanian";
  return "English";
}

function textByLanguage(language, values) {
  return values[language] || values.en || values.mk || "";
}

function getInvalidEmailMessage(language = "en") {
  return textByLanguage(language, {
    mk: "Внесете валидна e-mail адреса за понуда 😊",
    en: "Please enter a valid email address for the offer 😊",
    sr: "Unesite validnu e-mail adresu za ponudu 😊",
    sq: "Shkruani një email adresë të vlefshme për ofertën 😊",
  });
}

function normalizeEmail(value = "") {
  return String(value || "").trim().toLowerCase();
}

function hasBasicEmailFormat(value = "") {
  const email = normalizeEmail(value);

  if (email.length < 6 || email.length > 254) return false;
  if (email.includes("..")) return false;
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return false;

  const [local, domain] = email.split("@");

  if (!local || !domain) return false;
  if (local.length < 2) return false;
  if (domain.length < 4) return false;
  if (!domain.includes(".")) return false;
  if (domain.startsWith(".") || domain.endsWith(".")) return false;
  if (domain.includes("_")) return false;

  return true;
}

function isBlockedFakeEmail(value = "") {
  const email = normalizeEmail(value);
  const [local, domain] = email.split("@");

  const blockedExactEmails = new Set([
    "test@test.com",
    "test@gmail.com",
    "test@hotmail.com",
    "test@yahoo.com",
    "test@outlook.com",
    "fake@fake.com",
    "fake@gmail.com",
    "demo@demo.com",
    "demo@gmail.com",
    "example@example.com",
    "admin@admin.com",
    "mail@mail.com",
    "a@a.com",
    "aa@aa.com",
    "asdf@asdf.com",
    "qwerty@qwerty.com",
    "user@user.com",
    "guest@guest.com",
  ]);

  const blockedDomains = new Set([
    "test.com",
    "example.com",
    "example.org",
    "example.net",
    "fake.com",
    "demo.com",
    "invalid.com",
    "asdf.com",
    "qwerty.com",
    "localhost.com",
    "mailinator.com",
    "yopmail.com",
    "guerrillamail.com",
    "10minutemail.com",
    "tempmail.com",
    "temp-mail.org",
    "trashmail.com",
  ]);

  const blockedLocalParts = new Set([
    "test",
    "fake",
    "demo",
    "example",
    "asdf",
    "qwerty",
    "aaa",
    "aaaa",
    "user",
    "guest",
    "none",
    "no",
    "mail",
    "email",
  ]);

  if (blockedExactEmails.has(email)) return true;
  if (blockedDomains.has(domain)) return true;

  if (blockedLocalParts.has(local)) {
    const commonDomains = [
      "gmail.com",
      "hotmail.com",
      "outlook.com",
      "yahoo.com",
      "icloud.com",
      "live.com",
    ];

    if (commonDomains.includes(domain)) return true;
  }

  if (/^(.)\1{3,}$/.test(local)) return true;
  if (/^(123|1234|12345|1111|0000)/.test(local)) return true;

  return false;
}

async function hasValidEmailDomain(value = "") {
  const email = normalizeEmail(value);
  const domain = email.split("@")[1];

  if (!domain) return false;

  const trustedDomains = new Set([
    "gmail.com",
    "hotmail.com",
    "outlook.com",
    "yahoo.com",
    "icloud.com",
    "live.com",
    "proton.me",
    "protonmail.com",
  ]);

  if (trustedDomains.has(domain)) return true;

  try {
    const mxRecords = await Promise.race([
      dns.resolveMx(domain),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error("DNS timeout")), 2500)
      ),
    ]);

    return Array.isArray(mxRecords) && mxRecords.length > 0;
  } catch (error) {
    return false;
  }
}

async function isValidEmailForInquiry(value = "") {
  if (!hasBasicEmailFormat(value)) return false;
  if (isBlockedFakeEmail(value)) return false;
  if (!(await hasValidEmailDomain(value))) return false;

  return true;
}

function detectLanguage(text = "") {
  const t = text.trim().toLowerCase();

  const sqWords = [
    "pershendetje",
    "përshëndetje",
    "tung",
    "dhomë",
    "dhome",
    "dhoma",
    "apartament",
    "çmim",
    "cmim",
    "çmime",
    "cmime",
    "ofertë",
    "oferte",
    "rezervim",
    "disponueshmeri",
    "disponueshmëri",
    "femije",
    "fëmijë",
    "sa kushton",
    "qershor",
    "korrik",
    "gusht",
    "shtator",
  ];

  if (containsAny(t, sqWords)) return "sq";

  const srWords = [
    "zdravo",
    "cao",
    "ćao",
    "cena",
    "cene",
    "ponuda",
    "soba",
    "sobe",
    "apartman",
    "apartmani",
    "bazen",
    "parking",
    "lokacija",
    "rezervacija",
    "slobodno",
    "dostupno",
    "koliko",
    "deca",
    "dete",
    "beba",
    "želimo",
    "zelimo",
    "hoću",
    "hocu",
    "treba mi",
    "jun",
    "juni",
    "jul",
    "juli",
  ];

  const mkLatinWords = [
    "zdravo",
    "cena",
    "ponuda",
    "soba",
    "apartman",
    "bazen",
    "parking",
    "lokacija",
    "rezervacija",
    "slobodno",
    "dostapno",
    "kolku",
    "deca",
    "dete",
    "bebe",
    "sakame",
    "sakam",
  ];

  if (/[а-шѓќљњџѕј]/i.test(t)) return "mk";

  if (containsAny(t, mkLatinWords)) return "mk";
  if (containsAny(t, srWords)) return "sr";

  return "en";
}

function getSmartGreeting(language = "en") {
  return textByLanguage(language, {
    mk: "Здраво 👋\nКако можам да ви помогнам? 😊",
    en: "Hello 👋\nHow can I help you today? 😊",
    sr: "Zdravo 👋\nKako mogu da vam pomognem? 😊",
    sq: "Përshëndetje 👋\nSi mund t’ju ndihmoj? 😊",
  });
}

function getLanguageMenu() {
  return (
    "Welcome to Laki Hotel & Spa 🏨\n\n" +
    "Please choose your language / Ве молиме изберете јазик:\n\n" +
    "1. English\n" +
    "2. Македонски\n" +
    "3. Srpski\n" +
    "4. Shqip"
  );
}

function getEnglishMenu() {
  return (
    "Laki Hotel & Spa 🏨\n\n" +
    "You can ask me about rooms, apartments, spa, restaurant, parking, location, prices or availability.\n\n" +
    "If you would like an offer, write your dates."
  );
}

function getMacedonianMenu() {
  return (
    "Laki Hotel & Spa 🏨\n\n" +
    "Можете да ме прашате за соби, апартмани, СПА, ресторан, паркинг, локација, цени или достапност.\n\n" +
    "Ако сакате понуда, напишете ги датумите."
  );
}

function getSerbianMenu() {
  return (
    "Laki Hotel & Spa 🏨\n\n" +
    "Možete me pitati za sobe, apartmane, SPA, restoran, parking, lokaciju, cene ili dostupnost.\n\n" +
    "Ako želite ponudu, napišite datume boravka."
  );
}

function getAlbanianMenu() {
  return (
    "Laki Hotel & Spa 🏨\n\n" +
    "Mund të më pyesni për dhoma, apartamente, SPA, restorant, parkim, lokacion, çmime ose disponueshmëri.\n\n" +
    "Nëse dëshironi ofertë, shkruani datat e qëndrimit."
  );
}

function getMenuByLanguage(language = "en") {
  if (language === "mk") return getMacedonianMenu();
  if (language === "sr") return getSerbianMenu();
  if (language === "sq") return getAlbanianMenu();
  return getEnglishMenu();
}

function getHumanFallback(language = "en") {
  return textByLanguage(language, {
    mk: "Можете да ме прашате за соба, апартман, СПА, паркинг, локација или понуда 😊",
    en: "You can ask me about rooms, apartments, spa, parking, location or an offer 😊",
    sr: "Možete me pitati za sobu, apartman, SPA, parking, lokaciju ili ponudu 😊",
    sq: "Mund të më pyesni për dhomë, apartament, SPA, parkim, lokacion ose ofertë 😊",
  });
}

function addSoftNextStep(replyText, language, options = {}) {
  const { offer = true } = options;

  if (!offer) return replyText;

  return (
    replyText +
    "\n\n" +
    textByLanguage(language, {
      mk: "Ако сакате понуда, напишете ги датумите на престој 😊",
      en: "If you would like an offer, please write your stay dates 😊",
      sr: "Ako želite ponudu, napišite datume boravka 😊",
      sq: "Nëse dëshironi ofertë, shkruani datat e qëndrimit 😊",
    })
  );
}

/* =========================
   SMART DATE / BOOKING PARSER
   ========================= */

function padDay(value) {
  return String(value).padStart(2, "0");
}

function normalizeParserText(text = "") {
  return text
    .toLowerCase()
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}

function detectMonthNumber(text = "") {
  const t = text.toLowerCase();

  const months = [
    { keys: ["јануари", "januari", "january", "janar", "januar", "jan"], value: "01" },
    { keys: ["февруари", "fevruari", "february", "februar", "shkurt", "feb"], value: "02" },
    { keys: ["март", "mart", "march", "mars", "mar"], value: "03" },
    { keys: ["април", "april", "prill", "apr"], value: "04" },
    { keys: ["мај", "maj", "may"], value: "05" },
    { keys: ["јуни", "juni", "june", "jun", "qershor"], value: "06" },
    { keys: ["јули", "juli", "july", "jul", "korrik"], value: "07" },
    { keys: ["август", "avgust", "august", "gusht", "aug"], value: "08" },
    { keys: ["септември", "septemvri", "september", "septembar", "shtator", "sep"], value: "09" },
    { keys: ["октомври", "oktomvri", "october", "oktobar", "tetor", "oct", "okt"], value: "10" },
    { keys: ["ноември", "noemvri", "november", "novembar", "nëntor", "nentor", "nov"], value: "11" },
    { keys: ["декември", "dekemvri", "december", "decembar", "dhjetor", "dec"], value: "12" },
  ];

  for (const month of months) {
    if (month.keys.some((key) => t.includes(key))) return month.value;
  }

  return null;
}

function getCurrentYear() {
  return new Date().getFullYear();
}

function makeDate(day, month, year) {
  const d = new Date(Number(year), Number(month) - 1, Number(day));

  if (
    d.getFullYear() !== Number(year) ||
    d.getMonth() !== Number(month) - 1 ||
    d.getDate() !== Number(day)
  ) {
    return null;
  }

  return d;
}

function formatDateDMY(date) {
  return `${padDay(date.getDate())}.${padDay(date.getMonth() + 1)}.${date.getFullYear()}`;
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + Number(days));
  return d;
}

function guessFutureYear(day, month, text = "") {
  const yearMatch = text.match(/\b(20\d{2})\b/);
  if (yearMatch) return Number(yearMatch[1]);

  const year = getCurrentYear();
  const candidate = makeDate(day, month, year);
  const today = new Date();
  const todayOnly = new Date(today.getFullYear(), today.getMonth(), today.getDate());

  if (candidate && candidate < todayOnly) return year + 1;

  return year;
}

function extractNumberWord(text = "") {
  const t = text.toLowerCase();

  const numbers = [
    { keys: ["еден", "една", "едно", "one", "jedan", "jedna", "jedno", "një", "nje"], value: 1 },
    { keys: ["два", "две", "two", "dva", "dve", "dy"], value: 2 },
    { keys: ["три", "three", "tri", "tre"], value: 3 },
    { keys: ["четири", "four", "cetiri", "četiri", "katër", "kater"], value: 4 },
    { keys: ["пет", "five", "pet", "pesë", "pese"], value: 5 },
    { keys: ["шест", "six", "sest", "šest", "gjashtë", "gjashte"], value: 6 },
    { keys: ["седум", "seven", "sedam", "shtatë", "shtate"], value: 7 },
    { keys: ["осум", "eight", "osam", "tetë", "tete"], value: 8 },
    { keys: ["девет", "nine", "devet", "nëntë", "nente"], value: 9 },
    { keys: ["десет", "ten", "deset", "dhjetë", "dhjete"], value: 10 },
  ];

  for (const item of numbers) {
    if (item.keys.some((key) => t.includes(key))) return item.value;
  }

  return null;
}

function extractGuestCount(text = "") {
  const t = normalizeParserText(text);

  const explicit = t.match(
    /\b(\d{1,2})\s*(лица|лице|гости|гостин|возрасни|persons|people|guests|adults|odraslih|osoba|gostiju|mysafirë|mysafire|të rritur|te rritur)\b/
  );

  if (explicit) return Number(explicit[1]);

  if (
    t.includes("двајца") ||
    t.includes("два лица") ||
    t.includes("две лица") ||
    t.includes("2 persons") ||
    t.includes("2 people") ||
    t.includes("2 guests") ||
    t.includes("dvoje") ||
    t.includes("dve osobe") ||
    t.includes("dy persona") ||
    t.includes("couple")
  ) {
    return 2;
  }

  const wordNumber = extractNumberWord(t);
  if (
    wordNumber &&
    (t.includes("лица") ||
      t.includes("гости") ||
      t.includes("возрасни") ||
      t.includes("people") ||
      t.includes("guests") ||
      t.includes("adults") ||
      t.includes("osoba") ||
      t.includes("gostiju") ||
      t.includes("odraslih") ||
      t.includes("persona") ||
      t.includes("mysafir"))
  ) {
    return wordNumber;
  }

  return null;
}

function getWeekendDates(nextWeekend = false) {
  const today = new Date();
  const day = today.getDay();
  let daysUntilFriday = (5 - day + 7) % 7;

  if (nextWeekend || daysUntilFriday === 0) {
    daysUntilFriday += 7;
  }

  const friday = addDays(today, daysUntilFriday);
  const sunday = addDays(friday, 2);

  return {
    checkin: formatDateDMY(friday),
    checkout: formatDateDMY(sunday),
  };
}

function extractBookingInfo(text = "") {
  const t = normalizeParserText(text);

  let checkin = null;
  let checkout = null;
  let guests = extractGuestCount(t);

  const month = detectMonthNumber(t);
  const yearMatch = t.match(/\b(20\d{2})\b/);
  const explicitYear = yearMatch ? Number(yearMatch[1]) : null;

  const fullDateMatches = [
    ...t.matchAll(/\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/g),
  ];

  if (fullDateMatches.length >= 2) {
    const d1 = makeDate(fullDateMatches[0][1], fullDateMatches[0][2], fullDateMatches[0][3]);
    const d2 = makeDate(fullDateMatches[1][1], fullDateMatches[1][2], fullDateMatches[1][3]);

    if (d1 && d2 && d2 > d1) {
      return {
        checkin: formatDateDMY(d1),
        checkout: formatDateDMY(d2),
        guests,
      };
    }
  }

  const singleFullDate = t.match(/\b(\d{1,2})[./-](\d{1,2})[./-](20\d{2})\b/);
  const nightsMatch = t.match(/\b(\d{1,2})\s*(ноќи|ноќ|nights|night|noći|noci|noć|noc|netë|nete|natë|nate)\b/);

  if (singleFullDate && nightsMatch) {
    const start = makeDate(singleFullDate[1], singleFullDate[2], singleFullDate[3]);
    const nights = Number(nightsMatch[1]);

    if (start && nights > 0) {
      const end = addDays(start, nights);
      return {
        checkin: formatDateDMY(start),
        checkout: formatDateDMY(end),
        guests,
      };
    }
  }

  const rangeSameMonth = t.match(
    /\b(?:од\s*|od\s*|nga\s*)?(\d{1,2})\s*(?:-?\s*(?:ти|ви|ми|th|st|nd|rd))?\s*(?:-|до|do|to|until|till|\/|deri)\s*(\d{1,2})\s*(?:-?\s*(?:ти|ви|ми|th|st|nd|rd))?/i
  );

  if (rangeSameMonth && month) {
    const startYear = explicitYear || guessFutureYear(rangeSameMonth[1], month, t);
    const d1 = makeDate(rangeSameMonth[1], month, startYear);
    const d2 = makeDate(rangeSameMonth[2], month, startYear);

    if (d1 && d2 && d2 > d1) {
      return {
        checkin: formatDateDMY(d1),
        checkout: formatDateDMY(d2),
        guests,
      };
    }
  }

  const dayMonthToDayMonth = t.match(
    /\b(\d{1,2})\s*(?:-?\s*(?:ти|ви|ми|th|st|nd|rd))?\s*([a-zа-шѓќљњџѕјçë]+)\s*(?:-|до|do|to|until|till|deri)\s*(\d{1,2})\s*(?:-?\s*(?:ти|ви|ми|th|st|nd|rd))?\s*([a-zа-шѓќљњџѕјçë]+)\b/i
  );

  if (dayMonthToDayMonth) {
    const m1 = detectMonthNumber(dayMonthToDayMonth[2]);
    const m2 = detectMonthNumber(dayMonthToDayMonth[4]);

    if (m1 && m2) {
      const y1 = explicitYear || guessFutureYear(dayMonthToDayMonth[1], m1, t);
      const y2 = Number(m2) < Number(m1) ? y1 + 1 : y1;

      const d1 = makeDate(dayMonthToDayMonth[1], m1, y1);
      const d2 = makeDate(dayMonthToDayMonth[3], m2, y2);

      if (d1 && d2 && d2 > d1) {
        return {
          checkin: formatDateDMY(d1),
          checkout: formatDateDMY(d2),
          guests,
        };
      }
    }
  }

  if (
    t.includes("утре") ||
    t.includes("tomorrow") ||
    t.includes("sutra") ||
    t.includes("nesër") ||
    t.includes("neser")
  ) {
    const start = addDays(new Date(), 1);
    let nights = 1;

    if (nightsMatch) {
      nights = Number(nightsMatch[1]);
    } else {
      const wordNights = extractNumberWord(t);
      if (
        wordNights &&
        (t.includes("ноќи") ||
          t.includes("ноќ") ||
          t.includes("nights") ||
          t.includes("noći") ||
          t.includes("noci") ||
          t.includes("netë") ||
          t.includes("nete"))
      ) {
        nights = wordNights;
      }
    }

    const end = addDays(start, nights);

    return {
      checkin: formatDateDMY(start),
      checkout: formatDateDMY(end),
      guests,
    };
  }

  const afterDaysMatch = t.match(/\b(?:за|после|after|za|posle|nakon|pas)\s*(\d{1,2})\s*(дена|денови|ден|days|day|dana|dan|ditë|dite)\b/);

  if (afterDaysMatch) {
    const start = addDays(new Date(), Number(afterDaysMatch[1]));
    const nights = nightsMatch ? Number(nightsMatch[1]) : 1;
    const end = addDays(start, nights);

    return {
      checkin: formatDateDMY(start),
      checkout: formatDateDMY(end),
      guests,
    };
  }

  if (
    t.includes("следен викенд") ||
    t.includes("нареден викенд") ||
    t.includes("next weekend") ||
    t.includes("sledeći vikend") ||
    t.includes("sledeci vikend") ||
    t.includes("sljedeći vikend") ||
    t.includes("vikendin tjetër") ||
    t.includes("vikendin tjeter")
  ) {
    const dates = getWeekendDates(true);
    return {
      checkin: dates.checkin,
      checkout: dates.checkout,
      guests,
    };
  }

  if (
    t.includes("овој викенд") ||
    t.includes("викендов") ||
    t.includes("this weekend") ||
    t.includes("ovaj vikend") ||
    t.includes("ovog vikenda") ||
    t.includes("këtë vikend") ||
    t.includes("kete vikend")
  ) {
    const dates = getWeekendDates(false);
    return {
      checkin: dates.checkin,
      checkout: dates.checkout,
      guests,
    };
  }

  return { checkin, checkout, guests };
}

function detectRoomType(text = "") {
  const t = text.toLowerCase();

  if (
    t.includes("соба") ||
    t.includes("room") ||
    t.includes("soba") ||
    t.includes("dhom")
  )
    return "room";

  if (
    t.includes("апартман") ||
    t.includes("apartment") ||
    t.includes("apartman") ||
    t.includes("apartament")
  )
    return "apartment";

  return null;
}

function detectDirectIntent(text = "", language = "en") {
  const t = text.toLowerCase().trim();

  const callWords = [
    "свонам",
    "ѕвонам",
    "јавам",
    "се јавам",
    "вртам",
    "повикам",
    "број",
    "телефон",
    "внатрешен",
    "call",
    "phone",
    "dial",
    "reach",
    "internal",
    "number",
    "pozovem",
    "zovem",
    "telefon",
    "interni",
    "pozvati",
    "thërras",
    "therras",
    "telefonoj",
    "numër",
    "numer",
  ];

  const departmentWords = [
    "рецепција",
    "ресторан",
    "спа",
    "базен",
    "кујна",
    "reception",
    "restaurant",
    "spa",
    "pool",
    "kitchen",
    "front desk",
    "recepcija",
    "restoran",
    "bazen",
    "kuhinja",
    "recepsion",
    "restorant",
    "pishinë",
    "pishine",
    "kuzhina",
  ];

  if (containsAny(t, callWords) && containsAny(t, departmentWords)) {
    return "internal_phone";
  }

  return null;
}

function getDirectIntentReply(intent, language) {
  if (intent === "internal_phone") {
    return textByLanguage(language, {
      mk: "📞 Од соба можете директно да се јавите:\n\nРецепција: 0\nРесторан: 501\nСПА центар: 502\nБазен: 503\nКујна: 504",
      en: "📞 From your room you can call directly:\n\nReception: 0\nRestaurant: 501\nSpa center: 502\nPool: 503\nKitchen: 504",
      sr: "📞 Iz sobe možete direktno pozvati:\n\nRecepcija: 0\nRestoran: 501\nSPA centar: 502\nBazen: 503\nKuhinja: 504",
      sq: "📞 Nga dhoma mund të telefononi direkt:\n\nRecepsioni: 0\nRestoranti: 501\nSPA qendra: 502\nPishina: 503\nKuzhina: 504",
    });
  }

  return null;
}

function resetInquiryFlow(from) {
  delete userInquiryState[from];
}

function startInquiryFlow(from, language, prefilledData = {}) {
  userInquiryState[from] = {
    step: prefilledData.checkin && prefilledData.checkout ? "adults" : "checkin",
    language,
    data: {
      ...prefilledData,
    },
  };

  if (prefilledData.checkin && prefilledData.checkout) {
    if (prefilledData.adults) {
      userInquiryState[from].step = "children";

      return textByLanguage(language, {
        mk: `Одлично 😊\nCheck-in: ${prefilledData.checkin}\nCheck-out: ${prefilledData.checkout}\nВозрасни: ${prefilledData.adults}\n\nДали ќе има деца? Ако нема, внесете 0.`,
        en: `Great 😊\nCheck-in: ${prefilledData.checkin}\nCheck-out: ${prefilledData.checkout}\nAdults: ${prefilledData.adults}\n\nWill there be any children? If none, enter 0.`,
        sr: `Odlično 😊\nCheck-in: ${prefilledData.checkin}\nCheck-out: ${prefilledData.checkout}\nOdrasli: ${prefilledData.adults}\n\nDa li će biti dece? Ako nema, unesite 0.`,
        sq: `Shumë mirë 😊\nCheck-in: ${prefilledData.checkin}\nCheck-out: ${prefilledData.checkout}\nTë rritur: ${prefilledData.adults}\n\nA do të ketë fëmijë? Nëse jo, shkruani 0.`,
      });
    }

    return textByLanguage(language, {
      mk: `Одлично 😊\nCheck-in: ${prefilledData.checkin}\nCheck-out: ${prefilledData.checkout}\n\nКолку возрасни гости ќе има?`,
      en: `Great 😊\nCheck-in: ${prefilledData.checkin}\nCheck-out: ${prefilledData.checkout}\n\nHow many adults will stay?`,
      sr: `Odlično 😊\nCheck-in: ${prefilledData.checkin}\nCheck-out: ${prefilledData.checkout}\n\nKoliko odraslih gostiju će boraviti?`,
      sq: `Shumë mirë 😊\nCheck-in: ${prefilledData.checkin}\nCheck-out: ${prefilledData.checkout}\n\nSa të rritur do të qëndrojnë?`,
    });
  }

  return textByLanguage(language, {
    mk: "Супер 😊\nЗа кој период планирате престој?\nПример: 20-25 јуни",
    en: "Great 😊\nFor which dates are you planning your stay?\nExample: 20-25 June",
    sr: "Super 😊\nZa koji period planirate boravak?\nPrimer: 20-25 juni",
    sq: "Shumë mirë 😊\nPër cilën periudhë planifikoni qëndrimin?\nShembull: 20-25 qershor",
  });
}

function isValidDateFormat(value) {
  return /^\d{2}\.\d{2}\.\d{4}$/.test(value);
}

function parseDate(value) {
  if (!isValidDateFormat(value)) return null;

  const [dayStr, monthStr, yearStr] = value.split(".");
  const day = Number(dayStr);
  const month = Number(monthStr);
  const year = Number(yearStr);

  const date = new Date(year, month - 1, day);

  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day
  ) {
    return null;
  }

  return date;
}

function normalizeZero(value = "") {
  const v = value.trim().toLowerCase();
  if (v === "o" || v === "о") return "0";
  return value.trim();
}

function isPositiveInteger(value) {
  return /^\d+$/.test(value);
}

function isValidName(value) {
  const trimmed = value.trim();
  if (trimmed.length < 2) return false;
  if (/^\d+$/.test(trimmed)) return false;
  return /[A-Za-zА-Ша-шЃѓЌќЉљЊњЏџЅѕČčĆćŽžŠšĐđÇçËë]/.test(trimmed);
}

function isValidChildrenAges(value) {
  const trimmed = value.trim();
  if (!trimmed) return false;

  const parts = trimmed
    .split(",")
    .map((item) => item.trim())
    .filter(Boolean);

  if (!parts.length) return false;

  return parts.every(
    (item) => /^\d{1,2}$/.test(item) && Number(item) >= 0 && Number(item) <= 17
  );
}

function isExplicitOfferRequest(text, language) {
  const t = text.toLowerCase().trim();

  const keywords = [
    "цена",
    "цени",
    "понуда",
    "резервација",
    "слободно",
    "достапно",
    "достапност",
    "колку чини",
    "колку е",
    "price",
    "prices",
    "offer",
    "booking",
    "reservation",
    "availability",
    "available",
    "how much",
    "quote",
    "book now",
    "cena",
    "cene",
    "ponuda",
    "rezervacija",
    "slobodno",
    "dostupno",
    "koliko košta",
    "koliko kosta",
    "çmim",
    "cmim",
    "ofertë",
    "oferte",
    "rezervim",
    "disponueshmeri",
    "disponueshmëri",
    "sa kushton",
  ];

  return containsAny(t, keywords);
}

function isRoomOrApartmentRequest(text = "") {
  const t = text.toLowerCase();

  return (
    t.includes("соба") ||
    t.includes("соби") ||
    t.includes("room") ||
    t.includes("rooms") ||
    t.includes("апартман") ||
    t.includes("apartment") ||
    t.includes("soba") ||
    t.includes("sobe") ||
    t.includes("apartman") ||
    t.includes("dhom") ||
    t.includes("apartament")
  );
}

function formatChildrenValue(count, ages, language) {
  if (Number(count) === 0) return "0";

  return textByLanguage(language, {
    mk: `${count} (возраст: ${ages})`,
    en: `${count} (ages: ${ages})`,
    sr: `${count} (uzrast: ${ages})`,
    sq: `${count} (mosha: ${ages})`,
  });
}

async function handleInquiryStep(from, rawText) {
  const inquiry = userInquiryState[from];
  if (!inquiry) return null;

  const language = inquiry.language;
  let msg = rawText.trim();
  const lowerMsg = msg.toLowerCase();

  if (matchesCommand(lowerMsg, COMMANDS.cancel)) {
    resetInquiryFlow(from);
    return textByLanguage(language, {
      mk: "Во ред, барањето е откажано 😊",
      en: "No problem, the inquiry has been cancelled 😊",
      sr: "U redu, upit je otkazan 😊",
      sq: "Në rregull, kërkesa u anulua 😊",
    });
  }

  if (matchesCommand(lowerMsg, COMMANDS.menu)) {
    return getMenuByLanguage(language);
  }

  if (inquiry.step === "checkin") {
    const parsed = extractBookingInfo(msg);

    if (parsed.checkin && parsed.checkout) {
      const checkinDate = parseDate(parsed.checkin);
      const checkoutDate = parseDate(parsed.checkout);

      if (!checkinDate || !checkoutDate || checkoutDate <= checkinDate) {
        return textByLanguage(language, {
          mk: "Check-out мора да биде после check-in.\nПробајте повторно, пример: 20-25 јуни 😊",
          en: "Check-out must be after check-in.\nPlease try again, example: 20-25 June 😊",
          sr: "Check-out mora biti posle check-in datuma.\nPokušajte ponovo, primer: 20-25 juni 😊",
          sq: "Check-out duhet të jetë pas check-in.\nProvoni përsëri, shembull: 20-25 qershor 😊",
        });
      }

      inquiry.data.checkin = parsed.checkin;
      inquiry.data.checkout = parsed.checkout;

      if (parsed.guests && Number(parsed.guests) > 0) {
        inquiry.data.adults = String(parsed.guests);
        inquiry.step = "children";

        return textByLanguage(language, {
          mk: `Одлично 😊\nCheck-in: ${parsed.checkin}\nCheck-out: ${parsed.checkout}\nВозрасни: ${parsed.guests}\n\nДали ќе има деца? Ако нема, внесете 0.`,
          en: `Great 😊\nCheck-in: ${parsed.checkin}\nCheck-out: ${parsed.checkout}\nAdults: ${parsed.guests}\n\nWill there be any children? If none, enter 0.`,
          sr: `Odlično 😊\nCheck-in: ${parsed.checkin}\nCheck-out: ${parsed.checkout}\nOdrasli: ${parsed.guests}\n\nDa li će biti dece? Ako nema, unesite 0.`,
          sq: `Shumë mirë 😊\nCheck-in: ${parsed.checkin}\nCheck-out: ${parsed.checkout}\nTë rritur: ${parsed.guests}\n\nA do të ketë fëmijë? Nëse jo, shkruani 0.`,
        });
      }

      inquiry.step = "adults";

      return textByLanguage(language, {
        mk: `Одлично 😊\nCheck-in: ${parsed.checkin}\nCheck-out: ${parsed.checkout}\n\nКолку возрасни гости ќе има?`,
        en: `Great 😊\nCheck-in: ${parsed.checkin}\nCheck-out: ${parsed.checkout}\n\nHow many adults will stay?`,
        sr: `Odlično 😊\nCheck-in: ${parsed.checkin}\nCheck-out: ${parsed.checkout}\n\nKoliko odraslih gostiju će boraviti?`,
        sq: `Shumë mirë 😊\nCheck-in: ${parsed.checkin}\nCheck-out: ${parsed.checkout}\n\nSa të rritur do të qëndrojnë?`,
      });
    }

    if (!isValidDateFormat(msg) || !parseDate(msg)) {
      return textByLanguage(language, {
        mk: "Напишете ги датумите, пример: 20-25 јуни 😊",
        en: "Please write the dates, example: 20-25 June 😊",
        sr: "Napišite datume, primer: 20-25 juni 😊",
        sq: "Shkruani datat, shembull: 20-25 qershor 😊",
      });
    }

    inquiry.data.checkin = msg;
    inquiry.step = "checkout";

    return textByLanguage(language, {
      mk: "Одлично 😊\nНапишете check-out датум.",
      en: "Great 😊\nPlease enter your check-out date.",
      sr: "Odlično 😊\nNapišite check-out datum.",
      sq: "Shumë mirë 😊\nShkruani datën e check-out.",
    });
  }

  if (inquiry.step === "checkout") {
    const parsed = extractBookingInfo(msg);

    if (parsed.checkin && parsed.checkout) {
      msg = parsed.checkout;
    }

    if (!isValidDateFormat(msg) || !parseDate(msg)) {
      return textByLanguage(language, {
        mk: "Внесете check-out датум во формат: 25.06.2026 😊",
        en: "Please enter check-out date in this format: 25.06.2026 😊",
        sr: "Unesite check-out datum u formatu: 25.06.2026 😊",
        sq: "Shkruani datën e check-out në formatin: 25.06.2026 😊",
      });
    }

    const checkinDate = parseDate(inquiry.data.checkin);
    const checkoutDate = parseDate(msg);

    if (!checkinDate || !checkoutDate || checkoutDate <= checkinDate) {
      return textByLanguage(language, {
        mk: "Check-out датумот мора да биде после check-in датумот 😊",
        en: "Check-out date must be after check-in date 😊",
        sr: "Check-out datum mora biti posle check-in datuma 😊",
        sq: "Data e check-out duhet të jetë pas check-in 😊",
      });
    }

    inquiry.data.checkout = msg;
    inquiry.step = "adults";

    return textByLanguage(language, {
      mk: "Колку возрасни гости ќе има?",
      en: "How many adults will stay?",
      sr: "Koliko odraslih gostiju će boraviti?",
      sq: "Sa të rritur do të qëndrojnë?",
    });
  }

  if (inquiry.step === "adults") {
    const parsedGuests = extractGuestCount(msg);
    const adultsValue = parsedGuests ? String(parsedGuests) : msg;

    if (!isPositiveInteger(adultsValue) || Number(adultsValue) < 1) {
      return textByLanguage(language, {
        mk: "Внесете број на возрасни гости, пример: 2",
        en: "Please enter the number of adults, example: 2",
        sr: "Unesite broj odraslih gostiju, primer: 2",
        sq: "Shkruani numrin e të rriturve, shembull: 2",
      });
    }

    inquiry.data.adults = adultsValue;
    inquiry.step = "children";

    return textByLanguage(language, {
      mk: "Дали ќе има деца? Ако нема, внесете 0.",
      en: "Will there be any children? If none, enter 0.",
      sr: "Da li će biti dece? Ako nema, unesite 0.",
      sq: "A do të ketë fëmijë? Nëse jo, shkruani 0.",
    });
  }

  if (inquiry.step === "children") {
    msg = normalizeZero(msg);

    if (!isPositiveInteger(msg) || Number(msg) < 0) {
      return textByLanguage(language, {
        mk: "За деца внесете 0 или поголем број 😊",
        en: "For children, please enter 0 or a higher number 😊",
        sr: "Za decu unesite 0 ili veći broj 😊",
        sq: "Për fëmijë, shkruani 0 ose numër më të madh 😊",
      });
    }

    inquiry.data.children = msg;

    if (Number(msg) > 0) {
      inquiry.step = "children_ages";

      return textByLanguage(language, {
        mk: "Внесете возраст на децата, одвоена со запирка.\nПример: 4, 7",
        en: "Please enter the children's ages, separated by commas.\nExample: 4, 7",
        sr: "Unesite uzrast dece, odvojeno zarezom.\nPrimer: 4, 7",
        sq: "Shkruani moshat e fëmijëve, të ndara me presje.\nShembull: 4, 7",
      });
    }

    inquiry.data.childrenAges = "";
    inquiry.step = "name";

    return textByLanguage(language, {
      mk: "На кое име да ја подготвиме понудата?",
      en: "Under which name should we prepare the offer?",
      sr: "Na koje ime da pripremimo ponudu?",
      sq: "Në cilin emër ta përgatisim ofertën?",
    });
  }

  if (inquiry.step === "children_ages") {
    if (!isValidChildrenAges(msg)) {
      return textByLanguage(language, {
        mk: "Внесете возраст со броеви, пример: 4, 7",
        en: "Please enter ages as numbers, example: 4, 7",
        sr: "Unesite uzrast brojevima, primer: 4, 7",
        sq: "Shkruani moshat me numra, shembull: 4, 7",
      });
    }

    inquiry.data.childrenAges = msg;
    inquiry.step = "name";

    return textByLanguage(language, {
      mk: "На кое име да ја подготвиме понудата?",
      en: "Under which name should we prepare the offer?",
      sr: "Na koje ime da pripremimo ponudu?",
      sq: "Në cilin emër ta përgatisim ofertën?",
    });
  }

  if (inquiry.step === "name") {
    if (!isValidName(msg)) {
      return textByLanguage(language, {
        mk: "Внесете име и презиме 😊",
        en: "Please enter a valid name 😊",
        sr: "Unesite ime i prezime 😊",
        sq: "Shkruani emrin dhe mbiemrin 😊",
      });
    }

    inquiry.data.name = msg;
    inquiry.step = "email";

    return textByLanguage(language, {
      mk: "Внесете e-mail адреса за да ви испратиме понуда 📧",
      en: "Please enter your email address so we can send you an offer 📧",
      sr: "Unesite e-mail adresu kako bismo vam poslali ponudu 📧",
      sq: "Shkruani email adresën që t’ju dërgojmë ofertën 📧",
    });
  }

  if (inquiry.step === "email") {
    const cleanEmail = normalizeEmail(msg);

    if (!(await isValidEmailForInquiry(cleanEmail))) {
      return getInvalidEmailMessage(language);
    }

    inquiry.data.email = cleanEmail;
    inquiry.step = "special_request";

    return textByLanguage(language, {
      mk: "Дали имате дополнително барање?\nАко немате, напишете: нема",
      en: "Do you have any additional request?\nIf none, type: none",
      sr: "Da li imate dodatni zahtev?\nAko nemate, napišite: nema",
      sq: "A keni ndonjë kërkesë shtesë?\nNëse jo, shkruani: nuk ka",
    });
  }

  if (inquiry.step === "special_request") {
    const noRequestWords = ["нема", "none", "nema", "no", "nuk ka", "ska", "jo"];

    inquiry.data.specialRequest = noRequestWords.includes(lowerMsg) ? "" : msg;

    const inquiryKey = `inquiry:${from}`;

    if (
      hitRateLimit(
        inquiryKey,
        inquiryRateLimit,
        INQUIRY_RATE_LIMIT_MAX_EMAILS,
        INQUIRY_RATE_LIMIT_WINDOW_MS
      )
    ) {
      resetInquiryFlow(from);

      return textByLanguage(language, {
        mk: "Испратени се повеќе барања за кратко време. Ве молиме пробајте повторно подоцна 😊",
        en: "Several requests were sent in a short time. Please try again later 😊",
        sr: "Poslato je više upita u kratkom vremenu. Molimo pokušajte kasnije 😊",
        sq: "Janë dërguar disa kërkesa në kohë të shkurtër. Ju lutemi provoni më vonë 😊",
      });
    }

    const emailPayload = {
      fromWebchat: from,
      language,
      checkin: inquiry.data.checkin,
      checkout: inquiry.data.checkout,
      adults: inquiry.data.adults,
      children: inquiry.data.children,
      childrenAges: inquiry.data.childrenAges,
      name: inquiry.data.name,
      email: inquiry.data.email,
      specialRequest: inquiry.data.specialRequest,
      replyTo: inquiry.data.email,
    };

    let emailSent = true;

    try {
      console.log("Sending webchat inquiry email:", emailPayload);
      await sendInquiryEmail(emailPayload);
      console.log("Webchat inquiry email sent successfully");
    } catch (emailError) {
      emailSent = false;
      console.error("Email send error:", emailError.message || emailError);
    }

    const childrenDisplay = formatChildrenValue(
      inquiry.data.children,
      inquiry.data.childrenAges,
      language
    );

    const specialRequestDisplay =
      inquiry.data.specialRequest ||
      textByLanguage(language, {
        mk: "нема",
        en: "none",
        sr: "nema",
        sq: "nuk ka",
      });

    const summary = textByLanguage(language, {
      mk:
        "Ви благодариме 🙏\nВашето барање е примено.\n\n" +
        `Check-in: ${inquiry.data.checkin}\n` +
        `Check-out: ${inquiry.data.checkout}\n` +
        `Возрасни: ${inquiry.data.adults}\n` +
        `Деца: ${childrenDisplay}\n` +
        `Име: ${inquiry.data.name}\n` +
        `Email: ${inquiry.data.email}\n` +
        `Дополнително барање: ${specialRequestDisplay}\n\n` +
        (emailSent
          ? "Нашиот тим ќе ви испрати понуда што е можно поскоро 😊"
          : "Барањето е примено, но има проблем со автоматското e-mail испраќање."),

      en:
        "Thank you 🙏\nYour inquiry has been received.\n\n" +
        `Check-in: ${inquiry.data.checkin}\n` +
        `Check-out: ${inquiry.data.checkout}\n` +
        `Adults: ${inquiry.data.adults}\n` +
        `Children: ${childrenDisplay}\n` +
        `Name: ${inquiry.data.name}\n` +
        `Email: ${inquiry.data.email}\n` +
        `Additional request: ${specialRequestDisplay}\n\n` +
        (emailSent
          ? "Our team will send you an offer as soon as possible 😊"
          : "Your inquiry was received, but there is a problem with automatic email delivery."),

      sr:
        "Hvala 🙏\nVaš upit je primljen.\n\n" +
        `Check-in: ${inquiry.data.checkin}\n` +
        `Check-out: ${inquiry.data.checkout}\n` +
        `Odrasli: ${inquiry.data.adults}\n` +
        `Deca: ${childrenDisplay}\n` +
        `Ime: ${inquiry.data.name}\n` +
        `Email: ${inquiry.data.email}\n` +
        `Dodatni zahtev: ${specialRequestDisplay}\n\n` +
        (emailSent
          ? "Naš tim će vam poslati ponudu što je moguće pre 😊"
          : "Upit je primljen, ali postoji problem sa automatskim slanjem e-maila."),

      sq:
        "Faleminderit 🙏\nKërkesa juaj u pranua.\n\n" +
        `Check-in: ${inquiry.data.checkin}\n` +
        `Check-out: ${inquiry.data.checkout}\n` +
        `Të rritur: ${inquiry.data.adults}\n` +
        `Fëmijë: ${childrenDisplay}\n` +
        `Emri: ${inquiry.data.name}\n` +
        `Email: ${inquiry.data.email}\n` +
        `Kërkesë shtesë: ${specialRequestDisplay}\n\n` +
        (emailSent
          ? "Ekipi ynë do t’ju dërgojë ofertën sa më shpejt 😊"
          : "Kërkesa u pranua, por ka problem me dërgimin automatik të email-it."),
    });

    resetInquiryFlow(from);
    return summary;
  }

  return null;
}

function shouldStartInquiryFlow(text, language) {
  const t = text.toLowerCase().trim();
  if (["1", "2", "3", "4"].includes(t)) return false;
  return isExplicitOfferRequest(t, language);
}

async function detectIntentWithAI(message, language) {
  try {
    const prompt = `
You are a hotel intent classifier.

Return ONLY valid JSON:
{
  "intent": "spa | restaurant | parking | location | contact | rooms | offer | checkin_checkout | children_policy | baby_crib | internal_phone | unknown",
  "guestType": "family | couple | none",
  "needsInquiry": true,
  "confidence": 0.95
}

Rules:
- Use "offer" only for explicit price, booking, reservation, availability, quote, or offer request.
- Use "rooms" for room/apartment questions.
- Use "internal_phone" for calling departments from room phone.
- needsInquiry true only for booking/price/availability.
- Return only JSON.

Message: "${message}"
`;

    const ai = await getAiReply({
      message: prompt,
      language,
      faqContext: "",
    });

    let clean = (ai || "").replace(/```json|```/g, "").trim();
    const jsonMatch = clean.match(/\{[\s\S]*\}/);
    if (jsonMatch) clean = jsonMatch[0];

    return JSON.parse(clean);
  } catch (err) {
    console.error("AI intent error:", err?.message || err);
    return {
      intent: "unknown",
      guestType: "none",
      needsInquiry: false,
      confidence: 0,
    };
  }
}

function buildSmartFaqReply(faqReply, rawText, currentLanguage) {
  let replyText = faqReply.text;
  const textLower = rawText.toLowerCase();

  if (faqReply.id === "spa") {
    replyText +=
      "\n\n" +
      textByLanguage(currentLanguage, {
        mk: "СПА е добар избор за релаксација.",
        en: "The spa is a good choice for relaxation.",
        sr: "SPA je dobar izbor za relaksaciju.",
        sq: "SPA është zgjedhje e mirë për relaksim.",
      });
  }

  if (faqReply.id === "parking") {
    replyText +=
      "\n\n" +
      textByLanguage(currentLanguage, {
        mk: "Паркингот е бесплатен и надворешен.",
        en: "Parking is free and outdoor.",
        sr: "Parking je besplatan i spoljašnji.",
        sq: "Parkimi është falas dhe i jashtëm.",
      });
  }

  if (faqReply.id === "rooms") {
    if (
      containsAny(textLower, [
        "family",
        "kids",
        "children",
        "baby",
        "фамилија",
        "семејство",
        "деца",
        "бебе",
        "porodica",
        "deca",
        "dete",
        "beba",
        "familje",
        "fëmijë",
        "femije",
        "bebe",
      ])
    ) {
      replyText +=
        "\n\n" +
        textByLanguage(currentLanguage, {
          mk: "За семејства, најчесто е попрактичен апартман.",
          en: "For families, an apartment is usually more practical.",
          sr: "Za porodice je apartman najčešće praktičniji.",
          sq: "Për familje, apartamenti zakonisht është më praktik.",
        });
    }
  }

  if (faqReply.id === "contact") {
    return replyText;
  }

  return addSoftNextStep(replyText, currentLanguage);
}

function getGuestTypeReply(guestType, currentLanguage) {
  if (guestType === "family") {
    return textByLanguage(currentLanguage, {
      mk: "За семејства со деца, најчесто препорачуваме апартман 😊\nНапишете ги датумите за престој.",
      en: "For families with children, we usually recommend an apartment 😊\nPlease write your stay dates.",
      sr: "Za porodice sa decom najčešće preporučujemo apartman 😊\nNapišite datume boravka.",
      sq: "Për familje me fëmijë zakonisht rekomandojmë apartament 😊\nShkruani datat e qëndrimit.",
    });
  }

  if (guestType === "couple") {
    return textByLanguage(currentLanguage, {
      mk: "За двајца, двокреветна соба е добар избор 😊\nНапишете ги датумите за престој.",
      en: "For two persons, a double room is a good choice 😊\nPlease write your stay dates.",
      sr: "Za dve osobe, dvokrevetna soba je dobar izbor 😊\nNapišite datume boravka.",
      sq: "Për dy persona, dhoma dyshe është zgjedhje e mirë 😊\nShkruani datat e qëndrimit.",
    });
  }

  return null;
}

async function getSafeAiReply(rawText, currentLanguage) {
  const aiReply = await getAiReply({
    message:
      currentLanguage === "mk"
        ? `
Ти си web chat асистент за Laki Hotel & Spa.

Одговарај кратко, природно и како рецепционер.
Без долги објаснувања.
Без markdown **bold**.
Не измислувај цени или достапност.
Не кажувај "пишете ни меил" или "јавете се" освен ако има технички проблем.
Ако гостинот бара цена/достапност/резервација, побарај датуми или продолжи кон понуда.

Прашање:
${rawText}
        `
        : `
You are the web chat assistant for Laki Hotel & Spa.

Reply briefly, naturally and like a receptionist.
Guest language: ${getLanguageLabel(currentLanguage)}.
Reply only in that language.
No long explanations.
No markdown **bold**.
Never invent prices or availability.
Do not tell the guest to email or call unless there is a technical issue.
If the guest asks for price/availability/booking, ask for dates or continue toward an offer request.

Guest question:
${rawText}
        `,
    language: currentLanguage,
    faqContext: hotelKnowledge.faq.map((f) => `${f.id}`).join("\n"),
  });

  return cleanBotReply(aiReply);
}

async function processGuestMessage(from, rawText) {
  const text = rawText.toLowerCase().trim();
  let reply = "";
  let currentLanguage = userLanguage[from] || null;

  if (matchesCommand(rawText, COMMANDS.language)) {
    delete userLanguage[from];
    resetInquiryFlow(from);
    return getLanguageMenu();
  }

  if (matchesCommand(rawText, COMMANDS.reset)) {
    delete userLanguage[from];
    resetInquiryFlow(from);
    return "Session reset successfully / Сесијата е успешно ресетирана.\n\n" + getLanguageMenu();
  }

  if (!currentLanguage) {
    if (text === "1" || text === "english" || text === "en") {
      userLanguage[from] = "en";
      return getSmartGreeting("en");
    }

    if (text === "2" || text === "македонски" || text === "mk") {
      userLanguage[from] = "mk";
      return getSmartGreeting("mk");
    }

    if (text === "3" || text === "srpski" || text === "serbian" || text === "sr") {
      userLanguage[from] = "sr";
      return getSmartGreeting("sr");
    }

    if (text === "4" || text === "shqip" || text === "albanian" || text === "sq") {
      userLanguage[from] = "sq";
      return getSmartGreeting("sq");
    }

    const detectedLanguage = detectLanguage(rawText);
    userLanguage[from] = detectedLanguage;
    currentLanguage = detectedLanguage;

    const parsedFirst = extractBookingInfo(rawText);

    if (parsedFirst.checkin && parsedFirst.checkout) {
      return startInquiryFlow(from, currentLanguage, {
        checkin: parsedFirst.checkin,
        checkout: parsedFirst.checkout,
        adults: parsedFirst.guests ? String(parsedFirst.guests) : undefined,
      });
    }

    if (isRoomOrApartmentRequest(rawText) || shouldStartInquiryFlow(rawText, currentLanguage)) {
      return startInquiryFlow(from, currentLanguage);
    }

    return getSmartGreeting(currentLanguage);
  }

  if (userInquiryState[from]) {
    reply = await handleInquiryStep(from, rawText);
    if (reply) return cleanBotReply(reply);
  }

  if (matchesCommand(rawText, COMMANDS.menu)) {
    return getMenuByLanguage(currentLanguage);
  }

  if (matchesCommand(rawText, COMMANDS.cancel)) {
    resetInquiryFlow(from);
    return textByLanguage(currentLanguage, {
      mk: "Во ред, откажано е 😊",
      en: "No problem, it is cancelled 😊",
      sr: "U redu, otkazano je 😊",
      sq: "Në rregull, u anulua 😊",
    });
  }

  if (matchesCommand(rawText, COMMANDS.contact)) {
    const contactReply = getFaqReply("contact", currentLanguage)?.text;
    return cleanBotReply(contactReply || getHumanFallback(currentLanguage));
  }

  const parsedDates = extractBookingInfo(rawText);

  if (parsedDates.checkin && parsedDates.checkout) {
    return startInquiryFlow(from, currentLanguage, {
      checkin: parsedDates.checkin,
      checkout: parsedDates.checkout,
      adults: parsedDates.guests ? String(parsedDates.guests) : undefined,
    });
  }

  if (isRoomOrApartmentRequest(rawText)) {
    return startInquiryFlow(from, currentLanguage);
  }

  if (shouldStartInquiryFlow(rawText, currentLanguage)) {
    return startInquiryFlow(from, currentLanguage);
  }

  const directIntent = detectDirectIntent(rawText, currentLanguage);
  if (directIntent) {
    const directReply = getDirectIntentReply(directIntent, currentLanguage);
    if (directReply) return cleanBotReply(directReply);
  }

  const aiIntent = await detectIntentWithAI(rawText, currentLanguage);

  if (
    (aiIntent?.needsInquiry || aiIntent?.intent === "offer") &&
    isExplicitOfferRequest(rawText, currentLanguage)
  ) {
    return startInquiryFlow(from, currentLanguage);
  }

  if (aiIntent?.intent === "internal_phone") {
    const internalPhoneReply = getDirectIntentReply("internal_phone", currentLanguage);
    if (internalPhoneReply) return cleanBotReply(internalPhoneReply);
  }

  const guestTypeReply = getGuestTypeReply(aiIntent?.guestType, currentLanguage);
  if (guestTypeReply) return cleanBotReply(guestTypeReply);

  const faqFromIntent = getFaqReply(aiIntent?.intent, currentLanguage);
  if (faqFromIntent) {
    return faqFromIntent.triggersInquiryFlow
      ? startInquiryFlow(from, currentLanguage)
      : cleanBotReply(buildSmartFaqReply(faqFromIntent, rawText, currentLanguage));
  }

  const faqReply = getFaqReply(rawText, currentLanguage);
  if (faqReply) {
    return faqReply.triggersInquiryFlow
      ? startInquiryFlow(from, currentLanguage)
      : cleanBotReply(buildSmartFaqReply(faqReply, rawText, currentLanguage));
  }

  const aiReply = await getSafeAiReply(rawText, currentLanguage);

  if (aiReply) {
    if (isExplicitOfferRequest(rawText, currentLanguage)) {
      return startInquiryFlow(from, currentLanguage);
    }

    return cleanBotReply(aiReply);
  }

  return getHumanFallback(currentLanguage);
}

app.get("/", (req, res) => {
  res.status(200).json({
    service: "Laki Web Chat Bot",
    status: "running",
    version: "6.1.0-security-email-validation",
    languages: ["mk", "en", "sr", "sq"],
    security: [
      "rate_limit",
      "fake_email_block",
      "mx_domain_check",
      "email_quality_check",
    ],
    features: [
      "FAQ",
      "Inquiry Flow",
      "Email",
      "AI Intent",
      "Smart Greeting",
      "No Menu Spam",
      "Smart Date Parser",
      "No AI when dates are detected",
      "Short Replies",
      "Reply-To Guest Email",
      "Macedonian",
      "English",
      "Serbian",
      "Albanian",
    ],
    timestamp: new Date().toISOString(),
  });
});

app.post("/chat", async (req, res) => {
  try {
    const { message, userId } = req.body;

    if (!message || !message.trim()) {
      return res.json({ reply: "No message provided" });
    }

    const from = userId || req.ip || "web-user";

    if (
      hitRateLimit(
        `chat:${from}`,
        chatRateLimit,
        CHAT_RATE_LIMIT_MAX_MESSAGES,
        CHAT_RATE_LIMIT_WINDOW_MS
      )
    ) {
      return res.status(429).json({
        reply: "Too many messages. Please try again in a moment.",
      });
    }

    const reply = await processGuestMessage(from, message.trim());

    return res.json({ reply });
  } catch (err) {
    console.error("Webchat error:", err);
    return res.status(500).json({
      reply: "There was a technical problem. Please try again in a moment.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
