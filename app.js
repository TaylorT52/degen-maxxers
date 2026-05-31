const STORAGE_KEY = "behavior-chart-v1";
const SESSION_KEY = "behavior-chart-session-phone";

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
    caption: "There have been worse decisions, there have been better. Needs a cleaner next round.",
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
  selectedDate: document.querySelector("#selected-date"),
  sessionBadge: document.querySelector("#session-badge"),
  logoutButton: document.querySelector("#logout-button"),
  entryForm: document.querySelector("#entry-form"),
  daySummary: document.querySelector("#day-summary"),
  chartBoard: document.querySelector("#chart-board"),
  entriesList: document.querySelector("#entries-list"),
};

let state = loadState();
let sessionPhone = window.localStorage.getItem(SESSION_KEY) || "";
let selectedDate = todayString();

initialize();

function initialize() {
  dom.selectedDate.value = selectedDate;

  dom.loginForm.addEventListener("submit", handleLogin);
  dom.entryForm.addEventListener("submit", handleSaveEntry);
  dom.logoutButton.addEventListener("click", handleLogout);
  dom.selectedDate.addEventListener("change", handleDateChange);
  dom.entriesList.addEventListener("click", handleRateEntry);
  window.addEventListener("storage", handleStorageChange);

  render();
}

function handleLogin(event) {
  event.preventDefault();

  const phone = sanitizePhone(dom.phoneInput.value);
  const nickname = dom.nicknameInput.value.trim();

  if (!isValidPhone(phone)) {
    dom.phoneInput.setCustomValidity("Enter a real phone number with 10 to 15 digits.");
    dom.phoneInput.reportValidity();
    return;
  }

  dom.phoneInput.setCustomValidity("");
  ensureUser(phone, nickname);
  sessionPhone = phone;
  window.localStorage.setItem(SESSION_KEY, sessionPhone);
  dom.loginForm.reset();
  render();
}

function handleLogout() {
  sessionPhone = "";
  window.localStorage.removeItem(SESSION_KEY);
  render();
}

function handleDateChange(event) {
  selectedDate = event.target.value || todayString();
  render();
}

function handleSaveEntry(event) {
  event.preventDefault();

  if (!sessionPhone) {
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
    return;
  }

  const id = buildEntryId(sessionPhone, selectedDate);
  const now = new Date().toISOString();
  const existing = state.entries[id] || {
    id,
    phone: sessionPhone,
    date: selectedDate,
    ratings: {},
    createdAt: now,
  };

  state.entries[id] = {
    ...existing,
    selfScore,
    bullets,
    updatedAt: now,
  };

  saveState();
  render();
}

function handleRateEntry(event) {
  const button = event.target.closest("[data-entry-id][data-rate]");

  if (!button || !sessionPhone) {
    return;
  }

  const entryId = button.dataset.entryId;
  const rating = Number(button.dataset.rate);
  const entry = state.entries[entryId];

  if (!entry || entry.phone === sessionPhone || rating < 1 || rating > 5) {
    return;
  }

  entry.ratings = entry.ratings || {};
  entry.ratings[sessionPhone] = rating;
  entry.updatedAt = new Date().toISOString();

  saveState();
  render();
}

function handleStorageChange(event) {
  if (event.key !== STORAGE_KEY && event.key !== SESSION_KEY) {
    return;
  }

  state = loadState();
  sessionPhone = window.localStorage.getItem(SESSION_KEY) || "";
  render();
}

function render() {
  const loggedIn = Boolean(sessionPhone);

  dom.loginPanel.hidden = loggedIn;
  dom.dashboard.hidden = !loggedIn;
  dom.selectedDate.value = selectedDate;

  if (!loggedIn) {
    return;
  }

  const currentUser = state.users[sessionPhone] || ensureUser(sessionPhone);

  renderSessionBadge(currentUser);
  renderEntryForm();
  renderDaySummary();
  renderChart();
  renderEntries();
}

function renderSessionBadge(user) {
  dom.sessionBadge.innerHTML = `
    <div class="profile-chip">
      <span class="profile-swatch" style="background:${user.color};"></span>
      <span class="profile-label">
        <span class="profile-name">${escapeHtml(displayName(user))}</span>
        <span class="profile-phone">${escapeHtml(formatPhone(user.phone))}</span>
      </span>
    </div>
  `;
}

function renderEntryForm() {
  const entry = getEntry(sessionPhone, selectedDate);

  const scoreInputs = dom.entryForm.querySelectorAll('input[name="selfScore"]');
  scoreInputs.forEach((input) => {
    input.checked = entry ? Number(input.value) === entry.selfScore : false;
  });

  for (let index = 1; index <= 5; index += 1) {
    const field = dom.entryForm.elements[`bullet${index}`];
    field.value = entry?.bullets?.[index - 1] || "";
  }
}

function renderDaySummary() {
  const entries = getEntriesForDate(selectedDate);
  const averages = entries.map(getAverageScore);
  const peopleCount = entries.length;
  const ratingsCount = entries.reduce(
    (total, entry) => total + Object.keys(entry.ratings || {}).length,
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
  const entries = getEntriesForDate(selectedDate).sort((left, right) => {
    const averageDifference = getAverageScore(right) - getAverageScore(left);
    if (averageDifference !== 0) {
      return averageDifference;
    }

    return displayName(getUser(left.phone)).localeCompare(displayName(getUser(right.phone)));
  });

  const markers = entries
    .map((entry, index) => {
      const user = getUser(entry.phone);
      const average = getAverageScore(entry);
      const placement = levelForScore(average);
      const left = entries.length === 1 ? 50 : 10 + (index * 80) / (entries.length - 1);
      const bottom = 6 + ((average - 1) / 4) * 88;

      return `
        <div class="chart-marker" style="left:${left}%; bottom:${bottom}%; --marker:${user.color};">
          <span class="marker-dot"></span>
          <div class="marker-card">
            <span class="marker-name">${escapeHtml(displayName(user))}</span>
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
      <div class="chart-markers">
        ${markers}
      </div>
    </div>
  `;
}

function renderEntries() {
  const entries = getEntriesForDate(selectedDate).sort((left, right) => {
    const averageDifference = getAverageScore(right) - getAverageScore(left);
    if (averageDifference !== 0) {
      return averageDifference;
    }

    return displayName(getUser(left.phone)).localeCompare(displayName(getUser(right.phone)));
  });

  if (!entries.length) {
    dom.entriesList.innerHTML = `
      <div class="empty-state centered">
        Nobody has posted for ${escapeHtml(formatDateLabel(selectedDate))} yet.
        Save the first five-bullet recap to start the board.
      </div>
    `;
    return;
  }

  dom.entriesList.innerHTML = entries
    .map((entry) => {
      const user = getUser(entry.phone);
      const average = getAverageScore(entry);
      const placement = levelForScore(average);
      const peerRatings = Object.keys(entry.ratings || {}).length;
      const myRating = entry.ratings?.[sessionPhone];
      const isOwnEntry = entry.phone === sessionPhone;

      return `
        <article class="entry-card">
          <div class="entry-header">
            <div class="entry-user">
              <span class="profile-swatch" style="background:${user.color};"></span>
              <div>
                <h3>${escapeHtml(displayName(user))}</h3>
                <div class="entry-phone">${escapeHtml(formatPhone(user.phone))}</div>
              </div>
            </div>

            <div class="entry-stats">
              <span class="entry-average">${average.toFixed(2)}</span>
              <span class="entry-placement">${escapeHtml(placement.name)}</span>
            </div>
          </div>

          <div class="entry-meta">
            <span class="pill">Self score: ${entry.selfScore}</span>
            <span class="pill">Peer ratings: ${peerRatings}</span>
            <span class="pill">Viewed day: ${escapeHtml(formatDateLabel(entry.date))}</span>
          </div>

          <ul class="bullet-list">
            ${entry.bullets.map((bullet) => `<li>${escapeHtml(bullet)}</li>`).join("")}
          </ul>

          ${
            isOwnEntry
              ? `<p class="owner-note">This is your entry. Other people rate it from their own login.</p>`
              : `
                <div class="rating-panel">
                  <strong>Rate this day</strong>
                  <div class="rating-grid">
                    ${LEVELS.map(
                      (level) => `
                        <button
                          class="rate-button ${Number(myRating) === level.score ? "is-active" : ""}"
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

function getEntriesForDate(date) {
  return Object.values(state.entries).filter((entry) => entry.date === date);
}

function getEntry(phone, date) {
  return state.entries[buildEntryId(phone, date)] || null;
}

function getUser(phone) {
  return (
    state.users[phone] || {
      phone,
      nickname: "",
      color: buildColorFromPhone(phone),
    }
  );
}

function ensureUser(phone, nickname = "") {
  const current = getUser(phone);
  const nextUser = {
    ...current,
    phone,
    nickname: nickname || current.nickname || "",
    color: current.color || buildColorFromPhone(phone),
    createdAt: current.createdAt || new Date().toISOString(),
  };

  const previousUser = state.users[phone];
  const changed = JSON.stringify(previousUser) !== JSON.stringify(nextUser);

  state.users[phone] = nextUser;

  if (changed) {
    saveState();
  }

  return nextUser;
}

function getAverageScore(entry) {
  const peerRatings = Object.values(entry.ratings || {}).map(Number);
  const scores = [Number(entry.selfScore), ...peerRatings].filter(Boolean);
  return scores.reduce((sum, value) => sum + value, 0) / scores.length;
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

function buildEntryId(phone, date) {
  return `${phone}:${date}`;
}

function loadState() {
  try {
    const saved = JSON.parse(window.localStorage.getItem(STORAGE_KEY) || "{}");
    return {
      users: saved.users && typeof saved.users === "object" ? saved.users : {},
      entries: saved.entries && typeof saved.entries === "object" ? saved.entries : {},
    };
  } catch (error) {
    return { users: {}, entries: {} };
  }
}

function saveState() {
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

function sanitizePhone(value) {
  return String(value || "").replace(/\D/g, "");
}

function isValidPhone(phone) {
  return phone.length >= 10 && phone.length <= 15;
}

function formatPhone(phone) {
  if (!phone) {
    return "";
  }

  if (phone.length === 10) {
    return `(${phone.slice(0, 3)}) ${phone.slice(3, 6)}-${phone.slice(6)}`;
  }

  if (phone.length === 11 && phone.startsWith("1")) {
    return `+1 (${phone.slice(1, 4)}) ${phone.slice(4, 7)}-${phone.slice(7)}`;
  }

  return `+${phone}`;
}

function displayName(user) {
  return user.nickname || formatPhone(user.phone);
}

function buildColorFromPhone(phone) {
  const hash = [...phone].reduce((total, character) => {
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

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
