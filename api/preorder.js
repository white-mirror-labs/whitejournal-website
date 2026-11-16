const { randomUUID } = require('crypto');
const { Resend } = require('resend');
const { supabaseAdmin, reportIssue } = require('./_supabase');

const PHONE = '+20 101 818 6653';
// Prices in EGP, set server-side so a tampered client cannot choose its own.
const PRICES = { physical: 499, digital: 249 };
const PRODUCTS = { physical: 'Physical journal', digital: 'Digital edition' };
const PRODUCTS_AR = { physical: 'الدفتر الورقي', digital: 'النسخة الرقمية' };

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const escapeHtml = (value) =>
  String(value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[c]);

// Trimmed, single-line, length-capped text from an anonymous visitor.
const clean = (value, max) =>
  String(value ?? '').replace(/[\r\n\t]+/g, ' ').trim().slice(0, max);

// 8 to 15 digits, optional leading +; spaces, dashes and brackets ignored.
const phoneOk = (value) => /^\+?\d{8,15}$/.test(String(value).replace(/[\s\-()]/g, ''));

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
  // Same-origin form only: no CORS headers, so other sites cannot drive this
  // endpoint from a visitor's browser.
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const body = req.body && typeof req.body === 'object' ? req.body : {};

  // Honeypot: a visually hidden "company" field people never see. Bots fill
  // every field; answer them as if it worked.
  if (body.company) return res.status(200).json({ success: true });

  const name = clean(body.name, 200);
  const email = clean(body.email, 320).toLowerCase();
  const phone = clean(body.phone, 40);
  const product = PRODUCTS[body.product] ? body.product : 'physical';
  const lang = body.lang === 'ar' ? 'ar' : 'en';
  const address = clean(body.address, 300);
  const city = clean(body.city, 100);
  const governorate = clean(body.governorate, 100);

  if (!name || !email || !phone) {
    return res.status(400).json({ error: 'Name, email and phone are required' });
  }
  if (!EMAIL_RE.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }
  if (!phoneOk(phone)) {
    return res.status(400).json({ error: 'Invalid phone number' });
  }
  if (product === 'physical' && !(address && city && governorate)) {
    return res.status(400).json({ error: 'Delivery address is required for the physical journal' });
  }

  // The browser sends one id per filled-in form and reuses it on retry. It
  // becomes the order token, so a double submit or a retry after a timeout
  // finds the first order instead of creating a second one.
  const requestId = typeof body.request_id === 'string' && UUID_RE.test(body.request_id)
    ? body.request_id.toLowerCase()
    : randomUUID();
  const orderToken = `preorder_${requestId}`;

  // 1. The orders table is what the admin dashboard reads: a 'pending' row
  //    shows under Orders > Pending until someone calls the customer.
  let recorded = false;
  const admin = supabaseAdmin();
  if (admin) {
    const { data: existing, error: lookupErr } = await admin
      .from('orders').select('id').eq('order_token', orderToken).maybeSingle();
    if (!lookupErr && existing) {
      // Already have this exact submission: the team and the customer were
      // told the first time.
      return res.status(200).json({ success: true });
    }

    const { error: insertErr } = await admin.from('orders').insert({
      product: product === 'digital' ? 'digital' : 'journal',
      quantity: 1,
      amount_egp: PRICES[product],
      status: 'pending',
      order_token: orderToken,
      customer_email: email,
      lang,
      shipping_name: name,
      shipping_phone: phone,
      shipping_address: product === 'digital' ? null
        : [address, city, governorate].filter(Boolean).join(', ').slice(0, 500),
      notes: 'Website pre-order request. Call the customer to confirm and arrange payment.',
    });
    if (insertErr) {
      console.error('Preorder record failed:', insertErr.message);
      await reportIssue('preorder_record_failed', 'critical',
        'Website pre-order could not be recorded', { customer: name.slice(0, 100), error: insertErr.message });
    } else {
      recorded = true;
    }
  } else {
    console.error('Preorder record skipped: Supabase env missing');
  }

  const apiKey = process.env.RESEND_API_KEY;
  const resend = apiKey ? new Resend(apiKey) : null;
  if (!resend) {
    console.error('Preorder email skipped: RESEND_API_KEY missing');
    await reportIssue('resend_not_configured', 'critical',
      'Website pre-order emails are off: RESEND_API_KEY is not set', {});
  }

  // 2. Tell the team. If the database write failed, this email is the only
  //    copy of the order.
  let notified = false;
  if (resend) {
    const row = (label, value) => value
      ? `<tr><td style="padding:12px 0;border-bottom:1px solid #e8e6e1;font-size:13px;color:#86868b;width:110px;">${label}</td><td style="padding:12px 0;border-bottom:1px solid #e8e6e1;font-size:14px;">${escapeHtml(value)}</td></tr>`
      : '';
    try {
      const { error } = await resend.emails.send({
        from: 'White Mirror <noreply@whitemirrorlabs.com>',
        to: ['hello@whitemirrorlabs.com'],
        replyTo: email,
        subject: `New Pre-order${recorded ? '' : ' (NOT STORED)'} — ${name.slice(0, 100)} — ${PRODUCTS[product]}`,
        html: `
        <div style="font-family:sans-serif;max-width:520px;margin:0 auto;color:#0a0a0a;">
          <h2 style="font-size:18px;font-weight:600;margin-bottom:24px;">New Pre-order Request</h2>
          <table style="width:100%;border-collapse:collapse;">
            ${row('Edition', PRODUCTS[product])}
            ${row('Name', name)}
            ${row('Email', email)}
            ${row('Phone', phone)}
            ${row('Address', product === 'digital' ? '' : address)}
            ${row('City', product === 'digital' ? '' : city)}
            ${row('Governorate', product === 'digital' ? '' : governorate)}
            ${row('Language', lang)}
          </table>
          <p style="margin-top:24px;font-size:12px;color:#aeaeb2;">${recorded ? 'Saved as a pending order in the admin dashboard. ' : 'NOT saved to the dashboard: this email is the only copy. '}Call the customer to confirm the order and payment.</p>
        </div>`,
      });
      if (error) console.error('Preorder team email error:', error);
      else notified = true;
    } catch (err) {
      console.error('Preorder team email error:', err && err.message);
    }
  }

  // The order exists somewhere the team will see it: the dashboard row or
  // the email. Only when neither happened does the visitor see an error;
  // reporting a failure after a saved order would make them submit again.
  if (!recorded && !notified) {
    await reportIssue('preorder_lost', 'critical',
      'Website pre-order was neither stored nor emailed', { customer: name.slice(0, 100) });
    return res.status(500).json({ error: 'Server error' });
  }
  if (!notified) {
    await reportIssue('preorder_team_email_failed', 'error',
      'Website pre-order saved, but the team email failed', { order_token: orderToken });
  }

  // 3. Customer confirmation: a failure is logged, never surfaced.
  if (resend) {
    try {
      const firstName = escapeHtml(name.split(/\s+/)[0]).slice(0, 60);
      const mail = confirmationEmail(lang, firstName, product);
      const { error } = await resend.emails.send({
        from: 'White Mirror <noreply@whitemirrorlabs.com>',
        to: [email],
        replyTo: 'hello@whitemirrorlabs.com',
        subject: mail.subject,
        html: mail.html,
      });
      if (error) console.error('Preorder confirm error:', error);
    } catch (err) {
      console.error('Preorder confirm error:', err && err.message);
    }
  }

  return res.status(200).json({ success: true });
};
