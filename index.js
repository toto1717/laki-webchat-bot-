// ==========================
// IMPORTS
// ==========================
import express from "express";
import axios from "axios";
import dotenv from "dotenv";
import { getFaqReply, hotelKnowledge } from "./knowledge.js";
import { sendInquiryEmail } from "./mailer.js";
import { getAiReply } from "./ai.js";

dotenv.config();

const app = express();
app.use(express.json());

const VERIFY_TOKEN = process.env.VERIFY_TOKEN;
const WHATSAPP_TOKEN = process.env.WHATSAPP_TOKEN;
const PHONE_NUMBER_ID = process.env.PHONE_NUMBER_ID;
const PORT = process.env.PORT || 3000;

const userLanguage = {};
const userInquiryState = {};
const processedMessages = new Map();
const PROCESSED_MESSAGE_TTL_MS = 10 * 60 * 1000;

// ==========================
// DUPLICATE WEBHOOK PROTECTION
// ==========================
function cleanupProcessedMessages() {
  const now = Date.now();
  for (const [messageId, timestamp] of processedMessages.entries()) {
    if (now - timestamp > PROCESSED_MESSAGE_TTL_MS) {
      processedMessages.delete(messageId);
    }
  }
}

function hasProcessedMessage(messageId) {
  cleanupProcessedMessages();
  return processedMessages.has(messageId);
}

function markMessageAsProcessed(messageId) {
  cleanupProcessedMessages();
  processedMessages.set(messageId, Date.now());
}

// ==========================
// COMMANDS
// ==========================
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
  const normalized = normalizeCommand(text);
  return commandList.includes(normalized);
}

// ==========================
// MENUS
// ==========================
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

// ==========================
// FALLBACK
// ==========================
function getHumanFallback(language = "en") {
  if (language === "mk") {
    return (
      "Во моментов немаме точен автоматски одговор.\n" +
      `Контакт: ${hotelKnowledge.hotel.email} / ${hotelKnowledge.hotel.phone}\n\n` +
      getMacedonianMenu()
    );
  }

  return (
    "We do not have an automatic answer right now.\n" +
    `Contact: ${hotelKnowledge.hotel.email} / ${hotelKnowledge.hotel.phone}\n\n` +
    getEnglishMenu()
  );
}

// ==========================
// INQUIRY FLOW HELPERS
// ==========================
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
    ? "Внесете check-in датум (10.04.2026)"
    : "Enter check-in date (10.04.2026)";
}

// ==========================
// SEND WHATSAPP
// ==========================
async function sendWhatsAppMessage(to, body) {
  await axios.post(
    `https://graph.facebook.com/v22.0/${PHONE_NUMBER_ID}/messages`,
    {
      messaging_product: "whatsapp",
      to,
      text: { body },
    },
    {
      headers: {
        Authorization: `Bearer ${WHATSAPP_TOKEN}`,
        "Content-Type": "application/json",
      },
    }
  );
}

// ==========================
// ROOT
// ==========================
app.get("/", (req, res) => {
  res.status(200).send("Laki bot is running");
});

// ==========================
// VERIFY WEBHOOK
// ==========================
app.get("/webhook", (req, res) => {
  const mode = req.query["hub.mode"];
  const token = req.query["hub.verify_token"];
  const challenge = req.query["hub.challenge"];

  if (mode === "subscribe" && token === VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }

  return res.sendStatus(403);
});

// ==========================
// MAIN WHATSAPP BOT
// ==========================
app.post("/webhook", async (req, res) => {
  try {
    const message =
      req.body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];

    if (!message) return res.sendStatus(200);

    const from = message.from;
    const text = message.text?.body?.toLowerCase() || "";

    if (!userLanguage[from]) {
      if (text === "1") {
        userLanguage[from] = "en";
        return sendWhatsAppMessage(from, getEnglishMenu());
      }
      if (text === "2") {
        userLanguage[from] = "mk";
        return sendWhatsAppMessage(from, getMacedonianMenu());
      }
      return sendWhatsAppMessage(from, getLanguageMenu());
    }

    const lang = userLanguage[from];

    const faq = getFaqReply(text, lang);
    if (faq) {
      return sendWhatsAppMessage(from, faq.text);
    }

    if (text.includes("price") || text.includes("понуда")) {
      userInquiryState[from] = { step: "email" };
      return sendWhatsAppMessage(
        from,
        lang === "mk" ? "Внесете email:" : "Enter your email:"
      );
    }

    if (userInquiryState[from]) {
      await sendInquiryEmail({ email: text });
      delete userInquiryState[from];

      return sendWhatsAppMessage(
        from,
        lang === "mk" ? "Понудата е испратена." : "Offer sent."
      );
    }

    const ai = await getAiReply({
      message: text,
      language: lang,
    });

    return sendWhatsAppMessage(from, ai);
  } catch (err) {
    console.log(err);
    return res.sendStatus(500);
  }
});

// ==========================
// 🔥 WEB CHAT (НОВО)
// ==========================
app.post("/chat", async (req, res) => {
  try {
    const { message, userId } = req.body;

    if (!message) {
      return res.json({ reply: "No message provided" });
    }

    const fakeReq = {
      body: {
        entry: [
          {
            changes: [
              {
                value: {
                  messages: [
                    {
                      id: "web_" + Date.now(),
                      from: userId || "web-user",
                      text: { body: message },
                    },
                  ],
                },
              },
            ],
          },
        ],
      },
    };

    let replyText = "";

    const originalSend = sendWhatsAppMessage;

    sendWhatsAppMessage = async (to, body) => {
      replyText = body;
    };

    await app._router.handle(fakeReq, res, () => {});

    sendWhatsAppMessage = originalSend;

    return res.json({ reply: replyText || "No reply" });
  } catch (err) {
    console.error("WEBCHAT ERROR:", err);
    return res.json({ reply: "Error occurred" });
  }
});

// ==========================
// START
// ==========================
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
