import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
  RecaptchaVerifier,
  browserLocalPersistence,
  getAuth,
  onAuthStateChanged,
  setPersistence,
  signInWithPhoneNumber,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  collection,
  doc,
  getDoc,
  getFirestore,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-firestore.js";

const LEVELS = [
  {
    score: 5,
    name: "Net Positive Aura Gain",
    emoji: "😇",
    caption: "Top tier behavior. Aura fully intact.",
  },
  {
    score: 4,
    name: "Found the Big Chill Within",
    emoji: "💋",
    caption: "Strong day. A little drama, but that usually hasn't hurt anyone.",
  },
  {
    score: 3,
    name: "Gouse at 5am",
    emoji: "🙂",
    caption: "There have been worse decisions, there have been better.",
  },
  {
    score: 2,
    name: "Attended a Rodiddy Party",
    emoji: "🧊",
    caption: "Warning zone. KSig talks.",
  },
  {
    score: 1,
    name: "Paisley at Theta Formal",
    emoji: "⛓️",
    caption: "Consequences. You've fallen down the stairs already.",
  },
];

const dom = {
  loginPanel: document.querySelector("#login-panel"),
  dashboard: document.querySelector("#dashboard"),
  loginForm: document.querySelector("#login-form"),
  phoneInput: document.querySelector("#phone-input"),
  nicknameInput: document.querySelector("#nickname-input"),
  sendCodeButton: document.querySelector("#send-code-button"),
  verificationStep: document.querySelector("#verification-step"),
  verifyForm: document.querySelector("#verify-form"),
  verificationCodeInput: document.querySelector("#verification-code"),
  resetLoginButton: document.querySelector("#reset-login-button"),
  authMessage: document.querySelector("#auth-message"),
  setupNotice: document.querySelector("#setup-notice"),
  recaptchaContainer: document.querySelector("#recaptcha-container"),
  selectedDate: document.querySelector("#selected-date"),
  sessionBadge: document.querySelector("#session-badge"),
  profileNicknameInput: document.querySelector("#profile-nickname"),
  saveProfileButton: document.querySelector("#save-profile-button"),
  logoutButton: document.querySelector("#logout-button"),
  dashboardMessage: document.querySelector("#dashboard-message"),
  entryForm: document.querySelector("#entry-form"),
  daySummary: document.querySelector("#day-summary"),
  chartBoard: document.querySelector("#chart-board"),
  entriesList: document.querySelector("#entries-list"),
};

const state = {
  setupError: "",
  authReady: false,
  currentUser: null,
  currentProfile: null,
  selectedDate: todayString(),
  users: {},
  entries: {},
  ratings: {},
  authNotice: null,
  dashboardNotice: null,
  confirmationResult: null,
  pendingPhoneNumber: "",
  pendingNickname: "",
  recaptchaVerifier: null,
  recaptchaWidgetId: null,
  entryFormDirty: false,
  lastEntryFormKey: "",
  listeners: {
    users: null,
    entries: null,
    ratings: null,
  },
};

let auth = null;
let db = null;

bootstrap();

async function bootstrap() {
  dom.selectedDate.value = state.selectedDate;
  bindEvents();

  const firebaseConfig = getFirebaseConfig();
  if (!firebaseConfig) {
    state.setupError =
      "Firebase is not configured yet. Add your real project values in config.js to enable shared sign-in and shared ratings.";
    render();
    return;
  }

  try {
    const app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    db = getFirestore(app);

    await setPersistence(auth, browserLocalPersistence);

    onAuthStateChanged(auth, async (user) => {
      state.authReady = true;
      state.currentUser = user;
      state.dashboardNotice = null;

      if (!user) {
        state.currentProfile = null;
        state.users = {};
        clearRealtimeSubscriptions();
        resetEntryDraft();
        render();
        return;
      }

      try {
        await ensureUserProfile(user, state.pendingNickname);
      } catch (error) {
        state.dashboardNotice = {
          tone: "error",
          text: friendlyErrorMessage(error),
        };
      }

      subscribeToUsers();
      subscribeToSelectedDate();

      state.confirmationResult = null;
      state.pendingPhoneNumber = "";
      state.pendingNickname = "";
      state.authNotice = null;
      dom.loginForm.reset();
      dom.verifyForm.reset();
      render();
    });
  } catch (error) {
    state.setupError = friendlyErrorMessage(error);
    state.authReady = true;
  }

  render();
}

function bindEvents() {
  dom.loginForm.addEventListener("submit", handleSendCode);
  dom.verifyForm.addEventListener("submit", handleVerifyCode);
  dom.resetLoginButton.addEventListener("click", resetLoginFlow);
  dom.logoutButton.addEventListener("click", handleLogout);
  dom.selectedDate.addEventListener("change", handleDateChange);
  dom.saveProfileButton.addEventListener("click", handleSaveProfile);
  dom.entryForm.addEventListener("submit", handleSaveEntry);
  dom.entryForm.addEventListener("input", handleEntryFormInput);
  dom.entriesList.addEventListener("click", handleRateEntry);
}

async function handleSendCode(event) {
  event.preventDefault();

  if (!auth) {
    return;
  }

  const phoneNumber = normalizePhoneForSms(dom.phoneInput.value);
  const nickname = dom.nicknameInput.value.trim();

  if (!phoneNumber) {
    dom.phoneInput.setCustomValidity("Use a valid phone number, like (555) 123-4567.");
    dom.phoneInput.reportValidity();
    return;
  }

  dom.phoneInput.setCustomValidity("");
  state.authNotice = { tone: "info", text: "Sending a verification code..." };
  render();

  try {
    const verifier = await ensureRecaptcha();
    state.confirmationResult = await signInWithPhoneNumber(auth, phoneNumber, verifier);
    state.pendingPhoneNumber = phoneNumber;
    state.pendingNickname = nickname;
    state.authNotice = {
      tone: "success",
      text: `Code sent to ${formatPhone(phoneNumber)}. Enter the six-digit code below.`,
    };
    render();
    dom.verificationCodeInput.focus();
  } catch (error) {
    await resetRecaptcha();
    state.authNotice = {
      tone: "error",
      text: friendlyErrorMessage(error),
    };
    render();
  }
}

async function handleVerifyCode(event) {
  event.preventDefault();

  if (!state.confirmationResult) {
    state.authNotice = {
      tone: "error",
      text: "Send a verification code first.",
    };
    render();
    return;
  }

  const code = dom.verificationCodeInput.value.trim();
  if (!/^\d{6}$/.test(code)) {
    dom.verificationCodeInput.setCustomValidity("Enter the six-digit code from the text message.");
    dom.verificationCodeInput.reportValidity();
    return;
  }

  dom.verificationCodeInput.setCustomValidity("");
  state.authNotice = { tone: "info", text: "Verifying your code..." };
  render();

  try {
    const result = await state.confirmationResult.confirm(code);
    await ensureUserProfile(result.user, state.pendingNickname);
  } catch (error) {
    state.authNotice = {
      tone: "error",
      text: friendlyErrorMessage(error),
    };
    render();
  }
}

function resetLoginFlow() {
  state.confirmationResult = null;
  state.pendingPhoneNumber = "";
  state.pendingNickname = dom.nicknameInput.value.trim();
  dom.verifyForm.reset();
  state.authNotice = null;
  resetRecaptcha().catch(() => {});
  render();
}

async function handleLogout() {
  if (!auth) {
    return;
  }

  try {
    await signOut(auth);
    state.authNotice = { tone: "success", text: "Signed out. Use any phone number to sign back in." };
    render();
  } catch (error) {
    state.dashboardNotice = {
      tone: "error",
      text: friendlyErrorMessage(error),
    };
    render();
  }
}

function handleDateChange(event) {
  state.selectedDate = event.target.value || todayString();
  resetEntryDraft();

  if (state.currentUser) {
    subscribeToSelectedDate();
  }

  render();
}

function handleEntryFormInput() {
  state.entryFormDirty = true;
}

async function handleSaveProfile() {
  if (!db || !state.currentUser) {
    return;
  }

  const nickname = dom.profileNicknameInput.value.trim();
  state.dashboardNotice = { tone: "info", text: "Saving nickname..." };
  render();

  try {
    await updateDoc(doc(db, "users", state.currentUser.uid), {
      nickname,
      updatedAt: serverTimestamp(),
    });
    state.dashboardNotice = { tone: "success", text: "Nickname saved." };
    render();
  } catch (error) {
    state.dashboardNotice = {
      tone: "error",
      text: friendlyErrorMessage(error),
    };
    render();
  }
}

async function handleSaveEntry(event) {
  event.preventDefault();

  if (!db || !state.currentUser) {
    return;
  }

  const form = new FormData(dom.entryForm);
  const selfScore = Number(form.get("selfScore"));
  const bullets = [
    form.get("bullet1"),
    form.get("bullet2"),
    form.get("bullet3"),
    form.get("bullet4"),
    form.get("bullet5"),
  ].map((item) => String(item || "").trim());

  if (!selfScore || bullets.some((bullet) => !bullet)) {
    state.dashboardNotice = {
      tone: "error",
      text: "Pick a score and fill out all five bullets before saving.",
    };
    render();
    return;
  }

  const entryId = buildEntryId(state.currentUser.uid, state.selectedDate);
  const existing = state.entries[entryId];
  const profile = getCurrentProfile();

  state.dashboardNotice = { tone: "info", text: "Saving your daily recap..." };
  render();

  try {
    await setDoc(doc(db, "entries", entryId), {
      ownerUid: state.currentUser.uid,
      ownerPhoneNumber: state.currentUser.phoneNumber || state.pendingPhoneNumber || "",
      date: state.selectedDate,
      selfScore,
      bullets,
      createdAt: existing?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
      ownerColor: profile.color,
    });
    state.entryFormDirty = false;
    state.dashboardNotice = { tone: "success", text: "Daily recap saved." };
    render();
  } catch (error) {
    state.dashboardNotice = {
      tone: "error",
      text: friendlyErrorMessage(error),
    };
    render();
  }
}

async function handleRateEntry(event) {
  const button = event.target.closest("[data-entry-id][data-rate]");

  if (!button || !db || !state.currentUser) {
    return;
  }

  const entryId = button.dataset.entryId;
  const score = Number(button.dataset.rate);
  const entry = state.entries[entryId];

  if (!entry || entry.ownerUid === state.currentUser.uid || score < 1 || score > 5) {
    return;
  }

  const ratingId = buildRatingId(entryId, state.currentUser.uid);
  const existing = state.ratings[ratingId];

  try {
    await setDoc(doc(db, "ratings", ratingId), {
      entryId,
      date: entry.date,
      raterUid: state.currentUser.uid,
      targetUid: entry.ownerUid,
      score,
      createdAt: existing?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    state.dashboardNotice = {
      tone: "error",
      text: friendlyErrorMessage(error),
    };
    render();
  }
}

async function ensureRecaptcha() {
  if (state.recaptchaVerifier) {
    return state.recaptchaVerifier;
  }

  state.recaptchaVerifier = new RecaptchaVerifier(auth, "send-code-button", {
    size: "invisible",
    callback: () => {},
    "expired-callback": () => {
      state.authNotice = {
        tone: "info",
        text: "The verification challenge expired. Send a fresh code.",
      };
      render();
    },
  });

  state.recaptchaWidgetId = await state.recaptchaVerifier.render();
  return state.recaptchaVerifier;
}

async function resetRecaptcha() {
  if (typeof state.recaptchaWidgetId === "number" && window.grecaptcha) {
    window.grecaptcha.reset(state.recaptchaWidgetId);
    return;
  }

  if (state.recaptchaVerifier) {
    state.recaptchaWidgetId = await state.recaptchaVerifier.render();
  }
}

async function ensureUserProfile(user, nicknameOverride = "") {
  if (!db || !user) {
    return null;
  }

  const userRef = doc(db, "users", user.uid);
  const snapshot = await getDoc(userRef);
  const existing = snapshot.exists() ? snapshot.data() : null;
  const nickname = nicknameOverride.trim() || existing?.nickname || "";
  const phoneNumber = user.phoneNumber || existing?.phoneNumber || state.pendingPhoneNumber || "";
  const color = existing?.color || buildColorFromKey(user.uid);

  if (!existing) {
    await setDoc(userRef, {
      uid: user.uid,
      phoneNumber,
      nickname,
      color,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return;
  }

  if (
    existing.nickname !== nickname ||
    existing.phoneNumber !== phoneNumber ||
    existing.color !== color
  ) {
    await updateDoc(userRef, {
      nickname,
      phoneNumber,
      color,
      updatedAt: serverTimestamp(),
    });
  }
}

function subscribeToUsers() {
  if (!db) {
    return;
  }

  if (state.listeners.users) {
    state.listeners.users();
  }

  state.listeners.users = onSnapshot(
    collection(db, "users"),
    (snapshot) => {
      state.users = Object.fromEntries(
        snapshot.docs.map((document) => [document.id, { id: document.id, ...document.data() }]),
      );
      state.currentProfile = state.currentUser ? state.users[state.currentUser.uid] || null : null;
      render();
    },
    (error) => {
      state.dashboardNotice = {
        tone: "error",
        text: friendlyErrorMessage(error),
      };
      render();
    },
  );
}

function subscribeToSelectedDate() {
  if (!db || !state.currentUser) {
    return;
  }

  if (state.listeners.entries) {
    state.listeners.entries();
  }

  if (state.listeners.ratings) {
    state.listeners.ratings();
  }

  state.entries = {};
  state.ratings = {};

  const entriesQuery = query(collection(db, "entries"), where("date", "==", state.selectedDate));
  const ratingsQuery = query(collection(db, "ratings"), where("date", "==", state.selectedDate));

  state.listeners.entries = onSnapshot(
    entriesQuery,
    (snapshot) => {
      state.entries = Object.fromEntries(
        snapshot.docs.map((document) => [document.id, { id: document.id, ...document.data() }]),
      );
      render();
    },
    (error) => {
      state.dashboardNotice = {
        tone: "error",
        text: friendlyErrorMessage(error),
      };
      render();
    },
  );

  state.listeners.ratings = onSnapshot(
    ratingsQuery,
    (snapshot) => {
      state.ratings = Object.fromEntries(
        snapshot.docs.map((document) => [document.id, { id: document.id, ...document.data() }]),
      );
      render();
    },
    (error) => {
      state.dashboardNotice = {
        tone: "error",
        text: friendlyErrorMessage(error),
      };
      render();
    },
  );
}

function clearRealtimeSubscriptions() {
  for (const key of Object.keys(state.listeners)) {
    if (state.listeners[key]) {
      state.listeners[key]();
      state.listeners[key] = null;
    }
  }

  state.entries = {};
  state.ratings = {};
}

function render() {
  dom.selectedDate.value = state.selectedDate;

  const configured = !state.setupError;
  const loggedIn = Boolean(state.currentUser);

  dom.loginPanel.hidden = loggedIn;
  dom.dashboard.hidden = !loggedIn;
  dom.verificationStep.hidden = !state.confirmationResult;
  dom.sendCodeButton.textContent = state.confirmationResult
    ? "Send a new code"
    : "Send verification code";

  setNotice(dom.authMessage, state.authNotice);
  setNotice(dom.dashboardMessage, state.dashboardNotice);
  setNotice(
    dom.setupNotice,
    configured
      ? null
      : {
          tone: "error",
          text: state.setupError,
        },
  );

  setElementsDisabled(
    [dom.phoneInput, dom.nicknameInput, dom.sendCodeButton],
    !configured || !state.authReady,
  );

  setElementsDisabled(
    [dom.verificationCodeInput, ...dom.verifyForm.querySelectorAll("button")],
    !configured || !state.confirmationResult,
  );

  if (!loggedIn) {
    return;
  }

  const profile = getCurrentProfile();

  if (document.activeElement !== dom.profileNicknameInput) {
    dom.profileNicknameInput.value = profile.nickname || "";
  }

  renderSessionBadge(profile);
  renderEntryForm();
  renderDaySummary();
  renderChart();
  renderEntries();
}

function renderSessionBadge(profile) {
  dom.sessionBadge.innerHTML = `
    <div class="profile-chip">
      <span class="profile-swatch" style="background:${profile.color};"></span>
      <span class="profile-label">
        <span class="profile-name">${escapeHtml(displayName(profile))}</span>
        <span class="profile-phone">${escapeHtml(formatPhone(profile.phoneNumber))}</span>
      </span>
    </div>
  `;
}

function renderEntryForm() {
  if (!state.currentUser) {
    return;
  }

  const entryKey = buildEntryId(state.currentUser.uid, state.selectedDate);
  if (state.lastEntryFormKey !== entryKey) {
    state.lastEntryFormKey = entryKey;
    state.entryFormDirty = false;
  }

  if (state.entryFormDirty) {
    return;
  }

  const entry = state.entries[entryKey] || null;
  const scoreInputs = dom.entryForm.querySelectorAll('input[name="selfScore"]');

  scoreInputs.forEach((input) => {
    input.checked = entry ? Number(input.value) === Number(entry.selfScore) : false;
  });

  for (let index = 1; index <= 5; index += 1) {
    const field = dom.entryForm.elements[`bullet${index}`];
    field.value = entry?.bullets?.[index - 1] || "";
  }
}

function renderDaySummary() {
  const entries = getEntriesForSelectedDate();
  const averages = entries.map(getAverageScore);
  const peopleCount = entries.length;
  const ratingsCount = entries.reduce(
    (total, entry) => total + getRatingsForEntry(entry.id).length,
    0,
  );
  const dayAverage = averages.length
    ? (averages.reduce((sum, value) => sum + value, 0) / averages.length).toFixed(2)
    : "0.00";

  dom.daySummary.innerHTML = `
    <div class="summary-card">
      <strong>${peopleCount}</strong>
      <span>People checked in</span>
    </div>
    <div class="summary-card">
      <strong>${ratingsCount}</strong>
      <span>Peer ratings submitted</span>
    </div>
    <div class="summary-card">
      <strong>${dayAverage}</strong>
      <span>Board average</span>
    </div>
  `;
}

function renderChart() {
  const entries = sortEntries(getEntriesForSelectedDate());

  const markers = entries
    .map((entry, index) => {
      const profile = getUserProfile(entry.ownerUid, entry.ownerPhoneNumber, entry.ownerColor);
      const average = getAverageScore(entry);
      const placement = levelForScore(average);
      const left = entries.length === 1 ? 50 : 10 + (index * 80) / (entries.length - 1);
      const bottom = 6 + ((average - 1) / 4) * 88;

      return `
        <div class="chart-marker" style="left:${left}%; bottom:${bottom}%; --marker:${profile.color};">
          <span class="marker-dot"></span>
          <div class="marker-card">
            <span class="marker-name">${escapeHtml(displayName(profile))}</span>
            <span class="marker-score">${average.toFixed(2)} · ${escapeHtml(placement.name)}</span>
          </div>
        </div>
      `;
    })
    .join("");

  dom.chartBoard.innerHTML = `
    <div class="chart-surface">
      ${LEVELS.map(
        (level) => `
          <div class="chart-band band-${level.score}">
            <div class="band-copy">
              <span class="band-emoji">${level.emoji}</span>
              <div class="band-text">
                <h3 class="band-title">${level.name}</h3>
                <span class="band-caption">${level.caption}</span>
              </div>
            </div>
            <span class="band-score">${level.score}</span>
          </div>
        `,
      ).join("")}
      <div class="chart-markers">${markers}</div>
    </div>
  `;
}

function renderEntries() {
  const entries = sortEntries(getEntriesForSelectedDate());

  if (!entries.length) {
    dom.entriesList.innerHTML = `
      <div class="empty-state centered">
        Nobody has posted for ${escapeHtml(formatDateLabel(state.selectedDate))} yet.
        Save the first five-bullet recap to start the board.
      </div>
    `;
    return;
  }

  dom.entriesList.innerHTML = entries
    .map((entry) => {
      const profile = getUserProfile(entry.ownerUid, entry.ownerPhoneNumber, entry.ownerColor);
      const average = getAverageScore(entry);
      const placement = levelForScore(average);
      const peerRatings = getRatingsForEntry(entry.id);
      const myRating = peerRatings.find((rating) => rating.raterUid === state.currentUser?.uid);
      const isOwnEntry = entry.ownerUid === state.currentUser?.uid;

      return `
        <article class="entry-card">
          <div class="entry-header">
            <div class="entry-user">
              <span class="profile-swatch" style="background:${profile.color};"></span>
              <div>
                <h3>${escapeHtml(displayName(profile))}</h3>
                <div class="entry-phone">${escapeHtml(formatPhone(profile.phoneNumber))}</div>
              </div>
            </div>

            <div class="entry-stats">
              <span class="entry-average">${average.toFixed(2)}</span>
              <span class="entry-placement">${escapeHtml(placement.name)}</span>
            </div>
          </div>

          <div class="entry-meta">
            <span class="pill">Self score: ${entry.selfScore}</span>
            <span class="pill">Peer ratings: ${peerRatings.length}</span>
            <span class="pill">Viewed day: ${escapeHtml(formatDateLabel(entry.date))}</span>
          </div>

          <ul class="bullet-list">
            ${entry.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}
          </ul>

          ${
            isOwnEntry
              ? `<p class="owner-note">This is your entry. Other people rate it from their own verified login.</p>`
              : `
                <div class="rating-panel">
                  <strong>Rate this day</strong>
                  <div class="rating-grid">
                    ${LEVELS.map(
                      (level) => `
                        <button
                          class="rate-button ${Number(myRating?.score) === level.score ? "is-active" : ""}"
                          type="button"
                          data-entry-id="${entry.id}"
                          data-rate="${level.score}"
                        >
                          ${level.score}
                        </button>
                      `,
                    ).join("")}
                  </div>
                </div>
              `
          }
        </article>
      `;
    })
    .join("");
}

function getEntriesForSelectedDate() {
  return Object.values(state.entries);
}

function getRatingsForEntry(entryId) {
  return Object.values(state.ratings).filter((rating) => rating.entryId === entryId);
}

function getAverageScore(entry) {
  const peerScores = getRatingsForEntry(entry.id).map((rating) => Number(rating.score));
  const scores = [Number(entry.selfScore), ...peerScores].filter(Boolean);
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
}

function getCurrentProfile() {
  if (!state.currentUser) {
    return {
      uid: "",
      nickname: "",
      phoneNumber: "",
      color: buildColorFromKey("fallback"),
    };
  }

  return getUserProfile(
    state.currentUser.uid,
    state.currentUser.phoneNumber || state.pendingPhoneNumber,
    buildColorFromKey(state.currentUser.uid),
  );
}

function getUserProfile(uid, phoneNumber = "", fallbackColor = "") {
  return (
    state.users[uid] || {
      uid,
      nickname: "",
      phoneNumber,
      color: fallbackColor || buildColorFromKey(uid),
    }
  );
}

function sortEntries(entries) {
  return [...entries].sort((left, right) => {
    const scoreDifference = getAverageScore(right) - getAverageScore(left);
    if (scoreDifference !== 0) {
      return scoreDifference;
    }

    const leftName = displayName(
      getUserProfile(left.ownerUid, left.ownerPhoneNumber, left.ownerColor),
    );
    const rightName = displayName(
      getUserProfile(right.ownerUid, right.ownerPhoneNumber, right.ownerColor),
    );

    return leftName.localeCompare(rightName);
  });
}

function levelForScore(score) {
  if (score >= 4.5) {
    return LEVELS[0];
  }

  if (score >= 3.5) {
    return LEVELS[1];
  }

  if (score >= 2.5) {
    return LEVELS[2];
  }

  if (score >= 1.5) {
    return LEVELS[3];
  }

  return LEVELS[4];
}

function setNotice(element, notice) {
  if (!element) {
    return;
  }

  if (!notice?.text) {
    element.hidden = true;
    element.textContent = "";
    element.removeAttribute("data-tone");
    return;
  }

  element.hidden = false;
  element.dataset.tone = notice.tone || "info";
  element.textContent = notice.text;
}

function setElementsDisabled(elements, disabled) {
  elements.forEach((element) => {
    if (element) {
      element.disabled = disabled;
    }
  });
}

function resetEntryDraft() {
  state.entryFormDirty = false;
  state.lastEntryFormKey = "";
}

function buildEntryId(uid, date) {
  return `${uid}_${date}`;
}

function buildRatingId(entryId, uid) {
  return `${entryId}__${uid}`;
}

function getFirebaseConfig() {
  const config = window.BEHAVIOR_CHART_CONFIG;
  if (!config || typeof config !== "object") {
    return null;
  }

  const requiredFields = ["apiKey", "authDomain", "projectId", "appId", "messagingSenderId"];
  const missingField = requiredFields.find((field) => {
    const value = String(config[field] || "").trim();
    return !value || value.includes("REPLACE_ME");
  });

  return missingField ? null : config;
}

function normalizePhoneForSms(value) {
  const raw = String(value || "").trim();
  const digits = raw.replace(/\D/g, "");

  if (raw.startsWith("+")) {
    return digits.length >= 10 && digits.length <= 15 ? `+${digits}` : "";
  }

  if (digits.length === 10) {
    return `+1${digits}`;
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+${digits}`;
  }

  if (digits.length >= 10 && digits.length <= 15) {
    return `+${digits}`;
  }

  return "";
}

function formatPhone(phoneNumber) {
  const digits = String(phoneNumber || "").replace(/\D/g, "");

  if (!digits) {
    return "";
  }

  if (digits.length === 11 && digits.startsWith("1")) {
    return `+1 (${digits.slice(1, 4)}) ${digits.slice(4, 7)}-${digits.slice(7)}`;
  }

  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }

  return phoneNumber.startsWith("+") ? phoneNumber : `+${digits}`;
}

function displayName(profile) {
  return profile.nickname || formatPhone(profile.phoneNumber);
}

function buildColorFromKey(key) {
  const hash = [...String(key || "fallback")].reduce((total, character) => {
    return (total * 31 + character.charCodeAt(0)) % 360;
  }, 19);

  return `hsl(${hash} 74% 52%)`;
}

function todayString() {
  const now = new Date();
  const offset = now.getTimezoneOffset();
  const localDate = new Date(now.getTime() - offset * 60_000);
  return localDate.toISOString().slice(0, 10);
}

function formatDateLabel(date) {
  if (!date) {
    return "";
  }

  return new Intl.DateTimeFormat(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  }).format(new Date(`${date}T12:00:00`));
}

function friendlyErrorMessage(error) {
  const code = error?.code || "";

  switch (code) {
    case "auth/invalid-phone-number":
      return "That phone number format did not work. Use a real number like (555) 123-4567.";
    case "auth/invalid-verification-code":
      return "That verification code does not match. Check the SMS and try again.";
    case "auth/missing-verification-code":
      return "Enter the six-digit verification code from the text message.";
    case "auth/code-expired":
      return "That code expired. Send a fresh code and try again.";
    case "auth/unauthorized-domain":
      return "This site domain is not authorized in Firebase Auth yet. Add it in Authentication settings.";
    case "auth/quota-exceeded":
      return "Firebase blocked more verification texts for now. Phone auth SMS requires the Blaze plan and has quotas.";
    case "auth/too-many-requests":
      return "Too many attempts right now. Wait a bit and try again.";
    case "permission-denied":
      return "Firestore rejected that request. Deploy the included firestore.rules file before testing shared data.";
    default:
      return error?.message || "Something went wrong. Try again.";
  }
}

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
