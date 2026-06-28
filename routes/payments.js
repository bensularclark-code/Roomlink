const express = require('express');
const router = express.Router();
const axios = require('axios');
const { authMiddleware } = require('../middleware/auth');
const supabase = require('../config/supabase');

const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY;
const FEE_RATE = 0.07;
const PLATFORM_SHARE = 0.70;

function computeFee(annualRent) {
  const fee = Math.round(annualRent * FEE_RATE);
  const platform = Math.round(fee * PLATFORM_SHARE);
  const referrer = fee - platform;
  return { fee, platform, referrer };
}

// POST /api/payments/initiate
// Called when a tenant confirms they've moved in — triggers landlord fee payment
router.post('/initiate', authMiddleware, async (req, res) => {
  const { listing_id } = req.body;

  if (!listing_id) return res.status(400).json({ error: 'listing_id is required' });

  try {
    const { data: listing, error: listErr } = await supabase
      .from('listings')
      .select('*')
      .eq('id', listing_id)
      .single();

    if (listErr || !listing) return res.status(404).json({ error: 'Listing not found' });

    const { fee, platform, referrer } = computeFee(listing.price);
    const amountKobo = fee * 100; // Paystack uses kobo

    // Get user email for Paystack
    const { data: user } = await supabase
      .from('users')
      .select('email, full_name')
      .eq('id', req.user.id)
      .single();

    // Create payment record
    const { data: payment, error: payErr } = await supabase
      .from('payments')
      .insert({
        listing_id,
        tenant_id: req.user.id,
        lister_id: listing.lister_id,
        annual_rent: listing.price,
        total_fee: fee,
        platform_share: platform,
        referrer_share: referrer,
        status: 'pending'
      })
      .select()
      .single();

    if (payErr) throw payErr;

    // Initiate Paystack transaction
    const paystackRes = await axios.post(
      'https://api.paystack.co/transaction/initialize',
      {
        email: user.email,
        amount: amountKobo,
        reference: `RL-${payment.id}-${Date.now()}`,
        metadata: {
          payment_id: payment.id,
          listing_id,
          listing_title: listing.title,
          custom_fields: [
            { display_name: 'Listing', variable_name: 'listing', value: listing.title },
            { display_name: 'Lister', variable_name: 'lister', value: listing.lister_name }
          ]
        },
        callback_url: `${process.env.FRONTEND_URL}/payment-success.html`
      },
      {
        headers: {
          Authorization: `Bearer ${PAYSTACK_SECRET}`,
          'Content-Type': 'application/json'
        }
      }
    );

    const { authorization_url, access_code, reference } = paystackRes.data.data;

    // Store reference
    await supabase
      .from('payments')
      .update({ paystack_reference: reference, paystack_access_code: access_code })
      .eq('id', payment.id);

    res.json({
      authorization_url,
      access_code,
      reference,
      payment_id: payment.id,
      fee_breakdown: { total_fee: fee, platform, referrer, annual_rent: listing.price }
    });
  } catch (err) {
    console.error('Payment initiate error:', err?.response?.data || err.message);
    res.status(500).json({ error: 'Failed to initiate payment. Please try again.' });
  }
});

// POST /api/payments/verify — Paystack webhook + manual verify
router.post('/verify', async (req, res) => {
  const { reference } = req.body;
  if (!reference) return res.status(400).json({ error: 'reference is required' });

  try {
    const paystackRes = await axios.get(
      `https://api.paystack.co/transaction/verify/${reference}`,
      { headers: { Authorization: `Bearer ${PAYSTACK_SECRET}` } }
    );

    const txn = paystackRes.data.data;

    if (txn.status === 'success') {
      const { data: payment } = await supabase
        .from('payments')
        .update({ status: 'success', paid_at: new Date().toISOString() })
        .eq('paystack_reference', reference)
        .select()
        .single();

      // Mark listing as rented
      if (payment?.listing_id) {
        await supabase
          .from('listings')
          .update({ status: 'rented' })
          .eq('id', payment.listing_id);
      }

      return res.json({ status: 'success', payment });
    }

    res.json({ status: txn.status });
  } catch (err) {
    console.error('Verify error:', err?.response?.data || err.message);
    res.status(500).json({ error: 'Verification failed' });
  }
});

// Paystack webhook (register this URL in your Paystack dashboard)
router.post('/webhook', express.raw({ type: 'application/json' }), async (req, res) => {
  const hash = require('crypto')
    .createHmac('sha512', PAYSTACK_SECRET)
    .update(JSON.stringify(req.body))
    .digest('hex');

  if (hash !== req.headers['x-paystack-signature']) {
    return res.status(401).send('Invalid signature');
  }

  const event = req.body;
  res.sendStatus(200); // Always respond immediately

  if (event.event === 'charge.success') {
    const reference = event.data.reference;
    try {
      const { data: payment } = await supabase
        .from('payments')
        .update({ status: 'success', paid_at: new Date().toISOString() })
        .eq('paystack_reference', reference)
        .select()
        .single();

      if (payment?.listing_id) {
        await supabase
          .from('listings')
          .update({ status: 'rented' })
          .eq('id', payment.listing_id);
      }
    } catch (err) {
      console.error('Webhook processing error:', err);
    }
  }
});

// GET /api/payments/my — current user's payment history
router.get('/my', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('payments')
      .select('*, listings(title, location, room_type)')
      .eq('tenant_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ payments: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch payments' });
  }
});

// GET /api/payments/calculator — fee preview
router.get('/calculator', (req, res) => {
  const { rent } = req.query;
  const annualRent = Number(rent) || 100000;
  const { fee, platform, referrer } = computeFee(annualRent);
  res.json({ annual_rent: annualRent, total_fee: fee, platform_share: platform, referrer_share: referrer, fee_rate: '7%', split: '70/30' });
});

module.exports = router;
