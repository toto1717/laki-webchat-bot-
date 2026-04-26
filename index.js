// =========================
// 🧠 SMART INPUT PARSER
// =========================
function extractBookingInfo(text) {
  const t = text.toLowerCase();

  let checkin = null;
  let checkout = null;
  let guests = null;

  // dates like: 20-26 june / 20 до 26 јуни
  const dateMatch = t.match(/(\d{1,2}).*(\d{1,2})/);
  if (dateMatch) {
    checkin = dateMatch[1];
    checkout = dateMatch[2];
  }

  // guests
  if (t.includes("два") || t.includes("2")) guests = 2;
  if (t.includes("три") || t.includes("3")) guests = 3;
  if (t.includes("четири") || t.includes("4")) guests = 4;

  return { checkin, checkout, guests };
}

// =========================
// 🧠 ROOM TYPE DETECTION
// =========================
function detectRoomType(text) {
  const t = text.toLowerCase();

  if (t.includes("соба") || t.includes("room")) return "room";
  if (t.includes("апартман") || t.includes("apartment")) return "apartment";

  return null;
}
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
    "bebе",
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
    "You can ask me about rooms, apartments, spa, restaurant, parking, location, contact, prices or availability.\n\n" +
    "If you would like an offer, just write your dates or ask for price/availability."
  );
}

function getMacedonianMenu() {
  return (
    "Laki Hotel & Spa 🏨\n\n" +
    "Можете да ме прашате за соби, апартмани, СПА, ресторан, паркинг, локација, контакт, цени или достапност.\n\n" +
    "Ако сакате понуда, само напишете датуми или прашајте за цена/слободно."
  );
}

function getHumanFallback(language = "en") {
  if (language === "mk") {
    return (
      "Ќе ми треба уште малку информација за да ви одговорам точно 😊\n\n" +
      "Можете да прашате за соби, апартмани, СПА, ресторан, паркинг, локација или понуда.\n\n" +
      `За директен контакт: ${hotelKnowledge.hotel.email} / ${hotelKnowledge.hotel.phone}`
    );
  }

  return (
    "I may need a little more information to answer this accurately 😊\n\n" +
    "You can ask me about rooms, apartments, spa, restaurant, parking, location or an offer.\n\n" +
    `For direct contact: ${hotelKnowledge.hotel.email} / ${hotelKnowledge.hotel.phone}`
  );
}

function addSoftNextStep(replyText, language, options = {}) {
  const { offer = true } = options;

  if (!offer) return replyText;

  if (language === "mk") {
    return (
      replyText +
      "\n\nДоколку планирате престој, можам да ви помогнам да испратиме барање за понуда со датумите и број на гости 😊"
    );
  }

  return (
    replyText +
    "\n\nIf you are planning a stay, I can help you send an offer request with your dates and number of guests 😊"
  );
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
      ? "📞 Почитувани,\n\n" +
          "од вашата соба можете директно да се јавите:\n\n" +
          "– Рецепција: 0\n" +
          "– Ресторан: 501\n" +
          "– Спа центар: 502\n" +
          "– Базен: 503\n" +
          "– Кујна: 504\n\n" +
          "Доколку ви треба нешто, слободно обратете се 😊"
      : "📞 Dear guest,\n\n" +
          "from your room you can call directly:\n\n" +
          "– Reception: 0\n" +
          "– Restaurant: 501\n" +
          "– Spa center: 502\n" +
          "– Pool: 503\n" +
          "– Kitchen: 504\n\n" +
          "If you need anything, feel free to contact us 😊";
  }

  return null;
}

function resetInquiryFlow(from) {
  delete userInquiryState[from];
}

function startInquiryFlow(from, language) {
  userInquiryState[from] = {
    step: "checkin",
    language,
    data: {},
  };

  return language === "mk"
    ? "Супер 😊\nЗа да ви подготвиме понуда, ќе ми требаат неколку информации.\n\n👉 Прво внесете check-in датум.\nПример: 10.04.2026"
    : "Great 😊\nTo prepare an offer, I’ll need a few details.\n\n👉 First, please enter your check-in date.\nExample: 10.04.2026";
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
  const msg = rawText.trim();
  const lowerMsg = msg.toLowerCase();

  if (matchesCommand(lowerMsg, COMMANDS.cancel)) {
    resetInquiryFlow(from);
    return language === "mk"
      ? "Во ред, барањето е откажано 😊\nАко сакате, можете повторно да прашате за понуда, соби, СПА, паркинг или локација."
      : "No problem, the inquiry has been cancelled 😊\nYou can ask again about an offer, rooms, spa, parking or location whenever you like.";
  }

  if (matchesCommand(lowerMsg, COMMANDS.menu)) {
    return language === "mk" ? getMacedonianMenu() : getEnglishMenu();
  }

  const directIntent = detectDirectIntent(msg, language);
  if (directIntent) {
    const directReply = getDirectIntentReply(directIntent, language);

    if (directReply) {
      return (
        directReply +
        "\n\n" +
        (language === "mk"
          ? "Кога ќе бидете подготвени, продолжете со check-in датумот за понудата."
          : "When you are ready, please continue with the check-in date for the offer.")
      );
    }
  }

  const faqReply = getFaqReply(msg, language);
  if (faqReply && !faqReply.triggersInquiryFlow) {
    return (
      buildSmartFaqReply(faqReply, msg, language) +
      "\n\n" +
      (language === "mk"
        ? "Кога ќе бидете подготвени, внесете check-in датум за понудата."
        : "When you are ready, please enter the check-in date for the offer.")
    );
  }

  if (isGeneralHotelQuestion(msg) && !isExplicitOfferRequest(msg, language)) {
    const aiReply = await getAiReply({
      message: msg,
      language,
      faqContext: hotelKnowledge.faq
        .map((f) => `${f.id}: ${language === "mk" ? f.textMk : f.textEn}`)
        .join("\n"),
    });

    return (
      aiReply +
      "\n\n" +
      (language === "mk"
        ? "Кога ќе бидете подготвени, внесете check-in датум за понудата."
        : "When you are ready, please enter the check-in date for the offer.")
    );
  }

  if (inquiry.step === "checkin") {
    if (!isValidDateFormat(msg) || !parseDate(msg)) {
      return language === "mk"
        ? "Можете да ми напишете датум во формат: 10.04.2026 😊"
        : "Please write the date in this format: 10.04.2026 😊";
    }

    inquiry.data.checkin = msg;
    inquiry.step = "checkout";

    return language === "mk"
      ? "Одлично 😊\n\n👉 Сега напишете check-out датум.\nПример: 12.04.2026"
      : "Great 😊\n\n👉 Now please enter your check-out date.\nExample: 12.04.2026";
  }

  if (inquiry.step === "checkout") {
    if (!isValidDateFormat(msg) || !parseDate(msg)) {
      return language === "mk"
        ? "Внесете check-out датум во формат: 12.04.2026 😊"
        : "Please enter the check-out date in this format: 12.04.2026 😊";
    }

    const checkinDate = parseDate(inquiry.data.checkin);
    const checkoutDate = parseDate(msg);

    if (!checkinDate || !checkoutDate || checkoutDate <= checkinDate) {
      return language === "mk"
        ? "Check-out датумот мора да биде после check-in датумот.\nВнесете валиден check-out датум 😊"
        : "Check-out date must be after check-in date.\nPlease enter a valid check-out date 😊";
    }

    inquiry.data.checkout = msg;
    inquiry.step = "adults";

    return language === "mk"
      ? "Супер 👍\nКолку возрасни гости ќе има?\nВнесете број, на пример: 2"
      : "Perfect 👍\nHow many adults will stay?\nEnter a number, for example: 2";
  }

  if (inquiry.step === "adults") {
    if (!isPositiveInteger(msg) || Number(msg) < 1) {
      return language === "mk"
        ? "Бројот на возрасни мора да биде најмалку 1.\nВнесете број, на пример: 2"
        : "The number of adults must be at least 1.\nEnter a number, for example: 2";
    }

    inquiry.data.adults = msg;
    inquiry.step = "children";

    return language === "mk"
      ? "Дали ќе има деца? 😊\nАко има, внесете број. Ако нема, внесете 0."
      : "Will there be any children? 😊\nIf yes, enter the number. If none, enter 0.";
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
        ? "Внесете ја возраста на децата, одвоена со запирка.\nПример: 4, 7"
        : "Please enter the children's ages, separated by commas.\nExample: 4, 7";
    }

    inquiry.data.childrenAges = "";
    inquiry.step = "name";

    return language === "mk"
      ? "Одлично. На кое име да ја подготвиме понудата? 😊"
      : "Great. Under which name should we prepare the offer? 😊";
  }

  if (inquiry.step === "children_ages") {
    if (!isValidChildrenAges(msg)) {
      return language === "mk"
        ? "Внесете ја возраста на децата со броеви, одвоени со запирка.\nПример: 4, 7"
        : "Please enter the children's ages as numbers, separated by commas.\nExample: 4, 7";
    }

    inquiry.data.childrenAges = msg;
    inquiry.step = "name";

    return language === "mk"
      ? "Одлично. На кое име да ја подготвиме понудата? 😊"
      : "Great. Under which name should we prepare the offer? 😊";
  }

  if (inquiry.step === "name") {
    if (!isValidName(msg)) {
      return language === "mk"
        ? "Внесете валидно име и презиме 😊"
        : "Please enter a valid name 😊";
    }

    inquiry.data.name = msg;
    inquiry.step = "email";

    return language === "mk"
      ? "Ве молиме внесете e-mail адреса каде што може да ја добиете понудата 📧"
      : "Please enter the email address where you would like to receive the offer 📧";
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
      ? "Дали имате дополнително барање?\nПример: baby crib, late arrival, поглед кон езеро.\n\nАко немате, напишете: нема"
      : "Do you have any additional request?\nExample: baby crib, late arrival, lake view.\n\nIf none, type: none";
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
        ? "Вашето барање е успешно испратено до нашиот тим. Ќе ви испратиме понуда што е можно поскоро 😊\n"
        : "Вашето барање е примено, но моментално има проблем со автоматското e-mail испраќање. Ве молиме контактирајте нè директно.\n") +
      `Контакт: ${hotelKnowledge.hotel.email} / ${hotelKnowledge.hotel.phone}`;

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
        ? "Your inquiry has been sent to our team. We will send you an offer as soon as possible 😊\n"
        : "Your inquiry has been received, but there is currently a problem with automatic email delivery. Please contact us directly.\n") +
      `Contact: ${hotelKnowledge.hotel.email} / ${hotelKnowledge.hotel.phone}`;

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

Return ONLY valid JSON in this format:
{
  "intent": "spa | restaurant | parking | location | contact | rooms | offer | checkin_checkout | children_policy | baby_crib | internal_phone | unknown",
  "guestType": "family | couple | none",
  "needsInquiry": true,
  "confidence": 0.95
}

Rules:
- Use "offer" ONLY when the guest EXPLICITLY asks about price, rates, booking, reservation, availability, cost, quote, or sending an offer.
- If the guest is only asking generally about the hotel, services, rooms, spa, restaurant, or says things like "tell me more", "what do you offer", "I am interested in the hotel", DO NOT use "offer".
- In such cases use the closest intent like "rooms", "spa", "restaurant", or "unknown".
- Set "needsInquiry" to true ONLY for explicit booking / price / availability requests.
- guestType = "family" if the message clearly mentions family, kids, children, baby.
- guestType = "couple" if the message clearly mentions couple, romantic stay, honeymoon, two persons.
- If unclear, use "unknown" and "none".
- Do not add explanation text, only JSON.
- Use "internal_phone" when the guest asks how to call reception, restaurant, spa, kitchen, or any hotel department from the room phone.

Message: "${message}"
`;

    const ai = await getAiReply({
      message: prompt,
      language,
      faqContext: "",
    });

    const clean = (ai || "").replace(/```json|```/g, "").trim();
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
        ? "\n\nСПА делот е одличен избор ако доаѓате за релаксација, особено во комбинација со престој во соба или апартман."
        : "\n\nThe spa area is a great choice if you are coming for relaxation, especially combined with a stay in a room or apartment.";
  }

  if (faqReply.id === "parking") {
    replyText +=
      currentLanguage === "mk"
        ? "\n\nОва е практично ако доаѓате со автомобил, бидејќи не мора да барате паркинг околу хотелот."
        : "\n\nThis is convenient if you are arriving by car, because you do not need to look for parking around the hotel.";
  }

  if (faqReply.id === "location") {
    replyText +=
      currentLanguage === "mk"
        ? "\n\nЛокацијата е добра ако сакате помирен престој, а сепак да сте блиску до Охрид и плажа."
        : "\n\nThe location is a good choice if you want a calmer stay while still being close to Ohrid and the beach.";
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
          ? "\n\nЗа семејства, најчесто е попрактичен апартман бидејќи има повеќе простор и удобност."
          : "\n\nFor families, an apartment is usually more practical because it offers more space and comfort.";
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
          ? "\n\nЗа двајца, двокреветна соба е одличен избор за удобен и мирен престој."
          : "\n\nFor two persons, a double room is a great choice for a comfortable and relaxing stay.";
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
      ? "За семејства со деца, најчесто препорачуваме апартман за повеќе простор и удобност 😊\n\nАко сакате, можам да ви помогнам да испратиме барање за понуда со датумите, бројот на возрасни и возраста на децата."
      : "For families with children, we usually recommend an apartment for more space and comfort 😊\n\nIf you’d like, I can help you send an offer request with your dates, number of adults and children’s ages.";
  }

  if (guestType === "couple") {
    return currentLanguage === "mk"
      ? "За двајца, двокреветна соба е одличен избор за удобен и мирен престој 😊\n\nАко сакате, можам да ви помогнам да испратиме барање за понуда со вашите датуми."
      : "For two persons, a double room is a great choice for a comfortable and relaxing stay 😊\n\nIf you’d like, I can help you send an offer request with your dates.";
  }

  return null;
}

// =========================
// 🧠 SMART PARSER V2
// =========================
function extractBookingInfo(text) {
  const t = text.toLowerCase();

  let checkin = null;
  let checkout = null;
  let guests = null;

  // numbers (20–26)
  const match = t.match(/(\d{1,2}).*(\d{1,2})/);
  if (match) {
    checkin = match[1];
    checkout = match[2];
  }

  // guests
  if (t.includes("два") || t.includes("2")) guests = 2;
  if (t.includes("три") || t.includes("3")) guests = 3;
  if (t.includes("четири") || t.includes("4")) guests = 4;

  return { checkin, checkout, guests };
}

function detectRoomType(text) {
  const t = text.toLowerCase();

  if (t.includes("соба") || t.includes("room")) return "room";
  if (t.includes("апартман") || t.includes("apartment")) return "apartment";

  return null;
}
async function processGuestMessage(from, rawText) {
  const text = rawText.toLowerCase().trim();
  let reply = "";
  const currentLanguage = userLanguage[from] || null;

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

  if (userInquiryState[from]) {
    reply = await handleInquiryStep(from, rawText);
    if (reply) return reply;
  }

  // =========================
// ⚡ SMART QUICK BOOKING V2
// =========================
const parsed = extractBookingInfo(rawText);
const roomType = detectRoomType(rawText);

// ако user кажал „соба“
if (
  rawText.toLowerCase().includes("соба") ||
  rawText.toLowerCase().includes("room")
) {
  userInquiryState[from] = {
    step: "quick_booking",
    language: currentLanguage,
    data: {
      roomType,
      ...parsed,
    },
  };

  return currentLanguage === "mk"
    ? "Супер 😊 Кои датуми ги планирате?"
    : "Great 😊 What dates are you planning?";
}

// ако внесе датум одма
if (userInquiryState[from]?.step === "quick_booking") {
  if (parsed.checkin && parsed.checkout) {
    userInquiryState[from].data.checkin = parsed.checkin;
    userInquiryState[from].data.checkout = parsed.checkout;
    userInquiryState[from].data.guests = parsed.guests || 2;

    userInquiryState[from].step = "email";

    return currentLanguage === "mk"
      ? `Одлично 👍 ${parsed.checkin}–${parsed.checkout} за ${userInquiryState[from].data.guests} лица.\n\nСамо уште e-mail за понуда 📧`
      : `Great 👍 ${parsed.checkin}-${parsed.checkout} for ${userInquiryState[from].data.guests} guests.\n\nPlease provide your email 📧`;
  }
}

// email step
if (userInquiryState[from]?.step === "email") {
  await sendInquiryEmail({
    ...userInquiryState[from].data,
    email: rawText.trim(),
    fromWebchat: from,
  });

  delete userInquiryState[from];

  return currentLanguage === "mk"
    ? "Барањето е испратено ✅ Ќе добиете понуда наскоро 😊"
    : "Request sent ✅ You will receive an offer soon 😊";
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

    const detectedLanguage = detectLanguage(rawText);
    userLanguage[from] = detectedLanguage;
    return getSmartGreeting(detectedLanguage);
  }

  if (matchesCommand(rawText, COMMANDS.menu)) {
    return currentLanguage === "mk" ? getMacedonianMenu() : getEnglishMenu();
  }

  if (matchesCommand(rawText, COMMANDS.cancel)) {
    resetInquiryFlow(from);
    return currentLanguage === "mk"
      ? "Во ред, откажано е 😊\nКако можам да ви помогнам понатаму?"
      : "No problem, it is cancelled 😊\nHow can I help you further?";
  }

  if (matchesCommand(rawText, COMMANDS.contact)) {
    const contactReply =
      currentLanguage === "mk"
        ? getFaqReply("contact", "mk")?.text || hotelKnowledge.hotel.fallbackMessageMk
        : getFaqReply("contact", "en")?.text || hotelKnowledge.hotel.fallbackMessageEn;

    return contactReply;
  }

  if (shouldStartInquiryFlow(rawText, currentLanguage)) {
    return startInquiryFlow(from, currentLanguage);
  }

  const directIntent = detectDirectIntent(rawText, currentLanguage);
  if (directIntent) {
    const directReply = getDirectIntentReply(directIntent, currentLanguage);
    if (directReply) return directReply;
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
    if (internalPhoneReply) return internalPhoneReply;
  }

  const guestTypeReply = getGuestTypeReply(aiIntent?.guestType, currentLanguage);
  if (guestTypeReply) return guestTypeReply;

  const faqFromIntent = getFaqReply(aiIntent?.intent, currentLanguage);
  if (faqFromIntent) {
    return faqFromIntent.triggersInquiryFlow
      ? startInquiryFlow(from, currentLanguage)
      : buildSmartFaqReply(faqFromIntent, rawText, currentLanguage);
  }

  const faqReply = getFaqReply(rawText, currentLanguage);
  if (faqReply) {
    const smartReply = buildSmartFaqReply(faqReply, rawText, currentLanguage);
    return faqReply.triggersInquiryFlow
      ? startInquiryFlow(from, currentLanguage)
      : smartReply;
  }

  const aiReply = await getAiReply({
    message:
      currentLanguage === "mk"
        ? `
Ти си web chat асистент за Laki Hotel & Spa.

Одговарај како пријателски, професионален хотелски рецепционер и sales асистент.
Тонот да биде топол, природен, љубезен и малку подетален, но едноставен.
Не пишувај премногу долги одговори.

Правила:
- Прво одговори директно на прашањето на гостинот.
- Не измислувај цени, достапност, услуги, типови соби или политики.
- Ако прашањето е за цена или достапност, насочи го гостинот кон барање за понуда.
- Ако нема сигурна информација, кажи дека хотелскиот тим ќе потврди.
- Ако одговорот не е сигурен, упати го гостинот на ${hotelKnowledge.hotel.email} и ${hotelKnowledge.hotel.phone}.
- Не нуди големо мени со бројки.
- На крај, ако е природно, постави едно кратко прашање за да продолжи разговорот.

Прашање од гостин:
${rawText}
        `
        : `
You are the web chat assistant for Laki Hotel & Spa.

Reply like a friendly, professional hotel receptionist and sales assistant.
The tone should be warm, natural, polite and slightly detailed, but simple.
Do not write very long answers.

Rules:
- First answer the guest's question directly.
- Never invent prices, availability, services, room types, or policies.
- If the guest asks about price or availability, guide them toward an offer request.
- If information is uncertain, say the hotel team will confirm it.
- If the answer is uncertain, direct the guest to ${hotelKnowledge.hotel.email} and ${hotelKnowledge.hotel.phone}.
- Do not offer a large numbered menu.
- At the end, if natural, ask one short question to continue the conversation.

Guest question:
${rawText}
        `,
    language: currentLanguage,
    faqContext: hotelKnowledge.faq
      .map((f) => `${f.id}: ${currentLanguage === "mk" ? f.textMk : f.textEn}`)
      .join("\n"),
  });

  if (aiReply) {
    if (isExplicitOfferRequest(rawText, currentLanguage)) {
      return startInquiryFlow(from, currentLanguage);
    }

    return aiReply;
  }

  return getHumanFallback(currentLanguage);
}

app.get("/", (req, res) => {
  res.status(200).json({
    service: "Laki Web Chat Bot",
    status: "running",
    version: "3.0.0-smart-ux",
    features: ["FAQ", "Inquiry Flow", "Email", "AI Intent", "Smart Greeting", "No Menu Spam"],
    timestamp: new Date().toISOString(),
  });
});

app.post("/chat", async (req, res) => {
  try {
    const { message, userId } = req.body;

    if (!message || !message.trim()) {
      return res.json({ reply: "No message provided" });
    }

    const from = userId || "web-user";
    const reply = await processGuestMessage(from, message.trim());

    return res.json({ reply });
  } catch (err) {
    console.error("Webchat error:", err);
    return res.status(500).json({
      reply:
        "There was a technical problem. Please contact us at contact@lakihotelspa.com or +389 46 203 333.",
    });
  }
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
