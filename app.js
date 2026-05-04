/* =========================================================
   CLAIMLY – App Logic (app.js)
   ========================================================= */

// =========================================================
// PRICING CONFIG — never hard-code prices in HTML; always
// pull from this object so prices can be updated in one place.
// =========================================================
const PRICING = {
  income_protection: {
    bronze: {
      name: 'BRONZE',
      premium: 80,
      benefit: 'R5,000/month',
      benefitRaw: 5000,
      period: 'Up to 7 months',
      covers: ['Illness', 'Injury', 'Retrenchment'],
      builtFor: 'Street vendors · Domestic workers · Part-time earners',
      channel: 'WhatsApp · USSD · App'
    },
    silver: {
      name: 'SILVER',
      premium: 100,
      benefit: 'R10,000/month',
      benefitRaw: 10000,
      period: 'Up to 7 months',
      covers: ['Illness', 'Injury', 'Retrenchment'],
      builtFor: 'Retail workers · Cashiers · Fixed-term employees',
      channel: 'App · WhatsApp'
    },
    gold: {
      name: 'GOLD',
      premium: 150,
      benefit: 'R15,000/month',
      benefitRaw: 15000,
      period: 'Up to 7 months',
      covers: ['Illness', 'Injury', 'Retrenchment'],
      builtFor: 'Salaried workers · Self-employed · Small business owners',
      channel: 'App'
    }
  },
  excess_cover: {
    bronze: {
      name: 'BRONZE',
      premium: 49,
      benefit: 'Up to R3,000',
      benefitRaw: 3000,
      period: 'Per approved claim',
      covers: ['Accidents', 'Theft', 'Hijacking', 'Third-party'],
      builtFor: 'Vehicle-owning LSM 5–7 workers',
      channel: 'WhatsApp · USSD · App'
    },
    silver: {
      name: 'SILVER',
      premium: 99,
      benefit: 'Up to R6,000',
      benefitRaw: 6000,
      period: 'Per approved claim',
      covers: ['Accidents', 'Theft', 'Hijacking', 'Third-party'],
      builtFor: 'Vehicle-owning LSM 5–7 workers',
      channel: 'App · WhatsApp'
    },
    gold: {
      name: 'GOLD',
      premium: 179,
      benefit: 'Up to R10,000',
      benefitRaw: 10000,
      period: 'Per approved claim',
      covers: ['Accidents', 'Theft', 'Hijacking', 'Third-party'],
      builtFor: 'Vehicle-owning LSM 5–7 workers',
      channel: 'App'
    }
  }
};

// =========================================================
// API CONFIG — env-config.js sets window.__CLAIMLY_API_ORIGIN__
// =========================================================
const API_ORIGIN =
  (typeof window !== 'undefined' && window.__CLAIMLY_API_ORIGIN__) ?
    String(window.__CLAIMLY_API_ORIGIN__).replace(/\/$/, '') :
    'http://localhost:3001';
const API_BASE = `${API_ORIGIN}/api`;

// =========================================================
// STATE — persisted to localStorage
// =========================================================
let state = {
  user: null,        // { name, saId, phone, email, employer, payment, bank, accNum }
  policy: null,      // { product, tier, premium, benefit, coverPeriod, startDate, nextDebit, policyNumber }
  claims: [],        // array of claim objects
  payments: [],      // array of payment objects
  isLoggedIn: false,
  isAdmin: false,
  userToken: null,
  adminToken: null,
  notifications: [], // array of { at, title, body, ref }
  notifSeen: {},     // map claimRef -> last known status
  // transient (not persisted)
  selectedProduct: 'income_protection',
  selectedTier: null,
  pendingSignup: null,
  adminClaimsCache: [],
  currentClaimType: null,
  uploadedFiles: [],
  generatedOTP: null,
  loginGeneratedOTP: null
};

function saveState() {
  const toSave = {
    user: state.user,
    policy: state.policy,
    claims: state.claims,
    payments: state.payments,
    notifications: state.notifications,
    notifSeen: state.notifSeen,
    isLoggedIn: state.isLoggedIn,
    isAdmin: state.isAdmin,
    userToken: state.userToken,
    adminToken: state.adminToken
  };
  localStorage.setItem('claimly_state', JSON.stringify(toSave));
}

function loadState() {
  try {
    const saved = localStorage.getItem('claimly_state');
    if (saved) {
      const parsed = JSON.parse(saved);
      Object.assign(state, parsed);
    }
  } catch (e) {
    console.warn('Failed to load state:', e);
  }
}

// =========================================================
// UTILITIES
// =========================================================
function fmt(amount) {
  return 'R' + Number(amount).toLocaleString('en-ZA');
}

function escapeHtml(s) {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

function generateOTP() {
  return String(Math.floor(1000 + Math.random() * 9000));
}

function generateClaimRef() {
  return 'CLM-' + Date.now().toString().slice(-6);
}

function generatePolicyNumber() {
  return 'POL-' + Date.now().toString().slice(-8);
}

function formatDate(dateStr) {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-ZA', { day: '2-digit', month: 'short', year: 'numeric' });
}

function addMonths(date, n) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d.toISOString().split('T')[0];
}

function addDays(date, n) {
  const d = new Date(date);
  d.setDate(d.getDate() + n);
  return d.toISOString().split('T')[0];
}

function today() {
  return new Date().toISOString().split('T')[0];
}

function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(' ');
  return (parts[0][0] + (parts[1] ? parts[1][0] : '')).toUpperCase();
}

function validateSAID(id) {
  return /^\d{13}$/.test(id);
}

function validatePhone(p) {
  return /^0[6-8]\d{8}$/.test(p.replace(/\s/g, ''));
}

// =========================================================
// TOAST NOTIFICATIONS
// =========================================================
function showToast(message, type = 'info', duration = 3500) {
  const tc = document.getElementById('toastContainer');
  const icons = {
    info:    `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 16v-4"/><path d="M12 8h.01"/></svg>`,
    success: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"/><path d="m9 11 3 3L22 4"/></svg>`,
    error:   `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="m15 9-6 6"/><path d="m9 9 6 6"/></svg>`,
    warning: `<svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3Z"/><path d="M12 9v4"/><path d="M12 17h.01"/></svg>`,
  };
  const t = document.createElement('div');
  t.className = `toast ${type}`;
  t.innerHTML = `<span class="toast-icon">${icons[type] || icons.info}</span><span>${message}</span>`;
  tc.appendChild(t);
  setTimeout(() => { t.style.opacity = '0'; t.style.transform = 'translateY(-10px)'; t.style.transition = 'all 0.3s'; setTimeout(() => t.remove(), 300); }, duration);
}

// =========================================================
// MODAL
// =========================================================
function openModal(html) {
  document.getElementById('modalContent').innerHTML = html;
  document.getElementById('modalOverlay').classList.add('open');
}
function closeModal() {
  document.getElementById('modalOverlay').classList.remove('open');
}
document.addEventListener('DOMContentLoaded', () => {
  document.getElementById('modalOverlay').addEventListener('click', (e) => {
    if (e.target === document.getElementById('modalOverlay')) closeModal();
  });
});

// =========================================================
// ROUTER — screen switcher
// =========================================================
const App = {
  clearUserSession({ keepPendingSignup = false } = {}) {
    // Hard reset all user-scoped data so the next account can't see the previous account's info.
    state.user = null;
    state.policy = null;
    state.claims = [];
    state.payments = [];
    state.notifications = [];
    state.notifSeen = {};

    state.isLoggedIn = false;
    state.isAdmin = false;

    state.userToken = null;
    state.adminToken = null;

    state.pendingSignup = keepPendingSignup ? state.pendingSignup : null;
    state.adminClaimsCache = [];
    state.currentClaimType = null;
    state.currentClaimRef = null;
    state.uploadedFiles = [];
    state.generatedOTP = null;
    state.loginGeneratedOTP = null;

    if (state.userPollTimer) clearInterval(state.userPollTimer);
    state.userPollTimer = null;

    saveState();
  },

  go(screenId) {
    // If the user navigates back to any auth/onboarding screen, wipe previous account data.
    // This prevents showing stale info when switching between accounts on the same device.
    const authScreens = new Set(['screen-welcome', 'screen-details', 'screen-login', 'screen-login-otp']);
    if (authScreens.has(screenId)) this.clearUserSession();

    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    const target = document.getElementById(screenId);
    if (target) {
      target.classList.add('active');
      target.scrollTop = 0;
      if (window.lucide) lucide.createIcons();
    }
  },

  async apiRequest(path, { method = 'GET', token = null, body = null } = {}) {
    const headers = {};
    if (token) headers['Authorization'] = `Bearer ${token}`;
    headers['Content-Type'] = 'application/json';

    const url = `${API_BASE}${path}`;
    let res;
    try {
      res = await fetch(url, {
        method,
        headers,
        body: body ? JSON.stringify(body) : undefined,
      });
    } catch (netErr) {
      const hint =
        'Cannot reach API. Check CORS on the backend, the API URL, or wait if the host was asleep.';
      const msg = netErr?.message ? `${netErr.message} — ${hint}` : hint;
      showToast(msg, 'error');
      throw new Error(msg);
    }

    const text = await res.text();
    let data = null;
    try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }

    if (!res.ok) {
      const msg = data?.error || `Request failed (${res.status})`;
      showToast(msg, 'error');
      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  },

  // -------------------------------------------------------
  // ONBOARDING FLOW
  // -------------------------------------------------------
  async init() {
    loadState();
    state.notifications = Array.isArray(state.notifications) ? state.notifications : [];
    state.notifSeen = state.notifSeen || {};
    if (state.user && !state.user.notificationPrefs) {
      state.user.notificationPrefs = { claims: true, debit: true };
    }

    const wantsAdmin = window.location.hash === '#admin';

    // Admin mode is only active when URL is #admin
    if (wantsAdmin) {
      // Never fall back into user screens while in admin mode.
      state.isAdmin = true;
      state.isLoggedIn = false;
      state.userToken = null;
      if (state.userPollTimer) clearInterval(state.userPollTimer);
      state.userPollTimer = null;
      saveState();

      if (state.adminToken) {
        this.go('screen-admin');
        this.adminSetTab('claims');
        await this.refreshAdminClaims();
      } else {
        this.go('screen-admin-login');
      }
      return;
    }

    if (state.userToken) {
      state.isAdmin = false;
      state.isLoggedIn = true;
      await this.refreshUserData();
      this.startUserPolling();
      this.goDashboard();
      return;
    }

    // Backwards-compatible fallback (old localStorage demo data)
    if (state.isAdmin) {
      this.go('screen-admin');
      this.renderAdminClaims();
      return;
    }
    if (state.isLoggedIn && state.user && state.policy) {
      this.initClaimNotificationBaseline();
      this.goDashboard();
      return;
    }
    this.go('screen-welcome');
  },

  // Welcome CTA buttons
  // (wired up via onclick in HTML)

  switchProduct(type) {
    state.selectedProduct = type === 'income' ? 'income_protection' : 'excess_cover';
    state.selectedTier = null;

    const tabIP = document.getElementById('tab-ip');
    const tabEx = document.getElementById('tab-ex');
    tabIP.classList.toggle('active', type === 'income');
    tabEx.classList.toggle('active', type === 'excess');

    const info = {
      income_protection: {
        title: 'Income Protection',
        desc: 'Monthly income replacement if you can\'t work due to illness, injury, or retrenchment. Pays within 48 hours.'
      },
      excess_cover: {
        title: 'Excess Fee Cover',
        desc: 'Pays your vehicle insurance excess on approved claims. No cash handling. Covers accidents, theft, hijacking, and third-party claims.'
      }
    };
    const p = state.selectedProduct;
    document.getElementById('planProductTitle').textContent = info[p].title;
    document.getElementById('planProductDesc').textContent = info[p].desc;
    this.renderTierCards();
  },

  renderTierCards() {
    const container = document.getElementById('tierCardsContainer');
    const tiers = PRICING[state.selectedProduct];
    container.innerHTML = '';
    ['bronze', 'silver', 'gold'].forEach((tier) => {
      const t = tiers[tier];
      const isPopular = tier === 'silver';
      const colorClass = tier; // bronze, silver, gold
      const selectedClass = state.selectedTier === tier ? `selected-${colorClass}` : '';
      const coverPills = t.covers.map(c => `<span class="cover-pill">${c}</span>`).join('');
      container.innerHTML += `
        <div class="tier-card ${selectedClass}" id="tierCard-${tier}" onclick="App.selectTier('${tier}')">
          ${isPopular ? '<div class="popular-tag"><svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="currentColor" stroke="none"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg> Most Popular</div>' : ''}
          <div class="tier-name" style="color:${tier === 'gold' ? 'var(--gold)' : tier === 'silver' ? 'var(--teal)' : 'var(--gold)'};">${t.name}</div>
          <div class="tier-price">${fmt(t.premium)}<span>/month</span></div>
          <div class="tier-benefit">${t.benefit} · ${t.period}</div>
          <div class="tier-covers">${coverPills}</div>
          <div style="font-size:11px;color:var(--text-secondary);">Built for: ${t.builtFor}</div>
        </div>`;
    });
    if (window.lucide) lucide.createIcons();
  },

  selectTier(tier) {
    state.selectedTier = tier;
    ['bronze', 'silver', 'gold'].forEach(t => {
      const card = document.getElementById(`tierCard-${t}`);
      if (card) {
        card.className = `tier-card${t === tier ? ` selected-${t}` : ''}`;
        if (t === tier) {
          card.querySelector('.tier-name').style.color =
            t === 'gold' ? 'var(--gold)' : t === 'silver' ? 'var(--teal)' : 'var(--gold)';
        }
      }
    });
  },

  confirmPlan() {
    if (!state.selectedTier) {
      showToast('Please select a tier before continuing', 'warning');
      return;
    }
    this.go('screen-details');
  },

  async submitDetails() {
    // Starting a new signup for a new account must wipe any previous account data.
    this.clearUserSession();

    const name    = document.getElementById('inputFullName').value.trim();
    const saId    = document.getElementById('inputSAID').value.trim();
    const phone   = document.getElementById('inputPhone').value.trim();
    const email   = document.getElementById('inputEmail').value.trim();
    const employer= document.getElementById('inputEmployer').value.trim();
    const payment = document.getElementById('inputPayment').value;

    let valid = true;
    const show = (id, show) => {
      const el = document.getElementById(id);
      if (el) el.classList.toggle('show', show);
    };

    if (!name) { show('errFullName', true); valid = false; } else show('errFullName', false);
    if (!validateSAID(saId)) { show('errSAID', true); valid = false; } else show('errSAID', false);
    if (!validatePhone(phone)) { show('errPhone', true); valid = false; } else show('errPhone', false);
    if (!employer) { show('errEmployer', true); valid = false; } else show('errEmployer', false);
    if (!payment) { show('errPayment', true); valid = false; } else show('errPayment', false);

    if (!valid) { showToast('Please fix the errors above', 'error'); return; }

    const bank   = document.getElementById('inputBank')?.value || '';
    const accNum = document.getElementById('inputAccNum')?.value || '';

    state.user = {
      name,
      saId,
      phone,
      email,
      employer,
      payment,
      bank,
      accNum,
      notificationPrefs: { claims: true, debit: true }
    };

    state.pendingSignup = {
      user: {
        fullName: name,
        saId,
        email,
        employer,
        paymentMethod: payment,
        bank,
        accNum,
      },
      subscription: {
        product: state.selectedProduct,
        tier: state.selectedTier,
      },
    };

    try {
      const data = await this.apiRequest('/auth/request-otp', {
        method: 'POST',
        body: { phone, purpose: 'signup' },
      });

      state.generatedOTP = data?.otp || null; // demo mode hint (should be null in compliant mode)
      document.getElementById('otpPhoneDisplay').textContent = phone;
      const demoWrap = document.getElementById('demoOtpContainer');
      if (demoWrap) demoWrap.style.display = state.generatedOTP ? 'block' : 'none';
      document.getElementById('demoOtpHint').textContent = state.generatedOTP || '';
      this.setupOtpInputs('otpGroup', 'otp');
      this.go('screen-otp');
      showToast(`OTP sent via SMS/WhatsApp to ${phone}`, 'success');
    } catch (_) {
      /* Error toast already shown in apiRequest */
    }
  },

  setupOtpInputs(groupId, prefix) {
    [0,1,2,3].forEach(i => {
      const inp = document.getElementById(`${prefix}${i}`);
      if (!inp) return;
      inp.value = '';
      inp.addEventListener('input', (e) => {
        e.target.value = e.target.value.replace(/\D/g,'').slice(-1);
        if (e.target.value && i < 3) document.getElementById(`${prefix}${i+1}`).focus();
      });
      inp.addEventListener('keydown', (e) => {
        if (e.key === 'Backspace' && !e.target.value && i > 0)
          document.getElementById(`${prefix}${i-1}`).focus();
      });
    });
  },

  getOtpValue(prefix) {
    return [0,1,2,3].map(i => document.getElementById(`${prefix}${i}`)?.value || '').join('');
  },

  async verifyOTP() {
    // Ensure a fresh user context for this signup attempt.
    // We still rely on `otpPhoneDisplay` for phone, not `state.user`.
    this.clearUserSession({ keepPendingSignup: true });

    const entered = this.getOtpValue('otp');
    if (entered.length < 4) { showToast('Please enter the complete 4-digit OTP', 'warning'); return; }

    const phone = state.user?.phone || document.getElementById('otpPhoneDisplay')?.textContent || '';
    if (!phone) { showToast('Phone number missing', 'error'); return; }
    if (!state.pendingSignup) { showToast('Missing signup data', 'error'); return; }

    try {
      const data = await this.apiRequest('/auth/verify-otp', {
        method: 'POST',
        body: {
          phone,
          purpose: 'signup',
          code: entered,
          signupData: state.pendingSignup,
        },
      });

      state.userToken = data.token;
      state.adminToken = null;
      state.isLoggedIn = true;
      state.isAdmin = false;

      state.user = data.user;
      state.policy = data.policy;

      // Fetch claims/payments silently for dashboard later.
      await this.refreshUserData(false);
      this.startUserPolling();
      state.pendingSignup = null;
      saveState();

      const pol = state.policy;
      document.getElementById('cvProduct').textContent = pol.productLabel;
      document.getElementById('cvTier').textContent = pol.tier.toUpperCase();
      document.getElementById('cvPremium').textContent = fmt(pol.premium) + '/month';
      document.getElementById('cvBenefit').textContent = pol.benefit;
      document.getElementById('cvCovers').textContent = pol.covers;
      document.getElementById('cvStart').textContent = formatDate(pol.startDate);
      document.getElementById('cvNextDebit').textContent = formatDate(pol.nextDebit);

      this.go('screen-covered');
    } catch (e) {
      showToast('OTP verification failed. Please try again.', 'error');
    }
  },

  async resendOTP() {
    const phone = state.user?.phone || document.getElementById('otpPhoneDisplay')?.textContent || '';
    if (!phone) { showToast('Phone number missing', 'error'); return; }
    try {
      const data = await this.apiRequest('/auth/request-otp', {
        method: 'POST',
        body: { phone, purpose: 'signup' },
      });
      state.generatedOTP = data?.otp || null;
      document.getElementById('demoOtpHint').textContent = state.generatedOTP || '';
      showToast(`New OTP sent via SMS/WhatsApp to ${phone}`, 'success');
    } catch (_) {
      /* Error toast already shown in apiRequest */
    }
  },

  goDashboard() {
    this.go('screen-dashboard');
    this.renderDashboard();
  },

  async refreshUserData(render = true) {
    if (!state.userToken) return;
    const token = state.userToken;
    const [policyRes, claimsRes, paymentsRes, notificationsRes] = await Promise.all([
      this.apiRequest('/me/policy', { token }),
      this.apiRequest('/me/claims', { token }),
      this.apiRequest('/me/payments', { token }),
      this.apiRequest('/me/notifications', { token }).catch(() => ({ notifications: [] })),
    ]);

    state.policy = policyRes.policy;
    state.claims = claimsRes.claims;
    state.payments = paymentsRes.payments;
    if (notificationsRes?.notifications) state.notifications = notificationsRes.notifications;

    // Ensure notification prefs exist
    if (state.user && !state.user.notificationPrefs) state.user.notificationPrefs = { claims: true, debit: true };
    this.initClaimNotificationBaseline();
    if (render) {
      this.renderDashboard();
      this.renderPayments();
    }
  },

  async refreshAdminClaims() {
    if (!state.adminToken) return;
    await this.renderAdminClaims();
  },

  adminSetTab(tab) {
    state.adminTab = tab;
    const usersPanel = document.getElementById('adminUsersPanel');
    const stats = document.getElementById('adminStats');
    const claimsContainer = document.getElementById('adminClaimsContainer');
    const claimsHeader = document.getElementById('adminStatusFilter')?.closest('div')?.parentElement;
    const claimsTitleRow = document.getElementById('adminStatusFilter')?.closest('div')?.parentElement;
    // Simpler: toggle by known elements
    if (usersPanel) usersPanel.style.display = tab === 'users' ? 'block' : 'none';
    if (stats) stats.style.display = tab === 'claims' ? 'grid' : 'none';
    if (claimsTitleRow) claimsTitleRow.style.display = tab === 'claims' ? 'flex' : 'none';
    if (claimsContainer) claimsContainer.style.display = tab === 'claims' ? 'block' : 'none';

    const btnClaims = document.getElementById('adminTabClaims');
    const btnUsers = document.getElementById('adminTabUsers');
    if (btnClaims) btnClaims.style.opacity = tab === 'claims' ? '1' : '0.6';
    if (btnUsers) btnUsers.style.opacity = tab === 'users' ? '1' : '0.6';

    if (tab === 'users') this.renderAdminUsers();
    if (tab === 'claims') this.renderAdminClaims();
  },

  async renderAdminUsers() {
    if (!state.adminToken) return;
    const container = document.getElementById('adminUsersContainer');
    const empty = document.getElementById('adminUsersEmpty');
    if (!container) return;
    const q = encodeURIComponent((document.getElementById('adminUserSearch')?.value || '').trim());

    let users = [];
    try {
      const res = await this.apiRequest(`/admin/users?q=${q}`, { token: state.adminToken });
      users = res?.users || [];
    } catch (e) {}

    if (!users.length) {
      container.innerHTML = '';
      if (empty) empty.style.display = 'block';
      return;
    }
    if (empty) empty.style.display = 'none';

    container.innerHTML = users.map(u => `
      <div class="card" style="padding:14px 16px;margin-bottom:10px;">
        <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;">
          <div>
            <div style="font-size:14px;font-weight:800;color:var(--navy);">${u.name || 'Subscriber'}</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${u.phone}${u.policy ? ` · ${u.policy.tier.toUpperCase()} · ${u.policy.product}` : ''}</div>
            <div style="font-size:11px;color:var(--mid-gray);margin-top:2px;">Claims: ${u.claimCount}</div>
          </div>
          <button class="btn btn-secondary btn-sm" style="width:auto;" onclick="App.adminViewUser('${u.phone}')">View</button>
        </div>
      </div>
    `).join('');
    if (window.lucide) lucide.createIcons();
  },

  async adminViewUser(phone) {
    if (!state.adminToken) return;
    try {
      const res = await this.apiRequest(`/admin/users/${encodeURIComponent(phone)}`, { token: state.adminToken });
      const u = res.user;
      const pol = res.policy;
      const claims = res.claims || [];
      const html = `
        <div>
          <div class="modal-title">User</div>
          <div style="font-size:14px;font-weight:800;color:var(--navy);">${u.name || 'Subscriber'}</div>
          <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">${u.phone} · SA ID: ${u.saIdMasked || '-'}</div>

          <div class="divider"></div>

          <p style="font-size:12px;font-weight:800;color:var(--navy);margin-bottom:8px;">Policy</p>
          ${pol ? `
            <div style="font-size:12px;color:var(--text-secondary);line-height:1.6;">
              <div><strong style="color:var(--text-primary);">Product:</strong> ${pol.productLabel}</div>
              <div><strong style="color:var(--text-primary);">Tier:</strong> ${pol.tier.toUpperCase()}</div>
              <div><strong style="color:var(--text-primary);">Premium:</strong> ${fmt(pol.premium)}/month</div>
              <div><strong style="color:var(--text-primary);">Next debit:</strong> ${pol.nextDebit}</div>
            </div>
          ` : `<div style="font-size:12px;color:var(--text-secondary);">No active policy</div>`}

          <div class="divider"></div>

          <p style="font-size:12px;font-weight:800;color:var(--navy);margin-bottom:8px;">Notification prefs</p>
          <div style="display:flex;gap:14px;align-items:center;">
            <label style="font-size:12px;color:var(--text-secondary);display:flex;gap:8px;align-items:center;">
              <input type="checkbox" id="adminUserPrefClaims" ${u.notificationPrefs?.claims === false ? '' : 'checked'} />
              Claim updates
            </label>
            <label style="font-size:12px;color:var(--text-secondary);display:flex;gap:8px;align-items:center;">
              <input type="checkbox" id="adminUserPrefDebit" ${u.notificationPrefs?.debit === false ? '' : 'checked'} />
              Debit reminders
            </label>
          </div>
          <button class="btn btn-primary btn-sm" style="width:100%;margin-top:12px;" onclick="App.adminSaveUserPrefs('${u.phone}')">Save Preferences</button>

          <div class="divider"></div>

          <p style="font-size:12px;font-weight:800;color:var(--navy);margin-bottom:8px;">Recent claims</p>
          ${claims.length ? claims.map(c => `
            <div style="padding:10px 0;border-bottom:1px solid var(--border);">
              <div style="display:flex;justify-content:space-between;align-items:center;">
                <div style="font-size:12px;font-weight:700;color:var(--navy);">${c.ref}</div>
                <span class="badge badge-${App.statusBadgeClass(c.status)}">${App.statusLabel(c.status)}</span>
              </div>
              <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;">${c.typeLabel} · ${c.date}</div>
            </div>
          `).join('') : `<div style="font-size:12px;color:var(--text-secondary);">No claims</div>`}

          <button class="btn btn-secondary" style="width:auto;margin-top:16px;" onclick="closeModal()">Close</button>
        </div>
      `;
      openModal(html);
    } catch (e) {
      showToast('Failed to load user', 'error');
    }
  },

  async adminSaveUserPrefs(phone) {
    if (!state.adminToken) return;
    const claims = document.getElementById('adminUserPrefClaims')?.checked ?? true;
    const debit = document.getElementById('adminUserPrefDebit')?.checked ?? true;
    try {
      await this.apiRequest(`/admin/users/${encodeURIComponent(phone)}`, {
        method: 'PATCH',
        token: state.adminToken,
        body: { notificationPrefs: { claims, debit } },
      });
      showToast('Preferences saved', 'success');
      closeModal();
      this.renderAdminUsers();
    } catch (e) {
      showToast('Failed to save preferences', 'error');
    }
  },

  startUserPolling() {
    // Simple polling for MVP/demo: keep UI in sync with backend.
    if (state.userPollTimer) clearInterval(state.userPollTimer);
    state.userPollTimer = setInterval(() => {
      this.pollUserUpdates().catch(() => {});
    }, 8000);
  },

  async pollUserUpdates() {
    if (!state.userToken || state.isAdmin) return;

    const activeId = document.querySelector('.screen.active')?.id;

    const prevNotifIds = new Set((state.notifications || []).map(n => String(n.id)));
    const [claimsRes, notifRes] = await Promise.all([
      this.apiRequest('/me/claims', { token: state.userToken }),
      this.apiRequest('/me/notifications', { token: state.userToken }).catch(() => ({ notifications: [] })),
    ]);

    if (claimsRes?.claims) state.claims = claimsRes.claims;
    if (notifRes?.notifications) state.notifications = notifRes.notifications;

    const newNotifs = (state.notifications || []).filter(n => !prevNotifIds.has(String(n.id)));
    if (newNotifs.length) {
      // Show the most recent one to keep UI calm.
      const latest = newNotifs[0];
      const title = latest.title || 'New notification';
      let toastType = 'info';
      if (/Paid|Approved/i.test(title)) toastType = 'success';
      else if (/Rejected/i.test(title)) toastType = 'error';
      else toastType = 'warning';
      showToast(title, toastType);
    }

    if (activeId === 'screen-dashboard') this.renderDashboard();
    if (activeId === 'screen-claim-track' && state.currentClaimRef) this.trackClaim(state.currentClaimRef);
  },

  // -------------------------------------------------------
  // LOGIN FLOW
  // -------------------------------------------------------
  async loginSendOTP() {
    // Starting a login for a new phone number must wipe any previous account data.
    this.clearUserSession();

    const phone = document.getElementById('loginPhone').value.trim();
    if (!validatePhone(phone)) {
      document.getElementById('errLoginPhone').classList.add('show');
      return;
    }
    document.getElementById('errLoginPhone').classList.remove('show');

    try {
      const data = await this.apiRequest('/auth/request-otp', {
        method: 'POST',
        body: { phone, purpose: 'login' },
      });
      state.loginGeneratedOTP = data?.otp || null;
      document.getElementById('loginOtpPhone').textContent = phone;
      const demoWrap = document.getElementById('loginDemoOtpContainer');
      if (demoWrap) demoWrap.style.display = state.loginGeneratedOTP ? 'block' : 'none';
      document.getElementById('loginOtpHint').textContent = state.loginGeneratedOTP || '';
      this.setupOtpInputs('loginOtpGroup', 'lotp');
      this.go('screen-login-otp');
      showToast(`OTP sent via SMS/WhatsApp to ${phone}`, 'success');
    } catch (_) {
      /* Error toast already shown in apiRequest */
    }
  },

  async verifyLoginOTP() {
    // Ensure a fresh user context for this login attempt.
    // We rely on `loginOtpPhone` DOM element for phone, not `state.user`.
    this.clearUserSession();

    const entered = this.getOtpValue('lotp');
    if (entered.length < 4) { showToast('Please enter the complete OTP', 'warning'); return; }
    const phone = document.getElementById('loginOtpPhone')?.textContent || state.user?.phone || '';
    if (!phone) { showToast('Phone number missing', 'error'); return; }

    try {
      const data = await this.apiRequest('/auth/verify-otp', {
        method: 'POST',
        body: { phone, purpose: 'login', code: entered },
      });

      state.userToken = data.token;
      state.adminToken = null;
      state.isLoggedIn = true;
      state.isAdmin = false;
      state.user = data.user;
      state.policy = data.policy;

      await this.refreshUserData(false);
      this.startUserPolling();
      state.pendingSignup = null;
      saveState();
      this.goDashboard();
      showToast(`Welcome back, ${state.user.name.split(' ')[0]}!`, 'success');
    } catch (e) {
      showToast('Login failed. Please try again.', 'error');
    }
  },

  logout() {
    this.clearUserSession();
    this.go('screen-welcome');
    showToast('Signed out successfully.', 'info');
  },

  // -------------------------------------------------------
  // BOTTOM NAV TABS
  // -------------------------------------------------------
  showTab(tab) {
    const map = {
      home:     'screen-dashboard',
      policy:   'screen-policy',
      claims:   'screen-claims',
      payments: 'screen-payments',
      profile:  'screen-profile'
    };
    if (!map[tab]) return;
    this.go(map[tab]);

    // Update active nav states across all navbars
    ['', '2', '3', '4', '5'].forEach(suffix => {
      ['home','policy','claims','payments','profile'].forEach(t => {
        const el = document.getElementById(`nav${suffix}-${t}`);
        if (el) el.classList.toggle('active', t === tab);
      });
    });

    if (tab === 'home') this.renderDashboard();
    if (tab === 'policy') this.renderPolicy();
    if (tab === 'payments') this.renderPayments();
    if (tab === 'profile') this.renderProfile();
  },

  // -------------------------------------------------------
  // DASHBOARD
  // -------------------------------------------------------
  renderDashboard() {
    if (!state.user || !state.policy) return;
    const pol = state.policy;
    const user = state.user;
    const initials = getInitials(user.name);

    document.getElementById('dashGreeting').textContent = user.name.split(' ')[0];
    document.getElementById('avatarCircle').textContent = initials;
    document.getElementById('dashPolicyType').textContent = pol.productLabel;
    document.getElementById('dashPolicySub').textContent = pol.covers;
    document.getElementById('dashPremium').textContent = fmt(pol.premium) + '/mo';
    document.getElementById('dashBenefit').textContent = pol.benefit;
    document.getElementById('dashNextDebit').textContent = formatDate(pol.nextDebit);

    const badge = document.getElementById('dashTierBadge');
    badge.textContent = pol.tier.toUpperCase();
    badge.className = `badge badge-${pol.tier}`;

    const ussdBanner = document.getElementById('ussdBanner');
    if (ussdBanner) ussdBanner.style.display = pol.tier === 'bronze' ? 'block' : 'none';

    this.renderDashClaimsPreview();
  },

  renderDashClaimsPreview() {
    const container = document.getElementById('dashClaimsPreview');
    if (!state.claims || state.claims.length === 0) {
      container.innerHTML = `<div class="empty-state" style="padding:28px 16px;">
        <div class="es-icon"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><line x1="16" y1="13" x2="8" y2="13"/><line x1="16" y1="17" x2="8" y2="17"/><line x1="10" y1="9" x2="8" y2="9"/></svg></div>
        <div class="es-title">No claims yet</div>
        <div class="es-desc">When you submit a claim, it will appear here for easy tracking.</div>
      </div>`;
      return;
    }
    // Show ALL user claims under "Recent Claims" (scroll within the section if needed).
    container.innerHTML = `
      <div style="max-height:420px;overflow-y:auto;padding-right:4px;">
        ${state.claims.map(c => `
          <div class="card" style="padding:14px 16px;margin-bottom:10px;cursor:pointer;" onclick="App.viewClaim('${c.ref}')">
            <div style="display:flex;justify-content:space-between;align-items:center;">
              <div>
                <p style="font-size:13px;font-weight:700;color:var(--navy);">${c.ref}</p>
                <p style="font-size:11px;color:var(--text-secondary);margin-top:2px;">${c.typeLabel} · ${formatDate(c.date)}</p>
              </div>
              <span class="badge badge-${App.statusBadgeClass(c.status)}">${App.statusLabel(c.status)}</span>
            </div>
          </div>
        `).join('')}
      </div>
    `;
    if (window.lucide) lucide.createIcons();
  },

  statusBadgeClass(s) {
    const map = { submitted:'review', under_review:'review', approved:'active', paid:'paid', rejected:'rejected' };
    return map[s] || 'review';
  },
  statusLabel(s) {
    const map = { submitted:'Submitted', under_review:'Under Review', approved:'Approved', paid:'Paid', rejected:'Rejected' };
    return map[s] || s;
  },

  // -------------------------------------------------------
  // MY POLICY
  // -------------------------------------------------------
  renderPolicy() {
    if (!state.policy) return;
    const pol = state.policy;
    document.getElementById('policyProduct').textContent = pol.productLabel;
    document.getElementById('policyPremium').textContent = fmt(pol.premium) + '/month';
    document.getElementById('policyBenefit').textContent = pol.benefit;
    document.getElementById('policyNumber').textContent  = pol.policyNumber;
    document.getElementById('policyStartDate').textContent = formatDate(pol.startDate);
    document.getElementById('policyNextDebit').textContent = formatDate(pol.nextDebit);
    document.getElementById('policyCovers').textContent  = pol.covers;
    const coverEl = document.getElementById('policyCoverPeriod');
    if (coverEl) coverEl.textContent = pol.coverPeriod || '-';
    const pm = state.user?.payment;
    document.getElementById('policyPayment').textContent = pm === 'debit_order' ? 'Debit Order' : pm === 'easypay' ? 'EasyPay' : '-';
    const badge = document.getElementById('policyTierBadge');
    badge.textContent = pol.tier.toUpperCase();
    badge.className = `badge badge-${pol.tier}`;
  },

  // -------------------------------------------------------
  // CLAIMS FLOW
  // -------------------------------------------------------
  selectClaimType(type) {
    state.currentClaimType = type;
    ['illness','injury','retrenchment','excess'].forEach(t => {
      document.getElementById(`ct-${t}`)?.classList.toggle('selected', t === type);
    });
    const btn = document.getElementById('btnClaimNext');
    if (btn) { btn.disabled = false; btn.style.opacity = '1'; }
  },

  goUploadDocs() {
    if (!state.currentClaimType) { showToast('Please select a claim type', 'warning'); return; }
    const labels = {
      illness: 'Illness',
      injury: 'Injury',
      retrenchment: 'Retrenchment',
      excess: 'Vehicle Excess'
    };
    const hints = {
      illness: 'Upload a doctor\'s note, sick note, or hospital letter confirming your illness.',
      injury: 'Upload a medical report, hospital letter, or workplace accident report.',
      retrenchment: 'Upload your retrenchment letter or UIF registration confirmation.',
      excess: 'Upload a copy of your insurer\'s excess invoice or repair quote.'
    };
    document.getElementById('uploadClaimTypeLabel').textContent = labels[state.currentClaimType] || state.currentClaimType;
    document.getElementById('uploadDocHint').textContent = hints[state.currentClaimType] || 'Upload supporting documents for your claim.';
    const ex = document.getElementById('excessPayoutFields');
    if (ex) ex.style.display = state.currentClaimType === 'excess' ? 'block' : 'none';
    state.uploadedFiles = [];
    document.getElementById('uploadedFiles').innerHTML = '';
    this.go('screen-upload');
  },

  handleFileUpload(event) {
    const files = Array.from(event.target.files);
    files.forEach(f => {
      if (f.size > 10 * 1024 * 1024) { showToast(`${f.name} is too large (max 10MB)`, 'error'); return; }
      // Keep the actual File objects so submitClaim() can upload them after we clear the input.
      state.uploadedFiles.push({ file: f, name: f.name, size: f.size, type: f.type });
      const container = document.getElementById('uploadedFiles');
      const sizeLabel = f.size > 1024*1024 ? `${(f.size/1024/1024).toFixed(1)}MB` : `${Math.round(f.size/1024)}KB`;
      const icon = f.type.includes('pdf')
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7.5L14.5 2z"/><polyline points="14 2 14 8 20 8"/><path d="M9 13h6"/><path d="M9 17h6"/></svg>`
        : `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" ry="2"/><circle cx="9" cy="9" r="2"/><path d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21"/></svg>`;
      container.innerHTML += `
        <div class="uploaded-file" id="uf-${f.name.replace(/\W/g,'_')}">
          <span class="uf-icon">${icon}</span>
          <div style="flex:1">
            <div class="uf-name">${f.name}</div>
            <div class="uf-size">${sizeLabel}</div>
          </div>
          <span class="uf-remove" onclick="App.removeFile('${f.name.replace(/'/g,'')}')">
            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
          </span>
        </div>`;
    });
    showToast(`${files.length} file(s) uploaded`, 'success');
  },

  removeFile(name) {
    state.uploadedFiles = state.uploadedFiles.filter(f => f.name !== name);
    const el = document.getElementById(`uf-${name.replace(/\W/g,'_')}`);
    if (el) el.remove();
  },

  async submitClaim() {
    if (!state.currentClaimType) { showToast('No claim type selected', 'error'); return; }
    if (!state.userToken) { showToast('Please login again', 'error'); return; }

    try {
      const notes = document.getElementById('claimNotes')?.value || '';
      // Prefer state.uploadedFiles (we store File objects there), but also fall back to the live input.
      const pickedFromState = (state.uploadedFiles || []).map(x => x?.file).filter(Boolean);
      const inputEl = document.getElementById('fileInput');
      const pickedFromInput = inputEl?.files ? Array.from(inputEl.files) : [];
      const pickedFiles = pickedFromState.length ? pickedFromState : pickedFromInput;
      if (!pickedFiles.length) {
        showToast('Please upload at least one document before submitting.', 'error');
        return;
      }

      const form = new FormData();
      form.append('type', state.currentClaimType);
      form.append('notes', notes);
      if (state.currentClaimType === 'excess') {
        const kind = document.getElementById('excessPayoutKind')?.value || 'insurer';
        const name = document.getElementById('excessPayoutName')?.value || '';
        const reference = document.getElementById('excessPayoutReference')?.value || '';
        const details = document.getElementById('excessPayoutDetails')?.value || '';
        form.append('payoutKind', kind);
        form.append('payoutName', name);
        form.append('payoutReference', reference);
        form.append('payoutDetails', details);
      }
      pickedFiles.forEach(f => form.append('files', f, f.name));

      const res = await fetch(`${API_BASE}/me/claims`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${state.userToken}` },
        body: form,
      });
      const text = await res.text();
      let data = null;
      try { data = text ? JSON.parse(text) : null; } catch (_) { data = null; }
      if (!res.ok) throw new Error(data?.error || `Claim submission failed (${res.status})`);

      const claim = data?.claim;
      if (!claim) throw new Error('Missing claim response');

      state.claims = Array.isArray(state.claims) ? state.claims : [];
      state.claims.push(claim);
      saveState();

      // Populate confirmation screen
      document.getElementById('claimRefDisplay').textContent = claim.ref;
      document.getElementById('claimTypeDisplay').textContent = claim.typeLabel;
      document.getElementById('claimSubmittedDate').textContent = formatDate(claim.date);
      document.getElementById('claimPayoutAmount').textContent = state.policy?.benefit || fmt(claim.amount);

      const nextPayoutEl = document.getElementById('claimNextPayoutDate');
      if (nextPayoutEl && claim.nextPayoutDate) nextPayoutEl.textContent = formatDate(claim.nextPayoutDate);

      if (data?.payoutAccount) document.getElementById('claimPayoutAccount').textContent = data.payoutAccount;
      else {
        const bank = state.user?.bank || 'your bank';
        const accNum = state.user?.accNum ? state.user.accNum : 'on file';
        document.getElementById('claimPayoutAccount').textContent = `${bank} ${accNum}`;
      }

      state.currentClaimRef = claim.ref;

      // Clear upload UI/state after successful submission to avoid duplicate uploads.
      state.uploadedFiles = [];
      const uploadedContainer = document.getElementById('uploadedFiles');
      if (uploadedContainer) uploadedContainer.innerHTML = '';
      if (inputEl) inputEl.value = '';

      this.go('screen-claim-confirm');
      showToast('Claim submitted successfully!', 'success');
    } catch (e) {
      showToast('Claim submission failed. Please try again.', 'error');
    }
  },

  trackClaim(ref) {
    const claimRef = ref || state.currentClaimRef;
    const claim = state.claims?.find(c => c.ref === claimRef) || (state.claims?.length ? state.claims[state.claims.length - 1] : null);
    if (!claim) { showToast('Claim not found', 'error'); return; }

    document.getElementById('trackClaimRef').textContent = claim.ref;
    document.getElementById('trackClaimType').textContent = claim.typeLabel + ' · Submitted ' + formatDate(claim.date);
    const badge = document.getElementById('trackStatusBadge');
    badge.textContent = this.statusLabel(claim.status);
    badge.className = `badge badge-${this.statusBadgeClass(claim.status)}`;

    const container = document.getElementById('claimTrackerSteps');
    if (!container) return;

    if (claim.status === 'rejected') {
      container.innerHTML = `
        <div class="tracker-step active">
          <div class="ts-circle"><svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg></div>
          <div class="ts-content">
            <div class="ts-label">Rejected</div>
            <div class="ts-date">${claim.rejectedDate ? formatDate(claim.rejectedDate) : formatDate(today())}</div>
            <div class="ts-desc">This claim could not be approved. Please contact support if you need help.</div>
          </div>
        </div>`;

      // Make the header reflect the final state.
      document.getElementById('trackClaimType').textContent =
        claim.typeLabel + ' · Submitted ' + formatDate(claim.date) + ' · Rejected';
      this.go('screen-claim-track');
      return;
    }

    const steps = [
      { key: 'submitted',    label: 'Submitted',     desc: 'Your claim has been received by our team.' },
      { key: 'under_review', label: 'Under Review',  desc: 'Our assessors are reviewing your documents.' },
      { key: 'approved',     label: 'Approved',      desc: 'Your claim has been approved for payout.' },
      { key: 'paid',         label: 'Paid',          desc: 'Payment sent within 48 hours to your account.' }
    ];
    const statusOrder = ['submitted','under_review','approved','paid'];
    let currentIdx  = statusOrder.indexOf(claim.status);
    if (currentIdx < 0) currentIdx = 0;

    const stepDates = {
      submitted: claim.date,
      under_review: claim.underReviewDate || null,
      approved: claim.approvedDate || null,
      paid: claim.paidDate || null
    };

    container.innerHTML = steps.map((s, i) => {
      let cls = '';
      if (i < currentIdx) cls = 'done';
      else if (i === currentIdx) cls = 'active';
      const icon = i < currentIdx
        ? `<svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><path d="M20 6 9 17l-5-5"/></svg>`
        : (i === currentIdx ? `<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="currentColor" stroke="none"><circle cx="12" cy="12" r="10"/></svg>` : '');
      const date = i <= currentIdx
        ? (stepDates[s.key] ? formatDate(stepDates[s.key]) : formatDate(today()))
        : 'Pending';

      return `
        <div class="tracker-step ${cls}">
          <div class="ts-circle">${icon}</div>
          <div class="ts-content">
            <div class="ts-label">${s.label}</div>
            <div class="ts-date">${date}</div>
            <div class="ts-desc">${s.desc}</div>
          </div>
        </div>`;
    }).join('');

    this.go('screen-claim-track');
  },

  viewClaim(ref) {
    this.trackClaim(ref);
  },

  // -------------------------------------------------------
  // PAYMENTS
  // -------------------------------------------------------
  renderPayments() {
    if (!state.policy || !state.user) return;
    document.getElementById('payNextDebitDate').textContent = formatDate(state.policy.nextDebit);
    document.getElementById('payAmount').textContent = fmt(state.policy.premium);
    const pm = state.user.payment;
    document.getElementById('payMethod').textContent = pm === 'debit_order' ? 'Debit Order' : pm === 'easypay' ? 'EasyPay' : '-';

    const list = document.getElementById('payHistoryList');
    if (!state.payments || state.payments.length === 0) {
      list.innerHTML = `<div class="empty-state" style="padding:28px 0;"><div class="es-icon"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 2v20l2-1 2 1 2-1 2 1 2-1 2 1 2-1 2 1V2l-2 1-2-1-2 1-2-1-2 1-2-1-2 1-2-1z"/><path d="M16 8H8"/><path d="M16 12H8"/><path d="M12 16H8"/></svg></div><div class="es-title">No payments yet</div></div>`;
      return;
    }
    list.innerHTML = [...state.payments].reverse().map(p => `
      <div class="card" style="padding:14px 16px;margin-bottom:8px;">
        <div style="display:flex;justify-content:space-between;align-items:center;">
          <div>
            <p style="font-size:13px;font-weight:700;color:var(--navy);">${fmt(p.amount)}</p>
            <p style="font-size:11px;color:var(--text-secondary);margin-top:2px;">${p.description}</p>
            <p style="font-size:10px;color:var(--text-secondary);">${formatDate(p.date)}</p>
          </div>
          <span class="badge badge-${p.status === 'paid' ? 'paid' : 'review'}">${p.status === 'paid' ? 'Paid' : 'Pending'}</span>
        </div>
      </div>`).join('');
  },

  async updatePayment() {
    const method = document.getElementById('updatePayMethod').value;
    if (!method) { showToast('Please select a payment method', 'warning'); return; }
    if (!state.userToken) { showToast('Please login again', 'error'); return; }
    try {
      await this.apiRequest('/me/profile', {
        method: 'PATCH',
        token: state.userToken,
        body: { paymentMethod: method },
      });
      state.user.payment = method;
      saveState();
      showToast('Payment method updated', 'success');
      this.renderPayments();
    } catch (e) {
      showToast('Failed to update payment method', 'error');
    }
  },

  // -------------------------------------------------------
  // PROFILE
  // -------------------------------------------------------
  renderProfile() {
    if (!state.user || !state.policy) return;
    const u = state.user;
    document.getElementById('profileName').textContent = u.name;
    document.getElementById('profileAvatar').textContent = getInitials(u.name);
    document.getElementById('profileEditName').value    = u.name || '';
    document.getElementById('profileEditID').value      = u.saId || '';
    document.getElementById('profileEditPhone').value   = u.phone || '';
    document.getElementById('profileEditEmail').value   = u.email || '';
    document.getElementById('profileEditEmployer').value = u.employer || '';
    document.getElementById('profileEditBank').value    = u.bank || '';
    document.getElementById('profileEditAccNum').value  = u.accNum || '';
    const badge = document.getElementById('profileTierBadge');
    badge.textContent = state.policy.tier.toUpperCase();
    badge.className = `badge badge-${state.policy.tier}`;

    const prefs = u.notificationPrefs || { claims: true, debit: true };
    const notifClaimsEl = document.getElementById('notifClaims');
    const notifDebitEl = document.getElementById('notifDebit');
    if (notifClaimsEl) notifClaimsEl.checked = prefs.claims !== false;
    if (notifDebitEl) notifDebitEl.checked = prefs.debit !== false;
  },

  async saveProfile() {
    if (!state.user || !state.userToken) return;
    const newPhone = document.getElementById('profileEditPhone').value.trim();
    if (newPhone && state.user.phone && newPhone !== state.user.phone) {
      showToast('Mobile number cannot be changed in MVP', 'warning');
      return;
    }

    const notifClaimsEl = document.getElementById('notifClaims');
    const notifDebitEl = document.getElementById('notifDebit');

    const payload = {
      fullName: document.getElementById('profileEditName').value.trim() || state.user.name,
      email: document.getElementById('profileEditEmail').value.trim(),
      employer: document.getElementById('profileEditEmployer').value.trim(),
      bank: document.getElementById('profileEditBank').value,
      accNum: document.getElementById('profileEditAccNum').value.trim(),
      notificationPrefs: {
        claims: notifClaimsEl ? notifClaimsEl.checked : true,
        debit: notifDebitEl ? notifDebitEl.checked : true
      },
    };

    try {
      const data = await this.apiRequest('/me/profile', {
        method: 'PATCH',
        token: state.userToken,
        body: payload,
      });

      state.user = data?.user || state.user;
      saveState();
      showToast('Profile saved', 'success');

      document.getElementById('profileAvatar').textContent = getInitials(state.user.name);
      document.getElementById('profileName').textContent = state.user.name;
      if (document.getElementById('avatarCircle'))
        document.getElementById('avatarCircle').textContent = getInitials(state.user.name);
      if (document.getElementById('dashGreeting'))
        document.getElementById('dashGreeting').textContent = state.user.name.split(' ')[0];
    } catch (e) {
      showToast('Failed to save profile', 'error');
    }
  },

  // -------------------------------------------------------
  // NOTIFICATIONS (in-app "push" for MVP/demo)
  // -------------------------------------------------------
  isClaimForCurrentUser(claim) {
    if (!state.user || !claim) return false;
    const myPhone = state.user.phone;
    const subPhone = claim.subscriber?.phone;
    if (myPhone && subPhone) return String(subPhone) === String(myPhone);

    // Fallback for older claims / missing phone.
    const saIdMasked = claim.subscriber?.saIdMasked;
    if (state.user.saId && saIdMasked) {
      const expected = `***${String(state.user.saId).slice(-4)}`;
      return expected === saIdMasked;
    }
    return false;
  },

  initClaimNotificationBaseline() {
    // Establish "seen" statuses so the user doesn't get spammed on initial load.
    if (state.isAdmin || !state.isLoggedIn) return;
    const myPhone = state.user?.phone;
    if (!myPhone) return;
    if (!state.notifSeen) state.notifSeen = {};

    let changed = false;
    (state.claims || [])
      .filter(c => this.isClaimForCurrentUser(c))
      .forEach(c => {
        if (!state.notifSeen[c.ref]) {
          state.notifSeen[c.ref] = c.status;
          changed = true;
        }
      });

    if (changed) saveState();
  },

  pushNotification(ref, status, toastType) {
    const title = `Claim ${ref}: ${this.statusLabel(status)}`;
    const body = `Status update for your claim (${this.statusLabel(status)}).`;
    state.notifications = Array.isArray(state.notifications) ? state.notifications : [];
    state.notifications.unshift({ at: today(), title, body, ref });
    state.notifications = state.notifications.slice(0, 10);
    saveState();
    showToast(title, toastType);
  },

  checkForClaimStatusUpdates(prevStatusesByRef) {
    if (state.isAdmin || !state.isLoggedIn || !state.user) return;
    const prefs = state.user.notificationPrefs || { claims: true, debit: true };
    const claimsEnabled = prefs.claims !== false;
    if (!claimsEnabled) {
      // Still update notifSeen so we don't repeatedly evaluate.
      if (!state.notifSeen) state.notifSeen = {};
    }

    const myClaims = (state.claims || []).filter(c => this.isClaimForCurrentUser(c));
    let seenChanged = false;

    myClaims.forEach((claim) => {
      const ref = claim.ref;
      const prev = prevStatusesByRef?.[ref];
      const newStatus = claim.status;
      const alreadySeen = state.notifSeen?.[ref];

      const shouldNotify = alreadySeen ? (alreadySeen !== newStatus) : (prev && prev !== newStatus) || !alreadySeen;
      // Baseline init sets alreadySeen for existing claims, so we only notify on real changes/new claims.
      if (!state.notifSeen) state.notifSeen = {};
      if (shouldNotify && claimsEnabled) {
        const toastType =
          newStatus === 'paid' || newStatus === 'approved' ? 'success' :
          newStatus === 'rejected' ? 'error' :
          'warning';
        this.pushNotification(ref, newStatus, toastType);
      }

      if (state.notifSeen[ref] !== newStatus) {
        state.notifSeen[ref] = newStatus;
        seenChanged = true;
      }
    });

    if (seenChanged) saveState();
  },

  openNotifications() {
    const notifs = Array.isArray(state.notifications) ? state.notifications : [];
    const items = notifs.length
      ? notifs.map(n => `
          <div style="padding:10px 0;border-bottom:1px solid var(--border);">
            <div style="font-size:12px;font-weight:800;color:var(--navy);">${n.title}</div>
            <div style="font-size:11px;color:var(--text-secondary);margin-top:2px;line-height:1.5;">${n.body}</div>
            <div style="font-size:10px;color:var(--mid-gray);margin-top:4px;">${n.at}</div>
          </div>
        `).join('')
      : `<div style="padding:18px 0;color:var(--text-secondary);font-size:12px;">No notifications yet.</div>`;

    openModal(`
      <div>
        <div class="modal-title">Notifications</div>
        ${items}
        <div style="display:flex;gap:12px;justify-content:flex-end;margin-top:14px;">
          <button class="btn btn-secondary" style="width:auto;" onclick="closeModal()">Close</button>
        </div>
      </div>
    `);
  },

  // -------------------------------------------------------
  // ADMIN PANEL
  // -------------------------------------------------------
  async adminLogin() {
    const pw = document.getElementById('adminPassword').value;
    document.getElementById('errAdminPw').classList.remove('show');

    try {
      const data = await this.apiRequest('/admin/login', {
        method: 'POST',
        body: { password: pw },
      });
      state.adminToken = data.token;
      state.userToken = null;
      state.isAdmin = true;
      state.isLoggedIn = false;
      saveState();
      this.go('screen-admin');
      this.adminSetTab('claims');
      await this.refreshAdminClaims();
      showToast('Admin access granted', 'success');
    } catch (e) {
      document.getElementById('errAdminPw').classList.add('show');
    }
  },

  async renderAdminClaims() {
    if (!state.adminToken) return;

    const filterVal = document.getElementById('adminStatusFilter')?.value || 'all';
    const searchRaw = document.getElementById('adminSearch')?.value || '';
    const searchVal = searchRaw.trim().toLowerCase();
    const normalizedSearch = searchVal.replace(/\s/g, '');

    const container = document.getElementById('adminClaimsContainer');
    if (!container) return;

    // Stats call (all claims)
    let statsClaims = [];
    try {
      const statsRes = await this.apiRequest(`/admin/claims?status=all&q=`, { token: state.adminToken });
      statsClaims = statsRes?.claims || [];
    } catch (e) {}

    const total = statsClaims.length;
    const review = statsClaims.filter(c => ['submitted', 'under_review'].includes(c.status)).length;
    const paid = statsClaims.filter(c => c.status === 'paid').length;
    const statTotal = document.getElementById('adminStatTotal');
    const statReview = document.getElementById('adminStatReview');
    const statPaid = document.getElementById('adminStatPaid');
    if (statTotal) statTotal.textContent = total;
    if (statReview) statReview.textContent = review;
    if (statPaid) statPaid.textContent = paid;

    // Claims call (filtered)
    let claims = [];
    try {
      const q = encodeURIComponent(normalizedSearch);
      const status = encodeURIComponent(filterVal);
      const res = await this.apiRequest(`/admin/claims?status=${status}&q=${q}`, { token: state.adminToken });
      claims = res?.claims || [];
    } catch (e) {}

    state.adminClaimsCache = claims;

    if (!claims.length) {
      container.innerHTML = `<div class="empty-state"><div class="es-icon"><svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><rect width="8" height="4" x="8" y="2" rx="1" ry="1"/><path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2"/><path d="m9 14 2 2 4-4"/></svg></div><div class="es-title">No claims found</div><div class="es-desc">No claims match the selected filter.</div></div>`;
      return;
    }

    container.innerHTML = claims.map(c => {
      const subName = c.subscriber?.name || 'Subscriber';
      const phone = c.subscriber?.phone ? ` · ${c.subscriber.phone}` : '';
      return `
        <div class="card" style="padding:16px;margin-bottom:10px;">
          <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:10px;">
            <div>
              <p style="font-size:14px;font-weight:700;color:var(--navy);">${c.ref}</p>
              <p style="font-size:12px;color:var(--text-secondary);">${subName}${phone} · ${c.typeLabel}</p>
              <p style="font-size:11px;color:var(--mid-gray);">Submitted: ${formatDate(c.date)}</p>
            </div>
            <span class="badge badge-${App.statusBadgeClass(c.status)}">${App.statusLabel(c.status)}</span>
          </div>
          ${c.notes ? `<p style="font-size:12px;color:var(--text-secondary);margin-bottom:10px;padding:8px;background:var(--light-gray);border-radius:6px;">${c.notes}</p>` : ''}
          <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">
            <button class="btn btn-secondary btn-sm" style="width:auto;" onclick="App.adminViewClaim('${c.ref}')">Details</button>
            <label style="font-size:11px;font-weight:600;color:var(--text-secondary);">Update Status:</label>
            <select class="form-select" style="flex:1;min-width:120px;padding:7px 28px 7px 10px;font-size:12px;" id="adminSelect-${c.ref}" onchange="App.adminUpdateStatus('${c.ref}')">
              <option value="submitted"    ${c.status==='submitted'    ?'selected':''}>Submitted</option>
              <option value="under_review" ${c.status==='under_review' ?'selected':''}>Under Review</option>
              <option value="approved"     ${c.status==='approved'     ?'selected':''}>Approved</option>
              <option value="paid"         ${c.status==='paid'         ?'selected':''}>Paid</option>
              <option value="rejected"     ${c.status==='rejected'     ?'selected':''}>Rejected</option>
            </select>
            ${c.status==='approved' ? `<button class="btn btn-primary btn-sm" onclick="App.adminMarkPaid('${c.ref}')">Mark as Paid</button>` : ''}
          </div>
        </div>`;
    }).join('');
    if (window.lucide) lucide.createIcons();
  },

  async adminViewClaim(ref) {
    let claim = (state.adminClaimsCache || []).find(c => c.ref === ref);
    if (!claim) {
      showToast('Claim not found', 'error');
      return;
    }

    const sub = claim.subscriber || {};

    // If admin cache is stale (e.g., files were uploaded after the list was fetched),
    // fetch the specific claim again so Documents display correctly.
    let files = Array.isArray(claim.files) ? claim.files : [];
    if (files.length === 0 && state.adminToken) {
      try {
        const q = encodeURIComponent(ref);
        const res = await this.apiRequest(`/admin/claims?status=all&q=${q}`, { token: state.adminToken });
        const updated = (res?.claims || []).find(c => c.ref === ref);
        if (updated) {
          const cache = Array.isArray(state.adminClaimsCache) ? state.adminClaimsCache : [];
          const idx = cache.findIndex(c => c.ref === ref);
          if (idx >= 0) cache[idx] = updated;
          else cache.push(updated);
          state.adminClaimsCache = cache;
          claim = updated;
          files = Array.isArray(updated.files) ? updated.files : [];
        }
      } catch (_) {}
    }

    const statusLabel = this.statusLabel(claim.status);
    const badgeClass = this.statusBadgeClass(claim.status);

    const payoutLine = sub.bank
      ? `${sub.bank} ${sub.accNumMasked ? `· ${sub.accNumMasked}` : ''}`
      : '-';

    const payoutDestination = claim.payoutDestination || {};
    const isVehicleExcess = claim.type === 'excess';
    const payToLabel = payoutDestination.kind === 'repair_shop'
      ? 'Repair Shop'
      : payoutDestination.kind === 'insurer'
        ? 'Insurer'
        : 'Subscriber';

    const html = `
      <div>
        <div class="modal-title">Claim Details</div>
        <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:12px;">
          <div>
            <div style="font-size:16px;font-weight:800;color:var(--navy);margin-bottom:2px;">${claim.ref}</div>
            <div style="font-size:12px;color:var(--text-secondary);">Submitted: ${claim.date ? formatDate(claim.date) : '-'}</div>
            <div style="font-size:12px;color:var(--text-secondary);margin-top:2px;">Type: ${claim.typeLabel || claim.type || '-'}</div>
          </div>
          <span class="badge badge-${badgeClass}">${statusLabel}</span>
        </div>

        <div class="divider"></div>

        <p style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:8px;">Subscriber</p>
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.6;">
          <div><strong style="color:var(--text-primary);">Name:</strong> ${sub.name || '-'}</div>
          <div><strong style="color:var(--text-primary);">Phone:</strong> ${sub.phone || '-'}</div>
          <div><strong style="color:var(--text-primary);">SA ID:</strong> ${sub.saIdMasked || '-'}</div>
          <div><strong style="color:var(--text-primary);">Payout:</strong> ${payoutLine}</div>
        </div>

        ${isVehicleExcess ? `
          <div class="divider"></div>
          <p style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:8px;">Excess Payout Destination</p>
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.6;">
            <div><strong style="color:var(--text-primary);">Pay To:</strong> ${escapeHtml(payToLabel)}</div>
            <div><strong style="color:var(--text-primary);">Name:</strong> ${escapeHtml(payoutDestination.name || '-')}</div>
            <div><strong style="color:var(--text-primary);">Reference:</strong> ${escapeHtml(payoutDestination.reference || '-')}</div>
            <div><strong style="color:var(--text-primary);">Extra Details:</strong> ${escapeHtml(payoutDestination.details || '-')}</div>
          </div>
        ` : ''}

        ${claim.notes ? `
          <div class="divider"></div>
          <p style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:8px;">Admin Notes</p>
          <div style="font-size:12px;color:var(--text-secondary);line-height:1.6;background:var(--light-gray);border:1px solid var(--border);padding:12px;border-radius:8px;">
            ${claim.notes}
          </div>
        ` : ''}

        <div class="divider"></div>
        <p style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:8px;">Documents (${files.length})</p>
        ${files.length ? files.map((f) => {
          const name = f?.name || f?.originalName || f?.key || 'Document';
          const url = f?.url || '';
          const backendBase = API_BASE.replace('/api', '');
          const href = url && url.startsWith('/') ? `${backendBase}${url}` : (url || '');
          const safeName = escapeHtml(name);

          if (href) {
            return `
              <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--white);">
                <a href="${href}" target="_blank" rel="noopener noreferrer" style="color:var(--teal);font-weight:700;text-decoration:none;">${safeName}</a>
              </div>
            `;
          }

          return `
            <div style="font-size:12px;color:var(--text-secondary);margin-bottom:6px;padding:8px;border:1px solid var(--border);border-radius:8px;background:var(--white);">
              ${safeName}
            </div>
          `;
        }).join('') : `<div style="font-size:12px;color:var(--text-secondary);">No documents stored in this demo.</div>`}

        <div class="divider"></div>
        <p style="font-size:12px;font-weight:700;color:var(--navy);margin-bottom:8px;">Status Timeline</p>
        <div style="font-size:12px;color:var(--text-secondary);line-height:1.6;">
          <div>Submitted: ${claim.date ? formatDate(claim.date) : '-'}</div>
          <div>Under Review: ${claim.underReviewDate ? formatDate(claim.underReviewDate) : '-'}</div>
          <div>Approved: ${claim.approvedDate ? formatDate(claim.approvedDate) : '-'}</div>
          <div>Paid: ${claim.paidDate ? formatDate(claim.paidDate) : '-'}</div>
          <div>Rejected: ${claim.rejectedDate ? formatDate(claim.rejectedDate) : '-'}</div>
        </div>

        <button class="btn btn-secondary" style="width:auto;margin-top:16px;padding:10px 16px;" onclick="closeModal()">Close</button>
      </div>
    `;

    openModal(html);
  },

  async adminUpdateStatus(ref) {
    if (!state.adminToken) return;
    const select = document.getElementById(`adminSelect-${ref}`);
    if (!select) return;
    const newStatus = select.value;

    const cached = (state.adminClaimsCache || []).find(c => c.ref === ref);
    const currentStatus = cached?.status || '';

    try {
      await this.apiRequest(`/admin/claims/${encodeURIComponent(ref)}/status`, {
        method: 'PATCH',
        token: state.adminToken,
        body: { status: newStatus },
      });
      await this.refreshAdminClaims();
      showToast(`Claim ${ref} updated to: ${this.statusLabel(newStatus)}`, 'success');
    } catch (e) {
      showToast(`Update failed: ${e.message || 'Unknown error'}`, 'error');
      if (currentStatus) select.value = currentStatus;
    }
  },

  async adminMarkPaid(ref) {
    if (!state.adminToken) return;
    const cached = (state.adminClaimsCache || []).find(c => c.ref === ref);
    if (cached?.status !== 'approved') {
      showToast('Only approved claims can be marked as paid', 'warning');
      return;
    }

    try {
      await this.apiRequest(`/admin/claims/${encodeURIComponent(ref)}/status`, {
        method: 'PATCH',
        token: state.adminToken,
        body: { status: 'paid' },
      });
      await this.refreshAdminClaims();
      showToast(`Payout processed for ${ref}`, 'success');
    } catch (e) {
      showToast(`Mark paid failed: ${e.message || 'Unknown error'}`, 'error');
    }
  },

  syncClaimsFromStorage() {
    // Keep this lightweight: update claims/payments only (do not overwrite auth/session flags).
    const prevStatusesByRef = {};
    if (state.isLoggedIn && !state.isAdmin && state.user?.phone && Array.isArray(state.claims)) {
      (state.claims || [])
        .filter(c => this.isClaimForCurrentUser(c))
        .forEach(c => { prevStatusesByRef[c.ref] = c.status; });
    }
    try {
      const st = JSON.parse(localStorage.getItem('claimly_state') || '{}');
      if (Array.isArray(st.claims)) state.claims = st.claims;
      if (Array.isArray(st.payments)) state.payments = st.payments;
    } catch (e) {}

    this.checkForClaimStatusUpdates(prevStatusesByRef);

    const activeId = document.querySelector('.screen.active')?.id;
    if (activeId === 'screen-admin') this.renderAdminClaims();
    if (activeId === 'screen-dashboard') this.renderDashboard();
    if (activeId === 'screen-claim-track' && state.currentClaimRef) this.trackClaim(state.currentClaimRef);
    if (activeId === 'screen-payments') this.renderPayments();
  },

  // -------------------------------------------------------
  // MISC
  // -------------------------------------------------------
  openWhatsApp() {
    const phone = '27000000000'; // placeholder WhatsApp number
    const msg   = encodeURIComponent('Hi Claimly, I need help with my claim.');
    window.open(`https://wa.me/${phone}?text=${msg}`, '_blank');
    showToast('Opening WhatsApp...', 'info');
  }
};

// =========================================================
// WIRE-UP BUTTONS & INIT
// =========================================================
document.addEventListener('DOMContentLoaded', () => {
  // Hero buttons
  document.getElementById('btnGetStarted').addEventListener('click', () => {
    App.go('screen-plan');
    App.switchProduct('income');
    App.renderTierCards();
  });
  document.getElementById('btnLogin').addEventListener('click', () => App.go('screen-login'));

  // Payment method toggle
  document.getElementById('inputPayment').addEventListener('change', (e) => {
    document.getElementById('bankFields').style.display = e.target.value === 'debit_order' ? 'block' : 'none';
  });

  // Upload drag events
  const zone = document.getElementById('uploadZone');
  if (zone) {
    zone.addEventListener('dragover', e => { e.preventDefault(); zone.classList.add('drag-over'); });
    zone.addEventListener('dragleave', () => zone.classList.remove('drag-over'));
    zone.addEventListener('drop', e => {
      e.preventDefault();
      zone.classList.remove('drag-over');
      const dt = new DataTransfer();
      Array.from(e.dataTransfer.files).forEach(f => dt.items.add(f));
      const fi = document.getElementById('fileInput');
      fi.files = dt.files;
      App.handleFileUpload({ target: fi });
    });
  }

  // Admin access via URL hash
  const checkHash = () => {
    if (window.location.hash === '#admin') App.go('screen-admin-login');
  };
  window.addEventListener('hashchange', checkHash);
  // Handle direct loads like ".../index.html#admin"
  checkHash();

  // Live refresh across tabs for claim updates.
  window.addEventListener('storage', (e) => {
    if (e.key === 'claimly_state') App.syncClaimsFromStorage();
  });

  // Start app
  App.init().then(() => {
    if (window.lucide) lucide.createIcons();
  });
});
