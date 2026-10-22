const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const ROOT = process.env.AMULET_TEST_ROOT || path.resolve(__dirname, '..');

// Only the DOM operations touched by these behaviors are simulated. No Google
// account, browser storage or network endpoint is accessed by this harness.
function harness({ configured = true } = {}) {
  let now = new Date('2026-10-18T10:00:00+02:00').getTime();
  class Clock extends Date {
    constructor(...args) { super(...(args.length ? args : [now])); }
    static now() { return now; }
  }
  const elements = new Map(), intervals = new Map(), storage = new Map(), events = new Map();
  const addEventListener = (name, callback) => { if (!events.has(name)) events.set(name, []); events.get(name).push(callback); };
  let timerId = 0;
  const document = { activeElement: null, hidden: false, addEventListener };
  class Element {
    constructor(tag = 'div') {
      this.tagName = tag.toUpperCase(); this.dataset = {}; this.children = [];
      this.value = ''; this.hidden = false; this.open = false; this.events = new Map();
      this.style = { setProperty() {} }; this.attributes = {}; this.clientWidth = 256;
      this.classes = new Set(); this.classList = {
        add: value => this.classes.add(value), remove: value => this.classes.delete(value),
        contains: value => this.classes.has(value), toggle: (value, on) => on ? this.classes.add(value) : this.classes.delete(value),
      };
    }
    get childElementCount() { return this.children.length; }
    appendChild(child) { child.parentElement = this; this.children.push(child); return child; }
    replaceChildren(...children) { this.children = []; children.forEach(child => {
      if (child.fragment) child.children.forEach(item => this.appendChild(item)); else this.appendChild(child);
    }); }
    matches(selector) {
      if (selector === '[data-habit-id]' || selector === 'button[data-habit-id]') return Boolean(this.dataset.habitId);
      if (selector === '[data-field]') return Boolean(this.dataset.field);
      if (selector === '[data-google-retry]') return Boolean(this.dataset.googleRetry);
      if (selector === 'input') return this.tagName === 'INPUT';
      const field = /\[data-field=["']([^"']+)["']\]/.exec(selector);
      return Boolean(field && this.dataset.field === field[1]);
    }
    querySelectorAll(selector) { return this.children.flatMap(child => [ ...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector) ]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
    contains(target) { return target === this || this.children.some(child => child.contains(target)); }
    addEventListener(name, listener) { this.events.set(name, listener); }
    click() { this.events.get('click')?.({ currentTarget: this, target: this }); }
    focus() { document.activeElement = this; }
    setSelectionRange(start, end) { this.selectionStart = start; this.selectionEnd = end; }
    setAttribute(name, value) { this.attributes[name] = value; }
    scrollIntoView() { this.scrolled = true; }
    reportValidity() { return !this.invalid; }
    close() { this.open = false; this.closeCount = (this.closeCount || 0) + 1; }
    showModal() { this.open = true; }
    remove() { this.removed = true; }
  }
  document.createElement = tag => new Element(tag);
  document.createDocumentFragment = () => Object.assign(new Element(), { fragment: true });
  document.getElementById = id => elements.get(id) || null;
  document.querySelectorAll = selector => [...elements.values()].filter(element => element.matches(selector));
  document.querySelector = () => null;
  document.head = new Element('head'); document.body = new Element('body');
  const localStorage = { get length() { return storage.size; }, key: index => [...storage.keys()][index] ?? null, getItem: key => storage.get(key) || null, setItem: (key, value) => storage.set(key, String(value)), removeItem: key => storage.delete(key) };
  const window = { localStorage, addEventListener, matchMedia: () => ({ matches: true }), scrollTo() {},
    setTimeout: () => ++timerId, clearTimeout() {},
    setInterval: callback => { intervals.set(++timerId, callback); return timerId; }, clearInterval: id => intervals.delete(id),
    DISCIPLINE_OS_AUTH_CONFIG: { googleClientId: configured ? 'synthetic-test-client' : '' } };
  let fetchHandler = async () => { throw new Error('Unexpected test network request'); };
  const context = vm.createContext({ window, document, navigator: {}, URL, Date: Clock, Intl, Map, Set, Math, Number,
    String, Boolean, Array, Object, JSON, Uint8Array, atob: value => Buffer.from(value, 'base64').toString('binary'),
    setTimeout: window.setTimeout, clearTimeout: window.clearTimeout, clearInterval: window.clearInterval,
    fetch: (...args) => fetchHandler(...args), console });
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'amulet.js'), 'utf8'), context);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'sync-merge.js'), 'utf8'), context);
  let source = fs.readFileSync(path.join(ROOT, 'app.js'), 'utf8')
    .replace(/  window\.Amulet\.mount\(\{[\s\S]*?\n  \}\);/, '')
    .replace('  initialize();', '  // Explicit isolated test setup.');
  const cut = source.lastIndexOf('})();');
  source = source.slice(0, cut) + `
    renderAll = () => {};
    window.__core = {
      refs, state, exUi, googleAuthRuntime, initializeGoogleAuth, openGoogleSignIn, handleGoogleCredential,
      signOutGoogle, exchangeIdTokenForSession, setDateInputDefault, rememberDateSelection, refreshCalendarDay,
      isValidDateKey, exAddMeal, exUpdateMeal, exAddWorkout, exAddWeight, cafAddEntry, renderDayDetails,
      renderExWorkoutCalendar, handleSaveMealEdit, renderHabitEditor, saveHabitFromEditorRow, bindDialogSaveForms,
      countMuscleSessions, animateHabitToggle, renderViewMode, positionHeatmapOnce,
      cursors: () => ({ week: toDateKey(weekCursor), month: toDateKey(monthCursor) }),
      setWeek: date => { weekCursor = fromDateKey(date); },
      stub: hooks => {
        if (hooks.toast) showToast = hooks.toast;
        if (hooks.sidebar) openSidebar = hooks.sidebar;
        if (hooks.editorGroup) renderHabitEditorGroup = hooks.editorGroup;
      },
    };
  ` + source.slice(cut);
  vm.runInContext(source, context);
  const api = window.__core;
  const messages = []; api.stub({ toast: message => messages.push(message) });
  function node(id, tag = 'div') { const result = new Element(tag); elements.set(id, result); api.refs[id] = result; return result; }
  function google({ promptFails = false, initFails = false } = {}) {
    const calls = { initialize: 0, buttons: 0, prompts: 0 };
    window.google = { accounts: { id: {
      initialize() { calls.initialize++; if (initFails) throw Error('Initialization unavailable'); },
      renderButton(container, options) { calls.buttons++; assert.ok(options.width <= 256); container.appendChild(new Element('iframe')); },
      prompt() { calls.prompts++; if (promptFails) throw Error('One Tap suppressed'); },
      disableAutoSelect() {},
    } } };
    return calls;
  }
  return { ...api, window, document, Element, node, google, messages, intervals, storage,
    advance: milliseconds => { now += milliseconds; }, setFetch: handler => { fetchHandler = handler; } };
}
let total = 0;
async function test(name, run) { await run(); total++; console.log('PASS', name); }
function authNodes(h) { ['googleSignInButton', 'googleSignInBannerButton', 'googleSignInError', 'signInBannerBtn', 'drawerAccount', 'authStatusText'].forEach(id => h.node(id)); }

(async () => {
  await test('real Google buttons remain available when One Tap is suppressed; custom action never prompts', async () => {
    const h = harness(); authNodes(h); const calls = h.google({ promptFails: true });
    assert.equal(await h.initializeGoogleAuth(), true);
    assert.equal(calls.buttons, 2); assert.equal(h.refs.signInBannerBtn.hidden, true);
    let opened = 0; h.stub({ sidebar: () => opened++ }); h.openGoogleSignIn(); await Promise.resolve();
    assert.equal(opened, 1); assert.equal(calls.prompts, 1); assert.equal(calls.initialize, 1);
    assert.equal(h.refs.drawerAccount.scrolled, true); assert.equal(calls.buttons, 2, 'status refresh retains Google iframes');
  });
  await test('missing Google script shows an actionable error and a later retry recovers', async () => {
    const h = harness(); authNodes(h); const attempt = h.initializeGoogleAuth();
    h.advance(8100); [...h.intervals.values()].forEach(callback => callback());
    assert.equal(await attempt, false); assert.equal(h.refs.googleSignInError.hidden, false);
    assert.match(h.refs.googleSignInError.textContent, /try again/);
    const retry = h.initializeGoogleAuth({ retry: true }); assert.equal(h.document.head.children.length, 1);
    const calls = h.google(); [...h.intervals.values()].forEach(callback => callback());
    assert.equal(await retry, true); assert.equal(calls.buttons, 2); assert.equal(h.refs.googleSignInError.hidden, true);
  });
  await test('Google initialization failure is caught and can be retried', async () => {
    const h = harness(); authNodes(h); h.google({ initFails: true });
    assert.equal(await h.initializeGoogleAuth(), false);
    const calls = h.google(); assert.equal(await h.initializeGoogleAuth({ retry: true }), true); assert.equal(calls.buttons, 2);
  });
  await test('missing Google configuration produces a visible error without polling', async () => {
    const h = harness({ configured: false }); authNodes(h);
    assert.equal(await h.initializeGoogleAuth(), false); assert.equal(h.intervals.size, 0);
    assert.match(h.refs.authStatusText.textContent, /not configured/); assert.equal(h.refs.googleSignInError.hidden, true);
  });
  await test('a fresh Google credential cannot retain the previous account session', () => {
    const h = harness();
    h.state.auth.email = 'previous@example.test';
    h.state.auth.sessionToken = 'previous-synthetic-session'; h.state.auth.sessionExpiresAt = '2099-01-01';
    const payload = Buffer.from(JSON.stringify({ email: 'example@example.test', exp: Math.floor(new Date('2026-10-18T12:00:00+02:00').getTime() / 1000) })).toString('base64url');
    h.handleGoogleCredential({ credential: `test.${payload}.test` });
    assert.equal(h.state.auth.sessionToken, ''); assert.equal(h.state.auth.email, 'example@example.test'); assert.equal(h.state.auth.signedIn, true);
  });
  await test('a late session exchange cannot sign the user back in after sign-out', async () => {
    const h = harness();
    const payload = Buffer.from(JSON.stringify({ email: 'example@example.test', exp: Date.parse('2026-10-18T12:00:00+02:00') / 1000 })).toString('base64url');
    h.state.auth.idToken = `synthetic.${payload}.signature`; h.state.cloud.webAppUrl = 'https://example.test/exec';
    let finish; h.setFetch(() => new Promise(resolve => { finish = resolve; }));
    const exchange = h.exchangeIdTokenForSession(); h.signOutGoogle();
    finish({ ok: true, json: async () => ({ ok: true, sessionToken: 'synthetic-session', expiresAt: '2099-01-01' }) }); await exchange;
    assert.equal(h.state.auth.sessionToken, ''); assert.equal(h.state.auth.signedIn, false);
  });
  await test('midnight advances default dates and latest Habits view while preserving a selected historical date', () => {
    const h = harness(); const meal = h.node('exMealDateInput', 'input'); const caffeine = h.node('cafDateInput', 'input');
    h.setDateInputDefault(meal); h.setDateInputDefault(caffeine);
    caffeine.value = '2026-10-12'; h.rememberDateSelection(caffeine);
    h.advance(24 * 3600 * 1000); assert.equal(h.refreshCalendarDay(), true);
    assert.equal(meal.value, '2026-10-19'); assert.equal(meal.max, '2026-10-19');
    assert.equal(caffeine.value, '2026-10-12'); assert.equal(caffeine.max, '2026-10-19'); assert.equal(h.cursors().week, '2026-10-19');
    h.setWeek('2026-09-20'); h.advance(24 * 3600 * 1000); h.refreshCalendarDay(); assert.equal(h.cursors().week, '2026-09-20');
  });
  await test('invalid calendar dates and future entries are rejected without moving data to today', () => {
    const h = harness(); assert.equal(h.isValidDateKey('2026-02-30'), false); assert.equal(h.isValidDateKey('2024-02-29'), true);
    assert.equal(h.exAddMeal({ calories: 100, dateKey: '2026-10-19' }), null);
    assert.equal(h.exAddWorkout({ muscleGroups: ['legs'], dateKey: '2026-02-30' }), null);
    assert.equal(h.cafAddEntry({ cups: 1, dateKey: '2026-10-19' }), null);
    assert.equal(Object.keys(h.state.exercise.meals).length, 0);
    const original = h.exAddMeal({ calories: 200, dateKey: '2026-10-18' });
    assert.equal(h.exUpdateMeal(original.dateKey, original.meal.id, { dateKey: '2026-10-19' }), false);
    assert.equal(h.state.exercise.meals['2026-10-18'].length, 1);
  });
  await test('out-of-range weights and caffeine are rejected rather than silently clamped', () => {
    const h = harness(); assert.equal(h.exAddWeight({ kg: 5 }), null); assert.equal(h.exAddWeight({ kg: 500 }), null);
    assert.equal(h.exAddWeight({ kg: 75.4 }).kg, 75.4); assert.equal(h.cafAddEntry({ cups: 41 }), null);
    assert.equal(h.cafAddEntry({ cups: 0.5 }).cups, 0.5);
  });
  await test('editing a meal to empty nutrition keeps the dialog and original record', () => {
    const h = harness(); const record = h.exAddMeal({ calories: 500, protein: 20 });
    h.exUi.editingMealKey = `${record.dateKey}|${record.meal.id}`;
    for (const id of ['exMealEditCalories', 'exMealEditProtein', 'exMealEditDate', 'exMealEditNote']) h.node(id, 'input');
    h.refs.exMealEditDate.value = record.dateKey; h.refs.exMealEditTypeButtons = [];
    const modal = h.node('exMealEditModal'); modal.open = true;
    h.handleSaveMealEdit(); assert.equal(modal.open, true); assert.equal(h.state.exercise.meals[record.dateKey][0].calories, 500);
    assert.match(h.messages.at(-1), /calories or protein/);
  });
  await test('Day Details note draft survives a completion redraw', () => {
    const h = harness(); ['dayDetailsTitle', 'dayDetailsSummary', 'dayDetailsTrack', 'dayDetailsRate', 'dayDetailsNoteInput', 'dayDetailsHabitsList'].forEach(id => h.node(id));
    h.state.dayNotes['2026-10-18'] = 'Saved'; h.renderDayDetails('2026-10-18');
    assert.equal(h.refs.dayDetailsNoteInput.value, 'Saved'); h.refs.dayDetailsNoteInput.value = 'Unsaved draft';
    h.renderDayDetails('2026-10-18', { preserveNote: true }); assert.equal(h.refs.dayDetailsNoteInput.value, 'Unsaved draft');
  });
  await test('session-only workout calendar shows Session without invented zero PR statistics', () => {
    const h = harness(); h.node('exWorkoutCalendar'); h.exAddWorkout({ muscleGroups: ['legs'] }); h.renderExWorkoutCalendar();
    assert.match(h.refs.exWorkoutCalendar.innerHTML, />Session</); assert.doesNotMatch(h.refs.exWorkoutCalendar.innerHTML, /0×0|0kg e1RM/);
  });
  await test('muscle session frequency counts each group once per day, even with several lifts', () => {
    const h = harness(); const counts = h.countMuscleSessions({ a: [{ muscleGroups: ['legs', 'back'] }, { muscleGroups: ['legs'] }], b: [{ muscleGroups: ['legs'] }] }, ['a', 'b']);
    assert.equal(counts.legs, 2); assert.equal(counts.back, 1);
  });
  await test('Enter/Done uses the Save action and invalid input never closes the native dialog', () => {
    const h = harness(); const form = h.node('exMealEditForm', 'form'); const input = new h.Element('input'); form.appendChild(input);
    const button = h.node('exSaveMealEditBtn', 'button'); let saved = 0; button.addEventListener('click', () => saved++);
    h.bindDialogSaveForms(); let prevented = 0;
    form.events.get('submit')({ currentTarget: form, preventDefault: () => prevented++ }); assert.equal(saved, 1); assert.equal(prevented, 1);
    input.invalid = true; form.events.get('submit')({ currentTarget: form, preventDefault: () => prevented++ }); assert.equal(saved, 1); assert.equal(prevented, 2);
  });
  await test('native single-line Enter saves multi-input forms without relying on implicit submit', () => {
    const h = harness(); const form = h.node('exMealEditForm', 'form');
    const calories = new h.Element('input'); calories.type = 'number';
    const protein = new h.Element('input'); protein.type = 'text'; form.appendChild(calories); form.appendChild(protein);
    const button = h.node('exSaveMealEditBtn', 'button'); let saved = 0; button.addEventListener('click', () => saved++);
    h.bindDialogSaveForms(); const onKey = form.events.get('keydown'); let prevented = 0;
    const event = { key: 'Enter', target: calories, preventDefault: () => prevented++ };
    onKey(event); assert.equal(saved, 1); assert.equal(prevented, 1);
    calories.invalid = true; onKey(event); assert.equal(saved, 1); assert.equal(prevented, 2);
    calories.invalid = false;
    for (const ignored of [{ isComposing: true }, { keyCode: 229 }, { ctrlKey: true }, { metaKey: true }, { shiftKey: true }, { altKey: true }, { defaultPrevented: true }]) onKey({ ...event, ...ignored });
    onKey({ ...event, target: new h.Element('textarea') }); onKey({ ...event, target: new h.Element('select') });
    const date = new h.Element('input'); date.type = 'date'; onKey({ ...event, target: date });
    assert.equal(saved, 1); assert.equal(prevented, 2, 'IME, modifiers, textarea, selects and date pickers keep their native behavior');
  });
  await test('Year view hides unsupported period controls and preserves a manually scrolled history', () => {
    const h = harness(); const buttons = ['prevPeriodBtn', 'todayBtn', 'nextPeriodBtn'].map(id => h.node(id, 'button'));
    const view = h.node('heatmapView'); const scroller = new h.Element(); scroller.scrollWidth = 1400; scroller.scrollLeft = 0;
    view.querySelector = selector => selector === '.heatmap-scroll' ? scroller : null;
    h.window.requestAnimationFrame = callback => callback(); h.state.viewMode = 'heatmap'; h.renderViewMode();
    assert.ok(buttons.every(button => button.hidden)); h.positionHeatmapOnce(); assert.equal(scroller.scrollLeft, 1400);
    scroller.scrollLeft = 300; h.positionHeatmapOnce(); assert.equal(scroller.scrollLeft, 300, 'background redraw must not reset horizontal reading position');
    h.state.viewMode = 'week'; h.renderViewMode(); assert.ok(buttons.every(button => !button.hidden));
  });
  await test('habit editor preserves dirty fields and caret through background state updates', () => {
    const h = harness(); const editor = h.node('habitEditorList');
    h.stub({ editorGroup: (_title, habits) => {
      const group = new h.Element(); habits.forEach(habit => {
        const row = new h.Element(); row.dataset.habitId = habit.id;
        const saved = { name: habit.name, icon: habit.icon, type: habit.type, targetPerWeek: String(habit.targetPerWeek) };
        for (const [field, value] of Object.entries(saved)) { const input = new h.Element('input'); input.dataset.field = field; input.value = value; row.appendChild(input); }
        row.dataset.savedFields = JSON.stringify(saved); group.appendChild(row);
      }); return group;
    } });
    h.renderHabitEditor(); const row = editor.querySelectorAll('[data-habit-id]')[0]; const input = row.querySelector('[data-field="name"]');
    input.value = 'My unsaved rename'; input.focus(); input.setSelectionRange(3, 7); h.renderHabitEditor(); assert.equal(h.document.activeElement, input);
    const other = h.state.habits.find(habit => habit.id !== row.dataset.habitId); other.name = 'Cloud changed another habit'; h.renderHabitEditor();
    const updatedRow = editor.querySelectorAll('[data-habit-id]').find(item => item.dataset.habitId === row.dataset.habitId);
    const updatedInput = updatedRow.querySelector('[data-field="name"]'); assert.equal(updatedInput.value, 'My unsaved rename');
    assert.equal(h.document.activeElement, updatedInput); assert.equal(updatedInput.selectionStart, 3); assert.equal(updatedInput.selectionEnd, 7);
  });
  console.log(`${total} core UX regressions passed`);
})().catch(error => { console.error(error); process.exitCode = 1; });
