const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

const PHONE = '+20 101 818 6653';
const PRODUCTS = { physical: 'Physical journal', digital: 'Digital edition' };
const PRODUCTS_AR = { physical: 'الدفتر الورقي', digital: 'النسخة الرقمية' };

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);

const FONT = "-apple-system,BlinkMacSystemFont,'Segoe UI',Arial,sans-serif";

function confirmationEmail(lang, firstName, product) {
  const ar = lang === 'ar';
  const dir = ar ? 'rtl' : 'ltr';
  const hello = ar ? `أهلًا ${firstName}،` : `Hi ${firstName},`;
  const title = ar ? 'وصلنا طلبك.' : 'We got your pre-order.';
  const body = ar
    ? `شكرًا لك. طلبك: ${PRODUCTS_AR[product]}. سنتصل بك قريبًا لتأكيد الطلب وطريقة الدفع. لا يتم أي دفع قبل ذلك.`
    : `Thank you. Your pre-order: ${PRODUCTS[product]}. We will call you soon to confirm your order and how to pay. Nothing is charged before then.`;
  const note = ar
    ? `للاستفسار اتصل على ${PHONE}. وإن لم تطلب أنت، تجاهل هذه الرسالة.`
    : `Questions? Call ${PHONE}. If you didn't order, ignore this email.`;
  return {
    subject: ar ? 'وصلنا طلبك المسبق — White Mirror' : 'We got your White Mirror pre-order',
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
      <tr><td align="center" style="padding:30px 48px 40px 48px;">
        <p style="margin:0;font-family:${FONT};font-size:13px;line-height:1.7;color:#86868b;">${note}</p>
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

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, phone, product, address, city, governorate, lang, company } = req.body || {};

  // Honeypot, same as the waitlist form.
  if (company) return res.status(200).json({ success: true });

  if (!name || !email || !phone) {
    return res.status(400).json({ error: 'Name, email and phone are required' });
  }
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim())) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  const cleanProduct = PRODUCTS[product] ? product : 'physical';
  if (cleanProduct === 'physical' && !(address && city && governorate)) {
    return res.status(400).json({ error: 'Delivery address is required for the physical journal' });
  }

  const cleanEmail = String(email).trim().toLowerCase().slice(0, 320);
  const cleanLang = lang === 'ar' ? 'ar' : 'en';
  const row = (label, value) => value
    ? `<tr><td style="padding:12px 0;border-bottom:1px solid #e8e6e1;font-size:13px;color:#86868b;width:110px;">${label}</td><td style="padding:12px 0;border-bottom:1px solid #e8e6e1;font-size:14px;">${escapeHtml(value).slice(0, 300)}</td></tr>`
    : '';

  try {
    const { error } = await resend.emails.send({
      from: 'White Mirror <noreply@whitemirrorlabs.com>',
      to: ['hello@whitemirrorlabs.com'],
      reply_to: cleanEmail,
      subject: `New Pre-order — ${String(name).replace(/[\r\n]+/g, ' ').slice(0, 100)} — ${PRODUCTS[cleanProduct]}`,
      html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#0a0a0a;">
          <h2 style="font-size:18px;font-weight:600;margin-bottom:24px;">New Pre-order Request</h2>
          <table style="width:100%;border-collapse:collapse;">
            ${row('Edition', PRODUCTS[cleanProduct])}
            ${row('Name', String(name))}
            ${row('Email', cleanEmail)}
            ${row('Phone', String(phone).slice(0, 40))}
            ${row('Address', cleanProduct === 'digital' ? '' : String(address))}
            ${row('City', cleanProduct === 'digital' ? '' : String(city))}
            ${row('Governorate', cleanProduct === 'digital' ? '' : String(governorate))}
            ${row('Language', cleanLang)}
          </table>
          <p style="margin-top:24px;font-size:12px;color:#aeaeb2;">Call the customer to confirm the order and payment.</p>
        </div>`,
    });
    if (error) {
      console.error('Preorder team email error:', error);
      return res.status(500).json({ error: 'Server error' });
    }
  } catch (err) {
    console.error('Preorder team email error:', err && err.message);
    return res.status(500).json({ error: 'Server error' });
  }

  // Customer confirmation: a failure is logged, never surfaced; the team already has the order.
  try {
    const firstName = escapeHtml(String(name).trim().split(/\s+/)[0]).slice(0, 60);
    const mail = confirmationEmail(cleanLang, firstName, cleanProduct);
    const { error } = await resend.emails.send({
      from: 'White Mirror <noreply@whitemirrorlabs.com>',
      to: [cleanEmail],
      reply_to: 'hello@whitemirrorlabs.com',
      subject: mail.subject,
      html: mail.html,
    });
    if (error) console.error('Preorder confirm error:', error);
  } catch (err) {
    console.error('Preorder confirm error:', err && err.message);
  }

  return res.status(200).json({ success: true });
};
