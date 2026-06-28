# RoomLink — Complete Deployment Guide
## Go from zero to live website, totally free

---

## WHAT YOU'RE DEPLOYING
- **Frontend + Backend**: Single Node.js app (Express serves the HTML)
- **Database**: Supabase PostgreSQL (free tier)
- **Payments**: Paystack (free to register)
- **Hosting**: Railway (free tier — no credit card required)

Total cost: ₦0

---

## STEP 1 — Set Up Supabase (Database)

1. Go to **supabase.com** → Sign up (free)
2. Click **New project**
3. Choose a name: `roomlink`, pick a strong database password, save it
4. Wait ~2 minutes for project to be ready
5. Go to **SQL Editor** → **New Query**
6. Copy the ENTIRE contents of `database.sql` and paste it → Click **Run**
7. You should see "Success" — your tables are created
8. Go to **Settings → API**:
   - Copy **Project URL** → this is your `SUPABASE_URL`
   - Copy **anon public** key → this is your `SUPABASE_ANON_KEY`
   - Copy **service_role** key → this is your `SUPABASE_SERVICE_KEY` (keep this secret!)

---

## STEP 2 — Set Up Paystack (Payments)

1. Go to **paystack.com** → **Create a free account**
2. Verify your email
3. Go to **Settings → API Keys & Webhooks**
4. Copy **Test Secret Key** (sk_test_...) → `PAYSTACK_SECRET_KEY`
5. Copy **Test Public Key** (pk_test_...) → `PAYSTACK_PUBLIC_KEY`
6. In `public/app.js`, line 8, replace:
   ```
   const PAYSTACK_PUBLIC_KEY = 'pk_test_YOUR_PAYSTACK_PUBLIC_KEY_HERE';
   ```
   with your actual test public key.

---

## STEP 3 — Push to GitHub

1. Install Git if you don't have it: **git-scm.com**
2. Create a free account at **github.com**
3. Create a new repository called `roomlink` (private is fine)
4. Open terminal/command prompt in the roomlink folder:

```bash
git init
git add .
git commit -m "Initial RoomLink commit"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/roomlink.git
git push -u origin main
```

---

## STEP 4 — Deploy on Railway (Free Hosting)

1. Go to **railway.app** → Sign up with GitHub (free)
2. Click **New Project** → **Deploy from GitHub repo**
3. Select your `roomlink` repository
4. Railway detects Node.js automatically
5. Click **Variables** tab, then **Add Variable** for each:

```
SUPABASE_URL          = https://your-project-id.supabase.co
SUPABASE_ANON_KEY     = your_anon_key
SUPABASE_SERVICE_KEY  = your_service_role_key
JWT_SECRET            = paste_any_long_random_string_here_64chars
PAYSTACK_SECRET_KEY   = sk_test_your_key
PAYSTACK_PUBLIC_KEY   = pk_test_your_key
NODE_ENV              = production
FRONTEND_URL          = https://your-app.railway.app  (fill after deploy)
PORT                  = 3000
```

6. Click **Deploy**
7. Railway gives you a URL like `roomlink-production.up.railway.app`
8. Go back to Variables, update `FRONTEND_URL` to that URL

---

## STEP 5 — Add Paystack Webhook

1. Go to Paystack dashboard → **Settings → API Keys & Webhooks**
2. Under **Webhook URL**, enter:
   ```
   https://your-app.railway.app/api/payments/webhook
   ```
3. Save it

This ensures payments that complete after browser close are still recorded.

---

## STEP 6 — Generate a JWT Secret

Run this in terminal to get a secure random secret:
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```
Copy the output and use it as your `JWT_SECRET`.

---

## STEP 7 — Test Your Live Site

Open your Railway URL and test these flows:

### ✅ Registration & Login
- Click "Log In" → Sign Up → create an account
- Log out → log in again

### ✅ Browse Listings
- 4 seed listings should be visible
- Test filters (location, room type, price)

### ✅ List a Room
- Log in → "List a Room" → fill form → Submit
- New listing should appear in Browse

### ✅ Reveal Contact
- Click any listing → "Connect with landlord"
- Landlord contact should appear

### ✅ Payment (Test Mode)
- Click "Confirm move-in & pay fee" on a revealed listing
- Paystack popup opens
- Use test card: **4084 0840 8408 4081**, Expiry: any future date, CVV: 408
- Payment should succeed and listing marked as rented

---

## GOING LIVE (When Ready for Real Payments)

1. On Paystack dashboard → complete **KYC verification** (submit CAC or NIN)
2. Once approved, get your **live keys** (sk_live_..., pk_live_...)
3. On Railway, update environment variables to live keys
4. Update `PAYSTACK_PUBLIC_KEY` in `app.js`, push to GitHub
5. Railway auto-redeploys

---

## CUSTOM DOMAIN (Optional, Still Free)

Railway lets you connect a custom domain:
1. Railway project → **Settings → Domains** → **Custom Domain**
2. Add your domain (buy one at **Namecheap** for ~$10/yr, or use a free `.me.uk` from Freenom)
3. Follow Railway's DNS instructions

---

## FILE STRUCTURE (Reference)

```
roomlink/
├── server.js              ← Express app entry point
├── package.json           ← Dependencies
├── .env.example           ← Environment variable template
├── .env                   ← Your actual secrets (never commit this!)
├── .gitignore
├── database.sql           ← Paste into Supabase SQL Editor
├── config/
│   └── supabase.js        ← Database connection
├── middleware/
│   └── auth.js            ← JWT authentication
├── routes/
│   ├── auth.js            ← /api/auth/*
│   ├── listings.js        ← /api/listings/*
│   └── payments.js        ← /api/payments/*
└── public/                ← Frontend (served as static files)
    ├── index.html
    ├── style.css
    ├── app.js
    └── payment-success.html
```

---

## API REFERENCE

| Method | Endpoint | Auth | Description |
|--------|----------|------|-------------|
| POST | /api/auth/register | No | Create account |
| POST | /api/auth/login | No | Log in |
| GET | /api/auth/me | Yes | Get profile |
| GET | /api/listings | No | Browse listings |
| GET | /api/listings/locations | No | Get unique locations |
| GET | /api/listings/:id | Optional | Single listing |
| POST | /api/listings | Yes | Create listing |
| POST | /api/listings/:id/reveal | Yes | Reveal landlord contact |
| PATCH | /api/listings/:id/status | Yes | Update status |
| GET | /api/listings/my/listings | Yes | Your listings |
| POST | /api/payments/initiate | Yes | Start payment |
| POST | /api/payments/verify | No | Verify payment |
| POST | /api/payments/webhook | No | Paystack webhook |
| GET | /api/payments/calculator | No | Fee preview |
| GET | /api/health | No | Server status |

---

## TROUBLESHOOTING

**"Cannot connect to database"**
→ Check SUPABASE_URL and SUPABASE_SERVICE_KEY in Railway variables

**"Invalid token"**
→ Make sure JWT_SECRET is set and is the same across all deploys

**"Payment not initialising"**
→ Verify PAYSTACK_SECRET_KEY starts with `sk_test_` (or `sk_live_` in production)

**Listings not loading**
→ Check that you ran `database.sql` in Supabase and the seed data inserted

**Port errors**
→ Railway sets PORT automatically; make sure your code uses `process.env.PORT`

---

## SUPPORT

- Supabase docs: **supabase.com/docs**
- Railway docs: **docs.railway.app**
- Paystack docs: **paystack.com/docs**
