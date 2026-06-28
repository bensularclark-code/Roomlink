/* =============================================
   ROOMLINK — FRONTEND APP (app.js)
   Connects to backend API at /api/*
   ============================================= */

// =============================================
// CONFIG
// =============================================
const API = ''; // empty = same origin (works for both dev and production)
const PAYSTACK_PUBLIC_KEY = 'pk_test_YOUR_PAYSTACK_PUBLIC_KEY_HERE'; // replace with yours

// =============================================
// STATE
// =============================================
let state = {
  view: 'browse',
  user: null,
  token: null,
  listings: [],
  locations: [],
  filters: { location: 'all', room_type: 'all', max_price: 250000 },
  myListings: [],
  myPayments: []
};

// =============================================
// HELPERS
// =============================================
const $ = id => document.getElementById(id);
const naira = n => '₦' + Math.round(n).toLocaleString('en-NG');
const esc = s => (s||'').replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));

function computeFee(rent) {
  const fee = Math.round(rent * 0.07);
  const platform = Math.round(fee * 0.70);
  const referrer = fee - platform;
  return { fee, platform, referrer };
}

const ROOM_TYPES = [
  { id: 'self-contain', label: 'Self-Contain' },
  { id: 'room-parlour', label: 'Room & Parlour' },
  { id: 'shared', label: 'Shared Apartment' },
  { id: 'single-room', label: 'Single Room' },
];
const rtLabel = id => (ROOM_TYPES.find(r => r.id === id) || {}).label || id;

const THUMBS = [
  ['#F6E4DF','#B85042'],
  ['#EAEFE9','#739E82'],
  ['#F1E6DD','#8C6953'],
  ['#F8EEE9','#8A3B30'],
  ['#E9EFF6','#4A6FA5'],
];
const hashCode = s => { let h=0; for(let i=0;i<s.length;i++){h=(h<<5)-h+s.charCodeAt(i);h|=0;} return Math.abs(h); };
const thumbColors = id => THUMBS[hashCode(id||'') % THUMBS.length];

// =============================================
// AUTH HELPERS
// =============================================
function saveAuth(token, user) {
  state.token = token;
  state.user = user;
  localStorage.setItem('rl_token', token);
  localStorage.setItem('rl_user', JSON.stringify(user));
  updateAuthUI();
}
function clearAuth() {
  state.token = null;
  state.user = null;
  localStorage.removeItem('rl_token');
  localStorage.removeItem('rl_user');
  updateAuthUI();
}
function loadAuth() {
  const token = localStorage.getItem('rl_token');
  const user = localStorage.getItem('rl_user');
  if (token && user) {
    state.token = token;
    state.user = JSON.parse(user);
    updateAuthUI();
  }
}
function updateAuthUI() {
  const authBtn = $('authBtn');
  const userPill = $('userPill');
  const dashTab = $('dashTab');
  if (state.user) {
    authBtn.style.display = 'none';
    userPill.style.display = 'flex';
    $('userAv').textContent = state.user.full_name.charAt(0).toUpperCase();
    $('userName').textContent = state.user.full_name.split(' ')[0];
    dashTab.style.display = 'block';
  } else {
    authBtn.style.display = 'block';
    userPill.style.display = 'none';
    dashTab.style.display = 'none';
  }
}

// =============================================
// API CALLS
// =============================================
async function apiFetch(path, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (state.token) headers['Authorization'] = `Bearer ${state.token}`;
  const res = await fetch(API + path, { ...options, headers: { ...headers, ...options.headers } });
  const data = await res.json();
  if (!res.ok) throw new Error(data.error || 'Request failed');
  return data;
}

// =============================================
// TOAST
// =============================================
let toastTimer;
function showToast(msg, isError = false) {
  const t = $('toast');
  t.textContent = msg;
  t.className = 'toast show' + (isError ? ' toast-error' : '');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 4000);
}

// =============================================
// MODALS
// =============================================
function openModal(id) { $(id).classList.add('open'); document.body.style.overflow = 'hidden'; }
function closeModal(id) { $(id).classList.remove('open'); document.body.style.overflow = ''; }

// Close on backdrop click
['authModal','detailModal','payModal'].forEach(id => {
  $(id).addEventListener('click', e => { if(e.target === $(id)) closeModal(id); });
});

// =============================================
// AUTH MODAL
// =============================================
function setupAuthModal() {
  $('authBtn').addEventListener('click', () => openModal('authModal'));
  $('closeAuthModal').addEventListener('click', () => closeModal('authModal'));
  $('logoutBtn').addEventListener('click', () => {
    clearAuth();
    showToast('Logged out');
    if (state.view === 'dashboard') switchView('browse');
  });

  // Tabs
  document.querySelectorAll('.auth-tab').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.auth-tab').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      const tab = btn.dataset.tab;
      $('loginForm').style.display = tab === 'login' ? 'block' : 'none';
      $('registerForm').style.display = tab === 'register' ? 'block' : 'none';
    });
  });

  // Login
  $('loginBtn').addEventListener('click', async () => {
    const email = $('loginEmail').value.trim();
    const password = $('loginPassword').value;
    $('loginError').textContent = '';
    if (!email || !password) { $('loginError').textContent = 'Please fill in both fields'; return; }
    $('loginBtn').textContent = 'Logging in…';
    $('loginBtn').disabled = true;
    try {
      const { token, user } = await apiFetch('/api/auth/login', {
        method: 'POST', body: JSON.stringify({ email, password })
      });
      saveAuth(token, user);
      closeModal('authModal');
      showToast(`Welcome back, ${user.full_name.split(' ')[0]}!`);
    } catch (err) {
      $('loginError').textContent = err.message;
    } finally {
      $('loginBtn').textContent = 'Log In';
      $('loginBtn').disabled = false;
    }
  });

  // Register
  $('registerBtn').addEventListener('click', async () => {
    const full_name = $('regName').value.trim();
    const email = $('regEmail').value.trim();
    const phone = $('regPhone').value.trim();
    const password = $('regPassword').value;
    $('registerError').textContent = '';
    if (!full_name || !email || !password) { $('registerError').textContent = 'Please fill all required fields'; return; }
    if (password.length < 6) { $('registerError').textContent = 'Password must be at least 6 characters'; return; }
    $('registerBtn').textContent = 'Creating account…';
    $('registerBtn').disabled = true;
    try {
      const { token, user } = await apiFetch('/api/auth/register', {
        method: 'POST', body: JSON.stringify({ full_name, email, phone, password })
      });
      saveAuth(token, user);
      closeModal('authModal');
      showToast(`Welcome to RoomLink, ${user.full_name.split(' ')[0]}!`);
    } catch (err) {
      $('registerError').textContent = err.message;
    } finally {
      $('registerBtn').textContent = 'Create Account';
      $('registerBtn').disabled = false;
    }
  });
}

// =============================================
// BROWSE VIEW
// =============================================
async function renderBrowse() {
  const main = $('main');
  main.innerHTML = `
    <div class="hero">
      <div class="eyebrow">Verified peer listings</div>
      <h1>Find your next room off-campus</h1>
      <p>Browse rooms listed by fellow students, filter by budget and location, then connect directly with landlords.</p>
    </div>
    <div class="browse-layout">
      <aside class="filters">
        <div class="filters-title">Filter results</div>
        <div class="filter-group">
          <label>Location</label>
          <select id="fLoc">
            <option value="all">All locations</option>
            ${state.locations.map(l => `<option value="${esc(l)}" ${state.filters.location===l?'selected':''}>${esc(l)}</option>`).join('')}
          </select>
        </div>
        <div class="filter-group">
          <label>Room type</label>
          <select id="fType">
            <option value="all">All types</option>
            ${ROOM_TYPES.map(t => `<option value="${t.id}" ${state.filters.room_type===t.id?'selected':''}>${t.label}</option>`).join('')}
          </select>
        </div>
        <div class="filter-group">
          <label>Max price / year</label>
          <input type="range" id="fPrice" min="40000" max="250000" step="5000" value="${state.filters.max_price}"/>
          <div class="price-val" id="priceVal">${naira(state.filters.max_price)}</div>
        </div>
        <button class="filter-reset" id="resetFilters">Reset filters</button>
      </aside>
      <div class="results-col">
        <div class="results-meta">
          <div class="results-count" id="resultsCount"></div>
        </div>
        <div class="grid" id="grid">
          ${[1,2,3,4].map(() => '<div class="skeleton skeleton-card"></div>').join('')}
        </div>
      </div>
    </div>
  `;

  // Bind filters
  $('fLoc').addEventListener('change', e => { state.filters.location = e.target.value; fetchAndRenderListings(); });
  $('fType').addEventListener('change', e => { state.filters.room_type = e.target.value; fetchAndRenderListings(); });
  const priceSlider = $('fPrice');
  priceSlider.addEventListener('input', e => {
    state.filters.max_price = Number(e.target.value);
    $('priceVal').textContent = naira(state.filters.max_price);
  });
  priceSlider.addEventListener('change', () => fetchAndRenderListings());
  $('resetFilters').addEventListener('click', () => {
    state.filters = { location: 'all', room_type: 'all', max_price: 250000 };
    renderBrowse();
    fetchAndRenderListings();
  });

  await fetchAndRenderListings();
}

async function fetchAndRenderListings() {
  try {
    const params = new URLSearchParams();
    if (state.filters.location !== 'all') params.set('location', state.filters.location);
    if (state.filters.room_type !== 'all') params.set('room_type', state.filters.room_type);
    params.set('max_price', state.filters.max_price);

    const { listings } = await apiFetch(`/api/listings?${params}`);
    state.listings = listings;

    const grid = $('grid');
    const countEl = $('resultsCount');
    if (!grid) return;

    countEl.textContent = `${listings.length} room${listings.length !== 1 ? 's' : ''} available`;
    grid.innerHTML = listings.length ? listings.map(listingCardHTML).join('') : emptyHTML();

    grid.querySelectorAll('.listing-card').forEach(c => {
      c.addEventListener('click', () => openDetail(c.dataset.id));
    });
  } catch (err) {
    const grid = $('grid');
    if (grid) grid.innerHTML = `<div class="empty" style="grid-column:1/-1"><h3>Failed to load listings</h3><p>${err.message}</p></div>`;
  }
}

function listingCardHTML(l) {
  const [bg, fg] = thumbColors(l.id);
  return `
    <div class="listing-card" data-id="${esc(l.id)}">
      <div class="card-thumb" style="background:${bg};color:${fg}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5a1 1 0 0 0 1 1H17.5a1 1 0 0 0 1-1V10"/></svg>
        ${l.is_verified ? `<div class="verified-badge"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg>Verified</div>` : ''}
        <div class="price-chip">${naira(l.price)}/yr</div>
      </div>
      <div class="card-body">
        <h3>${esc(l.title)}</h3>
        <div class="card-meta">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 21s7-7.1 7-12a7 7 0 1 0-14 0c0 4.9 7 12 7 12Z"/><circle cx="12" cy="9" r="2.4"/></svg>
          ${esc(l.location)}
        </div>
        <span class="type-pill">${rtLabel(l.room_type)}</span>
      </div>
    </div>
  `;
}

function emptyHTML() {
  return `<div class="empty" style="grid-column:1/-1">
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><circle cx="11" cy="11" r="7"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>
    <h3>No rooms match these filters</h3>
    <p>Try widening your budget or clearing the filters.</p>
  </div>`;
}

// =============================================
// LISTING DETAIL
// =============================================
async function openDetail(id) {
  openModal('detailModal');
  const modal = $('detailContent');
  modal.innerHTML = `<div class="detail-body" style="padding:40px;text-align:center;color:var(--muted)">Loading…</div>`;

  try {
    const { listing, revealed } = await apiFetch(`/api/listings/${id}`);
    const [bg, fg] = thumbColors(listing.id);

    modal.innerHTML = `
      <div class="detail-thumb" style="background:${bg};color:${fg}">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="width:50px;height:50px;opacity:.8"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5a1 1 0 0 0 1 1H17.5a1 1 0 0 0 1-1V10"/></svg>
        <button class="modal-close" onclick="closeModal('detailModal')">✕</button>
      </div>
      <div class="detail-body">
        <span class="type-pill">${rtLabel(listing.room_type)}</span>
        <h2>${esc(listing.title)}</h2>
        <div class="detail-price">${naira(listing.price)} <span>/ year</span></div>
        <p class="detail-desc">${esc(listing.description)}</p>

        <div class="detail-meta-row">
          <div class="detail-meta-item">
            <div class="dm-label">Location</div>
            <div class="dm-value">${esc(listing.location)}</div>
          </div>
          <div class="detail-meta-item">
            <div class="dm-label">Room Type</div>
            <div class="dm-value">${rtLabel(listing.room_type)}</div>
          </div>
          <div class="detail-meta-item">
            <div class="dm-label">Listed By</div>
            <div class="dm-value">${esc(listing.lister_name)}</div>
          </div>
          ${listing.is_verified ? `<div class="detail-meta-item"><div class="dm-label">Status</div><div class="dm-value" style="color:var(--accent-dark)">✓ Verified</div></div>` : ''}
        </div>

        ${listing.amenities && listing.amenities.length ? `
          <div>
            <div class="dm-label" style="margin-bottom:8px">Amenities</div>
            <div class="amenities-list">${listing.amenities.map(a => `<span class="amenity-tag">${esc(a)}</span>`).join('')}</div>
          </div>
        ` : ''}

        <div class="landlord-box">
          <div class="landlord-label">Landlord Contact</div>
          ${revealed ? `
            <div class="contact-revealed">
              <div class="landlord-av">${esc(listing.landlord_name).charAt(0)}</div>
              <div>
                <strong>${esc(listing.landlord_name)}</strong>
                <span>${esc(listing.landlord_phone)}</span>
              </div>
            </div>
          ` : `
            <div class="contact-locked">
              <div class="lock-circle">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>
              </div>
              <p>Tap "Connect with landlord" to reveal the contact and arrange a viewing.</p>
            </div>
          `}
          <div class="fee-note">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="19" x2="19" y2="5"/><circle cx="7" cy="7" r="2.4"/><circle cx="17" cy="17" r="2.4"/></svg>
            A 7% finder's fee applies to the landlord only after move-in — browsing and connecting is free for students.
          </div>
        </div>

        <div class="detail-actions" id="detailActions">
          ${revealed
            ? `<button class="btn-secondary" id="markRentedBtn">Mark as rented</button>
               <button class="btn-accent" id="payFeeBtn">Confirm move-in & pay fee</button>`
            : `<button class="btn-primary btn-full" id="revealBtn">Connect with landlord</button>`
          }
        </div>
      </div>
    `;

    // Bind actions
    const revealBtn = $('revealBtn');
    if (revealBtn) {
      revealBtn.addEventListener('click', async () => {
        if (!state.user) { closeModal('detailModal'); openModal('authModal'); return; }
        revealBtn.textContent = 'Loading…'; revealBtn.disabled = true;
        try {
          const data = await apiFetch(`/api/listings/${id}/reveal`, { method: 'POST' });
          const { fee } = computeFee(listing.price);
          showToast(`Contact revealed! If you move in, ${naira(Math.round(fee * 0.3))} of the fee goes to ${data.lister_name}.`);
          closeModal('detailModal');
          openDetail(id); // reopen with contact visible
        } catch (err) {
          showToast(err.message, true);
          revealBtn.textContent = 'Connect with landlord'; revealBtn.disabled = false;
        }
      });
    }

    const markRentedBtn = $('markRentedBtn');
    if (markRentedBtn) {
      markRentedBtn.addEventListener('click', async () => {
        try {
          await apiFetch(`/api/listings/${listing.id}/status`, { method: 'PATCH', body: JSON.stringify({ status: 'rented' }) });
          showToast('Listing marked as rented and removed from browse.');
          closeModal('detailModal');
          fetchAndRenderListings();
        } catch (err) { showToast(err.message, true); }
      });
    }

    const payFeeBtn = $('payFeeBtn');
    if (payFeeBtn) {
      payFeeBtn.addEventListener('click', () => openPaymentModal(listing));
    }

  } catch (err) {
    modal.innerHTML = `<div class="detail-body" style="padding:40px;text-align:center"><h3>Failed to load listing</h3><p>${err.message}</p></div>`;
  }
}

// =============================================
// PAYMENT MODAL (Paystack)
// =============================================
async function openPaymentModal(listing) {
  if (!state.user) { openModal('authModal'); return; }

  closeModal('detailModal');
  const { fee, platform, referrer } = computeFee(listing.price);

  $('payContent').innerHTML = `
    <button class="modal-close" id="closePayModal2">✕</button>
    <h2 style="font-size:20px;margin-bottom:6px">Confirm Move-in Fee</h2>
    <p style="color:var(--muted);font-size:13.5px;margin-bottom:0">This fee is charged to the landlord. You are confirming on their behalf after signing your rent agreement.</p>
    <div class="pay-summary">
      <div class="pay-row"><span class="label">Listing</span><span class="value" style="font-size:13px;text-align:right;max-width:200px">${esc(listing.title)}</span></div>
      <div class="pay-row"><span class="label">Annual rent</span><span class="value">${naira(listing.price)}</span></div>
      <div class="pay-row"><span class="label">Finder's fee (7%)</span><span class="value">${naira(fee)}</span></div>
      <div class="pay-row"><span class="label">Referral to lister (30%)</span><span class="value" style="color:var(--accent-dark)">${naira(referrer)}</span></div>
      <div class="pay-row total"><span class="label">You are paying</span><span class="value" style="color:var(--primary-dark)">${naira(fee)}</span></div>
    </div>
    <div class="field-error" id="payError" style="margin-bottom:10px"></div>
    <button class="btn-primary btn-full" id="initiatePayBtn">Pay ${naira(fee)} with Paystack</button>
    <p style="text-align:center;font-size:11.5px;color:var(--muted);margin-top:12px">Secured by Paystack · Card, bank transfer, or USSD</p>
  `;

  openModal('payModal');
  $('closePayModal').addEventListener('click', () => closeModal('payModal'));
  $('closePayModal2').addEventListener('click', () => closeModal('payModal'));

  $('initiatePayBtn').addEventListener('click', async () => {
    const btn = $('initiatePayBtn');
    btn.textContent = 'Initialising payment…'; btn.disabled = true;
    $('payError').textContent = '';

    try {
      const data = await apiFetch('/api/payments/initiate', {
        method: 'POST', body: JSON.stringify({ listing_id: listing.id })
      });

      closeModal('payModal');

      // Load Paystack inline if not already loaded
      if (!window.PaystackPop) {
        await loadScript('https://js.paystack.co/v1/inline.js');
      }

      const handler = PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY,
        email: state.user.email,
        amount: fee * 100, // kobo
        ref: data.reference,
        metadata: { payment_id: data.payment_id, listing_title: listing.title },
        onSuccess: async (txn) => {
          showToast('Payment successful! Listing will be marked as rented.');
          try {
            await apiFetch('/api/payments/verify', { method: 'POST', body: JSON.stringify({ reference: txn.reference }) });
          } catch (_) {}
          fetchAndRenderListings();
        },
        onCancel: () => { showToast('Payment cancelled.', true); }
      });
      handler.openIframe();
    } catch (err) {
      $('payError').textContent = err.message;
      btn.textContent = `Pay ${naira(fee)} with Paystack`;
      btn.disabled = false;
    }
  });
}

function loadScript(src) {
  return new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = src; s.onload = resolve; s.onerror = reject;
    document.head.appendChild(s);
  });
}

// =============================================
// LIST A ROOM VIEW
// =============================================
function renderListForm() {
  if (!state.user) {
    $('main').innerHTML = `
      <div class="empty">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"><rect x="5" y="10.5" width="14" height="9.5" rx="2"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/></svg>
        <h3>Log in to list a room</h3>
        <p>You need an account to submit listings so we can credit your referral.</p>
        <button class="btn-primary" style="margin-top:16px" onclick="openModal('authModal')">Log In or Sign Up</button>
      </div>
    `;
    return;
  }

  let currentRT = 'self-contain';
  const AMENITIES = ['Running water','Prepaid meter','Security gate','Pop ceiling','Kitchen','Parking','Borehole','PHCN direct','Fence','Tiled floor'];

  $('main').innerHTML = `
    <div class="form-wrap">
      <div class="hero">
        <div class="eyebrow">List a room</div>
        <h1>Know a room that's opening up?</h1>
        <p>List it here. If a student moves in through your listing, you earn a referral share of the landlord's finder's fee.</p>
      </div>

      <div class="field">
        <label>Room type</label>
        <div class="room-type-grid" id="rtPicker">
          ${ROOM_TYPES.map(t => `
            <button type="button" class="rt-btn ${t.id==='self-contain'?'active':''}" data-rt="${t.id}">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5a1 1 0 0 0 1 1H17.5a1 1 0 0 0 1-1V10"/></svg>
              ${t.label}
            </button>
          `).join('')}
        </div>
      </div>

      <div class="field">
        <label>Listing title *</label>
        <input id="ltTitle" placeholder="e.g. Bright self-contain near school gate"/>
      </div>

      <div class="field-row">
        <div class="field">
          <label>Annual rent (₦) *</label>
          <input id="ltPrice" type="number" placeholder="e.g. 120000"/>
        </div>
        <div class="field">
          <label>Location / area *</label>
          <input id="ltLocation" placeholder="e.g. Behind School Gate"/>
        </div>
      </div>

      <div class="field">
        <label>Full address (optional)</label>
        <input id="ltAddress" placeholder="Street address if comfortable sharing"/>
      </div>

      <div class="field">
        <label>Description *</label>
        <textarea id="ltDesc" placeholder="Describe the room — condition, facilities, available from, any deal-breakers students should know"></textarea>
      </div>

      <div class="field">
        <label>Amenities</label>
        <div class="amenities-grid">
          ${AMENITIES.map(a => `
            <label class="amenity-check">
              <input type="checkbox" value="${a}" class="amenity-cb"/> ${a}
            </label>
          `).join('')}
        </div>
      </div>

      <div class="field-row">
        <div class="field">
          <label>Landlord name *</label>
          <input id="ltLandlordName" placeholder="e.g. Mr. Adeyemi"/>
        </div>
        <div class="field">
          <label>Landlord phone *</label>
          <input id="ltLandlordPhone" placeholder="e.g. 08012345678"/>
        </div>
      </div>

      <div class="field">
        <div class="field-hint" style="background:var(--card);border-radius:10px;padding:12px;font-size:12.5px;color:var(--secondary);line-height:1.6">
          Your account name <strong>${esc(state.user.full_name)}</strong> will be credited as the lister. If a student moves in through this listing, you earn 30% of the 7% finder's fee.
        </div>
      </div>

      <div class="field-error" id="listError"></div>
      <button class="btn-primary btn-full" id="submitListingBtn">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" width="18" height="18"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/></svg>
        Submit listing
      </button>
    </div>
  `;

  // Room type picker
  document.querySelectorAll('.rt-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentRT = btn.dataset.rt;
      document.querySelectorAll('.rt-btn').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
    });
  });

  // Submit
  $('submitListingBtn').addEventListener('click', async () => {
    const title = $('ltTitle').value.trim();
    const price = $('ltPrice').value;
    const location = $('ltLocation').value.trim();
    const description = $('ltDesc').value.trim();
    const landlord_name = $('ltLandlordName').value.trim();
    const landlord_phone = $('ltLandlordPhone').value.trim();
    const address = $('ltAddress').value.trim();
    const amenities = [...document.querySelectorAll('.amenity-cb:checked')].map(c => c.value);

    $('listError').textContent = '';
    if (!title || !price || !location || !description || !landlord_name || !landlord_phone) {
      $('listError').textContent = 'Please fill in all required fields (*).'; return;
    }
    if (Number(price) < 10000) {
      $('listError').textContent = 'Price must be at least ₦10,000.'; return;
    }

    const btn = $('submitListingBtn');
    btn.textContent = 'Submitting…'; btn.disabled = true;

    try {
      await apiFetch('/api/listings', {
        method: 'POST',
        body: JSON.stringify({ title, price: Number(price), location, address, description, room_type: currentRT, landlord_name, landlord_phone, amenities })
      });
      showToast('Listing submitted — now live for students to browse!');
      // Reload locations
      const { locations } = await apiFetch('/api/listings/locations');
      state.locations = locations;
      switchView('browse');
    } catch (err) {
      $('listError').textContent = err.message;
    } finally {
      btn.textContent = 'Submit listing'; btn.disabled = false;
    }
  });
}

// =============================================
// FEES PAGE
// =============================================
function renderFees() {
  $('main').innerHTML = `
    <div class="fees-wrap">
      <div class="hero">
        <div class="eyebrow">How it works</div>
        <h1>The RoomLink fee model</h1>
        <p>RoomLink only earns when a room is successfully filled. Browsing, searching, and connecting are always free for students.</p>
      </div>

      <div class="flow-row">
        <div class="flow-step">
          <div class="step-icon"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><path d="M17 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/></svg></div>
          <h4>Student moves in</h4>
          <p>A student finds a room on RoomLink, contacts the landlord, and signs the rent agreement.</p>
        </div>
        <div class="flow-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/></svg></div>
        <div class="flow-step">
          <div class="step-icon"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><line x1="5" y1="19" x2="19" y2="5"/><circle cx="7" cy="7" r="2.4"/><circle cx="17" cy="17" r="2.4"/></svg></div>
          <h4>Landlord pays 7%</h4>
          <p>A one-time finder's fee of 7% of the first year's rent, paid after move-in is confirmed.</p>
        </div>
        <div class="flow-arrow"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><line x1="5" y1="12" x2="19" y2="12"/><polyline points="13 6 19 12 13 18"/></svg></div>
        <div class="flow-step">
          <div class="step-icon"><svg viewBox="0 0 24 24" fill="none" stroke="white" stroke-width="2" stroke-linecap="round"><path d="M12 3v4M12 17v4M3 12h4M17 12h4M5.6 5.6l2.8 2.8M15.6 15.6l2.8 2.8M18.4 5.6l-2.8 2.8M8.4 15.6l-2.8 2.8"/></svg></div>
          <h4>Fee is split 70 / 30</h4>
          <p>70% goes to the RoomLink platform. 30% goes directly to the student who listed the room.</p>
        </div>
      </div>

      <div class="calc-box">
        <h3>Fee calculator</h3>
        <p class="calc-sub">Drag to see how the fee splits at different rent amounts</p>
        <div class="calc-row">
          <label>Annual rent</label>
          <input type="range" id="rentSlider" min="40000" max="300000" step="5000" value="150000"/>
          <div class="calc-amount" id="rentAmt">₦150,000</div>
        </div>
        <div class="calc-split">
          <div class="calc-seg"><div class="cs-label">Total finder's fee (7%)</div><div class="cs-num" id="feeOut">₦10,500</div></div>
          <div class="calc-seg"><div class="cs-label">RoomLink platform (70%)</div><div class="cs-num" id="platOut">₦7,350</div></div>
          <div class="calc-seg" style="border:1px solid rgba(255,255,255,.2)"><div class="cs-label">Referring student earns (30%)</div><div class="cs-num" id="refOut">₦3,150</div></div>
        </div>
      </div>

      <div class="fee-note" style="margin-top:20px">
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M12 3 4.5 6v6c0 4.6 3.1 7.9 7.5 9 4.4-1.1 7.5-4.4 7.5-9V6L12 3Z"/><polyline points="9 12 11.3 14.3 15.5 10"/></svg>
        These are illustrative rates for this proposal (7% fee, 70/30 split). Final figures would be validated with real landlords before launch.
      </div>
    </div>
  `;

  const slider = $('rentSlider');
  slider.addEventListener('input', () => {
    const rent = Number(slider.value);
    const { fee, platform, referrer } = computeFee(rent);
    $('rentAmt').textContent = naira(rent);
    $('feeOut').textContent = naira(fee);
    $('platOut').textContent = naira(platform);
    $('refOut').textContent = naira(referrer);
  });
}

// =============================================
// DASHBOARD VIEW
// =============================================
async function renderDashboard() {
  if (!state.user) { switchView('browse'); return; }

  $('main').innerHTML = `
    <div class="hero">
      <div class="eyebrow">My Account</div>
      <h1>Hello, ${esc(state.user.full_name.split(' ')[0])}</h1>
    </div>
    <div class="dashboard-grid" id="statsRow">
      <div class="skeleton" style="height:90px;border-radius:16px;"></div>
      <div class="skeleton" style="height:90px;border-radius:16px;"></div>
    </div>
    <h3 class="section-title">My Listings</h3>
    <div id="myListingsWrap"><div class="skeleton" style="height:60px;border-radius:14px;margin-bottom:10px;"></div></div>
  `;

  try {
    const { listings } = await apiFetch('/api/listings/my/listings');
    state.myListings = listings;

    const available = listings.filter(l => l.status === 'available').length;
    const rented = listings.filter(l => l.status === 'rented').length;

    $('statsRow').innerHTML = `
      <div class="stat-card">
        <div class="stat-icon"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5a1 1 0 0 0 1 1H17.5a1 1 0 0 0 1-1V10"/></svg></div>
        <div><div class="stat-num">${available}</div><div class="stat-label">Active listings</div></div>
      </div>
      <div class="stat-card">
        <div class="stat-icon" style="background:#F0EEF8"><svg viewBox="0 0 24 24" fill="none" stroke="#5B4A9E" stroke-width="2" stroke-linecap="round"><polyline points="20 6 9 17 4 12"/></svg></div>
        <div><div class="stat-num">${rented}</div><div class="stat-label">Rooms filled</div></div>
      </div>
    `;

    $('myListingsWrap').innerHTML = listings.length ? listings.map(l => `
      <div class="listing-row">
        <div class="listing-row-icon" style="background:${thumbColors(l.id)[0]};color:${thumbColors(l.id)[1]}">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"><path d="M3 11.5 12 4l9 7.5"/><path d="M5.5 10v9.5a1 1 0 0 0 1 1H17.5a1 1 0 0 0 1-1V10"/></svg>
        </div>
        <div class="listing-row-info">
          <h4>${esc(l.title)}</h4>
          <p>${rtLabel(l.room_type)} · ${esc(l.location)} · ${naira(l.price)}/yr</p>
        </div>
        <span class="status-pill status-${l.status}">${l.status.charAt(0).toUpperCase() + l.status.slice(1)}</span>
      </div>
    `).join('') : `<div class="empty" style="padding:30px"><p>You haven't listed any rooms yet. <button class="btn-ghost" onclick="switchView('list')" style="font-size:13px;padding:8px 14px;margin-left:6px">List a room</button></p></div>`;

  } catch (err) {
    showToast(err.message, true);
  }
}

// =============================================
// NAVIGATION
// =============================================
function switchView(view) {
  state.view = view;
  document.querySelectorAll('.tab-btn').forEach(b => b.classList.toggle('active', b.dataset.view === view));
  const main = $('main');
  main.innerHTML = '';
  if (view === 'browse') renderBrowse();
  else if (view === 'list') renderListForm();
  else if (view === 'fees') renderFees();
  else if (view === 'dashboard') renderDashboard();
  window.scrollTo({ top: 0, behavior: 'smooth' });
}

document.querySelectorAll('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => switchView(btn.dataset.view));
});

// =============================================
// INIT
// =============================================
async function init() {
  loadAuth();

  // Load locations for filter
  try {
    const { locations } = await apiFetch('/api/listings/locations');
    state.locations = locations;
  } catch (_) {}

  renderBrowse();
}

init();
