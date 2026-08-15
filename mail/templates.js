// Plain, table-free HTML with inline styles. Mail clients strip <style> blocks,
// ignore flexbox, and Gmail clips anything past ~102 KB, so the markup here is
// deliberately dull.
//
// The palette matches the site: the deep green band, near-black text, and the
// code set large enough to read off a phone without zooming.
const BAND = "#254c93";
const INK = "#1a2032";
const MUTED = "#5a6274";

const layout = (title, body) => `
<div style="margin:0;padding:0;background:#f0f0f0;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:520px;margin:0 auto;padding:24px 16px;">
    <div style="background:${BAND};border-radius:6px 6px 0 0;padding:18px 24px;">
      <span style="color:#ffffff;font-size:22px;font-weight:700;letter-spacing:-0.02em;">Plaza</span>
    </div>
    <div style="background:#ffffff;border-radius:0 0 6px 6px;padding:28px 24px;">
      <h1 style="margin:0 0 12px;font-size:18px;line-height:1.4;color:${INK};font-weight:600;">${title}</h1>
      ${body}
    </div>
    <p style="margin:16px 0 0;font-size:12px;line-height:1.6;color:${MUTED};text-align:center;">
      You are receiving this because someone used this address on Plaza.
    </p>
  </div>
</div>`;

const codeBlock = (code) => `
  <div style="margin:20px 0;padding:16px;background:#f0f0f0;border-radius:6px;text-align:center;">
    <span style="font-family:ui-monospace,'SFMono-Regular',Menlo,Consolas,monospace;font-size:30px;letter-spacing:8px;color:${INK};font-weight:600;">${code}</span>
  </div>`;

const paragraph = (text) =>
  `<p style="margin:0 0 12px;font-size:14px;line-height:1.6;color:${INK};">${text}</p>`;

const note = (text) =>
  `<p style="margin:12px 0 0;font-size:13px;line-height:1.6;color:${MUTED};">${text}</p>`;

/**
 * Anything a person typed, on its way into a mail.
 *
 * Mail clients render HTML, so a question containing a link arrives as a link
 * in the seller's inbox, in a message sent from Plaza's own address and
 * carrying Plaza's name — which is a phishing mail we posted ourselves. Titles,
 * usernames and free text all go through here; only the markup this file
 * writes gets to be markup.
 */
const escape = (text) =>
  String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");

/**
 * Something someone wrote, set apart from what Plaza is saying.
 *
 * Line breaks are kept, because a paragraph typed as three lines and delivered
 * as one is not what was written.
 */
const quoted = (text, label) => `
  <div style="margin:16px 0;padding:14px 16px;background:#eef1f6;border-left:3px solid ${BAND};border-radius:0 6px 6px 0;">
    ${label
      ? `<p style="margin:0 0 6px;font-size:12px;font-weight:600;letter-spacing:0.04em;text-transform:uppercase;color:${MUTED};">${label}</p>`
      : ""}
    <p style="margin:0;font-size:14px;line-height:1.6;color:${INK};">${escape(text).replace(/\n/g, "<br>")}</p>
  </div>`;

// Minutes rather than "soon": a person deciding whether to wait or ask for
// another code needs the actual number.
const verifyEmail = ({ username, code, minutes }) => ({
  subject: `${code} is your Plaza verification code`,
  html: layout("Confirm your email", `
    ${paragraph(`Hi ${username}, enter this code to confirm your email address.`)}
    ${codeBlock(code)}
    ${note(`The code expires in ${minutes} minutes. If you did not create a Plaza account, ignore this message and nothing will happen.`)}
  `),
});

const changeEmail = ({ username, code, minutes }) => ({
  subject: `${code} confirms your new Plaza email`,
  html: layout("Confirm your new email", `
    ${paragraph(`Hi ${username}, enter this code to move your Plaza account to this address.`)}
    ${codeBlock(code)}
    ${note(`The code expires in ${minutes} minutes. Your old address stays active until you enter it.`)}
  `),
});

const resetPassword = ({ username, code, minutes }) => ({
  subject: `${code} is your Plaza password reset code`,
  html: layout("Reset your password", `
    ${paragraph(`Hi ${username}, enter this code to set a new password.`)}
    ${codeBlock(code)}
    ${note(`The code expires in ${minutes} minutes. If you did not ask for this, ignore it — your password has not changed.`)}
  `),
});

// Sent to the address being left behind, which is the only way the owner finds
// out if someone else changed it.
const emailChanged = ({ username, email }) => ({
  subject: "Your Plaza email address was changed",
  html: layout("Your email address was changed", `
    ${paragraph(`Hi ${username}, the email on your Plaza account is now <strong>${email}</strong>.`)}
    ${note("If this was not you, reply to this message straight away — whoever made the change can now receive your password resets.")}
  `),
});

const passwordChanged = ({ username }) => ({
  subject: "Your Plaza password was changed",
  html: layout("Your password was changed", `
    ${paragraph(`Hi ${username}, your Plaza password has just been changed.`)}
    ${note("If this was not you, reply to this message straight away.")}
  `),
});



// ── shop review ──────────────────────────────────────────────────────────────

const shopApproved = ({ username, shop }) => ({
  subject: `${shop} is open on Plaza`,
  html: layout("Your shop was approved", `
    ${paragraph(`Hi ${username}, <strong>${shop}</strong> has been approved and is now listed on Plaza.`)}
    ${paragraph("You can start adding products to it whenever you are ready.")}
  `),
});

// The reason is the message. A refusal that does not say what to fix produces
// an identical resubmission.
const shopRejected = ({ username, shop, note }) => ({
  subject: `${shop} needs a change before it can open`,
  html: layout("Your shop was not approved yet", `
    ${paragraph(`Hi ${username}, we could not approve <strong>${shop}</strong> as it is.`)}
    <div style="margin:16px 0;padding:14px 16px;background:#f0f0f0;border-left:3px solid #bf510c;border-radius:0 6px 6px 0;">
      <p style="margin:0;font-size:14px;line-height:1.6;color:${INK};">${note}</p>
    </div>
    ${paragraph("Make that change and send it back — it goes to the front of the queue.")}
  `),
});

/* ─── orders ──────────────────────────────────────────────────────────────
   Notices, sent by Plaza, about something that happened.

   They carry nobody's details. Not an email, not a phone, not the other
   person's name — the counterparty is "the buyer" or "the seller" and nothing
   more. Mail leaves the building: it sits in an inbox, gets forwarded, gets
   read on a shared screen, and it reaches people who were never asked to agree
   to anything.

   Contact details belong on the site, where the rule about when they may be
   seen is enforced on every request. Here the job is only to say that
   something happened and that there is a page worth opening.

   The recipient's own name is used to greet them. That is theirs.
   ────────────────────────────────────────────────────────────────────────── */

const money = (amount, currency = "COP") => {
  const value = Number(amount);
  if (!Number.isFinite(value)) return "-";

  return new Intl.NumberFormat("es-CO", {
    style: "currency",
    currency,
    maximumFractionDigits: currency === "COP" ? 0 : 2,
  }).format(value);
};

// The listings themselves, so the notice says which order it is about. A title
// and a price are the listing's own public facts, not anybody's details.
const lines = (items, currency) => `
  <div style="margin:16px 0;padding:14px 16px;background:#eef1f6;border-radius:6px;">
    ${items
      .map(
        item => `<p style="margin:0 0 6px;font-size:14px;line-height:1.5;color:${INK};">
          ${item.quantity > 1 ? `${item.quantity} &times; ` : ""}${escape(item.title)}
          <span style="color:${MUTED};">&nbsp;&nbsp;${money(Number(item.unitPrice) * item.quantity, currency)}</span>
        </p>`,
      )
      .join("")}
  </div>`;

/** To the seller, the moment someone orders from them. */
const orderPlaced = ({ seller, items, subtotal, currency }) => ({
  subject: "You have a new order",
  html: layout("Someone ordered from you", `
    ${paragraph(`Hi ${seller}, you have a new order for ${money(subtotal, currency)}.`)}
    ${lines(items, currency)}
    ${paragraph("The stock is already held back for it. Open Your sales on Plaza to accept it or let it go.")}
    ${note("Nothing is paid through Plaza. You settle it with the buyer on handover.")}
  `),
});

/** To the buyer, so their own order is written down somewhere they keep. */
const orderReceipt = ({ buyer, items, total, currency }) => ({
  subject: "Your order is in",
  html: layout("You placed an order", `
    ${paragraph(`Hi ${buyer}, your order for ${money(total, currency)} has been sent.`)}
    ${lines(items, currency)}
    ${paragraph("Each seller has been asked to accept their part. You will hear from us when they answer.")}
    ${note("You can cancel any part of it until the seller accepts. After that, only they can.")}
  `),
});

/** To the buyer: it was accepted. Where to go, not who to call. */
const orderConfirmed = ({ buyer, items, subtotal, currency }) => ({
  subject: "Your order was accepted",
  html: layout("The seller accepted your order", `
    ${paragraph(`Hi ${buyer}, the seller accepted your order for ${money(subtotal, currency)}.`)}
    ${lines(items, currency)}
    ${paragraph("Open Your purchases on Plaza to see how to reach them and agree the handover.")}
    ${note("From here, only the seller can cancel this order.")}
  `),
});

/** To the buyer: the seller says it is handed over. */
const orderDelivered = ({ buyer, items, subtotal, currency }) => ({
  subject: "Your order was marked as delivered",
  html: layout("Marked as delivered", `
    ${paragraph(`Hi ${buyer}, the seller marked this order as handed over.`)}
    ${lines(items, currency)}
    ${note("If that is not right, reply to this email and tell us.")}
  `),
});

/**
 * To whichever of the two did not do it.
 *
 * The reason is optional, and its absence is said out loud rather than left as
 * a gap: "they did not say why" is information, and an empty space is not.
 */
const orderCancelled = ({ to, byBuyer, items, subtotal, currency, reason }) => ({
  subject: byBuyer ? "An order was cancelled" : "Your order was cancelled",
  html: layout("An order was cancelled", `
    ${paragraph(`Hi ${to}, the ${byBuyer ? "buyer" : "seller"} cancelled this order for ${money(subtotal, currency)}.`)}
    ${lines(items, currency)}
    ${reason ? quoted(reason) : note("They did not say why.")}
    ${paragraph(byBuyer
      ? "Whatever was held back is on sale again."
      : "Nothing is owed. The listing is on sale again if you still want it.")}
  `),
});

/* ─── questions ───────────────────────────────────────────────────────────
   Both sides of a question, and neither of them says who the other is.

   The buyer is anonymous on the listing, so they are anonymous here too:
   telling the seller privately what the page deliberately withholds would
   make the anonymity a decoration. The seller is not named either — they are
   "the seller", the same way they are in the order notices.
   ────────────────────────────────────────────────────────────────────────── */

/** To the seller: somebody wants to know something before they buy. */
const questionAsked = ({ seller, title, question }) => ({
  subject: "You have a new question",
  html: layout("Someone asked about your listing", `
    ${paragraph(`Hi ${escape(seller)}, there is a new question on ${escape(title)}.`)}
    ${quoted(question, "Question")}
    ${paragraph("Open Questions on Plaza to answer it. Your answer goes on the listing, where the next person wondering the same thing will read it without having to ask.")}
    ${note("You will not see who asked. Questions on Plaza are anonymous, and there is one answer per question, so it is worth writing once.")}
  `),
});

/** To whoever asked: it was answered. */
const questionAnswered = ({ buyer, title, question, answer }) => ({
  subject: "Your question was answered",
  html: layout("The seller answered your question", `
    ${paragraph(`Hi ${escape(buyer)}, the seller answered your question about ${escape(title)}.`)}
    ${quoted(question, "You asked")}
    ${quoted(answer, "They answered")}
    ${note("There is one answer per question. If something is still not clear, ask another one on the listing.")}
  `),
});

module.exports = {
  orderPlaced,
  orderReceipt,
  orderConfirmed,
  orderDelivered,
  orderCancelled,
  questionAsked,
  questionAnswered,
  verifyEmail,
  changeEmail,
  resetPassword,
  emailChanged,
  passwordChanged,
  shopApproved,
  shopRejected,
};
