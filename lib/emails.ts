import emailCopy from "@/lib/translations/application-emails.json";
import type { ApplicationLocale } from "@/lib/locale";

// Branded transactional email shell, matching the Figma email frames
// (2308:7356 desktop, 2308:7383 mobile): scalloped photo header, cream body,
// a pink→orange gradient CTA pill, and a black footer with the swirl.
//
// Applicant-journey emails are localized; the top-of-funnel ones (waitlist,
// interest, nomination) are English for now.

export type Email = { subject: string; html: string };

type Cta = { label: string; url: string };

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[char]!);
}

// Absolute so it resolves in an email client, not against a relative path.
const SITE = (process.env.APP_URL ?? "https://www.climaterefugeepavilion.org").replace(/\/+$/, "");
const LOGO = `${SITE}/emails/email-logo.png`;
const BANNER = process.env.EMAIL_HEADER_URL ?? `${SITE}/emails/email-banner-desktop.png`;
const SWIRL = `${SITE}/emails/email-footer-swirl.png`;
const SWIRL_MOBILE = `${SITE}/emails/email-footer-swirl-mobile.png`;

const CREAM = "#f4f1ea";
const INK = "#000000";
const MAGENTA = "#EC268F";
const ORANGE = "#FA8D2E";
const FONT = "Outfit, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const SMALL_FONT = "Geist, 'Helvetica Neue', Helvetica, Arial, sans-serif";
// Figma's button fill is a radial gradient anchored near the bottom-right
// (orange) fading out to magenta. Clients that drop radial-gradient keep the
// linear declaration before it; Outlook desktop gets the VML gradient fill.
const LINEAR = `linear-gradient(90deg,${MAGENTA} 0%,${ORANGE} 100%)`;
const RADIAL = `radial-gradient(194px 181px at 93.8% 83.4%,${ORANGE} 0%,#F77346 25%,#F35A5E 50%,#F04077 75%,${MAGENTA} 100%)`;

const pick = <T>(language: ApplicationLocale, en: T, fr: T, es: T): T => language === "fr" ? fr : language === "es" ? es : en;

// Email-client-safe: table layout, inline styles, progressive gradient
// fallbacks (solid bgcolor → linear → radial; VML for Outlook desktop).
// Geometry follows Figma 2308:7356 (600px desktop) and 2308:7383 (320px mobile).
function render(language: ApplicationLocale, bodyParas: string[], cta: Cta | null): string {
  const year = new Date().getUTCFullYear();
  const signoff = pick(
    language,
    "Best regards,<br />The Climate Refugee Pavilion Team",
    "Cordialement,<br />L'équipe du Climate Refugee Pavilion",
    "Un cordial saludo,<br />El equipo del Climate Refugee Pavilion",
  );
  const tagline = pick(language, "Making climate mobility impossible to ignore", "Rendre la mobilité climatique impossible à ignorer", "Hacer que la movilidad climática sea imposible de ignorar");
  const rights = pick(language, "All rights reserved.", "Tous droits réservés.", "Todos los derechos reservados.");

  // Figma separates paragraphs with an empty 14px/1.2 line (16.8px).
  const paras = [...bodyParas, signoff]
    .map(
      (p, i, all) =>
        `<p style="margin:0 0 ${i === all.length - 1 ? 0 : 17}px;font-family:${FONT};font-size:14px;font-weight:400;line-height:1.2;letter-spacing:-0.56px;color:${INK}">${p}</p>`,
    )
    .join("");

  const button = cta
    ? `<table role="presentation" class="btn" align="center" width="240" cellpadding="0" cellspacing="0" border="0" style="width:240px;margin:48px auto 0;border-collapse:separate">
         <tr><td class="btn-cell" align="center" height="45" bgcolor="${MAGENTA}" style="height:45px;border-radius:500px;background-color:${MAGENTA};background-image:${LINEAR};background-image:${RADIAL};mso-padding-alt:0">
           <!--[if mso]>
           <v:roundrect xmlns:v="urn:schemas-microsoft-com:vml" xmlns:w="urn:schemas-microsoft-com:office:word" href="${cta.url}" style="height:45px;v-text-anchor:middle;width:240px;" arcsize="50%" stroked="f" fillcolor="${MAGENTA}">
             <v:fill type="gradient" color="${MAGENTA}" color2="${ORANGE}" angle="90" />
             <w:anchorlock/>
             <center style="color:#ffffff;font-family:Arial,sans-serif;font-size:14px;font-weight:bold;letter-spacing:0.56px;text-transform:uppercase;">${cta.label}</center>
           </v:roundrect>
           <![endif]-->
           <!--[if !mso]><!-- -->
           <a class="btn-link" href="${cta.url}" style="display:block;box-sizing:border-box;width:240px;padding:16px 28px;border-radius:500px;color:#ffffff;text-decoration:none;text-align:center;font-family:${FONT};font-size:14px;font-weight:600;line-height:13px;mso-line-height-rule:exactly;letter-spacing:0.56px;text-transform:uppercase">${cta.label}</a>
           <!--<![endif]-->
         </td></tr>
       </table>`
    : "";

  return `<!doctype html>
<html lang="${language}" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:o="urn:schemas-microsoft-com:office:office"><head><meta charset="utf-8" /><meta name="viewport" content="width=device-width,initial-scale=1" /><meta name="color-scheme" content="light only" /><meta name="supported-color-schemes" content="light" />
<!--[if mso]><noscript><xml><o:OfficeDocumentSettings><o:PixelsPerInch>96</o:PixelsPerInch></o:OfficeDocumentSettings></xml></noscript><![endif]-->
<link href="https://fonts.googleapis.com/css2?family=Outfit:wght@400;600&amp;family=Geist:wght@400&amp;display=swap" rel="stylesheet" />
<style>
  body{margin:0!important;padding:0!important;-webkit-text-size-adjust:100%;-ms-text-size-adjust:100%}
  @media only screen and (max-width:480px){
    .shell{width:100%!important;max-width:320px!important}
    .header-pad{padding:44px 16px!important;text-align:center!important;background-position:-200px 0!important}
    .logo{margin:0 auto!important}
    .body-pad{padding:32px!important}
    .btn{width:100%!important;margin-top:32px!important}
    .btn-link{width:100%!important}
    .footer{background-image:url('${SWIRL_MOBILE}')!important;padding-top:46px!important}
    .tagline{line-height:1.2!important;max-width:207px!important}
    .copy{margin-top:20px!important}
  }
</style></head>
<body style="margin:0;padding:0;background:${CREAM}">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" border="0" bgcolor="${CREAM}" style="border-collapse:collapse;background:${CREAM}">
    <tr><td align="center" style="padding:0">
      <!--[if mso]><table role="presentation" width="600" cellpadding="0" cellspacing="0" border="0"><tr><td><![endif]-->
      <table role="presentation" class="shell" width="600" cellpadding="0" cellspacing="0" border="0" style="width:600px;max-width:600px;border-collapse:collapse">
        <tr><td class="header-pad" height="120" valign="middle" background="${BANNER}" bgcolor="${CREAM}" style="height:120px;box-sizing:border-box;padding:44px 80px 45px 76px;background-color:${CREAM};background-image:url('${BANNER}');background-repeat:no-repeat;background-position:-60px 0;background-size:720px 120px">
          <!--[if gte mso 9]><v:rect xmlns:v="urn:schemas-microsoft-com:vml" fill="true" stroke="false" style="width:600px;height:120px;"><v:fill type="frame" src="${BANNER}" color="${CREAM}" /><v:textbox inset="76px,44px,0,0"><![endif]-->
          <a href="${SITE}" style="text-decoration:none;display:inline-block">
            <img class="logo" src="${LOGO}" alt="Climate Refugee Pavilion" width="88" height="31" style="display:block;width:88px;height:31px;border:0;outline:none" />
          </a>
          <!--[if gte mso 9]></v:textbox></v:rect><![endif]-->
        </td></tr>
        <tr><td class="body-pad" bgcolor="${CREAM}" style="background:${CREAM};padding:64px">
          ${paras}
          ${button}
        </td></tr>
        <tr><td class="footer" background="${SWIRL}" bgcolor="#000000" height="120" valign="top" align="center" style="height:120px;box-sizing:border-box;background-color:#000000;background-image:url('${SWIRL}');background-repeat:no-repeat;background-position:right top;background-size:auto 120px;border-radius:32px 32px 0 0;padding:55px 16px 0;text-align:center">
          <p class="tagline" style="margin:0 auto;font-family:${FONT};font-size:12px;font-weight:600;line-height:0.9;letter-spacing:0.48px;text-transform:uppercase;color:#ffffff;color:rgba(255,255,255,0.48)">${tagline}</p>
          <p class="copy" style="margin:29px 0 0;font-family:${SMALL_FONT};font-size:8px;line-height:10px;color:#ffffff">© ${year} Climate Refugee Pavilion. ${rights}</p>
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body></html>`;
}

export function waitlistEmail(): Email {
  return {
    subject: "You're on the list",
    html: render(
      "en",
      ["Dear friend,", "Thanks for signing up. We'll email you with updates about the Climate Refugee Pavilion."],
      null,
    ),
  };
}

export function interestEmail(): Email {
  return {
    subject: "Thanks for your interest",
    html: render(
      "en",
      ["Dear friend,", "Thanks for expressing interest in the programme. We'll be in touch as opportunities open up for your group."],
      null,
    ),
  };
}

export function nominationEmail(nomineeName: string): Email {
  return {
    subject: "Thanks for your nomination",
    html: render(
      "en",
      ["Dear friend,", `Thanks for nominating ${escapeHtml(nomineeName)}. We'll reach out to them with the next steps.`],
      null,
    ),
  };
}

export function applicationEmail(name: string, link: string | null, language: ApplicationLocale): Email {
  const copy = emailCopy[language];
  return { subject: copy.applicationSubject, html: render(language, [copy.greeting.replace("{name}", escapeHtml(name)), link ? copy.confirm : copy.waiting], link ? { label: copy.confirmButton, url: link } : null) };
}
export function resumeEmail(name: string, link: string, language: ApplicationLocale): Email {
  const copy = emailCopy[language];
  return { subject: copy.resumeSubject, html: render(language, [copy.greeting.replace("{name}", escapeHtml(name)), copy.resume], { label: copy.continue, url: link }) };
}
export function identityEmail(name: string, link: string, language: ApplicationLocale): Email {
  const copy = emailCopy[language];
  return { subject: copy.identitySubject, html: render(language, [copy.greeting.replace("{name}", escapeHtml(name)), copy.identity], { label: copy.identityButton, url: link }) };
}
export function receivedEmail(name: string, language: ApplicationLocale): Email {
  const copy = emailCopy[language];
  return { subject: copy.receivedSubject, html: render(language, [copy.greeting.replace("{name}", escapeHtml(name)), copy.received], null) };
}
export function identityRetryEmail(name: string, link: string, language: ApplicationLocale): Email {
  const copy = emailCopy[language];
  return { subject: copy.retrySubject, html: render(language, [copy.greeting.replace("{name}", escapeHtml(name)), copy.retry], { label: copy.identityButton, url: link }) };
}
export function decisionEmail(
  status: "rejected" | "online_offered" | "accepted" | "interview_yes",
  link: string | null,
  language: ApplicationLocale,
): Email {
  const copy = emailCopy[language];
  if (status === "rejected") return { subject: copy.rejectedSubject, html: render(language, [copy.applicant, copy.rejected], null) };
  if (status === "online_offered") return { subject: copy.onlineSubject, html: render(language, [copy.applicant, copy.online], link ? { label: copy.onlineButton, url: link } : null) };
  if (status === "accepted") return { subject: copy.interviewSubject, html: render(language, [copy.congratulations, copy.interview], link ? { label: copy.interviewButton, url: link } : null) };
  return { subject: copy.selectedSubject, html: render(language, [copy.congratulations, copy.selected], null) };
}

export function captureConfirmationEmail(link: string, kind: "waitlist" | "interest"): Email {
  return { subject: "Confirm your email request", html: render("en", [
    kind === "waitlist" ? "Confirm that you want to subscribe to Pavilion updates." : "Confirm that you want to save the interests you submitted to Pavilion.",
    "The link expires in 30 minutes. If you did not request this change, ignore this email; your existing preferences will stay unchanged.",
  ], { label: "Confirm request", url: link }) };
}
