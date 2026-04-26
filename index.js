import express from "express";
import dotenv from "dotenv";
import { getFaqReply, hotelKnowledge } from "./knowledge.js";
import { sendInquiryEmail } from "./mailer.js";
import { getAiReply } from "./ai.js";

dotenv.config();

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;

const userLanguage = {};
const userInquiryState = {};

const COMMANDS = {
  menu: ["menu", "мени"],
  language: ["language", "јазик", "jazik"],
  reset: ["reset", "ресет"],
  cancel: ["cancel", "откажи", "stop", "стоп"],
  contact: ["contact", "контакт"],
};

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

function detectLanguage(text = "") {
  const t = text.trim().toLowerCase();

  if (/[а-шѓќљњџѕј]/i.test(t)) return "mk";

  const mkLatinWords = [
    "zdravo",
    "cao",
    "čao",
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

  if (containsAny(t, mkLatinWords)) return "mk";

  return "en";
}

function getSmartGreeting(language = "en") {
  if (language === "mk") {
    return "Здраво 👋\nКако можам да ви помогнам? 😊";
  }

  return "Hello 👋\nHow can I help you today? 😊";
}

function getLanguageMenu() {
  return (
    "Welcome to Laki Hotel & Spa 🏨\n\n" +
    "Please choose your language / Ве молиме изберете јазик:\n" +
    "1. English\n" +
    "2. Македонски"
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

function getHumanFallback(language = "en") {
  if (language === "mk") {
    return "Можете да ме прашате за соба, апартман, СПА, паркинг, локација или понуда 😊";
  }

  return "You can ask me about rooms, apartments, spa, parking, location or an offer 😊";
}

function addSoftNextStep(replyText, language, options = {}) {
  const { offer = true } = options;

  if (!offer) return replyText;

  if (language === "mk") {
    return replyText + "\n\nАко сакате понуда, напишете ги датумите на престој 😊";
  }

  return replyText + "\n\nIf you would like an offer, please write your stay dates 😊";
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
    { keys: ["јануари", "januari", "january", "jan"], value: "01" },
    { keys: ["февруари", "fevruari", "february", "feb"], value: "02" },
    { keys: ["март", "mart", "march", "mar"], value: "03" },
    { keys: ["април", "april", "apr"], value: "04" },
    { keys: ["мај", "maj", "may"], value: "05" },
    { keys: ["јуни", "juni", "june", "jun"], value: "06" },
    { keys: ["јули", "juli", "july", "jul"], value: "07" },
    { keys: ["август", "avgust", "august", "aug"], value: "08" },
    { keys: ["септември", "septemvri", "september", "sep"], value: "09" },
    { keys: ["октомври", "oktomvri", "october", "oct"], value: "10" },
    { keys: ["ноември", "noemvri", "november", "nov"], value: "11" },
    { keys: ["декември", "dekemvri", "december", "dec"], value: "12" },
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
    { keys: ["еден", "една", "едно", "one"], value: 1 },
    { keys: ["два", "две", "two"], value: 2 },
    { keys: ["три", "three"], value: 3 },
    { keys: ["четири", "four"], value: 4 },
    { keys: ["пет", "five"], value: 5 },
    { keys: ["шест", "six"], value: 6 },
    { keys: ["седум", "seven"], value: 7 },
    { keys: ["осум", "eight"], value: 8 },
    { keys: ["девет", "nine"], value: 9 },
    { keys: ["десет", "ten"], value: 10 },
  ];

  for (const item of numbers) {
    if (item.keys.some((key) => t.includes(key))) return item.value;
  }

  return null;
}

function extractGuestCount(text = "") {
  const t = normalizeParserText(text);

  const explicit = t.match(
    /\b(\d{1,2})\s*(лица|лице|гости|гостин|возрасни|persons|people|guests|adults)\b/
  );

  if (explicit) return Number(explicit[1]);

  if (
    t.includes("двајца") ||
    t.includes("два лица") ||
    t.includes("две лица") ||
    t.includes("2 persons") ||
    t.includes("2 people") ||
    t.includes("2 guests") ||
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
      t.includes("adults"))
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
  const nightsMatch = t.match(/\b(\d{1,2})\s*(ноќи|ноќ|nights|night)\b/);

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
    /\b(?:од\s*)?(\d{1,2})\s*(?:-?\s*(?:ти|ви|ми|th|st|nd|rd))?\s*(?:-|до|to|until|till|\/)\s*(\d{1,2})\s*(?:-?\s*(?:ти|ви|ми|th|st|nd|rd))?/i
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
    /\b(\d{1,2})\s*(?:-?\s*(?:ти|ви|ми|th|st|nd|rd))?\s*([a-zа-шѓќљњџѕј]+)\s*(?:-|до|to|until|till)\s*(\d{1,2})\s*(?:-?\s*(?:ти|ви|ми|th|st|nd|rd))?\s*([a-zа-шѓќљњџѕј]+)\b/i
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

  if (t.includes("утре") || t.includes("tomorrow")) {
    const start = addDays(new Date(), 1);
    let nights = 1;

    if (nightsMatch) {
      nights = Number(nightsMatch[1]);
    } else {
      const wordNights = extractNumberWord(t);
      if (wordNights && (t.includes("ноќи") || t.includes("ноќ") || t.includes("nights"))) {
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

  const afterDaysMatch = t.match(/\b(?:за|после|after)\s*(\d{1,2})\s*(дена|денови|ден|days|day)\b/);

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
    t.includes("next weekend")
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
    t.includes("this weekend")
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

  if (t.includes("соба") || t.includes("room")) return "room";
  if (t.includes("апартман") || t.includes("apartment")) return "apartment";

  return null;
}

function detectDirectIntent(text = "", language = "en") {
  const t = text.toLowerCase().trim();

  const mkCallWords = [
    "свонам",
    "ѕвонам",
    "јавам",
    "се јавам",
    "како да се јавам",
    "како да свонам",
    "како да ѕвонам",
    "вртам",
    "повикам",
    "број",
    "телефон",
    "внатрешен",
  ];

  const mkRoomWords = [
    "од соба",
    "во соба",
    "соба",
    "собен телефон",
    "телефон во соба",
    "внатрешен телефон",
    "од мојата соба",
  ];

  const mkDepartmentWords = ["рецепција", "ресторан", "спа", "базен", "кујна"];

  const enCallWords = [
    "call",
    "phone",
    "dial",
    "reach",
    "how do i call",
    "how can i call",
    "internal",
    "number",
  ];

  const enRoomWords = [
    "from room",
    "in room",
    "room phone",
    "internal phone",
    "hotel phone",
  ];

  const enDepartmentWords = [
    "reception",
    "restaurant",
    "spa",
    "pool",
    "kitchen",
    "front desk",
  ];

  const isMkInternalPhone =
    (containsAny(t, mkCallWords) && containsAny(t, mkDepartmentWords)) ||
    (containsAny(t, mkRoomWords) && containsAny(t, mkDepartmentWords)) ||
    (t.includes("телефон") &&
      (t.includes("рецепција") ||
        t.includes("ресторан") ||
        t.includes("спа") ||
        t.includes("базен") ||
        t.includes("кујна")));

  const isEnInternalPhone =
    (containsAny(t, enCallWords) && containsAny(t, enDepartmentWords)) ||
    (containsAny(t, enRoomWords) && containsAny(t, enDepartmentWords)) ||
    (t.includes("internal") && t.includes("phone"));

  if (isMkInternalPhone || isEnInternalPhone) return "internal_phone";

  return null;
}

function getDirectIntentReply(intent, language) {
  if (intent === "internal_phone") {
    return language === "mk"
      ? "📞 Од соба можете директно да се јавите:\n\nРецепција: 0\nРесторан: 501\nСпа центар: 502\nБазен: 503\nКујна: 504"
      : "📞 From your room you can call directly:\n\nReception: 0\nRestaurant: 501\nSpa center: 502\nPool: 503\nKitchen: 504";
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

      return language === "mk"
        ? `Одлично 😊\nCheck-in: ${prefilledData.checkin}\nCheck-out: ${prefilledData.checkout}\nВозрасни: ${prefilledData.adults}\n\nДали ќе има деца? Ако нема, внесете 0.`
        : `Great 😊\nCheck-in: ${prefilledData.checkin}\nCheck-out: ${prefilledData.checkout}\nAdults: ${prefilledData.adults}\n\nWill there be any children? If none, enter 0.`;
    }

    return language === "mk"
      ? `Одлично 😊\nCheck-in: ${prefilledData.checkin}\nCheck-out: ${prefilledData.checkout}\n\nКолку возрасни гости ќе има?`
      : `Great 😊\nCheck-in: ${prefilledData.checkin}\nCheck-out: ${prefilledData.checkout}\n\nHow many adults will stay?`;
  }

  return language === "mk"
    ? "Супер 😊\nЗа кој период планирате престој?\nПример: 20-25 јуни"
    : "Great 😊\nFor which dates are you planning your stay?\nExample: 20-25 June";
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

function isPositiveInteger(value) {
  return /^\d+$/.test(value);
}

function isValidName(value) {
  const trimmed = value.trim();
  if (trimmed.length < 2) return false;
  if (/^\d+$/.test(trimmed)) return false;
  return /[A-Za-zА-Ша-ш]/.test(trimmed);
}

function isValidEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value.trim());
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

  if (language === "mk") {
    return (
      t.includes("цена") ||
      t.includes("цени") ||
      t.includes("понуда") ||
      t.includes("резервација") ||
      t.includes("слободно") ||
      t.includes("достапно") ||
      t.includes("достапност") ||
      t.includes("колку чини") ||
      t.includes("колку е") ||
      t.includes("цена за") ||
      t.includes("сакам понуда") ||
      t.includes("сакам резервација") ||
      t.includes("сакам да резервирам") ||
      t.includes("имате слободно") ||
      t.includes("пратете понуда") ||
      t.includes("rezervacija") ||
      t.includes("ponuda") ||
      t.includes("cena") ||
      t.includes("slobodno") ||
      t.includes("dostapno")
    );
  }

  return (
    t.includes("price") ||
    t.includes("prices") ||
    t.includes("offer") ||
    t.includes("booking") ||
    t.includes("reservation") ||
    t.includes("availability") ||
    t.includes("available") ||
    t.includes("how much") ||
    t.includes("quote") ||
    t.includes("book now") ||
    t.includes("i want to book") ||
    t.includes("send me an offer")
  );
}

function isRoomOrApartmentRequest(text = "") {
  const t = text.toLowerCase();

  return (
    t.includes("соба") ||
    t.includes("соби") ||
    t.includes("room") ||
    t.includes("rooms") ||
    t.includes("апартман") ||
    t.includes("apartment")
  );
}

function isGeneralHotelQuestion(text) {
  const t = text.toLowerCase();

  return [
    "романтичен",
    "релаксација",
    "атмосфера",
    "викенд",
    "за парови",
    "што предлагаш",
    "кажи ми повеќе",
    "кажи нешто повеќе",
    "ме интересира",
    "се за хотелот",
    "што нудите",
    "какви услуги имате",
    "tell me more",
    "recommend",
    "romantic",
    "relax",
    "what do you offer",
    "interested in the hotel",
    "more about the hotel",
  ].some((k) => t.includes(k));
}

function formatChildrenValue(count, ages, language) {
  if (Number(count) === 0) return "0";

  return language === "mk"
    ? `${count} (возраст: ${ages})`
    : `${count} (ages: ${ages})`;
}

async function handleInquiryStep(from, rawText) {
  const inquiry = userInquiryState[from];
  if (!inquiry) return null;

  const language = inquiry.language;
  let msg = rawText.trim();
  const lowerMsg = msg.toLowerCase();

  if (matchesCommand(lowerMsg, COMMANDS.cancel)) {
    resetInquiryFlow(from);
    return language === "mk"
      ? "Во ред, барањето е откажано 😊"
      : "No problem, the inquiry has been cancelled 😊";
  }

  if (matchesCommand(lowerMsg, COMMANDS.menu)) {
    return language === "mk" ? getMacedonianMenu() : getEnglishMenu();
  }

  if (inquiry.step === "checkin") {
    const parsed = extractBookingInfo(msg);

    if (parsed.checkin && parsed.checkout) {
      const checkinDate = parseDate(parsed.checkin);
      const checkoutDate = parseDate(parsed.checkout);

      if (!checkinDate || !checkoutDate || checkoutDate <= checkinDate) {
        return language === "mk"
          ? "Check-out мора да биде после check-in.\nПробајте повторно, пример: 20-25 јуни 😊"
          : "Check-out must be after check-in.\nPlease try again, example: 20-25 June 😊";
      }

      inquiry.data.checkin = parsed.checkin;
      inquiry.data.checkout = parsed.checkout;

      if (parsed.guests && Number(parsed.guests) > 0) {
        inquiry.data.adults = String(parsed.guests);
        inquiry.step = "children";

        return language === "mk"
          ? `Одлично 😊\nCheck-in: ${parsed.checkin}\nCheck-out: ${parsed.checkout}\nВозрасни: ${parsed.guests}\n\nДали ќе има деца? Ако нема, внесете 0.`
          : `Great 😊\nCheck-in: ${parsed.checkin}\nCheck-out: ${parsed.checkout}\nAdults: ${parsed.guests}\n\nWill there be any children? If none, enter 0.`;
      }

      inquiry.step = "adults";

      return language === "mk"
        ? `Одлично 😊\nCheck-in: ${parsed.checkin}\nCheck-out: ${parsed.checkout}\n\nКолку возрасни гости ќе има?`
        : `Great 😊\nCheck-in: ${parsed.checkin}\nCheck-out: ${parsed.checkout}\n\nHow many adults will stay?`;
    }

    if (!isValidDateFormat(msg) || !parseDate(msg)) {
      return language === "mk"
        ? "Напишете ги датумите, пример: 20-25 јуни 😊"
        : "Please write the dates, example: 20-25 June 😊";
    }

    inquiry.data.checkin = msg;
    inquiry.step = "checkout";

    return language === "mk"
      ? "Одлично 😊\nНапишете check-out датум."
      : "Great 😊\nPlease enter your check-out date.";
  }

  if (inquiry.step === "checkout") {
    const parsed = extractBookingInfo(msg);

    if (parsed.checkin && parsed.checkout) {
      msg = parsed.checkout;
    }

    if (!isValidDateFormat(msg) || !parseDate(msg)) {
      return language === "mk"
        ? "Внесете check-out датум во формат: 25.06.2026 😊"
        : "Please enter check-out date in this format: 25.06.2026 😊";
    }

    const checkinDate = parseDate(inquiry.data.checkin);
    const checkoutDate = parseDate(msg);

    if (!checkinDate || !checkoutDate || checkoutDate <= checkinDate) {
      return language === "mk"
        ? "Check-out датумот мора да биде после check-in датумот 😊"
        : "Check-out date must be after check-in date 😊";
    }

    inquiry.data.checkout = msg;
    inquiry.step = "adults";

    return language === "mk"
      ? "Колку возрасни гости ќе има?"
      : "How many adults will stay?";
  }

  if (inquiry.step === "adults") {
    const parsedGuests = extractGuestCount(msg);
    const adultsValue = parsedGuests ? String(parsedGuests) : msg;

    if (!isPositiveInteger(adultsValue) || Number(adultsValue) < 1) {
      return language === "mk"
        ? "Внесете број на возрасни гости, пример: 2"
        : "Please enter the number of adults, example: 2";
    }

    inquiry.data.adults = adultsValue;
    inquiry.step = "children";

    return language === "mk"
      ? "Дали ќе има деца? Ако нема, внесете 0."
      : "Will there be any children? If none, enter 0.";
  }

  if (inquiry.step === "children") {
    if (!isPositiveInteger(msg) || Number(msg) < 0) {
      return language === "mk"
        ? "За деца внесете 0 или поголем број 😊"
        : "For children, please enter 0 or a higher number 😊";
    }

    inquiry.data.children = msg;

    if (Number(msg) > 0) {
      inquiry.step = "children_ages";

      return language === "mk"
        ? "Внесете возраст на децата, одвоена со запирка.\nПример: 4, 7"
        : "Please enter the children's ages, separated by commas.\nExample: 4, 7";
    }

    inquiry.data.childrenAges = "";
    inquiry.step = "name";

    return language === "mk"
      ? "На кое име да ја подготвиме понудата?"
      : "Under which name should we prepare the offer?";
  }

  if (inquiry.step === "children_ages") {
    if (!isValidChildrenAges(msg)) {
      return language === "mk"
        ? "Внесете возраст со броеви, пример: 4, 7"
        : "Please enter ages as numbers, example: 4, 7";
    }

    inquiry.data.childrenAges = msg;
    inquiry.step = "name";

    return language === "mk"
      ? "На кое име да ја подготвиме понудата?"
      : "Under which name should we prepare the offer?";
  }

  if (inquiry.step === "name") {
    if (!isValidName(msg)) {
      return language === "mk"
        ? "Внесете име и презиме 😊"
        : "Please enter a valid name 😊";
    }

    inquiry.data.name = msg;
    inquiry.step = "email";

    return language === "mk"
      ? "Внесете e-mail адреса за да ви испратиме понуда 📧"
      : "Please enter your email address so we can send you an offer 📧";
  }

  if (inquiry.step === "email") {
    if (!isValidEmail(msg)) {
      return language === "mk"
        ? "Внесете валидна e-mail адреса 😊"
        : "Please enter a valid email address 😊";
    }

    inquiry.data.email = msg;
    inquiry.step = "special_request";

    return language === "mk"
      ? "Дали имате дополнително барање?\nАко немате, напишете: нема"
      : "Do you have any additional request?\nIf none, type: none";
  }

  if (inquiry.step === "special_request") {
    inquiry.data.specialRequest =
      lowerMsg === "нема" || lowerMsg === "none" ? "" : msg;

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

    const childrenDisplayMk = formatChildrenValue(
      inquiry.data.children,
      inquiry.data.childrenAges,
      "mk"
    );

    const childrenDisplayEn = formatChildrenValue(
      inquiry.data.children,
      inquiry.data.childrenAges,
      "en"
    );

    const specialRequestMk = inquiry.data.specialRequest || "нема";
    const specialRequestEn = inquiry.data.specialRequest || "none";

    const summaryMk =
      "Ви благодариме 🙏\nВашето барање е примено.\n\n" +
      `Check-in: ${inquiry.data.checkin}\n` +
      `Check-out: ${inquiry.data.checkout}\n` +
      `Возрасни: ${inquiry.data.adults}\n` +
      `Деца: ${childrenDisplayMk}\n` +
      `Име: ${inquiry.data.name}\n` +
      `Email: ${inquiry.data.email}\n` +
      `Дополнително барање: ${specialRequestMk}\n\n` +
      (emailSent
        ? "Нашиот тим ќе ви испрати понуда што е можно поскоро 😊"
        : "Барањето е примено, но има проблем со автоматското e-mail испраќање.");

    const summaryEn =
      "Thank you 🙏\nYour inquiry has been received.\n\n" +
      `Check-in: ${inquiry.data.checkin}\n` +
      `Check-out: ${inquiry.data.checkout}\n` +
      `Adults: ${inquiry.data.adults}\n` +
      `Children: ${childrenDisplayEn}\n` +
      `Name: ${inquiry.data.name}\n` +
      `Email: ${inquiry.data.email}\n` +
      `Additional request: ${specialRequestEn}\n\n` +
      (emailSent
        ? "Our team will send you an offer as soon as possible 😊"
        : "Your inquiry was received, but there is a problem with automatic email delivery.");

    resetInquiryFlow(from);
    return language === "mk" ? summaryMk : summaryEn;
  }

  return null;
}

function shouldStartInquiryFlow(text, language) {
  const t = text.toLowerCase().trim();
  if (t === "1") return true;
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
      currentLanguage === "mk"
        ? "\n\nСПА работи од 11:00 до 21:00 и е одличен избор за релаксација."
        : "\n\nThe spa is open from 11:00 to 21:00 and is a great choice for relaxation.";
  }

  if (faqReply.id === "parking") {
    replyText +=
      currentLanguage === "mk"
        ? "\n\nПаркингот е бесплатен и надворешен."
        : "\n\nParking is free and outdoor.";
  }

  if (faqReply.id === "location") {
    replyText +=
      currentLanguage === "mk"
        ? "\n\nЛокацијата е добра за помирен престој, блиску до плажа и Охрид."
        : "\n\nThe location is good for a calm stay, close to the beach and Ohrid.";
  }

  if (faqReply.id === "rooms") {
    if (
      textLower.includes("family") ||
      textLower.includes("kids") ||
      textLower.includes("children") ||
      textLower.includes("baby") ||
      textLower.includes("фамилија") ||
      textLower.includes("семејство") ||
      textLower.includes("деца") ||
      textLower.includes("бебе")
    ) {
      replyText +=
        currentLanguage === "mk"
          ? "\n\nЗа семејства, најчесто е попрактичен апартман."
          : "\n\nFor families, an apartment is usually more practical.";
    } else if (
      textLower.includes("couple") ||
      textLower.includes("romantic") ||
      textLower.includes("honeymoon") ||
      textLower.includes("2 persons") ||
      textLower.includes("двојка") ||
      textLower.includes("пар") ||
      textLower.includes("двајца")
    ) {
      replyText +=
        currentLanguage === "mk"
          ? "\n\nЗа двајца, двокреветна соба е добар избор."
          : "\n\nFor two persons, a double room is a good choice.";
    }
  }

  if (faqReply.id === "contact") {
    return replyText;
  }

  return addSoftNextStep(replyText, currentLanguage);
}

function getGuestTypeReply(guestType, currentLanguage) {
  if (guestType === "family") {
    return currentLanguage === "mk"
      ? "За семејства со деца, најчесто препорачуваме апартман 😊\nНапишете ги датумите за престој."
      : "For families with children, we usually recommend an apartment 😊\nPlease write your stay dates.";
  }

  if (guestType === "couple") {
    return currentLanguage === "mk"
      ? "За двајца, двокреветна соба е добар избор 😊\nНапишете ги датумите за престој."
      : "For two persons, a double room is a good choice 😊\nPlease write your stay dates.";
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
No long explanations.
No markdown **bold**.
Never invent prices or availability.
Do not tell the guest to email or call unless there is a technical issue.
If the guest asks for price/availability/booking, ask for dates or continue toward an offer request.

Guest question:
${rawText}
        `,
    language: currentLanguage,
    faqContext: hotelKnowledge.faq
      .map((f) => `${f.id}: ${currentLanguage === "mk" ? f.textMk : f.textEn}`)
      .join("\n"),
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
    const detectedLanguage = detectLanguage(rawText);
    userLanguage[from] = detectedLanguage;
    currentLanguage = detectedLanguage;

    if (text === "1" || text === "english" || text === "en") {
      userLanguage[from] = "en";
      return getSmartGreeting("en");
    }

    if (text === "2" || text === "македонски" || text === "mk") {
      userLanguage[from] = "mk";
      return getSmartGreeting("mk");
    }

    const parsedFirst = extractBookingInfo(rawText);

    if (parsedFirst.checkin && parsedFirst.checkout) {
      return startInquiryFlow(from, currentLanguage, {
        checkin: parsedFirst.checkin,
        checkout: parsedFirst.checkout,
        adults: parsedFirst.guests ? String(parsedFirst.guests) : undefined,
      });
    }

    if (isRoomOrApartmentRequest(rawText) || shouldStartInquiryFlow(rawText, currentLanguage)) {
      return getSmartGreeting(currentLanguage) + "\n\n" + startInquiryFlow(from, currentLanguage);
    }

    return getSmartGreeting(currentLanguage);
  }

  if (userInquiryState[from]) {
    reply = await handleInquiryStep(from, rawText);
    if (reply) return cleanBotReply(reply);
  }

  if (matchesCommand(rawText, COMMANDS.menu)) {
    return currentLanguage === "mk" ? getMacedonianMenu() : getEnglishMenu();
  }

  if (matchesCommand(rawText, COMMANDS.cancel)) {
    resetInquiryFlow(from);
    return currentLanguage === "mk"
      ? "Во ред, откажано е 😊"
      : "No problem, it is cancelled 😊";
  }

  if (matchesCommand(rawText, COMMANDS.contact)) {
    const contactReply =
      currentLanguage === "mk"
        ? getFaqReply("contact", "mk")?.text || hotelKnowledge.hotel.fallbackMessageMk
        : getFaqReply("contact", "en")?.text || hotelKnowledge.hotel.fallbackMessageEn;

    return cleanBotReply(contactReply);
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
    version: "5.0.0-parser-flow-fix",
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
    const reply = await processGuestMessage(from, message.trim());

    return res.json({ reply });
  } catch (err) {
    console.error("Webchat error:", err);
    return res.status(500).json({
      reply:
        "There was a technical problem. Please try again in a moment.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
