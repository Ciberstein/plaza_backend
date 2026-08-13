const { Resend } = require("resend");

// Built on first use, not at import. The constructor throws when the key is
// absent, so creating it at module scope takes the whole server down on boot
// rather than failing the one request that needed to send something — which is
// what happens on a fresh deploy before the key is set.
let client = null;

const getClient = () => {
  if (!client) client = new Resend(process.env.RESEND_API_KEY);
  return client;
};

const FROM_NAME = process.env.MAIL_FROM_NAME || "Plaza";

/**
 * Sends one message and reports whether it actually left.
 *
 * Resend answers API failures in the `{ error }` field rather than by throwing,
 * so a bare try/catch reports success on a rejected send. Awaiting the call and
 * checking that field is the difference between a mail system that works and
 * one that silently drops everything.
 */
const mail = async (to, subject, html, options = {}) => {
  if (!process.env.RESEND_API_KEY) {
    console.error("MAIL: RESEND_API_KEY is not set, nothing was sent");
    return false;
  }

  if (!process.env.MAIL_SEND_ADDR) {
    console.error("MAIL: MAIL_SEND_ADDR is not set, nothing was sent");
    return false;
  }

  try {
    // The sending address is a send-only subdomain with no mailbox behind it,
    // so without a reply-to a reply goes nowhere.
    const replyTo = "replyTo" in options ? options.replyTo : process.env.MAIL_REPLY_TO;

    const { data, error } = await getClient().emails.send({
      from: `"${options.senderName || FROM_NAME}" <${process.env.MAIL_SEND_ADDR}>`,
      to,
      subject,
      html,
      // Omitted rather than sent empty: Resend rejects a blank address.
      ...(replyTo ? { replyTo } : {}),
    });

    if (error) {
      console.error("MAIL: send rejected:", error.message || error);
      return false;
    }

    return Boolean(data?.id);
  } catch (err) {
    console.error("MAIL: send failed:", err.message);
    return false;
  }
};

const configured = () =>
  Boolean(process.env.RESEND_API_KEY && process.env.MAIL_SEND_ADDR);

module.exports = { mail, configured };
