const { Resend } = require('resend');

const resend = new Resend(process.env.RESEND_API_KEY);

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  console.log('Waitlist method:', req.method);

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { name, email, phone } = req.body;

  if (!name || !email) {
    return res.status(400).json({ error: 'Name and email are required' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  try {
    const { error } = await resend.emails.send({
      from: 'White Mirror <noreply@whitemirrorlabs.com>',
      to: ['hello@whitemirrorlabs.com'],
      reply_to: email,
      subject: `New Waitlist Submission — ${name}`,
      html: `
        <div style="font-family: sans-serif; max-width: 520px; margin: 0 auto; color: #0a0a0a;">
          <h2 style="font-size: 18px; font-weight: 600; margin-bottom: 24px;">New Waitlist Submission</h2>
          <table style="width: 100%; border-collapse: collapse;">
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #e8e6e1; font-size: 13px; color: #86868b; width: 100px;">Name</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #e8e6e1; font-size: 14px;">${name}</td>
            </tr>
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #e8e6e1; font-size: 13px; color: #86868b;">Email</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #e8e6e1; font-size: 14px;"><a href="mailto:${email}" style="color: #0a0a0a;">${email}</a></td>
            </tr>
            ${phone ? `
            <tr>
              <td style="padding: 12px 0; border-bottom: 1px solid #e8e6e1; font-size: 13px; color: #86868b;">Phone</td>
              <td style="padding: 12px 0; border-bottom: 1px solid #e8e6e1; font-size: 14px;">${phone}</td>
            </tr>` : ''}
          </table>
          <p style="margin-top: 24px; font-size: 12px; color: #aeaeb2;">Submitted via whitemirrorlabs.com</p>
        </div>
      `,
    });

    if (error) {
      console.error('Resend error:', error);
      return res.status(500).json({ error: 'Failed to send email' });
    }

    return res.status(200).json({ success: true });
  } catch (err) {
    console.error('Waitlist error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
