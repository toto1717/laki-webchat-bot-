import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendInquiryEmail(inquiry) {
  try {
    const {
      fromWhatsApp,
      checkin,
      checkout,
      adults,
      children,
      childrenAges,
      name,
      email,
      specialRequest,
    } = inquiry;

    const text =
      `New inquiry from Laki Bot\n\n` +
      `Source: ${fromWhatsApp ? "WhatsApp" : "Web Chat"}\n\n` +
      `Contact:\n` +
      `WhatsApp: ${fromWhatsApp || "N/A"}\n` +
      `Email: ${email}\n` +
      `Name: ${name}\n\n` +
      `Stay details:\n` +
      `Check-in: ${checkin}\n` +
      `Check-out: ${checkout}\n` +
      `Adults: ${adults}\n` +
      `Children: ${children}\n` +
      `Children ages: ${childrenAges || "Not provided"}\n\n` +
      `Special request:\n${specialRequest || "None"}\n`;

    const response = await resend.emails.send({
      from: "Laki Hotel <onboarding@resend.dev>",
      to: [process.env.MAIL_TO],
      reply_to: email,
      subject: `New inquiry - ${name}`,
      text,
    });

    console.log("✅ EMAIL SENT:", response?.id || response);

    return response;
  } catch (err) {
    console.error("❌ EMAIL ERROR:", err?.message || err);
    return null;
  }
}
