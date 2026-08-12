const { randomUUID } = require('node:crypto');
const { supabaseAdmin } = require('./_supabase.js');

const XPAY_BASE = process.env.XPAY_BASE_URL || 'https://staging.xpay.app/api/v1';

// Where the app's payment callback lives. It is the ONLY thing that grants
// profiles.journal_purchased, and it grants from a pending_payments row this
// endpoint records — never from anything XPay or a browser says on its own.
// Overridable so a preview deployment can point at a preview of the app API.
const APP_API_BASE =
  process.env.APP_API_BASE || 'https://insights-ai-eight-nine.vercel.app';

module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { name, email, phone, address, city, governorate } = req.body || {};

  // Sent by the app when it opens /shop?uid=… — the Supabase account that
  // should be unlocked when this payment clears. Absent for someone buying
  // straight from the web with no account yet; the order still goes through,
  // it simply has nobody to unlock (they scan the printed serial instead).
  const uid =
    typeof req.body?.uid === 'string' && /^[0-9a-f-]{36}$/i.test(req.body.uid)
      ? req.body.uid
      : null;

  if (!name || !email || !phone || !address || !city || !governorate) {
    return res.status(400).json({ error: 'All fields are required' });
  }

  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(email)) {
    return res.status(400).json({ error: 'Invalid email address' });
  }

  const communityId = process.env.XPAY_COMMUNITY_ID;
  const apiKey = process.env.XPAY_API_KEY;
  const variableAmountId = parseInt(process.env.XPAY_VARIABLE_AMOUNT_ID, 10);

  try {
    // Step 1: get total with payment fees
    const prepareRes = await fetch(`${XPAY_BASE}/payments/prepare-amount/`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        community_id: communityId,
        amount: 499,
        currency: 'EGP',
        selected_payment_method: 'card',
      }),
    });

    const prepareData = await prepareRes.json();
    if (prepareData.status?.code !== 200) {
      console.error('XPay prepare-amount error:', prepareData);
      return res.status(500).json({ error: 'Failed to prepare payment amount' });
    }

    const totalAmount = prepareData.data.total_amount;

    // Step 2: record the order BEFORE taking any money.
    //
    // The token is a secret that only ever travels in the callback URL. The
    // app's callback grants strictly for a matching row that is still
    // 'pending', then claims it in the same conditional update — so a forged
    // or replayed callback grants nothing. Same table, same guarantees as an
    // in-app purchase; this is simply the other till.
    const orderToken = randomUUID();
    const admin = supabaseAdmin();
    if (!admin) {
      // Without Supabase configured nothing can be unlocked afterwards. Selling
      // anyway would take money for an app that stays shut.
      console.error('pay: Supabase env not configured — refusing to sell');
      return res.status(500).json({ error: 'Payment service not configured' });
    }

    // Delivery details deliberately stay out of this row: the columns that
    // would hold them ship in a migration that is not applied, and the shop is
    // the system of record for fulfilment anyway — name, phone and address
    // already travel to XPay as billing data and custom fields.
    const orderRow = {
      order_token: orderToken,
      product: 'journal',
      quantity: 1,
      amount_egp: 499,
    };

    let { error: insertErr } = await admin
      .from('pending_payments')
      .insert({ ...orderRow, user_id: uid });

    // user_id is a foreign key into auth.users. A uid that no longer resolves —
    // a deleted account, a stale link someone kept — must not cost us the sale:
    // record the order unattributed and let them unlock with the printed serial.
    if (insertErr && uid) {
      console.error(
        `pay: insert with uid ${uid} failed (${insertErr.message}); retrying unattributed`,
      );
      ({ error: insertErr } = await admin
        .from('pending_payments')
        .insert(orderRow));
    }

    if (insertErr) {
      // No row means the callback would refuse to grant, so a customer would
      // pay and stay locked out. Refuse to take the money instead.
      console.error('pay: pending_payments insert failed:', insertErr.message);
      return res.status(500).json({ error: 'Could not start payment' });
    }

    // Step 3: create transaction
    const payRes = await fetch(`${XPAY_BASE}/payments/pay/variable-amount`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
      },
      body: JSON.stringify({
        community_id: communityId,
        amount: totalAmount,
        original_amount: 499,
        currency: 'EGP',
        variable_amount_id: variableAmountId,
        pay_using: 'card',
        billing_data: {
          name,
          email,
          phone_number: phone,
        },
        custom_fields: [
          { field_label: 'Street Address', field_value: address },
          { field_label: 'City', field_value: city },
          { field_label: 'Governorate', field_value: governorate },
        ],
        // The token is the whole security model: it is the only way the
        // callback can identify this order, and it never reaches the browser.
        callback_url: `${APP_API_BASE}/api/xpay-callback?token=${orderToken}`,
        redirect_url: `https://www.whitemirrorlabs.com/shop-success`,
      }),
    });

    const payData = await payRes.json();

    if (payData.status?.code === 200) {
      return res.status(200).json({
        iframe_url: payData.data.iframe_url,
        transaction_id: payData.data.transaction_id,
        total_amount: totalAmount,
      });
    }

    console.error('XPay pay error:', JSON.stringify(payData));
    return res.status(400).json({
      error: payData.status?.message || 'Payment creation failed',
    });
  } catch (err) {
    console.error('Pay handler error:', err);
    return res.status(500).json({ error: 'Server error' });
  }
};
