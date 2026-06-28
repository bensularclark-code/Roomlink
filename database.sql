-- =============================================
-- ROOMLINK DATABASE SCHEMA
-- Paste this entire file into Supabase SQL Editor and click Run
-- supabase.com → Your Project → SQL Editor → New Query
-- =============================================

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- =============================================
-- USERS TABLE
-- =============================================
CREATE TABLE users (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  email TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  full_name TEXT NOT NULL,
  phone TEXT,
  role TEXT DEFAULT 'student' CHECK (role IN ('student', 'admin')),
  is_verified BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- LISTINGS TABLE
-- =============================================
CREATE TABLE listings (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  room_type TEXT NOT NULL CHECK (room_type IN ('self-contain', 'room-parlour', 'shared', 'single-room')),
  price INTEGER NOT NULL, -- annual rent in Naira (kobo × 100)
  location TEXT NOT NULL,
  address TEXT,
  landlord_name TEXT NOT NULL,
  landlord_phone TEXT NOT NULL,
  lister_id UUID REFERENCES users(id) ON DELETE SET NULL,
  lister_name TEXT NOT NULL,
  status TEXT DEFAULT 'available' CHECK (status IN ('available', 'rented', 'pending', 'removed')),
  is_verified BOOLEAN DEFAULT false,
  images TEXT[] DEFAULT '{}',
  amenities TEXT[] DEFAULT '{}',
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- PAYMENTS TABLE
-- Tracks finder's fee payments from landlords
-- =============================================
CREATE TABLE payments (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  listing_id UUID REFERENCES listings(id) ON DELETE SET NULL,
  tenant_id UUID REFERENCES users(id) ON DELETE SET NULL,
  lister_id UUID REFERENCES users(id) ON DELETE SET NULL,
  annual_rent INTEGER NOT NULL,
  total_fee INTEGER NOT NULL,        -- 7% of annual rent
  platform_share INTEGER NOT NULL,   -- 70% of fee
  referrer_share INTEGER NOT NULL,   -- 30% of fee
  paystack_reference TEXT UNIQUE,
  paystack_access_code TEXT,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'success', 'failed', 'refunded')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- =============================================
-- CONTACT REVEALS TABLE
-- Tracks who revealed which landlord contact
-- =============================================
CREATE TABLE contact_reveals (
  id UUID DEFAULT uuid_generate_v4() PRIMARY KEY,
  listing_id UUID REFERENCES listings(id) ON DELETE CASCADE,
  user_id UUID REFERENCES users(id) ON DELETE CASCADE,
  revealed_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(listing_id, user_id)
);

-- =============================================
-- INDEXES for performance
-- =============================================
CREATE INDEX idx_listings_status ON listings(status);
CREATE INDEX idx_listings_room_type ON listings(room_type);
CREATE INDEX idx_listings_location ON listings(location);
CREATE INDEX idx_listings_price ON listings(price);
CREATE INDEX idx_listings_lister ON listings(lister_id);
CREATE INDEX idx_payments_listing ON payments(listing_id);
CREATE INDEX idx_payments_status ON payments(status);
CREATE INDEX idx_payments_reference ON payments(paystack_reference);
CREATE INDEX idx_reveals_listing ON contact_reveals(listing_id);

-- =============================================
-- ROW LEVEL SECURITY (RLS)
-- =============================================
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE listings ENABLE ROW LEVEL SECURITY;
ALTER TABLE payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE contact_reveals ENABLE ROW LEVEL SECURITY;

-- Users: only see your own data
CREATE POLICY "Users see own data" ON users FOR SELECT USING (auth.uid()::text = id::text);

-- Listings: anyone can read available listings
CREATE POLICY "Anyone reads listings" ON listings FOR SELECT USING (status = 'available');
CREATE POLICY "Authenticated insert listings" ON listings FOR INSERT WITH CHECK (true);
CREATE POLICY "Lister updates own listing" ON listings FOR UPDATE USING (lister_id::text = auth.uid()::text);

-- Payments: only see own payments
CREATE POLICY "Users see own payments" ON payments FOR SELECT USING (tenant_id::text = auth.uid()::text);

-- =============================================
-- SEED DATA (sample listings for testing)
-- =============================================
INSERT INTO listings (title, description, room_type, price, location, landlord_name, landlord_phone, lister_name, is_verified) VALUES
('Bright Self-Contain near School Gate', 'Newly painted self-contain, tiled floor, steady water supply. 5 minutes walk to the main gate. Currently being vacated by the lister at the end of the month.', 'self-contain', 120000, 'Behind School Gate', 'Mr. Adeyemi', '08012345678', 'Kemi', true),
('Room & Parlour, Quiet Estate', 'Spacious room and parlour in a gated estate, good for two students sharing. Landlord lives on the same street, very responsive.', 'room-parlour', 180000, 'Federal Housing Estate', 'Mrs. Olu', '07034567890', 'Tunde', true),
('Shared Apartment, 1 Slot Open', 'One slot open in a 3-bedroom shared apartment with two other students. Furnished room, shared kitchen and living room.', 'shared', 75000, 'Behind School Gate', 'Engr. Bassey', '09045678901', 'Sarah', false),
('Single Room, Off Express Road', 'Compact single room, good for a student on a budget. Shared bathroom on the corridor, water provided by landlord.', 'single-room', 55000, 'Off Express Road', 'Pastor Eze', '08156789012', 'David', false);
