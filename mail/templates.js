// Plain, table-free HTML with inline styles. Mail clients strip <style> blocks,
// ignore flexbox, and Gmail clips anything past ~102 KB, so the markup here is
// deliberately dull.
//
// The palette matches the site: the deep green band, near-black text, and the
// code set large enough to read off a phone without zooming.
const BAND = "#00703c";
const INK = "#1a1a1a";
const MUTED = "#696969";

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

module.exports = {
  verifyEmail,
  changeEmail,
  resetPassword,
  emailChanged,
  passwordChanged,
  shopApproved,
  shopRejected,
};
