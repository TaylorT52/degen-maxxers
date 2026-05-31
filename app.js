import { initializeApp } from "https://www.gstatic.com/firebasejs/12.7.0/firebase-app.js";
import {
  browserLocalPersistence,
  getAuth,
  getRedirectResult,
  GoogleAuthProvider,
  onAuthStateChanged,
  setPersistence,
  signInWithPopup,
  signInWithRedirect,
  signOut,
} from "https://www.gstatic.com/firebasejs/12.7.0/firebase-auth.js";
import {
  collection,
  deleteDoc,
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

const ENTRY_TAGS = [
  {
    key: "brooks_modesitt_mention",
    label: "Mentioned Brooks Modesitt",
    shortLabel: "Brooks Mention",
    caption: "Anyone can assign this tag for a -0.50 penalty.",
    emoji: "📣",
    scoreDelta: -0.5,
  },
];

const ENTRY_TAGS_BY_KEY = Object.fromEntries(
  ENTRY_TAGS.map((tag) => [tag.key, tag]),
);

const dom = {
  loginPanel: document.querySelector("#login-panel"),
  dashboard: document.querySelector("#dashboard"),
  googleSignInButton: document.querySelector("#google-signin-button"),
  authMessage: document.querySelector("#auth-message"),
  setupNotice: document.querySelector("#setup-notice"),
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
  tags: {},
  authNotice: null,
  dashboardNotice: null,
  entryFormDirty: false,
  lastEntryFormKey: "",
  listeners: {
    users: null,
    entries: null,
    ratings: null,
    tags: null,
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
      "Firebase is not configured yet. Copy config.example.js to config.js and add your real project values to enable Google sign-in and shared ratings.";
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
        await ensureUserProfile(user);
      } catch (error) {
        state.dashboardNotice = {
          tone: "error",
          text: friendlyErrorMessage(error),
        };
      }

      subscribeToUsers();
      subscribeToSelectedDate();
      state.authNotice = null;
      render();
    });

    try {
      await getRedirectResult(auth);
    } catch (error) {
      state.authReady = true;
      state.authNotice = {
        tone: "error",
        text: friendlyErrorMessage(error),
      };
      render();
    }
  } catch (error) {
    state.setupError = friendlyErrorMessage(error);
    state.authReady = true;
  }

  render();
}

function bindEvents() {
  dom.googleSignInButton.addEventListener("click", handleGoogleSignIn);
  dom.logoutButton.addEventListener("click", handleLogout);
  dom.selectedDate.addEventListener("change", handleDateChange);
  dom.saveProfileButton.addEventListener("click", handleSaveProfile);
  dom.entryForm.addEventListener("submit", handleSaveEntry);
  dom.entryForm.addEventListener("input", handleEntryFormInput);
  dom.entriesList.addEventListener("click", handleEntryAction);
}

async function handleGoogleSignIn() {
  if (!auth) {
    return;
  }

  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });

  state.authNotice = { tone: "info", text: "Opening Google sign-in..." };
  render();

  try {
    if (shouldUseRedirectSignIn()) {
      await signInWithRedirect(auth, provider);
      return;
    }

    await signInWithPopup(auth, provider);
  } catch (error) {
    if (error?.code === "auth/popup-blocked") {
      state.authNotice = {
        tone: "info",
        text: "Popup blocked. Redirecting to Google sign-in instead...",
      };
      render();
      await signInWithRedirect(auth, provider);
      return;
    }

    state.authNotice = {
      tone: "error",
      text: friendlyErrorMessage(error),
    };
    render();
  }
}

async function handleLogout() {
  if (!auth) {
    return;
  }

  try {
    await signOut(auth);
    state.authNotice = {
      tone: "success",
      text: "Signed out. Use Google sign-in to come back.",
    };
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
      date: state.selectedDate,
      selfScore,
      bullets,
      ownerColor: profile.color,
      createdAt: existing?.createdAt || serverTimestamp(),
      updatedAt: serverTimestamp(),
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

async function handleEntryAction(event) {
  const tagButton = event.target.closest("[data-entry-id][data-tag-key]");

  if (tagButton) {
    await handleToggleTag(tagButton);
    return;
  }

  const rateButton = event.target.closest("[data-entry-id][data-rate]");

  if (rateButton) {
    await handleRateEntry(rateButton);
  }
}

async function handleRateEntry(button) {
  if (!button) {
    return;
  }

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

async function handleToggleTag(button) {
  if (!button || !db || !state.currentUser) {
    return;
  }

  const entryId = button.dataset.entryId;
  const tagKey = button.dataset.tagKey;
  const entry = state.entries[entryId];
  const tag = getEntryTag(tagKey);

  if (!entry || !tag) {
    return;
  }

  const tagId = buildTagAssignmentId(entryId, tagKey, state.currentUser.uid);
  const existing = state.tags[tagId];

  try {
    if (existing) {
      await deleteDoc(doc(db, "tags", tagId));
      return;
    }

    await setDoc(doc(db, "tags", tagId), {
      entryId,
      date: entry.date,
      assigneeUid: state.currentUser.uid,
      tagKey,
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

async function ensureUserProfile(user) {
  if (!db || !user) {
    return null;
  }

  const userRef = doc(db, "users", user.uid);
  const snapshot = await getDoc(userRef);
  const existing = snapshot.exists() ? snapshot.data() : null;
  const authDisplayName = user.displayName || existing?.authDisplayName || "";
  const nickname = existing?.nickname || "";
  const color = existing?.color || buildColorFromKey(user.uid);

  if (!existing) {
    await setDoc(userRef, {
      uid: user.uid,
      authDisplayName,
      nickname,
      color,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
    return;
  }

  if (
    existing.authDisplayName !== authDisplayName ||
    existing.color !== color
  ) {
    await updateDoc(userRef, {
      authDisplayName,
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

  if (state.listeners.tags) {
    state.listeners.tags();
  }

  state.entries = {};
  state.ratings = {};
  state.tags = {};

  const entriesQuery = query(collection(db, "entries"), where("date", "==", state.selectedDate));
  const ratingsQuery = query(collection(db, "ratings"), where("date", "==", state.selectedDate));
  const tagsQuery = query(collection(db, "tags"), where("date", "==", state.selectedDate));

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

  state.listeners.tags = onSnapshot(
    tagsQuery,
    (snapshot) => {
      state.tags = Object.fromEntries(
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
  state.tags = {};
}

function render() {
  dom.selectedDate.value = state.selectedDate;

  const configured = !state.setupError;
  const loggedIn = Boolean(state.currentUser);

  dom.loginPanel.hidden = loggedIn;
  dom.dashboard.hidden = !loggedIn;

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

  setElementsDisabled([dom.googleSignInButton], !configured || !state.authReady);

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
  const subtitle = state.currentUser?.email || "Google account connected";

  dom.sessionBadge.innerHTML = `
    <div class="profile-chip">
      <span class="profile-swatch" style="background:${profile.color};"></span>
      <span class="profile-label">
        <span class="profile-name">${escapeHtml(displayName(profile))}</span>
        <span class="profile-phone">${escapeHtml(subtitle)}</span>
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
      const profile = getUserProfile(entry.ownerUid);
      const average = getAverageScore(entry);
      const placement = levelForScore(average);
      const left = entries.length === 1 ? 50 : 10 + (index * 80) / (entries.length - 1);
      const bottom = 6 + ((clampNumber(average, 1, 5) - 1) / 4) * 88;

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
      const profile = getUserProfile(entry.ownerUid);
      const average = getAverageScore(entry);
      const placement = levelForScore(average);
      const peerRatings = getRatingsForEntry(entry.id);
      const myRating = peerRatings.find((rating) => rating.raterUid === state.currentUser?.uid);
      const activeTags = getActiveTagsForEntry(entry);
      const isOwnEntry = entry.ownerUid === state.currentUser?.uid;

      return `
        <article class="entry-card">
          <div class="entry-header">
            <div class="entry-user">
              <span class="profile-swatch" style="background:${profile.color};"></span>
              <div>
                <h3>${escapeHtml(displayName(profile))}</h3>
                <div class="entry-phone">${escapeHtml(entrySecondaryText(profile))}</div>
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
            ${activeTags
              .map(
                ({ tag, assignments }) => `
                  <span class="pill pill-tag">
                    <span class="pill-tag-icon">${escapeHtml(tag.emoji || "🏷️")}</span>
                    <span class="pill-tag-copy">
                      <span class="pill-tag-label">${escapeHtml(tag.shortLabel || tag.label)}</span>
                      <span class="pill-tag-meta">${formatTagAssignmentCount(assignments.length)} · ${formatSignedScore(tag.scoreDelta)}</span>
                    </span>
                  </span>
                `,
              )
              .join("")}
          </div>

          <ul class="bullet-list">
            ${entry.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}
          </ul>

          ${
            isOwnEntry
              ? `<p class="owner-note">This is your entry. Other people rate it from their own Google login, but anyone can still assign tags.</p>`
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

          <div class="tag-panel">
            <div class="tag-panel-heading">
              <strong>Assign tags</strong>
              <span class="tag-panel-copy">Anyone can toggle these on any entry.</span>
            </div>
            <div class="tag-grid">
              ${ENTRY_TAGS.map((tag) => {
                const assignments = getTagAssignmentsForEntry(entry.id, tag.key);
                const assignedByMe = assignments.some(
                  (assignment) => assignment.assigneeUid === state.currentUser?.uid,
                );
                const metaText = assignedByMe ? "Assigned by you" : "Tap to assign";
                const assignmentText = assignments.length
                  ? formatTagAssignmentCount(assignments.length)
                  : "No one has assigned this yet";

                return `
                  <div class="tag-option ${assignedByMe ? "is-active" : ""}">
                    <button
                      class="tag-button ${assignedByMe ? "is-active" : ""}"
                      type="button"
                      data-entry-id="${entry.id}"
                      data-tag-key="${tag.key}"
                      aria-pressed="${assignedByMe}"
                      aria-label="${escapeHtml(tag.label)} ${formatCompactSignedScore(tag.scoreDelta)}"
                      title="${escapeHtml(tag.caption)}"
                    >
                      <span class="tag-button-value">${formatCompactSignedScore(tag.scoreDelta)}</span>
                    </button>
                    <span class="tag-button-title">${escapeHtml(tag.shortLabel || tag.label)}</span>
                    <span class="tag-button-meta">${metaText}</span>
                    <span class="tag-button-count">${assignmentText}</span>
                  </div>
                `;
              }).join("")}
            </div>
          </div>
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

function getEntryTag(tagKey) {
  return ENTRY_TAGS_BY_KEY[tagKey] || null;
}

function getTagAssignmentsForEntry(entryId, tagKey) {
  return Object.values(state.tags).filter((tag) => {
    return tag.entryId === entryId && tag.tagKey === tagKey;
  });
}

function getActiveTagsForEntry(entry) {
  return ENTRY_TAGS.map((tag) => {
    const assignments = getTagAssignmentsForEntry(entry.id, tag.key);
    return assignments.length ? { tag, assignments } : null;
  }).filter(Boolean);
}

function getScoreAdjustment(entry) {
  return getActiveTagsForEntry(entry).reduce((total, { tag }) => total + tag.scoreDelta, 0);
}

function getAverageScore(entry) {
  const peerScores = getRatingsForEntry(entry.id).map((rating) => Number(rating.score));
  const scores = [Number(entry.selfScore), ...peerScores].filter(Boolean);
  const baseAverage = scores.reduce((sum, value) => sum + value, 0) / scores.length;
  return baseAverage + getScoreAdjustment(entry);
}

function getCurrentProfile() {
  if (!state.currentUser) {
    return {
      uid: "",
      nickname: "",
      authDisplayName: "",
      color: buildColorFromKey("fallback"),
    };
  }

  return getUserProfile(
    state.currentUser.uid,
    state.currentUser.displayName || "",
    buildColorFromKey(state.currentUser.uid),
  );
}

function getUserProfile(uid, fallbackDisplayName = "", fallbackColor = "") {
  return (
    state.users[uid] || {
      uid,
      nickname: "",
      authDisplayName: fallbackDisplayName,
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

    const leftName = displayName(getUserProfile(left.ownerUid));
    const rightName = displayName(getUserProfile(right.ownerUid));

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

function shouldUseRedirectSignIn() {
  return window.matchMedia("(max-width: 760px)").matches || /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
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

function buildTagAssignmentId(entryId, tagKey, uid) {
  return `${entryId}__${tagKey}__${uid}`;
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

function displayName(profile) {
  return profile.nickname || profile.authDisplayName || "Board User";
}

function entrySecondaryText(profile) {
  if (profile.nickname && profile.authDisplayName && profile.nickname !== profile.authDisplayName) {
    return profile.authDisplayName;
  }

  return "Google sign-in";
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

function formatSignedScore(score) {
  return `${score > 0 ? "+" : ""}${score.toFixed(2)}`;
}

function formatCompactSignedScore(score) {
  const compactValue = Number.isInteger(score)
    ? String(score)
    : String(Number(score.toFixed(2)));

  return `${score > 0 ? "+" : ""}${compactValue}`;
}

function formatTagAssignmentCount(count) {
  return `${count} ${count === 1 ? "person" : "people"} assigned`;
}

function clampNumber(value, minimum, maximum) {
  return Math.min(Math.max(value, minimum), maximum);
}

function friendlyErrorMessage(error) {
  const code = error?.code || "";

  switch (code) {
    case "auth/operation-not-allowed":
      return "Google sign-in is not enabled in Firebase Authentication yet. Turn on the Google provider and save.";
    case "auth/popup-blocked":
      return "Your browser blocked the Google sign-in popup.";
    case "auth/popup-closed-by-user":
      return "Google sign-in was closed before it finished.";
    case "auth/cancelled-popup-request":
      return "Another Google sign-in request is already in progress.";
    case "auth/unauthorized-domain":
      return "This domain is not authorized in Firebase Auth yet. Add localhost and your GitHub Pages domain in Authentication settings.";
    case "permission-denied":
      return "Firestore rejected that request. Publish the included firestore.rules file before testing shared data.";
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
