// Frozen compatibility fixture from amulet.js at edf1851ae16b4b54201d189ec33179d780fb9163.
// Keep this released normalizer unchanged; it represents a cached client.
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

  window.LegacyAmulet = { normalize };
})();
