const express = require('express');
const router = express.Router();
const { body, query, validationResult } = require('express-validator');
const { authMiddleware, optionalAuth } = require('../middleware/auth');
const supabase = require('../config/supabase');

// GET /api/listings — browse with filters
router.get('/', optionalAuth, async (req, res) => {
  try {
    const { location, room_type, max_price, min_price, limit = 20, offset = 0 } = req.query;

    let q = supabase
      .from('listings')
      .select('id, title, description, room_type, price, location, lister_name, is_verified, amenities, images, created_at')
      .eq('status', 'available')
      .order('created_at', { ascending: false })
      .range(Number(offset), Number(offset) + Number(limit) - 1);

    if (location && location !== 'all') q = q.eq('location', location);
    if (room_type && room_type !== 'all') q = q.eq('room_type', room_type);
    if (max_price) q = q.lte('price', Number(max_price));
    if (min_price) q = q.gte('price', Number(min_price));

    const { data, error, count } = await q;
    if (error) throw error;

    res.json({ listings: data, total: count });
  } catch (err) {
    console.error('Listings fetch error:', err);
    res.status(500).json({ error: 'Failed to fetch listings' });
  }
});

// GET /api/listings/locations — unique location list
router.get('/locations', async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('listings')
      .select('location')
      .eq('status', 'available');

    if (error) throw error;
    const unique = [...new Set(data.map(d => d.location))].sort();
    res.json({ locations: unique });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch locations' });
  }
});

// GET /api/listings/:id — single listing (landlord hidden unless revealed)
router.get('/:id', optionalAuth, async (req, res) => {
  try {
    const { data: listing, error } = await supabase
      .from('listings')
      .select('*')
      .eq('id', req.params.id)
      .single();

    if (error || !listing) return res.status(404).json({ error: 'Listing not found' });

    // Hide landlord contact unless user has revealed
    let revealed = false;
    if (req.user) {
      const { data: revealRecord } = await supabase
        .from('contact_reveals')
        .select('id')
        .eq('listing_id', req.params.id)
        .eq('user_id', req.user.id)
        .single();
      revealed = !!revealRecord;
    }

    if (!revealed) {
      listing.landlord_phone = null;
      listing.landlord_name = revealed ? listing.landlord_name : listing.landlord_name.split(' ')[0] + ' ***';
    }

    res.json({ listing, revealed });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch listing' });
  }
});

// POST /api/listings — create listing (auth required)
router.post('/', authMiddleware, [
  body('title').trim().notEmpty().withMessage('Title is required'),
  body('description').trim().notEmpty().withMessage('Description is required'),
  body('room_type').isIn(['self-contain', 'room-parlour', 'shared', 'single-room']),
  body('price').isInt({ min: 10000 }).withMessage('Price must be at least ₦10,000'),
  body('location').trim().notEmpty(),
  body('landlord_name').trim().notEmpty(),
  body('landlord_phone').trim().notEmpty()
], async (req, res) => {
  const errors = validationResult(req);
  if (!errors.isEmpty()) {
    return res.status(400).json({ error: errors.array()[0].msg });
  }

  try {
    const { title, description, room_type, price, location, address, landlord_name, landlord_phone, amenities } = req.body;

    const { data, error } = await supabase
      .from('listings')
      .insert({
        title, description, room_type,
        price: Number(price),
        location, address,
        landlord_name, landlord_phone,
        lister_id: req.user.id,
        lister_name: req.user.full_name,
        amenities: amenities || []
      })
      .select()
      .single();

    if (error) throw error;
    res.status(201).json({ listing: data, message: 'Listing submitted successfully' });
  } catch (err) {
    console.error('Create listing error:', err);
    res.status(500).json({ error: 'Failed to create listing' });
  }
});

// POST /api/listings/:id/reveal — reveal landlord contact
router.post('/:id/reveal', authMiddleware, async (req, res) => {
  try {
    const { data: listing, error: listErr } = await supabase
      .from('listings')
      .select('id, landlord_name, landlord_phone, lister_name, lister_id')
      .eq('id', req.params.id)
      .eq('status', 'available')
      .single();

    if (listErr || !listing) return res.status(404).json({ error: 'Listing not found' });

    // Upsert reveal record
    await supabase.from('contact_reveals').upsert({
      listing_id: req.params.id,
      user_id: req.user.id
    }, { onConflict: 'listing_id,user_id' });

    res.json({
      landlord_name: listing.landlord_name,
      landlord_phone: listing.landlord_phone,
      lister_name: listing.lister_name,
      message: 'Contact revealed'
    });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reveal contact' });
  }
});

// PATCH /api/listings/:id/status — mark as rented
router.patch('/:id/status', authMiddleware, async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['available', 'rented', 'removed'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Invalid status' });
  }

  try {
    const { data: listing } = await supabase
      .from('listings')
      .select('lister_id')
      .eq('id', req.params.id)
      .single();

    if (!listing) return res.status(404).json({ error: 'Listing not found' });
    if (listing.lister_id !== req.user.id && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Not authorised to update this listing' });
    }

    const { data, error } = await supabase
      .from('listings')
      .update({ status, updated_at: new Date().toISOString() })
      .eq('id', req.params.id)
      .select()
      .single();

    if (error) throw error;
    res.json({ listing: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update listing' });
  }
});

// GET /api/listings/my/listings — current user's listings
router.get('/my/listings', authMiddleware, async (req, res) => {
  try {
    const { data, error } = await supabase
      .from('listings')
      .select('*')
      .eq('lister_id', req.user.id)
      .order('created_at', { ascending: false });

    if (error) throw error;
    res.json({ listings: data });
  } catch (err) {
    res.status(500).json({ error: 'Failed to fetch your listings' });
  }
});

module.exports = router;
