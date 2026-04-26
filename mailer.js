import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

function getLanguageLabel(language = "unknown") {
  if (language === "mk") return "Macedonian";
  if (language === "en") return "English";
  if (language === "sr") return "Serbian";
  if (language === "sq") return "Albanian";
  return "Unknown";
}

function normalizeSpecialRequest(value = "") {
  const t = String(value || "").trim().toLowerCase();

  if (
    !t ||
    t === "none" ||
    t === "no" ||
    t === "нема" ||
    t === "nema" ||
    t === "nuk ka" ||
    t === "jo" ||
    t === "ska"
  ) {
    return "None";
  }

  return String(value).trim();
}

function buildEnglishSummary(inquiry) {
  const {
    fromWhatsApp,
    fromWebchat,
    language,
    checkin,
    checkout,
    adults,
    children,
    childrenAges,
    name,
    email,
    specialRequest,
  } = inquiry;

  const source = fromWhatsApp ? "WhatsApp" : "Web Chat";
  const languageLabel = getLanguageLabel(language);
  const cleanSpecialRequest = normalizeSpecialRequest(specialRequest);

  return (
    `NEW WEB CHAT INQUIRY - Laki Hotel & Spa\n\n` +
    `ENGLISH SUMMARY\n` +
    `Source: ${source}\n` +
    `Web user: ${fromWebchat || "N/A"}\n` +
    `Guest language: ${languageLabel}\n\n` +
    `Guest details:\n` +
    `Name: ${name || "Not provided"}\n` +
    `Guest email: ${email || "Not provided"}\n` +
    `WhatsApp: ${fromWhatsApp || "N/A"}\n\n` +
    `Stay details:\n` +
    `Check-in: ${checkin || "Not provided"}\n` +
    `Check-out: ${checkout || "Not provided"}\n` +
    `Adults: ${adults || "Not provided"}\n` +
    `Children: ${children || "0"}\n` +
    `Children ages: ${childrenAges || "Not provided"}\n\n` +
    `Additional request:\n` +
    `${cleanSpecialRequest}\n`
  );
}

function buildOriginalLanguageSection(inquiry) {
  const { language, specialRequest } = inquiry;

  const languageLabel = getLanguageLabel(language);
  const originalSpecialRequest =
    specialRequest && String(specialRequest).trim()
      ? String(specialRequest).trim()
      : "None / No additional request";

  return (
    `\n----------------------------------------\n\n` +
    `ORIGINAL GUEST LANGUAGE\n` +
    `Language: ${languageLabel}\n\n` +
    `Original additional request:\n` +
    `${originalSpecialRequest}\n`
  );
}

export async function sendInquiryEmail(inquiry) {
  const { fromWhatsApp, name, email, replyTo } = inquiry;

  const toEmail = process.env.MAIL_TO || "contact@lakihotelspa.com";

  const text =
    buildEnglishSummary(inquiry) +
    buildOriginalLanguageSection(inquiry) +
    `\n----------------------------------------\n\n` +
    `Reply-To guest email:\n` +
    `${replyTo || email || "Not provided"}\n`;

  const subjectSource = fromWhatsApp ? "WhatsApp" : "Web Chat";
  const subjectName = name || "Guest";

  const response = await resend.emails.send({
    from: "Laki Hotel <onboarding@resend.dev>",
    to: [toEmail],
    reply_to: replyTo || email,
    subject: `New ${subjectSource} inquiry - ${subjectName}`,
    text,
  });

  if (response?.error) {
    console.error("RESEND EMAIL ERROR:", response.error);
    throw new Error(response.error.message || "Resend email error");
  }

  console.log("EMAIL SENT:", response?.data?.id || response);

  return response;
}
