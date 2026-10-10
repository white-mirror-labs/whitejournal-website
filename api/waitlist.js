const { Resend } = require('resend');
const { supabaseAdmin } = require('./_supabase');

const resend = new Resend(process.env.RESEND_API_KEY);

// Everything below is typed by an anonymous visitor and lands in an HTML email,
// so it is escaped before interpolation; otherwise a "name" can carry markup or
// links into the inbox.
const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";

// Same restraint as docs/email-templates: table layout, inline styles, no web
// fonts. Sent once per address, on the first signup only.
function confirmationEmail(lang, firstName) {
  const ar = lang === 'ar';
  const dir = ar ? 'rtl' : 'ltr';
  const hello = ar ? `أهلًا ${firstName}،` : `Hi ${firstName},`;
  const title = ar ? 'أنت على قائمة الانتظار.' : "You're on the list.";
  const body = ar
    ? 'شكرًا لانضمامك. سنراسلك أولًا حين يفتح White Mirror Journal وتطبيقه المرافق، مع تفاصيل السعر والتوصيل.'
    : "Thank you for joining. You'll hear from us first when White Mirror Journal and its companion app open, with price and delivery details.";
  const note = ar
    ? 'لا رسائل مزعجة. وإن لم تسجّل أنت، تجاهل هذه الرسالة.'
    : "No spam. If you didn't sign up, ignore this email.";
  const link = ar ? 'https://www.whitemirrorlabs.com/ar' : 'https://www.whitemirrorlabs.com/';
  const cta = ar ? 'زر الموقع' : 'Visit the site';
  return {
    subject: ar ? 'أنت على قائمة انتظار White Mirror' : "You're on the White Mirror waitlist",
    html: `
<table role="presentation" cellpadding="0" cellspacing="0" border="0" width="100%" style="background:#fafaf8;margin:0;padding:40px 0;" dir="${dir}">
  <tr><td align="center">
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:92%;background:#ffffff;border:1px solid #e8e6e1;border-radius:14px;">
      <tr><td align="center" style="padding:40px 40px 0 40px;">
        <span style="font-family:${FONT};font-size:12px;letter-spacing:5px;color:#0a0a0a;font-weight:600;" dir="ltr">WHITE MIRROR LABS</span>
      </td></tr>
      <tr><td align="center" style="padding:36px 40px 0 40px;">
        <h1 style="margin:0;font-family:Georgia,'Times New Roman',serif;font-size:28px;line-height:1.3;font-weight:400;color:#0a0a0a;">${title}</h1>
      </td></tr>
      <tr><td align="center" style="padding:16px 48px 0 48px;">
        <p style="margin:0 0 10px 0;font-family:${FONT};font-size:15px;line-height:1.7;color:#0a0a0a;">${hello}</p>
        <p style="margin:0;font-family:${FONT};font-size:15px;line-height:1.7;color:#515154;">${body}</p>
      </td></tr>
      <tr><td align="center" style="padding:30px 40px 0 40px;">
        <a href="${link}" style="display:inline-block;background:#0a0a0a;color:#ffffff;font-family:${FONT};font-size:15px;font-weight:500;text-decoration:none;padding:14px 32px;border-radius:999px;">${cta}</a>
      </td></tr>
      <tr><td style="padding:36px 40px 0 40px;"><div style="border-top:1px solid #e8e6e1;"></div></td></tr>
      <tr><td align="center" style="padding:24px 48px 40px 48px;">
        <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.7;color:#86868b;">${note}</p>
      </td></tr>
    </table>
    <table role="presentation" cellpadding="0" cellspacing="0" border="0" width="600" style="width:600px;max-width:92%;">
      <tr><td align="center" style="padding:24px 40px 0 40px;">
        <p style="margin:0;font-family:Georgia,'Times New Roman',serif;font-style:italic;font-size:14px;color:#86868b;" dir="ltr">Technology for a more human life.</p>
      </td></tr>
    </table>
  </td></tr>
</table>`,
  };
}

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, phone, lang, source, company } = req.body || {};

  // Honeypot: the form carries a visually hidden "company" field that people
  // never see. Bots fill every field; answer them as if it worked.
  if (company) {
    return res.status(200).json({ success: true });
  }

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(String(email).trim())) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  const cleanEmail = String(email).trim().toLowerCase().slice(0, 320);
  const cleanLang = lang === 'ar' ? 'ar' : 'en';
  const safeName = escapeHtml(name).slice(0, 200);
  const safeEmail = escapeHtml(cleanEmail);
  const safePhone = phone ? escapeHtml(phone).slice(0, 40) : '';
  const safeSource = source ? escapeHtml(source).slice(0, 100) : '';

  // 1. The database is the record. If it is unreachable the team email below
  //    still carries the signup, so nobody is lost; only if both fail does the
  //    visitor see an error.
  let stored = false;
  let isNew = true;
  const sb = supabaseAdmin();
  if (sb) {
    const { data, error } = await sb.rpc('waitlist_join', {
      p_name: String(name).trim().slice(0, 200),
      p_email: cleanEmail,
      p_phone: phone ? String(phone).trim().slice(0, 40) : null,
      p_lang: cleanLang,
      p_source: source ? String(source).slice(0, 100) : null,
    });
    if (error) {
      console.error('Waitlist store error:', error.message);
    } else {
      stored = true;
      isNew = !!(data && data.new);
    }
  } else {
    console.error('Waitlist store skipped: Supabase env missing');
  }

  // 2. Tell the team (new signups only, unless the database is down and this
  //    email is the only copy).
  let notified = false;
  if (isNew || !stored) {
    try {
      const { error } = await resend.emails.send({
        from: 'White Mirror <noreply@whitemirrorlabs.com>',
        to: ['hello@whitemirrorlabs.com'],
        reply_to: cleanEmail,
        subject: `New Waitlist Submission — ${String(name).replace(/[\r\n]+/g, ' ').slice(0, 100)}${stored ? '' : ' (NOT STORED)'}`,
        html: `
          <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; color: #0a0a0a;">
            <h2 style="font-size: 18px; font-weight: 600; margin-bottom: 24px;">New Waitlist Submission</h2>
            <table style="width: 100%; border-collapse: collapse;">
              <tr><td style="padding: 12px 0; border-bottom: 1px solid #e8e6e1; font-size: 13px; color: #86868b; width: 100px;">Name</td><td style="padding: 12px 0; border-bottom: 1px solid #e8e6e1; font-size: 14px;">${safeName}</td></tr>
              <tr><td style="padding: 12px 0; border-bottom: 1px solid #e8e6e1; font-size: 13px; color: #86868b;">Email</td><td style="padding: 12px 0; border-bottom: 1px solid #e8e6e1; font-size: 14px;"><a href="mailto:${safeEmail}" style="color: #0a0a0a;">${safeEmail}</a></td></tr>
              ${safePhone ? `<tr><td style="padding: 12px 0; border-bottom: 1px solid #e8e6e1; font-size: 13px; color: #86868b;">Phone</td><td style="padding: 12px 0; border-bottom: 1px solid #e8e6e1; font-size: 14px;">${safePhone}</td></tr>` : ''}
              <tr><td style="padding: 12px 0; border-bottom: 1px solid #e8e6e1; font-size: 13px; color: #86868b;">Language</td><td style="padding: 12px 0; border-bottom: 1px solid #e8e6e1; font-size: 14px;">${cleanLang}</td></tr>
              ${safeSource ? `<tr><td style="padding: 12px 0; border-bottom: 1px solid #e8e6e1; font-size: 13px; color: #86868b;">Page</td><td style="padding: 12px 0; border-bottom: 1px solid #e8e6e1; font-size: 14px;">${safeSource}</td></tr>` : ''}
            </table>
            <p style="margin-top: 24px; font-size: 12px; color: #aeaeb2;">${stored ? 'Saved to the waitlist. See it at admin.whitemirrorlabs.com.' : 'The database write failed: this email is the only copy.'}</p>
          </div>
        `,
      });
      if (error) console.error('Resend team error:', error);
      else notified = true;
    } catch (err) {
      console.error('Resend team error:', err && err.message);
    }
  }

  if (!stored && !notified) {
    return res.status(500).json({ error: 'Server error' });
  }

  // 3. Confirm to the person, once. A failure here is logged, never surfaced:
  //    they are on the list either way.
  if (isNew) {
    try {
      const firstName = escapeHtml(String(name).trim().split(/\s+/)[0]).slice(0, 60);
      const mail = confirmationEmail(cleanLang, firstName);
      const { error } = await resend.emails.send({
        from: 'White Mirror <noreply@whitemirrorlabs.com>',
        to: [cleanEmail],
        reply_to: 'hello@whitemirrorlabs.com',
        subject: mail.subject,
        html: mail.html,
      });
      if (error) console.error('Resend confirm error:', error);
    } catch (err) {
      console.error('Resend confirm error:', err && err.message);
    }
  }

  return res.status(200).json({ success: true });
};
