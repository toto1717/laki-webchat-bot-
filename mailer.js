import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendInquiryEmail(inquiry) {
  const {
    fromWhatsApp,
    fromWebchat,
    checkin,
    checkout,
    adults,
    children,
    childrenAges,
    name,
    email,
    specialRequest,
    replyTo,
  } = inquiry;

  const toEmail = process.env.MAIL_TO || "contact@lakihotelspa.com";

  const text =
    `New inquiry from Laki Hotel Bot\n\n` +
    `Source: ${fromWhatsApp ? "WhatsApp" : "Web Chat"}\n` +
    `Web user: ${fromWebchat || "N/A"}\n\n` +
    `Guest details:\n` +
    `Name: ${name || "Not provided"}\n` +
    `Email: ${email || "Not provided"}\n` +
    `WhatsApp: ${fromWhatsApp || "N/A"}\n\n` +
    `Stay details:\n` +
    `Check-in: ${checkin || "Not provided"}\n` +
    `Check-out: ${checkout || "Not provided"}\n` +
    `Adults: ${adults || "Not provided"}\n` +
    `Children: ${children || "0"}\n` +
    `Children ages: ${childrenAges || "Not provided"}\n\n` +
    `Special request:\n${specialRequest || "None"}\n`;

  const response = await resend.emails.send({
    from: "Laki Hotel <onboarding@resend.dev>",
    to: [toEmail],
    reply_to: replyTo || email,
    subject: `New inquiry - ${name || "Web Chat Guest"}`,
    text,
  });

  if (response?.error) {
    console.error("❌ RESEND EMAIL ERROR:", response.error);
    throw new Error(response.error.message || "Resend email error");
  }

  console.log("✅ EMAIL SENT:", response?.data?.id || response);

  return response;
}
