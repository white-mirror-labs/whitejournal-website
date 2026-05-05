const XPAY_BASE = 'https://community.xpay.app/api/v1';

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

    // Step 2: create transaction
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
