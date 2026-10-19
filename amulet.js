(() => {
  "use strict";

  // Amulet deliberately owns its own habits and ledger. Existing Habits data is
  // never read or changed here. Money is stored as integer øre, never floats.
  const ALL_DAYS = [0, 1, 2, 3, 4, 5, 6];
  const WEEKDAYS = [1, 2, 3, 4, 5];
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const MAX_AMOUNT = 100000000;
  const STARTER_DATE = '2026-10-12';
  const numberFormat = new Intl.NumberFormat("nb-NO", { maximumFractionDigits: 2 });
  let host = null;
  let selectedDate = today();
  let wishView = "wishlist";
  let dialogContext = null;
  let lastToday = today();

  const icons = {
    check: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m5 12 4 4L19 6" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    plus: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    edit: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m15.5 4.5 4 4M4 20l4.5-1 11-11a2.8 2.8 0 0 0-4-4l-11 11L4 20Z" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    left: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m14 6-6 6 6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    right: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m10 6 6 6-6 6" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/></svg>',
    close: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="m6 6 12 12M18 6 6 18" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"/></svg>',
    arrow: '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M5 12h14m-5-5 5 5-5 5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>',
  };

  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function dateObject(value) { return new Date(`${value}T12:00:00`); }
  function validDate(value) {
    if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
    const d = dateObject(value);
    return Number.isFinite(d.getTime()) && `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}` === value;
  }
  function shiftDate(value, count) {
    const d = dateObject(value);
    d.setDate(d.getDate() + count);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
  }
  function monday(value) { return shiftDate(value, -((dateObject(value).getDay() + 6) % 7)); }
  function escapeHTML(value) { return String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }
  function cleanText(value, fallback = "", max = 100) { return typeof value === "string" ? value.trim().slice(0, max) || fallback : fallback; }
  function safeId(value) { return typeof value === "string" && /^[a-zA-Z0-9_-]{1,100}$/.test(value) ? value : ""; }
  function uid(prefix) { return `${prefix}_${globalThis.crypto?.randomUUID?.() || `${Date.now().toString(36)}_${Math.random().toString(36).slice(2)}`}`; }
  function money(value) { return `${numberFormat.format(value / 100)} KR`; }
  function formatDate(value, options = {}) { return dateObject(value).toLocaleDateString("en-GB", { day: "numeric", month: "short", ...options }); }
  function daysOf(raw) {
    const days = Array.isArray(raw) ? [...new Set(raw.filter(x => Number.isInteger(x) && x >= 0 && x <= 6))] : ALL_DAYS.slice();
    return days.length ? days.sort((a, b) => a - b) : ALL_DAYS.slice();
  }
  function targetOf(raw, days) { return Math.max(1, Math.min(days.length, Math.round(Number(raw) || days.length))); }
  function positiveOre(raw) { return Number.isSafeInteger(raw) && raw > 0 && raw <= MAX_AMOUNT ? raw : null; }
  function parseAmount(value) {
    const text = String(value).trim().replace(/[\s\u00a0]/g, "");
    if (!/^\d+(?:[.,]\d{1,2})?$/.test(text)) return null;
    const [whole, fraction = ""] = text.replace(",", ".").split(".");
    return positiveOre(Number(whole) * 100 + Number(fraction.padEnd(2, "0")));
  }
  function inputMoney(value) { return String(value / 100).replace(".", ","); }

  function defaultState() {
    const start = STARTER_DATE;
    const specs = [
      ["wake", "Wake up at 07:00", 25, ALL_DAYS],
      ["read", "Read", 10, ALL_DAYS],
      ["work", "At work by 08:30", 20, WEEKDAYS],
      ["strength", "Strength training", 10, ALL_DAYS],
      ["run", "Running", 30, ALL_DAYS],
      ["productive", "A productive day", 50, ALL_DAYS],
      ["leave", "Leave work by 17:15", 25, WEEKDAYS],
      ["social", "No time wasted on social media", 40, ALL_DAYS],
      ["meditate", "Meditate", 40, ALL_DAYS],
    ];
    return {
      version: 2, startedOn: start,
      habits: specs.map(([id, name, kr, days]) => ({ id: `am_${id}`, name, rewardOre: kr * 100, days: [...days], targetPerWeek: days.length, createdOn: start, archivedOn: null, versions: [{ from: start, name, rewardOre: kr * 100, days: [...days], targetPerWeek: days.length }] })),
      ledger: [], wishlist: [],
    };
  }

  // Normalize by replaying the ledger. Duplicate awards, repeated purchases,
  // orphan refunds, invalid amounts and overdrafts never become wallet money.
  function normalize(raw) {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return defaultState();
    const now = today();
    const originalStartedOn = validDate(raw.startedOn) && raw.startedOn <= now ? raw.startedOn : now;
    const migrateStarterDates = !Number.isInteger(raw.version) || raw.version < 2;
    const startedOn = migrateStarterDates && originalStartedOn > STARTER_DATE ? STARTER_DATE : originalStartedOn;
    const starterHabits = migrateStarterDates ? new Map(defaultState().habits.map(h => [h.id, h])) : null;
    const usedHabits = new Set();
    const habits = (Array.isArray(raw.habits) ? raw.habits : []).flatMap(source => {
      if (!source || typeof source !== "object") return [];
      const id = safeId(source.id);
      if (!id || usedHabits.has(id)) return [];
      const rewardOre = positiveOre(source.rewardOre);
      const name = cleanText(source.name);
      if (!name || !rewardOre) return [];
      usedHabits.add(id);
      const originalCreatedOn = validDate(source.createdOn) && source.createdOn <= now ? source.createdOn : originalStartedOn;
      const starter = starterHabits?.get(id);
      const createdOn = starter && originalCreatedOn > STARTER_DATE ? STARTER_DATE : originalCreatedOn;
      const archivedOn = validDate(source.archivedOn) && source.archivedOn >= createdOn ? source.archivedOn : null;
      const days = daysOf(source.days);
      const targetPerWeek = targetOf(source.targetPerWeek, days);
      const versionsByDate = new Map();
      for (const item of Array.isArray(source.versions) ? source.versions : []) {
        if (!item || !validDate(item.from) || item.from < createdOn || item.from > now) continue;
        const versionDays = daysOf(item.days);
        versionsByDate.set(item.from, { from: item.from, name: cleanText(item.name, name), rewardOre: positiveOre(item.rewardOre) || rewardOre, days: versionDays, targetPerWeek: targetOf(item.targetPerWeek, versionDays) });
      }
      if (!versionsByDate.has(originalCreatedOn)) versionsByDate.set(originalCreatedOn, { from: originalCreatedOn, name, rewardOre, days, targetPerWeek });
      // Starter habits are available for backfilling from October 12. Keep
      // their original values before creation and preserve all later edits.
      if (createdOn < originalCreatedOn) versionsByDate.set(createdOn, { ...starter.versions[0], days: [...starter.days] });
      const sortedVersions = [...versionsByDate.values()].sort((a, b) => a.from.localeCompare(b.from));
      const versions = sortedVersions.filter((item, index) => {
        if (!migrateStarterDates || !index) return true;
        const previous = sortedVersions[index - 1];
        return item.name !== previous.name || item.rewardOre !== previous.rewardOre || item.targetPerWeek !== previous.targetPerWeek || item.days.join(',') !== previous.days.join(',');
      });
      const latest = versions[versions.length - 1];
      return [{ id, ...latest, createdOn, archivedOn, versions }];
    });
    const habitById = new Map(habits.map(h => [h.id, h]));
    const wishlist = [];
    const wishIds = new Set();
    for (const source of Array.isArray(raw.wishlist) ? raw.wishlist : []) {
      if (!source || typeof source !== "object") continue;
      const id = safeId(source.id);
      const name = cleanText(source.name);
      const priceOre = positiveOre(source.priceOre);
      if (!id || wishIds.has(id) || !name || !priceOre) continue;
      wishIds.add(id);
      wishlist.push({ id, name, priceOre, createdAt: cleanText(source.createdAt, new Date().toISOString(), 40) });
    }
    const ledger = [];
    const eventIds = new Set();
    const activeEarnings = new Map();
    const activePurchases = new Map();
    const eventsById = new Map();
    let balance = 0;
    for (const source of Array.isArray(raw.ledger) ? raw.ledger : []) {
      if (!source || typeof source !== "object") continue;
      const id = safeId(source.id);
      if (!id || eventIds.has(id)) continue;
      const type = source.type;
      const date = validDate(source.date) && source.date <= now ? source.date : null;
      if (!date) continue;
      let event = { id, type, date, at: cleanText(source.at, `${date}T12:00:00`, 40), label: cleanText(source.label, "Activity") };
      if (type === "earn") {
        const habit = habitById.get(source.habitId);
        const amountOre = positiveOre(source.amountOre);
        const key = `${source.habitId}|${date}`;
        // The day was validated when awarded. A later schedule edit must never
        // erase previously earned money when the app next loads or syncs.
        if (!habit || !amountOre || date < habit.createdOn || (habit.archivedOn && date > habit.archivedOn) || activeEarnings.has(key)) continue;
        event = { ...event, habitId: habit.id, amountOre };
        activeEarnings.set(key, event);
      } else if (type === "undo-earn") {
        const original = eventsById.get(source.refId);
        if (!original || original.type !== "earn" || activeEarnings.get(`${original.habitId}|${original.date}`)?.id !== original.id || balance < original.amountOre) continue;
        event = { ...event, refId: original.id, habitId: original.habitId, amountOre: -original.amountOre, label: original.label };
        activeEarnings.delete(`${original.habitId}|${original.date}`);
      } else if (type === "withdraw") {
        const amount = positiveOre(Math.abs(source.amountOre));
        if (!amount || source.amountOre >= 0 || amount > balance) continue;
        event.amountOre = -amount;
      } else if (type === "purchase") {
        const amount = positiveOre(Math.abs(source.amountOre));
        const itemId = safeId(source.itemId);
        if (!itemId || !amount || source.amountOre >= 0 || amount > balance || activePurchases.has(itemId)) continue;
        event = { ...event, itemId, amountOre: -amount };
        activePurchases.set(itemId, event);
      } else if (type === "refund") {
        const original = eventsById.get(source.refId);
        if (!original || original.type !== "purchase" || activePurchases.get(original.itemId)?.id !== original.id) continue;
        event = { ...event, refId: original.id, itemId: original.itemId, amountOre: -original.amountOre, label: original.label };
        activePurchases.delete(original.itemId);
      } else continue;
      if (!Number.isSafeInteger(balance + event.amountOre)) continue;
      balance += event.amountOre;
      ledger.push(event);
      eventIds.add(id);
      eventsById.set(id, event);
    }
    return { version: 2, startedOn, habits, ledger, wishlist };
  }

  function versionAt(habit, date) {
    let value = habit.versions[0] || habit;
    for (const version of habit.versions) { if (version.from <= date) value = version; else break; }
    return value;
  }
  function isScheduled(habit, date) {
    return date >= habit.createdOn && (!habit.archivedOn || date <= habit.archivedOn) && versionAt(habit, date).days.includes(dateObject(date).getDay());
  }
  function ledgerView(slice) {
    const completions = new Map();
    const purchases = new Map();
    const withdrawals = new Map();
    const eventsById = new Map();
    let balance = 0;
    let earned = 0;
    for (const event of slice.ledger) {
      balance += event.amountOre;
      eventsById.set(event.id, event);
      if (event.type === "earn") { completions.set(`${event.habitId}|${event.date}`, event); earned += event.amountOre; }
      if (event.type === "undo-earn") {
        const original = eventsById.get(event.refId);
        if (original) completions.delete(`${original.habitId}|${original.date}`);
        earned += event.amountOre;
      }
      if (event.type === "purchase") purchases.set(event.itemId, event);
      if (event.type === "refund") purchases.delete(event.itemId);
      if (event.type === "withdraw") withdrawals.set(event.id, event);
    }
    return { completions, purchases, withdrawals, balance, earned };
  }
  function refundWithdrawal(slice, id) {
    const original = ledgerView(slice).withdrawals.get(id);
    if (!original) return false;
    // Keep the original debit and pair it with the existing refund format.
    // Cached clients understand purchase/refund, so they cannot silently drop
    // a new event type and subtract the returned money on their next sync.
    const itemId = uid("amexp");
    original.type = "purchase";
    original.itemId = itemId;
    slice.ledger.push(newEvent("refund", { itemId, refId: original.id, label: original.label, amountOre: -original.amountOre }));
    return true;
  }
  function goalStats(slice, from, to, view = ledgerView(slice)) {
    if (from > to) return { done: 0, goal: 0, percent: 0 };
    let done = 0;
    let goal = 0;
    // A weekly target is spread across that week's scheduled days. A partial
    // week counts only days since the habit existed; it never fabricates misses.
    for (let week = monday(from); week <= to; week = shiftDate(week, 7)) {
      for (const habit of slice.habits) {
        const counts = new Map();
        for (let offset = 0; offset < 7; offset++) {
          const date = shiftDate(week, offset);
          if (date < from || date > to || !isScheduled(habit, date)) continue;
          // Removing an unfinished habit removes today's obligation. A recorded
          // completion still counts, and all earlier dates retain their history.
          if (habit.archivedOn === date && !view.completions.has(`${habit.id}|${date}`)) continue;
          const version = versionAt(habit, date);
          const key = version.from;
          if (!counts.has(key)) counts.set(key, { version, eligible: 0, done: 0 });
          const count = counts.get(key);
          count.eligible++;
          if (view.completions.has(`${habit.id}|${date}`)) count.done++;
        }
        for (const count of counts.values()) {
          const goalForDays = count.version.targetPerWeek * count.eligible / count.version.days.length;
          goal += goalForDays;
          done += Math.min(count.done, goalForDays);
        }
      }
    }
    return { done, goal, percent: goal > 0 ? Math.min(100, Math.round(100 * done / goal)) : 0 };
  }

  function buildMarkup() {
    return `<div class="am-shell">
        <section class="am-wallet" aria-labelledby="am-wallet-label">
          <div class="am-wallet-top"><span class="am-wallet-label" id="am-wallet-label">Wallet</span></div>
          <div class="am-wallet-main"><div class="am-balance" id="am-balance">0 <span class="am-balance-unit">KR</span></div><button class="am-wallet-action" data-am-action="withdraw">Spend from wallet ${icons.arrow}</button></div>
        </section>
      <section class="am-today" aria-labelledby="am-today-title">
        <div class="am-section-head"><h3 id="am-today-title">Habits</h3><button class="am-text-button" data-am-action="manage-habits">${icons.edit} Manage</button></div>
        <div class="am-date-nav"><button class="am-icon-button" data-am-action="previous-week" aria-label="Previous week">${icons.left}</button><button class="am-current-date" id="am-current-date" data-am-action="today" title="Return to today"></button><button class="am-icon-button" id="am-next-week" data-am-action="next-week" aria-label="Next week">${icons.right}</button></div>
        <div class="am-day-strip" id="am-day-strip" role="group" aria-label="Choose a day"></div><div class="am-day-summary"><p class="am-muted" id="am-day-caption"></p><span class="am-today-earned" id="am-today-earned"></span></div><div class="am-habit-list" id="am-habit-list"></div>
      </section>
      <section class="am-chart-section" aria-labelledby="am-chart-title">
        <div class="am-section-head"><h3 id="am-chart-title">Progress</h3><span class="am-chart-period">Last 30 days</span></div><div class="am-chart-summary" id="am-chart-summary"></div><div class="am-chart-wrap" id="am-chart-wrap"></div>
      </section>
      <section class="am-wishes-section" aria-labelledby="am-wishes-title">
        <div class="am-section-head"><h3 id="am-wishes-title">Wishlist</h3><button class="am-text-button" data-am-action="add-wish">${icons.plus} Add item</button></div>
        <div class="am-segmented" role="tablist" aria-label="Wishlist and purchases"><button id="am-wishlist-tab" role="tab" aria-selected="true" aria-controls="am-wish-list" data-am-action="wish-view" data-view="wishlist">Wishlist <span id="am-wishlist-count">0</span></button><button id="am-purchases-tab" role="tab" aria-selected="false" aria-controls="am-wish-list" data-am-action="wish-view" data-view="purchases">Purchased <span id="am-purchase-count">0</span></button></div><div class="am-wish-list" id="am-wish-list" role="tabpanel" aria-labelledby="am-wishlist-tab"></div>
      </section>
      <div class="am-live-region" id="am-live" role="status" aria-live="polite" aria-atomic="true"></div><div class="am-reward-pop" id="am-reward-pop" aria-hidden="true"></div>
      <dialog class="am-dialog" id="am-dialog"><div class="am-dialog-content"><div class="am-dialog-head"><h3 id="am-dialog-title"></h3><button type="button" class="am-dialog-close am-icon-button" data-am-action="close-dialog" aria-label="Close dialog">${icons.close}</button></div><div id="am-dialog-body"></div></div></dialog>
    </div>`;
  }

  function state() { return host.getState(); }
  function $(id) { return host.root.querySelector(`#${id}`); }
  function updateHTML(element, html) {
    if (element.innerHTML === html) return;
    const focused = element.contains(document.activeElement) ? document.activeElement.getAttribute("data-am-focus") : null;
    element.innerHTML = html;
    if (focused) [...element.querySelectorAll("[data-am-focus]")].find(e => e.getAttribute("data-am-focus") === focused)?.focus({ preventScroll: true });
  }
  // Keep the existing row and its buttons alive so keyboard focus and the
  // checkbox's CSS transitions survive a completion or background sync.
  function patchNode(current, next) {
    if (current.nodeType !== next.nodeType || current.nodeName !== next.nodeName) {
      current.replaceWith(next);
      return;
    }
    if (current.nodeType !== 1) {
      if (current.nodeValue !== next.nodeValue) current.nodeValue = next.nodeValue;
      return;
    }
    for (const attribute of [...current.attributes]) {
      if (!next.hasAttribute(attribute.name)) current.removeAttribute(attribute.name);
    }
    for (const attribute of [...next.attributes]) {
      if (current.getAttribute(attribute.name) !== attribute.value) current.setAttribute(attribute.name, attribute.value);
    }
    const oldChildren = [...current.childNodes];
    const newChildren = [...next.childNodes];
    for (let i = 0; i < Math.max(oldChildren.length, newChildren.length); i++) {
      if (!newChildren[i]) oldChildren[i].remove();
      else if (!oldChildren[i]) current.append(newChildren[i]);
      else patchNode(oldChildren[i], newChildren[i]);
    }
  }
  function updateHabitRows(element, html) {
    const template = document.createElement("template");
    template.innerHTML = html;
    const rows = new Map([...element.children].map(row => [row.dataset.amHabit, row]));
    const retained = new Set();
    [...template.content.children].forEach((next, index) => {
      const previous = next.dataset.amHabit ? rows.get(next.dataset.amHabit) : null;
      const row = previous || next;
      if (previous) patchNode(previous, next);
      if (element.children[index] !== row) element.insertBefore(row, element.children[index] || null);
      retained.add(row);
    });
    for (const row of [...element.children]) if (!retained.has(row)) row.remove();
  }
  function save(message, options) {
    host.commit();
    render();
    if (message) announce(message, options);
  }
  function announce(message, { toast = true } = {}) {
    $("am-live").textContent = "";
    if (toast && typeof host.toast === "function") host.toast(message);
    else requestAnimationFrame(() => { if (host) $("am-live").textContent = message; });
  }
  function flashReward(amount) {
    window.AppUI?.hideToast?.();
    const pop = $("am-reward-pop");
    pop.textContent = `+${money(amount)}`;
    pop.classList.remove("is-visible");
    requestAnimationFrame(() => pop.classList.add("is-visible"));
    clearTimeout(flashReward.timer);
    flashReward.timer = setTimeout(() => pop.classList.remove("is-visible"), 1500);
    const wallet = $("am-balance");
    wallet.classList.remove("is-updated");
    requestAnimationFrame(() => wallet.classList.add("is-updated"));
  }

  function mount(config) {
    host = config;
    if (typeof config.root === "string") host.root = document.querySelector(config.root);
    if (!host.root) throw new Error("Amulet mount root is missing");
    host.root.innerHTML = buildMarkup();
    host.root.addEventListener("click", onClick);
    host.root.addEventListener("submit", onSubmit);
    host.root.addEventListener("change", onChange);
    host.root.addEventListener("animationend", event => {
      if (event.animationName === "am-check-pop") event.target.closest(".am-habit-row")?.classList.remove("is-earning");
    });
    const dialog = $("am-dialog");
    dialog.setAttribute("aria-labelledby", "am-dialog-title");
    dialog.addEventListener("close", () => { dialogContext = null; });
    host.root.addEventListener("keydown", event => {
      if (event.target.closest(".am-segmented") && ["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) {
        event.preventDefault();
        wishView = event.key === "ArrowLeft" || event.key === "Home" ? "wishlist" : "purchases";
        renderWishes(state(), ledgerView(state()));
        $(wishView === "wishlist" ? "am-wishlist-tab" : "am-purchases-tab").focus();
      }
    });
    if (!host.root.hidden) render();
  }

  function render() {
    if (!host || !state()) return;
    const now = today();
    if (lastToday !== now) { if (selectedDate === lastToday) selectedDate = now; lastToday = now; }
    if (selectedDate > now) selectedDate = now;
    const slice = state();
    const view = ledgerView(slice);
    $("am-balance").innerHTML = `${numberFormat.format(view.balance / 100)} <span class="am-balance-unit">KR</span>`;
    renderDays(slice, view);
    renderHabits(slice, view);
    renderChart(slice, view);
    renderWishes(slice, view);
  }

  function renderDays(slice, view) {
    const start = monday(selectedDate);
    const now = today();
    $("am-current-date").textContent = `${formatDate(start)} – ${formatDate(shiftDate(start, 6), { year: "numeric" })}`;
    $("am-next-week").disabled = shiftDate(start, 7) > now;
    updateHTML($("am-day-strip"), Array.from({ length: 7 }, (_, i) => {
      const date = shiftDate(start, i);
      const completed = [...view.completions.values()].some(e => e.date === date);
      return `<button class="am-day-button${date === selectedDate ? " is-selected" : ""}${date === now ? " is-today" : ""}" data-am-action="select-date" data-date="${date}" data-am-focus="day-${date}" aria-pressed="${date === selectedDate}" aria-label="${escapeHTML(formatDate(date, { weekday: "long", year: "numeric" }))}${date === now ? ", today" : ""}" ${date > now ? "disabled" : ""}><span class="am-day-name">${DAY_NAMES[dateObject(date).getDay()]}</span><span class="am-day-number">${dateObject(date).getDate()}</span><span class="am-day-dot${completed ? " is-complete" : ""}"></span></button>`;
    }).join(""));
    $("am-day-caption").textContent = selectedDate === now ? "Today" : formatDate(selectedDate, { weekday: "long", year: "numeric" });
    const earned = [...view.completions.values()].filter(e => e.date === selectedDate).reduce((sum, e) => sum + e.amountOre, 0);
    $("am-today-earned").textContent = `${money(earned)} earned`;
  }
  function scheduleLabel(version) {
    if (version.days.length === 7) return version.targetPerWeek === 7 ? "Every day" : `${version.targetPerWeek} days a week`;
    if (version.days.join(",") === "1,2,3,4,5") return version.targetPerWeek === 5 ? "Weekdays" : `${version.targetPerWeek} weekdays a week`;
    return `${version.days.map(d => DAY_NAMES[d]).join(", ")}${version.targetPerWeek < version.days.length ? ` · ${version.targetPerWeek} / week` : ""}`;
  }
  function renderHabits(slice, view) {
    const visible = slice.habits.filter(h => (isScheduled(h, selectedDate) || view.completions.has(`${h.id}|${selectedDate}`)) && (!h.archivedOn || selectedDate < today() || view.completions.has(`${h.id}|${selectedDate}`)));
    updateHabitRows($("am-habit-list"), visible.length ? visible.map(habit => {
      const version = versionAt(habit, selectedDate);
      const complete = view.completions.get(`${habit.id}|${selectedDate}`);
      return `<div class="am-habit-row${complete ? " is-complete" : ""}" data-am-habit="${habit.id}"><button type="button" class="am-habit-toggle" data-am-action="toggle-habit" data-id="${habit.id}" data-am-focus="habit-${habit.id}" aria-pressed="${Boolean(complete)}" aria-label="${escapeHTML(version.name)}, ${money(complete?.amountOre || version.rewardOre)}${complete ? ", completed; undo" : "; mark complete"}"><span class="am-check">${icons.check}</span><span class="am-habit-copy"><span class="am-habit-name">${escapeHTML(version.name)}</span>${version.days.length !== 7 || version.targetPerWeek !== 7 || habit.archivedOn ? `<span class="am-habit-meta">${escapeHTML(scheduleLabel(version))}${habit.archivedOn ? " · archived" : ""}</span>` : ""}</span><span class="am-reward">${complete ? "" : "+"}${money(complete?.amountOre || version.rewardOre)}</span></button>${!habit.archivedOn ? `<button class="am-habit-edit" data-am-action="edit-habit" data-id="${habit.id}" data-am-focus="edit-${habit.id}" aria-label="Edit ${escapeHTML(habit.name)}">${icons.edit}</button>` : ""}</div>`;
    }).join("") : `<div class="am-empty"><p>${slice.habits.some(h => !h.archivedOn) ? "No habits scheduled." : "No habits."}</p><button class="am-button am-button-secondary" data-am-action="add-habit">${icons.plus} Add habit</button></div>`);
  }

  function renderChart(slice, view) {
    const now = today();
    const daily = goalStats(slice, now, now, view);
    const seven = goalStats(slice, shiftDate(now, -6), now, view);
    const thirty = goalStats(slice, shiftDate(now, -29), now, view);
    $("am-chart-summary").innerHTML = `<div class="am-stat-daily"><strong>${daily.percent}<span>%</span></strong><span class="am-muted">Daily</span></div><div class="am-stat-seven"><strong>${seven.percent}<span>%</span></strong><span class="am-muted">7-day avg</span></div><div class="am-stat-thirty"><strong>${thirty.percent}<span>%</span></strong><span class="am-muted">30-day avg</span></div>`;
    const firstDate = slice.habits.reduce((first, h) => h.createdOn < first ? h.createdOn : first, now);
    const from = shiftDate(now, -29) < firstDate ? firstDate : shiftDate(now, -29);
    const dates = [];
    for (let d = from; d <= now; d = shiftDate(d, 1)) dates.push(d);
    const x = i => 36 + (dates.length === 1 ? 1 : i / (dates.length - 1)) * 552;
    const y = n => 148 - n * 1.24;
    const points = days => dates.map((d, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(goalStats(slice, shiftDate(d, 1 - days), d, view).percent).toFixed(1)}`).join(" ");
    const aria = `Goal completion. Daily completion ${daily.percent} percent. Seven-day rolling average ${seven.percent} percent. Thirty-day rolling average ${thirty.percent} percent.`;
    updateHTML($("am-chart-wrap"), `<svg class="am-chart" viewBox="0 0 612 182" role="img" aria-label="${aria}">${[0, 50, 100].map(n => `<line x1="36" x2="588" y1="${y(n)}" y2="${y(n)}" class="am-chart-grid"/><text x="27" y="${y(n) + 4}" text-anchor="end" class="am-chart-axis">${n}%</text>`).join("")}<path d="${points(1)}" class="am-chart-line am-chart-line-daily"/><path d="${points(7)}" class="am-chart-line am-chart-line-seven"/><path d="${points(30)}" class="am-chart-line am-chart-line-thirty"/><circle cx="${x(dates.length - 1)}" cy="${y(daily.percent)}" r="4" class="am-chart-dot"/><text x="36" y="176" class="am-chart-axis">${formatDate(from)}</text><text x="588" y="176" text-anchor="end" class="am-chart-axis">Today</text></svg>`);
  }

  function renderWishes(slice, view) {
    const wishes = slice.wishlist.filter(item => !view.purchases.has(item.id));
    $("am-wishlist-count").textContent = String(wishes.length);
    $("am-purchase-count").textContent = String(view.purchases.size + view.withdrawals.size);
    for (const mode of ["wishlist", "purchases"]) {
      const tab = $(mode === "wishlist" ? "am-wishlist-tab" : "am-purchases-tab");
      tab.setAttribute("aria-selected", String(wishView === mode));
      tab.tabIndex = wishView === mode ? 0 : -1;
    }
    $("am-wish-list").setAttribute("aria-labelledby", wishView === "wishlist" ? "am-wishlist-tab" : "am-purchases-tab");
    if (wishView === "purchases") {
      const purchases = slice.ledger.filter(event => event.type === "purchase" ? view.purchases.get(event.itemId)?.id === event.id : event.type === "withdraw" && view.withdrawals.has(event.id)).reverse();
      updateHTML($("am-wish-list"), purchases.length ? purchases.map(event => `<article class="am-wish-row am-purchase-row"><span class="am-purchase-check" aria-hidden="true">${icons.check}</span><div class="am-wish-copy"><h4>${escapeHTML(event.label)}</h4><p>${formatDate(event.date, { year: "numeric" })} · ${money(-event.amountOre)}</p></div><button class="am-text-button" data-am-action="${event.type === "withdraw" ? "undo-withdrawal" : "undo-purchase"}" data-id="${event.id}" data-am-focus="refund-${event.id}" aria-label="Undo ${escapeHTML(event.label)}">Undo</button></article>`).join("") : '<div class="am-empty am-empty-small"><p>No purchases.</p></div>');
      return;
    }
    updateHTML($("am-wish-list"), wishes.length ? wishes.map(item => {
      const ready = view.balance >= item.priceOre;
      const remaining = Math.max(0, item.priceOre - view.balance);
      return `<article class="am-wish-row"><div class="am-wish-copy"><h4>${escapeHTML(item.name)}</h4><p class="am-wish-price">${money(item.priceOre)} <span class="am-wish-status${ready ? " is-ready" : ""}">${ready ? "Available" : `${money(remaining)} remaining`}</span></p></div><div class="am-wish-actions"><button class="am-habit-edit" data-am-action="edit-wish" data-id="${item.id}" data-am-focus="wish-edit-${item.id}" aria-label="Edit ${escapeHTML(item.name)}">${icons.edit}</button><button class="am-button am-button-small${ready ? "" : " am-button-secondary"}" data-am-action="purchase" data-id="${item.id}" data-am-focus="buy-${item.id}" ${!ready ? 'disabled aria-label="Insufficient wallet balance"' : ""}>Purchased ${icons.check}</button></div></article>`;
    }).join("") : '<div class="am-empty am-empty-small"><p>No items.</p></div>');
  }
  function openDialog(title, body, context) {
    dialogContext = context;
    $("am-dialog-title").textContent = title;
    $("am-dialog-body").innerHTML = body;
    const dialog = $("am-dialog");
    if (!dialog.open) dialog.showModal();
    dialog.scrollTop = 0;
    requestAnimationFrame(() => {
      const target = context.dangerous
        ? dialog.querySelector('.am-form-actions [data-am-action="close-dialog"]')
        : dialog.querySelector("[autofocus], input, button[type=submit]");
      target?.focus({ preventScroll: true });
    });
  }
  function closeDialog() { $("am-dialog").close(); dialogContext = null; }
  function formError(message) {
    const error = $("am-dialog-body").querySelector(".am-form-error");
    if (error) {
      error.textContent = message;
      error.hidden = false;
      error.tabIndex = -1;
      error.focus({ preventScroll: true });
      error.scrollIntoView({ block: "nearest", behavior: "instant" });
    }
  }
  function formFooter(label, dangerous = false) {
    return `<p class="am-form-error" role="alert" hidden></p><div class="am-form-actions"><button type="button" class="am-button am-button-secondary" data-am-action="close-dialog">Cancel</button><button type="submit" class="am-button${dangerous ? " am-button-danger" : " am-button-primary"}">${label}</button></div>`;
  }
  function openHabit(id) {
    const habit = state().habits.find(h => h.id === id && !h.archivedOn);
    if (id && !habit) return;
    const current = habit || { name: "", rewardOre: 2500, days: ALL_DAYS, targetPerWeek: 7 };
    openDialog(habit ? "Edit habit" : "Add habit", `<form class="am-form" data-am-form="habit"><div class="am-field"><label for="am-habit-name-input">Habit name</label><input id="am-habit-name-input" name="name" type="text" maxlength="100" placeholder="Habit name" value="${escapeHTML(current.name)}" autocomplete="off" required autofocus></div><div class="am-field"><label for="am-habit-reward-input">Reward per completion <span>KR</span></label><input id="am-habit-reward-input" name="reward" type="text" inputmode="decimal" value="${inputMoney(current.rewardOre)}" required><p class="am-field-note">Once per day.</p></div><fieldset class="am-field am-schedule"><legend>Available on</legend><div class="am-schedule-days">${[1, 2, 3, 4, 5, 6, 0].map(d => `<label class="am-schedule-day"><input type="checkbox" name="day" value="${d}" ${current.days.includes(d) ? "checked" : ""}><span>${DAY_NAMES[d]}</span></label>`).join("")}</div></fieldset><div class="am-field"><label for="am-habit-target-input">Weekly goal <span>days</span></label><input id="am-habit-target-input" name="target" type="number" min="1" max="${current.days.length}" step="1" value="${current.targetPerWeek}" required><p class="am-field-note">Progress target. Each completion earns its reward.</p></div>${habit ? '<p class="am-field-note">Changes apply from today.</p>' : '<p class="am-field-note">Starts today.</p>'}${formFooter(habit ? "Save habit" : "Add habit")}${habit ? '<button type="button" class="am-delete-link" data-am-action="remove-habit" data-id="' + habit.id + '">Remove habit</button>' : ""}</form>`, { type: "habit", id });
  }
  function openManageHabits() {
    const active = state().habits.filter(h => !h.archivedOn);
    openDialog("Manage habits", `<div class="am-manage-list">${active.map(habit => `<button type="button" class="am-manage-habit" data-am-action="edit-habit" data-id="${habit.id}"><span class="am-habit-copy"><span class="am-habit-name">${escapeHTML(habit.name)}</span><span class="am-habit-meta">${money(habit.rewardOre)} · ${escapeHTML(scheduleLabel(habit))}</span></span><span class="am-manage-edit" aria-hidden="true">${icons.edit}</span></button>`).join("") || '<p class="am-muted">No habits.</p>'}</div><button type="button" class="am-button am-button-primary am-manage-add" data-am-action="add-habit">${icons.plus} Add habit</button>`, { type: "manage" });
  }
  function openWish(id) {
    const view = ledgerView(state());
    const wish = state().wishlist.find(w => w.id === id && !view.purchases.has(w.id));
    if (id && !wish) return;
    openDialog(wish ? "Edit item" : "Add item", `<form class="am-form" data-am-form="wish"><div class="am-field"><label for="am-wish-name-input">Item</label><input id="am-wish-name-input" name="name" type="text" value="${escapeHTML(wish?.name || "")}" maxlength="100" placeholder="Item name" required autofocus></div><div class="am-field"><label for="am-wish-price-input">Price <span>KR</span></label><input id="am-wish-price-input" name="price" type="text" inputmode="decimal" value="${wish ? inputMoney(wish.priceOre) : ""}" placeholder="2 000" required></div>${formFooter(wish ? "Save item" : "Add item")}${wish ? `<button type="button" class="am-delete-link" data-am-action="remove-wish" data-id="${wish.id}">Remove item</button>` : ""}</form>`, { type: "wish", id });
  }
  function openWithdrawal() {
    const balance = ledgerView(state()).balance;
    openDialog("Spend from wallet", `<form class="am-form" data-am-form="withdraw"><p class="am-dialog-intro">Balance: <strong>${money(balance)}</strong></p><div class="am-field"><label for="am-spend-amount-input">Amount <span>KR</span></label><input id="am-spend-amount-input" name="amount" type="text" inputmode="decimal" placeholder="0" required autofocus></div><div class="am-field"><label for="am-spend-reason-input">Item <span>optional</span></label><input id="am-spend-reason-input" name="reason" type="text" maxlength="100" placeholder="Item name"></div>${formFooter("Subtract from wallet")}</form>`, { type: "withdraw" });
  }
  function openConfirmation(title, text, submitLabel, context, danger = false) {
    openDialog(title, `<form class="am-form" data-am-form="confirm"><p class="am-dialog-intro">${escapeHTML(text)}</p>${formFooter(submitLabel, danger)}</form>`, { ...context, dangerous: danger });
  }
  function newEvent(type, data) { return { id: uid("ame"), type, date: today(), at: new Date().toISOString(), ...data }; }

  function toggleHabit(id) {
    const slice = state();
    const habit = slice.habits.find(h => h.id === id);
    if (!habit || selectedDate > today()) return;
    const view = ledgerView(slice);
    const previous = view.completions.get(`${id}|${selectedDate}`);
    if (previous) {
      if (view.balance < previous.amountOre) {
        announce("Those kroner have already been spent. Undo the spending in Purchased, or earn enough to uncheck this habit.");
        return;
      }
      slice.ledger.push(newEvent("undo-earn", { refId: previous.id, habitId: id, amountOre: -previous.amountOre, label: previous.label }));
      save(`${previous.label} unchecked. ${money(previous.amountOre)} removed from your wallet.`);
    } else {
      if (!isScheduled(habit, selectedDate)) return;
      const version = versionAt(habit, selectedDate);
      slice.ledger.push(newEvent("earn", { habitId: id, date: selectedDate, amountOre: version.rewardOre, label: version.name }));
      save(`${version.name} complete. ${money(version.rewardOre)} earned.`, { toast: false });
      const row = $("am-habit-list").querySelector(`[data-am-habit="${id}"]`);
      row?.classList.add("is-earning");
      flashReward(version.rewardOre);
    }
  }
  function onClick(event) {
    const button = event.target.closest("[data-am-action]");
    if (!button || !host.root.contains(button) || button.disabled) return;
    const action = button.dataset.amAction;
    const id = button.dataset.id;
    if (action === "toggle-habit") toggleHabit(id);
    if (action === "select-date") { selectedDate = button.dataset.date; render(); }
    if (action === "today") { selectedDate = today(); render(); }
    if (action === "previous-week" || action === "next-week") { selectedDate = shiftDate(selectedDate, action === "previous-week" ? -7 : 7); if (selectedDate > today()) selectedDate = today(); render(); }
    if (action === "add-habit") openHabit();
    if (action === "manage-habits") openManageHabits();
    if (action === "edit-habit") openHabit(id);
    if (action === "add-wish") openWish();
    if (action === "edit-wish") openWish(id);
    if (action === "withdraw") openWithdrawal();
    if (action === "close-dialog") closeDialog();
    if (action === "wish-view") { wishView = button.dataset.view; renderWishes(state(), ledgerView(state())); }
    if (action === "remove-habit") {
      const habit = state().habits.find(h => h.id === id && !h.archivedOn);
      if (habit) openConfirmation("Remove habit?", `Remove “${habit.name}” from your checklist? History and balance are kept.`, "Remove habit", { type: "remove-habit", id }, true);
    }
    if (action === "remove-wish") {
      const wish = state().wishlist.find(w => w.id === id);
      if (wish) openConfirmation("Remove item?", `Remove “${wish.name}” from your wishlist? Your wallet won't change.`, "Remove item", { type: "remove-wish", id }, true);
    }
    if (action === "purchase") {
      const wish = state().wishlist.find(w => w.id === id);
      const view = ledgerView(state());
      if (wish && !view.purchases.has(id) && view.balance >= wish.priceOre) openConfirmation("Confirm purchase", `Mark “${wish.name}” as purchased? ${money(wish.priceOre)} will leave your wallet, leaving ${money(view.balance - wish.priceOre)}.`, "Yes, purchased", { type: "purchase", id });
    }
    if (action === "undo-withdrawal") {
      const original = ledgerView(state()).withdrawals.get(id);
      if (original) openConfirmation("Undo spending?", `Return ${money(-original.amountOre)} for “${original.label}” to your wallet?`, "Undo spending", { type: "undo-withdraw", id });
    }
    if (action === "undo-purchase") {
      const original = state().ledger.find(e => e.id === id && e.type === "purchase");
      if (original) openConfirmation("Undo purchase?", `Undo “${original.label}” and return ${money(-original.amountOre)} to your wallet.`, "Undo purchase", { type: "refund", id });
    }
  }
  function onChange(event) {
    if (!event.target.matches('input[name="day"]')) return;
    const form = event.target.closest("form");
    const count = form.querySelectorAll('input[name="day"]:checked').length;
    const target = form.elements.target;
    target.max = String(Math.max(1, count));
    if (Number(target.value) > count && count > 0) target.value = String(count);
  }
  function onSubmit(event) {
    const form = event.target.closest("[data-am-form]");
    if (!form) return;
    event.preventDefault();
    const context = dialogContext;
    if (!context) return;
    const slice = state();
    const values = new FormData(form);
    if (context.type === "habit") {
      const name = cleanText(values.get("name"));
      const rewardOre = parseAmount(values.get("reward"));
      const days = values.getAll("day").map(Number).filter(d => ALL_DAYS.includes(d));
      const targetPerWeek = Number(values.get("target"));
      if (!name) return formError("Enter a habit name.");
      if (!rewardOre) return formError("Enter a reward above 0 KR, with no more than two decimals (for example 25 or 12,50).");
      if (!days.length) return formError("Choose at least one available day.");
      if (!Number.isInteger(targetPerWeek) || targetPerWeek < 1 || targetPerWeek > days.length) return formError(`Set a weekly goal from 1 to ${days.length} days.`);
      const from = today();
      const version = { from, name, rewardOre, days: days.sort((a, b) => a - b), targetPerWeek };
      if (context.id) {
        const habit = slice.habits.find(h => h.id === context.id && !h.archivedOn);
        if (!habit) return formError("This habit has changed. Close this window and try again.");
        // Earlier dates keep their schedule. Awarded ledger entries retain
        // their original name and amount independently, including today.
        habit.versions = habit.versions.filter(v => v.from !== from);
        habit.versions.push(version);
        Object.assign(habit, version);
      } else slice.habits.push({ id: uid("amh"), ...version, createdOn: from, archivedOn: null, versions: [version] });
      closeDialog();
      save(context.id ? "Habit saved." : "Habit added.");
    } else if (context.type === "wish") {
      const name = cleanText(values.get("name"));
      const priceOre = parseAmount(values.get("price"));
      if (!name) return formError("Enter an item name.");
      if (!priceOre) return formError("Enter a price above 0 KR, with no more than two decimals.");
      if (context.id) {
        const wish = slice.wishlist.find(w => w.id === context.id);
        if (!wish || ledgerView(slice).purchases.has(wish.id)) return formError("This wish has changed. Close this window and try again.");
        Object.assign(wish, { name, priceOre });
      } else slice.wishlist.push({ id: uid("amw"), name, priceOre, createdAt: new Date().toISOString() });
      closeDialog(); wishView = "wishlist"; save(context.id ? "Item saved." : "Item added.");
    } else if (context.type === "withdraw") {
      const amount = parseAmount(values.get("amount"));
      const balance = ledgerView(slice).balance;
      if (!amount) return formError("Enter an amount above 0 KR, with no more than two decimals.");
      if (amount > balance) return formError(`Your wallet has ${money(balance)}. Enter that amount or less.`);
      slice.ledger.push(newEvent("withdraw", { amountOre: -amount, label: cleanText(values.get("reason"), "Expense") }));
      closeDialog(); wishView = "purchases"; save(`${money(amount)} subtracted from your wallet.`);
    } else {
      const view = ledgerView(slice);
      if (context.type === "remove-habit") {
        const habit = slice.habits.find(h => h.id === context.id && !h.archivedOn);
        if (!habit) return formError("This habit has already been removed.");
        habit.archivedOn = today();
      } else if (context.type === "remove-wish") {
        if (view.purchases.has(context.id)) return formError("A purchased item must be undone before it can be removed.");
        slice.wishlist = slice.wishlist.filter(w => w.id !== context.id);
      } else if (context.type === "purchase") {
        const wish = slice.wishlist.find(w => w.id === context.id);
        if (!wish || view.purchases.has(wish.id)) return formError("This wish has already been purchased or removed.");
        if (wish.priceOre > view.balance) return formError("Your wallet balance has changed. Insufficient balance.");
        slice.ledger.push(newEvent("purchase", { itemId: wish.id, label: wish.name, amountOre: -wish.priceOre }));
        wishView = "purchases";
      } else if (context.type === "undo-withdraw") {
        if (!refundWithdrawal(slice, context.id)) return formError("This spending has already been undone.");
      } else if (context.type === "refund") {
        const original = slice.ledger.find(e => e.id === context.id && e.type === "purchase");
        if (!original || view.purchases.get(original.itemId)?.id !== original.id) return formError("This purchase has already been undone.");
        slice.ledger.push(newEvent("refund", { itemId: original.itemId, refId: original.id, label: original.label, amountOre: -original.amountOre }));
        if (!slice.wishlist.some(w => w.id === original.itemId)) slice.wishlist.push({ id: original.itemId, name: original.label, priceOre: -original.amountOre, createdAt: original.at });
        wishView = "wishlist";
      } else return;
      closeDialog(); save({ "remove-habit": "Habit removed.", "remove-wish": "Item removed.", purchase: "Purchase recorded.", refund: "Purchase refunded.", "undo-withdraw": "Spending undone." }[context.type]);
      if (["purchase", "refund", "undo-withdraw"].includes(context.type)) {
        $(wishView === "wishlist" ? "am-wishlist-tab" : "am-purchases-tab").focus({ preventScroll: true });
      }
    }
  }

  function hasData(slice) {
    if (!slice || typeof slice !== "object") return false;
    if (slice.ledger?.length || slice.wishlist?.length) return true;
    if (!Array.isArray(slice.habits)) return false;
    const defaults = defaultState().habits;
    if (slice.habits.length !== defaults.length) return true;
    return slice.habits.some(h => {
      const original = defaults.find(d => d.id === h.id);
      return !original || h.archivedOn || h.versions?.length > 1 || h.name !== original.name || h.rewardOre !== original.rewardOre || h.targetPerWeek !== original.targetPerWeek || JSON.stringify(h.days) !== JSON.stringify(original.days);
    });
  }
  window.Amulet = { buildTemplate: defaultState, normalize, mount, render, hasData,
    // Pure operations are also exposed for regression testing of wallet math.
    model: { ledgerView, refundWithdrawal, goalStats, parseAmount, isScheduled, versionAt, today, shiftDate } };
})();
