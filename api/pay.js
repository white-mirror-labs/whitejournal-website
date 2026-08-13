const { supabaseAdmin } = require('./_supabase.js');

// XPay v3 ("Checkout Sessions"). The legacy v1 community API this file used
// before — prepare-amount + pay/variable-amount, x-api-key, community_id — is
// gone; v3 is the only rail.
//
// Differences that matter here:
//   - POST https://api.xpay.app/checkout/sessions, `Authorization: Bearer sk_…`
//   - amounts are MINOR units: 49900 = 499.00 EGP (v1 took major units)
//   - there is NO per-order callback_url. Webhooks are account-level and
//     signed, so the order is identified by the checkout-session id (cs_…)
//     stored as pending_payments.order_token, and granted by the app's
//     api/xpay-v3-webhook.js after it verifies the HMAC signature.
const XPAY_V3_BASE = process.env.XPAY_V3_BASE || 'https://api.xpay.app';

// 499.00 EGP in minor units. Derived here, server-side, so a tampered client
// cannot set its own price.
const JOURNAL_AMOUNT_MINOR = 49900;

const SITE_BASE = process.env.SITE_BASE || 'https://www.whitemirrorlabs.com';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, phone, address, city, governorate } = req.body || {};

  if (!name || !email || !phone || !address || !city || !governorate) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  // Sent by the app when it opens /shop?uid=… — the Supabase account to unlock
  // once this payment clears. Absent for someone buying straight from the web
  // with no account; the order still goes through, and they unlock with the
  // serial printed inside the journal instead.
  const uid =
    typeof req.body?.uid === 'string' && /^[0-9a-f-]{36}$/i.test(req.body.uid)
      ? req.body.uid
      : null;

  const secretKey = process.env.XPAY_SECRET_KEY;
  if (!secretKey) {
    console.error('pay: XPAY_SECRET_KEY not configured');
    return res.status(500).json({ error: 'Payment service not configured' });
  }

  const admin = supabaseAdmin();
  if (!admin) {
    // Without Supabase nothing can be unlocked afterwards. Selling anyway would
    // take money for an app that stays shut.
    console.error('pay: Supabase env not configured — refusing to sell');
    return res.status(500).json({ error: 'Payment service not configured' });
  }

  try {
    // 1. Create the checkout session FIRST — its id is the key the order row
    //    is stored under, and the webhook looks the order up by that id.
    const sessionRes = await fetch(`${XPAY_V3_BASE}/checkout/sessions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${secretKey}`,
      },
      body: JSON.stringify({
        lineItems: [
          {
            priceData: {
              currency: 'EGP',
              unitAmount: JOURNAL_AMOUNT_MINOR,
              productData: { name: 'White Mirror — The Journal' },
            },
            quantity: 1,
          },
        ],
        // Carried for cross-checking only. The webhook grants from OUR
        // pending_payments row, never from metadata — a session whose metadata
        // disagrees with the recorded order is refused, not honoured.
        // v3 metadata values must be strings.
        metadata: {
          product: 'journal',
          ...(uid ? { user_id: uid } : {}),
          customer_name: String(name),
          customer_phone: String(phone),
          shipping_address: [address, city, governorate].filter(Boolean).join(', '),
        },
        afterCompletion: {
          type: 'redirect',
          redirect: { url: `${SITE_BASE}/shop-success` },
        },
      }),
    });

    const session = await sessionRes.json().catch(() => null);
    if (!sessionRes.ok || !session?.id || !session?.url) {
      console.error(
        `pay: session create failed (status ${sessionRes.status}, code ${session?.error?.code ?? 'n/a'})`,
      );
      return res.status(502).json({ error: 'Payment provider error' });
    }

    // 2. Record the order under that session id. The row is what proves WE
    //    priced this order and for whom; the signature proves the webhook came
    //    from XPay. Both are required before anything is granted.
    //
    //    Delivery details stay out of the row on purpose: the columns for them
    //    are in a migration that is not applied, and they already travel with
    //    the session metadata above.
    const orderRow = {
      order_token: session.id,
      product: 'journal',
      quantity: 1,
      amount_egp: JOURNAL_AMOUNT_MINOR / 100,
      xpay_payment_id: session.id,
    };

    let { error: insertErr } = await admin
      .from('pending_payments')
      .insert({ ...orderRow, user_id: uid });

    // user_id is a foreign key into auth.users. A uid that no longer resolves —
    // a deleted account, a stale link — must not cost us the sale: record the
    // order unattributed and let them unlock with the printed serial.
    if (insertErr && uid) {
      console.error(
        `pay: insert with uid ${uid} failed (${insertErr.message}); retrying unattributed`,
      );
      ({ error: insertErr } = await admin.from('pending_payments').insert(orderRow));
    }

    if (insertErr) {
      // The session exists at XPay but we will not honour it — the webhook
      // treats unrecorded sessions as unknown and grants nothing. The URL is
      // deliberately NOT returned, so nobody can pay against it.
      console.error(
        `pay: pending_payments insert failed for ${session.id}: ${insertErr.message}`,
      );
      return res.status(500).json({ error: 'Could not start payment' });
    }

    return res.status(200).json({
      checkout_url: session.url,
      session_id: session.id,
      total_amount: JOURNAL_AMOUNT_MINOR / 100,
    });
  } catch (err) {
    console.error('Pay handler error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
