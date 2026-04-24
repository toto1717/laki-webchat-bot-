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
    "Welcome to Laki Hotel & Spa 🏨\n\n" +
    "How can we help you?\n" +
    "1. Prices / Offer\n" +
    "2. Rooms & Apartments\n" +
    "3. Spa\n" +
    "4. Restaurant\n" +
    "5. Parking\n" +
    "6. Location\n" +
    "7. Contact\n\n" +
    "Useful commands:\n" +
    "- menu\n- language\n- reset\n- cancel\n- contact\n\n" +
    "You can also type your question directly."
  );
}

function getMacedonianMenu() {
  return (
    "Добредојдовте во Laki Hotel & Spa 🏨\n\n" +
    "Како можеме да ви помогнеме?\n" +
    "1. Цени / Понуда\n" +
    "2. Соби и апартмани\n" +
    "3. СПА\n" +
    "4. Ресторан\n" +
    "5. Паркинг\n" +
    "6. Локација\n" +
    "7. Контакт\n\n" +
    "Корисни команди:\n" +
    "- мени\n- јазик\n- ресет\n- откажи\n- контакт\n\n" +
    "Или напишете прашање директно."
  );
}

function getHumanFallback(language = "en") {
  if (language === "mk") {
    return (
      "Во моментов немаме точен автоматски одговор на ова прашање.\n" +
      "Нашиот тим ќе ви помогне во најкраток рок.\n" +
      `Контакт: ${hotelKnowledge.hotel.email} / ${hotelKnowledge.hotel.phone}\n\n` +
      getMacedonianMenu()
    );
  }

  return (
    "At the moment, we do not have an exact automatic answer to this question.\n" +
    "Our team will assist you shortly.\n" +
    `Contact: ${hotelKnowledge.hotel.email} / ${hotelKnowledge.hotel.phone}\n\n` +
    getEnglishMenu()
  );
}

function containsAny(text = "", keywords = []) {
  return keywords.some((keyword) => text.includes(keyword));
}

function detectDirectIntent(text = "", language = "en") {
  const t = text.toLowerCase().trim();

  const mkCallWords = [
    "свонам", "ѕвонам", "јавам", "се јавам", "како да се јавам",
    "како да свонам", "како да ѕвонам", "вртам", "повикам",
    "број", "телефон", "внатрешен",
  ];

  const mkRoomWords = [
    "од соба", "во соба", "соба", "собен телефон",
    "телефон во соба", "внатрешен телефон", "од мојата соба",
  ];

  const mkDepartmentWords = ["рецепција", "ресторан", "спа", "базен", "кујна"];

  const enCallWords = [
    "call", "phone", "dial", "reach", "how do i call",
    "how can i call", "internal", "number",
  ];

  const enRoomWords = [
    "from room", "in room", "room phone", "internal phone", "hotel phone",
  ];

  const enDepartmentWords = [
    "reception", "restaurant", "spa", "pool", "kitchen", "front desk",
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
    ? "За да ви подготвиме понуда, ве молиме внесете check-in датум.\nФормат: 10.04.2026"
    : "To prepare an offer, please enter your check-in date.\nFormat: 10.04.2026";
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
      t.includes("пратете понуда")
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

  if (lowerMsg === "menu" || lowerMsg === "meni" || lowerMsg === "мени") {
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
          ? "Кога ќе бидете подготвени, внесете check-in датум."
          : "When you are ready, please enter check-in date.")
      );
    }
  }

  const faqReply = getFaqReply(msg, language);
  if (faqReply) {
    return (
      faqReply.text +
      "\n\n" +
      (language === "mk"
        ? "Кога ќе бидете подготвени, внесете check-in датум."
        : "When you are ready, please enter check-in date.")
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
        ? "Ако сакате понуда, само напишете: сакам понуда."
        : "If you want an offer, just type: I want an offer.")
    );
  }

  if (matchesCommand(lowerMsg, COMMANDS.cancel)) {
    resetInquiryFlow(from);
    return language === "mk"
      ? "Барањето е откажано.\n\n" + getMacedonianMenu()
      : "Inquiry cancelled.\n\n" + getEnglishMenu();
  }

  if (inquiry.step === "checkin") {
    if (!isValidDateFormat(msg) || !parseDate(msg)) {
      return language === "mk"
        ? "Можете да ми напишете датум во формат: 10.04.2026 😊"
        : "Please write the date in format: 10.04.2026 😊";
    }

    inquiry.data.checkin = msg;
    inquiry.step = "checkout";

    return language === "mk"
      ? "Одлично 😊\n\n👉 Сега напишете check-out датум (пр. 12.04.2026)"
      : "Great 😊\n\n👉 Now please enter your check-out date (e.g. 12.04.2026)";
  }

  if (inquiry.step === "checkout") {
    if (!isValidDateFormat(msg) || !parseDate(msg)) {
      return language === "mk"
        ? "Невалиден датум.\nВнесете check-out датум во формат: 12.04.2026"
        : "Invalid date.\nPlease enter check-out date in format: 12.04.2026";
    }

    const checkinDate = parseDate(inquiry.data.checkin);
    const checkoutDate = parseDate(msg);

    if (!checkinDate || !checkoutDate || checkoutDate <= checkinDate) {
      return language === "mk"
        ? "Check-out датумот мора да биде после check-in датумот.\nВнесете валиден check-out датум."
        : "Check-out date must be after check-in date.\nPlease enter a valid check-out date.";
    }

    inquiry.data.checkout = msg;
    inquiry.step = "adults";

    return language === "mk"
      ? "Колку возрасни гости ќе има?\nВнесете број, на пример: 2"
      : "How many adults will stay?\nEnter a number, for example: 2";
  }

  if (inquiry.step === "adults") {
    if (!isPositiveInteger(msg) || Number(msg) < 1) {
      return language === "mk"
        ? "Невалиден број.\nБројот на возрасни мора да биде најмалку 1."
        : "Invalid number.\nThe number of adults must be at least 1.";
    }

    inquiry.data.adults = msg;
    inquiry.step = "children";

    return language === "mk"
      ? "Колку деца ќе има?\nАко нема, внесете 0."
      : "How many children will stay?\nIf none, enter 0.";
  }

  if (inquiry.step === "children") {
    if (!isPositiveInteger(msg) || Number(msg) < 0) {
      return language === "mk"
        ? "Невалиден број.\nЗа деца внесете 0 или поголем број."
        : "Invalid number.\nFor children, enter 0 or a higher number.";
    }

    inquiry.data.children = msg;

    if (Number(msg) > 0) {
      inquiry.step = "children_ages";

      return language === "mk"
        ? "Внесете ја возраста на децата одвоена со запирка.\nПример: 4, 7"
        : "Please enter the children's ages separated by commas.\nExample: 4, 7";
    }

    inquiry.data.childrenAges = "";
    inquiry.step = "name";

    return language === "mk"
      ? "Ве молиме внесете го вашето име:"
      : "Please enter your name:";
  }

  if (inquiry.step === "children_ages") {
    if (!isValidChildrenAges(msg)) {
      return language === "mk"
        ? "Невалиден внес.\nВнесете ја возраста на децата со броеви одвоени со запирка.\nПример: 4, 7"
        : "Invalid input.\nPlease enter the children's ages as numbers separated by commas.\nExample: 4, 7";
    }

    inquiry.data.childrenAges = msg;
    inquiry.step = "name";

    return language === "mk"
      ? "Ве молиме внесете го вашето име:"
      : "Please enter your name:";
  }

  if (inquiry.step === "name") {
    if (!isValidName(msg)) {
      return language === "mk"
        ? "Невалидно име.\nВе молиме внесете валидно име и презиме."
        : "Invalid name.\nPlease enter a valid name.";
    }

    inquiry.data.name = msg;
    inquiry.step = "email";

    return language === "mk"
      ? "Ве молиме внесете e-mail адреса:"
      : "Please enter your email address:";
  }

  if (inquiry.step === "email") {
    if (!isValidEmail(msg)) {
      return language === "mk"
        ? "Невалидна e-mail адреса.\nВе молиме внесете валидна e-mail адреса."
        : "Invalid email address.\nPlease enter a valid email address.";
    }

    inquiry.data.email = msg;
    inquiry.step = "special_request";

    return language === "mk"
      ? "Доколку имате дополнително барање, напишете го сега.\nПример: baby crib, late arrival\nАко немате, напишете: нема"
      : "If you have any additional request, please type it now.\nExample: baby crib, late arrival\nIf none, type: none";
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
      "Ви благодариме. Вашето барање е примено.\n\n" +
      `Check-in: ${inquiry.data.checkin}\n` +
      `Check-out: ${inquiry.data.checkout}\n` +
      `Возрасни: ${inquiry.data.adults}\n` +
      `Деца: ${childrenDisplayMk}\n` +
      `Име: ${inquiry.data.name}\n` +
      `Email: ${inquiry.data.email}\n` +
      `Дополнително барање: ${specialRequestMk}\n\n` +
      (emailSent
        ? "Вашето барање е успешно испратено и на нашиот e-mail.\nЌе ви испратиме понуда што е можно поскоро.\n"
        : "Вашето барање е примено, но моментално има проблем со автоматското e-mail испраќање.\nВе молиме за итни информации контактирајте не директно.\n") +
      `Контакт: ${hotelKnowledge.hotel.email} / ${hotelKnowledge.hotel.phone}`;

    const summaryEn =
      "Thank you. Your inquiry has been received.\n\n" +
      `Check-in: ${inquiry.data.checkin}\n` +
      `Check-out: ${inquiry.data.checkout}\n` +
      `Adults: ${inquiry.data.adults}\n` +
      `Children: ${childrenDisplayEn}\n` +
      `Name: ${inquiry.data.name}\n` +
      `Email: ${inquiry.data.email}\n` +
      `Additional request: ${specialRequestEn}\n\n` +
      (emailSent
        ? "Your inquiry has also been sent to our email.\nWe will send you an offer as soon as possible.\n"
        : "Your inquiry has been received, but there is currently a problem with automatic email delivery.\nFor urgent information, please contact us directly.\n") +
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
        ? "\n\nМожете да го комбинирате СПА искуството со престој во соба или апартман."
        : "\n\nYou can combine the spa experience with a stay in a room or apartment.";
  }

  if (faqReply.id === "rooms") {
    if (
      textLower.includes("family") ||
      textLower.includes("kids") ||
      textLower.includes("children") ||
      textLower.includes("baby") ||
      textLower.includes("фамилија") ||
      textLower.includes("деца") ||
      textLower.includes("бебе")
    ) {
      replyText +=
        currentLanguage === "mk"
          ? "\n\nЗа семејства, ви препорачуваме апартман за повеќе простор и удобност."
          : "\n\nFor families, we recommend an apartment for more space and comfort.";
    }

    if (
      textLower.includes("couple") ||
      textLower.includes("romantic") ||
      textLower.includes("honeymoon") ||
      textLower.includes("2 persons") ||
      textLower.includes("двојка")
    ) {
      replyText +=
        currentLanguage === "mk"
          ? "\n\nЗа двајца, двокреветна соба е одличен избор."
          : "\n\nFor two persons, a double room is a great choice.";
    }
  }

  return replyText;
}

async function processGuestMessage(from, rawText) {
  const text = rawText.toLowerCase();
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

  if (matchesCommand(rawText, COMMANDS.contact)) {
    return currentLanguage === "mk"
      ? getFaqReply("contact", "mk")?.text || hotelKnowledge.hotel.fallbackMessageMk
      : getFaqReply("contact", "en")?.text || hotelKnowledge.hotel.fallbackMessageEn;
  }

  if (userInquiryState[from]) {
    const inquiryLanguage = userInquiryState[from].language;

    if (matchesCommand(rawText, COMMANDS.menu)) {
      resetInquiryFlow(from);
      return inquiryLanguage === "mk" ? getMacedonianMenu() : getEnglishMenu();
    }

    reply = await handleInquiryStep(from, rawText);
    if (reply) return reply;
  }

  if (!currentLanguage) {
    if (text === "1" || text === "english" || text === "en") {
      userLanguage[from] = "en";
      return getEnglishMenu();
    }

    if (text === "2" || text === "македонски" || text === "mk") {
      userLanguage[from] = "mk";
      return getMacedonianMenu();
    }

    return getLanguageMenu();
  }

  if (matchesCommand(rawText, COMMANDS.menu)) {
    return currentLanguage === "mk" ? getMacedonianMenu() : getEnglishMenu();
  }

  if (matchesCommand(rawText, COMMANDS.cancel)) {
    resetInquiryFlow(from);
    return currentLanguage === "mk" ? getMacedonianMenu() : getEnglishMenu();
  }

  if (currentLanguage === "en") {
    if (text === "2") return getFaqReply("rooms", "en")?.text || getHumanFallback("en");
    if (text === "3") return getFaqReply("spa", "en")?.text || getHumanFallback("en");
    if (text === "4") return getFaqReply("restaurant", "en")?.text || getHumanFallback("en");
    if (text === "5") return getFaqReply("parking", "en")?.text || getHumanFallback("en");
    if (text === "6") return getFaqReply("location", "en")?.text || getHumanFallback("en");
    if (text === "7") return getFaqReply("contact", "en")?.text || getHumanFallback("en");
  }

  if (currentLanguage === "mk") {
    if (text === "2") return getFaqReply("rooms", "mk")?.text || getHumanFallback("mk");
    if (text === "3") return getFaqReply("spa", "mk")?.text || getHumanFallback("mk");
    if (text === "4") return getFaqReply("restaurant", "mk")?.text || getHumanFallback("mk");
    if (text === "5") return getFaqReply("parking", "mk")?.text || getHumanFallback("mk");
    if (text === "6") return getFaqReply("location", "mk")?.text || getHumanFallback("mk");
    if (text === "7") return getFaqReply("contact", "mk")?.text || getHumanFallback("mk");
  }

  const directIntent = detectDirectIntent(rawText, currentLanguage);
  if (directIntent) {
    const directReply = getDirectIntentReply(directIntent, currentLanguage);
    if (directReply) return directReply;
  }

  const faqReply = getFaqReply(rawText, currentLanguage);
  if (faqReply) {
    const smartReply = buildSmartFaqReply(faqReply, rawText, currentLanguage);
    return faqReply.triggersInquiryFlow
      ? startInquiryFlow(from, currentLanguage)
      : smartReply;
  }

  if (shouldStartInquiryFlow(rawText, currentLanguage)) {
    return startInquiryFlow(from, currentLanguage);
  }

  const aiIntent = await detectIntentWithAI(rawText, currentLanguage);

  if (
    (aiIntent?.needsInquiry || aiIntent?.intent === "offer") &&
    isExplicitOfferRequest(rawText, currentLanguage)
  ) {
    return startInquiryFlow(from, currentLanguage);
  }

  if (aiIntent?.guestType === "family") {
    return currentLanguage === "mk"
      ? "За семејства со деца, ви препорачуваме апартман за повеќе простор и удобност.\n\nДоколку сакате понуда, напишете 1 или пратете ни барање за цени."
      : "For families with children, we recommend an apartment for more space and comfort.\n\nIf you would like an offer, type 1 or send us a pricing request.";
  }

  if (aiIntent?.guestType === "couple") {
    return currentLanguage === "mk"
      ? "За двајца, двокреветна соба е одличен избор.\n\nДоколку сакате понуда, напишете 1 или пратете ни барање за цени."
      : "For two persons, a double room is a great choice.\n\nIf you would like an offer, type 1 or send us a pricing request.";
  }

  if (aiIntent?.intent === "internal_phone") {
    const internalPhoneReply = getDirectIntentReply("internal_phone", currentLanguage);
    if (internalPhoneReply) return internalPhoneReply;
  }

  const faqFromIntent = getFaqReply(aiIntent?.intent, currentLanguage);
  if (faqFromIntent) {
    return buildSmartFaqReply(faqFromIntent, rawText, currentLanguage);
  }

  const aiReply = await getAiReply({
    message:
      currentLanguage === "mk"
        ? `
Ти си web chat асистент за Laki Hotel & Spa.

Одговарај како професионален хотелски рецепционер и sales асистент.
Биди топол, љубезен, природен и краток.

Правила:
- Прво одговори директно на прашањето на гостинот.
- Не измислувај цени, достапност, услуги, типови соби или политики.
- Ако прашањето е за цена или достапност, насочи го гостинот кон барање за понуда.
- Ако нема сигурна информација, кажи дека хотелскиот тим ќе потврди.
- Ако одговорот не е сигурен, упати го гостинот на ${hotelKnowledge.hotel.email} и ${hotelKnowledge.hotel.phone}.
- Одговорот нека биде краток, јасен, природен и корисен.

Прашање од гостин:
${rawText}
        `
        : `
You are the web chat assistant for Laki Hotel & Spa.

Reply like a professional hotel receptionist and sales assistant.
Be warm, polite, natural, and short.

Rules:
- First answer the guest's question directly.
- Never invent prices, availability, services, room types, or policies.
- If the guest asks about price or availability, guide them toward an offer request.
- If information is uncertain, say the hotel team will confirm it.
- If the answer is uncertain, direct the guest to ${hotelKnowledge.hotel.email} and ${hotelKnowledge.hotel.phone}.
- Keep the reply short, clear, natural, and helpful.

Guest question:
${rawText}
        `,
    language: currentLanguage,
    faqContext: hotelKnowledge.faq
      .map((f) => `${f.id}: ${currentLanguage === "mk" ? f.textMk : f.textEn}`)
      .join("\n"),
  });

  if (aiReply) return aiReply;

  return getHumanFallback(currentLanguage);
}

app.get("/", (req, res) => {
  res.status(200).json({
    service: "Laki Web Chat Bot",
    status: "running",
    version: "2.0.0",
    features: ["FAQ", "Inquiry Flow", "Email", "AI Intent", "Language Menu"],
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
