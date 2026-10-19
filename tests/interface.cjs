const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = process.env.AMULET_TEST_ROOT || path.resolve(__dirname, '..');

// A small event/DOM harness exercises real ui.js listeners, observer callbacks,
// and timers without a browser dependency or changing any saved app data.
function harness({ reducedMotion = false } = {}) {
  const observers = [];
  const resizeObservers = [];
  const timers = new Map();
  let timerId = 0;
  const scrolls = [];
  let document;
  function changed(target, name, type = 'attributes') {
    for (const observer of observers) {
      if (observer.targets.some(([node, options]) => (node === target || (options.subtree && node.contains(target))) && (type === 'childList' ? options.childList : options.attributes && (!options.attributeFilter || options.attributeFilter.includes(name))))) observer.pending = true;
    }
  }
  class Style {
    constructor() { this.values = new Map(); this.priorities = new Map(); }
    getPropertyValue(name) { return this.values.get(name) || ''; }
    getPropertyPriority(name) { return this.priorities.get(name) || ''; }
    setProperty(name, value, priority = '') { this.values.set(name, String(value)); this.priorities.set(name, priority); }
    removeProperty(name) { this.values.delete(name); this.priorities.delete(name); }
  }
  const style = () => new Proxy(new Style(), {
    get(target, name) { return name in target ? (typeof target[name] === 'function' ? target[name].bind(target) : target[name]) : target.getPropertyValue(String(name).replace(/[A-Z]/g, char => '-' + char.toLowerCase())); },
    set(target, name, value) { target.setProperty(String(name).replace(/[A-Z]/g, char => '-' + char.toLowerCase()), value); return true; },
  });
  class Element {
    constructor(tag, attrs = {}) {
      this.tagName = tag.toUpperCase(); this.attrs = new Map(); this.children = []; this.parentElement = null;
      this.listeners = new Map(); this.style = style(); this.disabled = false;
      this.tabIndex = ['BUTTON', 'INPUT', 'SELECT', 'TEXTAREA', 'A', 'SUMMARY', 'IFRAME'].includes(this.tagName) ? 0 : -1;
      this.rect = { left: 100, right: 400, top: 100, bottom: 500, height: 400 };
      this.classList = {
        contains: value => (this.attrs.get('class') || '').split(' ').includes(value),
        add: value => { if (!this.classList.contains(value)) this.setAttribute('class', [...(this.attrs.get('class') || '').split(' ').filter(Boolean), value].join(' ')); },
        remove: value => this.setAttribute('class', (this.attrs.get('class') || '').split(' ').filter(item => item !== value).join(' ')),
        toggle: (value, force) => { const present = force === undefined ? !this.classList.contains(value) : force; this.classList[present ? 'add' : 'remove'](value); return present; },
      };
      for (const [name, value] of Object.entries(attrs)) this.setAttribute(name, value);
    }
    get id() { return this.getAttribute('id') || ''; }
    set id(value) { this.setAttribute('id', value); }
    get hidden() { return this.hasAttribute('hidden'); }
    set hidden(value) { if (value) this.setAttribute('hidden', ''); else this.removeAttribute('hidden'); }
    get inert() { return this.hasAttribute('inert'); }
    set inert(value) { if (value) this.setAttribute('inert', ''); else this.removeAttribute('inert'); }
    get open() { return this.hasAttribute('open'); }
    set open(value) { if (value) this.setAttribute('open', ''); else this.removeAttribute('open'); }
    get isConnected() { return this === document || Boolean(this.parentElement?.isConnected); }
    setAttribute(name, value) { const next = String(value); if (this.attrs.get(name) === next) return; this.attrs.set(name, next); changed(this, name); }
    getAttribute(name) { return this.attrs.get(name) ?? null; }
    hasAttribute(name) { return this.attrs.has(name); }
    removeAttribute(name) { if (this.attrs.delete(name)) changed(this, name); }
    appendChild(child) {
      if (child.parentElement) child.parentElement.children = child.parentElement.children.filter(item => item !== child);
      child.parentElement = this; this.children.push(child); changed(this, '', 'childList'); return child;
    }
    contains(node) { return this === node || this.children.some(child => child.contains(node)); }
    matches(selector) {
      return selector.split(',').some(part => {
        part = part.trim();
        if (part.startsWith('.')) return this.classList.contains(part.slice(1));
        if (part.startsWith('#')) return this.id === part.slice(1);
        const match = part.match(/^([a-z][a-z0-9]*)?(?:\[([^\]]+)\])?$/i);
        return Boolean(match && (!match[1] || this.tagName === match[1].toUpperCase()) && (!match[2] || this.hasAttribute(match[2])));
      });
    }
    closest(selector) { return this.matches(selector) ? this : this.parentElement?.closest(selector) || null; }
    querySelectorAll(selector) { return this.children.flatMap(child => [...(child.matches(selector) ? [child] : []), ...child.querySelectorAll(selector)]); }
    querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
    getClientRects() { return this.closest('[hidden]') ? [] : [this.rect]; }
    getBoundingClientRect() { return this.rect; }
    addEventListener(name, fn, options) { const list = this.listeners.get(name) || []; list.push({ fn, capture: options === true || options?.capture }); this.listeners.set(name, list); }
    focus() { if (!this.isConnected || this.closest('[hidden]') || document.activeElement === this) return; document.activeElement = this; dispatch(this, 'focusin'); }
    click() { dispatch(this, 'click'); }
    showModal() { this.opener = document.activeElement; this.open = true; (this.querySelector('button, input') || this).focus(); }
    close() { if (!this.open) return; this.open = false; this.opener?.focus(); dispatch(this, 'close'); }
  }
  function dispatch(target, type, properties = {}) {
    const event = { type, target, defaultPrevented: false, stopped: false, ...properties,
      preventDefault() { this.defaultPrevented = true; }, stopPropagation() { this.stopped = true; } };
    const route = []; for (let node = target; node; node = node.parentElement) route.push(node);
    for (const node of [...route].reverse()) {
      for (const listener of node.listeners.get(type) || []) if (listener.capture) listener.fn(event);
      if (event.stopped) return event;
    }
    for (const node of route) {
      for (const listener of node.listeners.get(type) || []) if (!listener.capture) listener.fn(event);
      if (event.stopped) break;
    }
    return event;
  }
  document = new Element('document');
  document.documentElement = document.appendChild(new Element('html'));
  document.documentElement.clientWidth = 390;
  document.body = document.documentElement.appendChild(new Element('body'));
  document.getElementById = id => document.querySelector('#' + id);
  document.activeElement = document.body;
  const add = (parent, tag, attrs) => parent.appendChild(new Element(tag, attrs));
  const app = add(document.body, 'main', { class: 'app-column' });
  const header = add(app, 'header', { class: 'top-bar' }); header.rect.height = 64;
  const menu = add(header, 'button', { id: 'openSidebarBtn' });
  const backgroundButton = add(app, 'button', { id: 'backgroundButton' });
  const drawer = add(document.body, 'aside', { id: 'sidebarDrawer', hidden: '' });
  const close = add(drawer, 'button', { id: 'closeSidebarBtn' });
  const sync = add(drawer, 'button', { id: 'openSyncBtn' });
  const modal = add(document.body, 'dialog', { id: 'syncModal' });
  add(modal, 'h2');
  const modalClose = add(modal, 'button', { 'data-dialog-dismiss': '' });
  add(modal, 'input');
  const secondModal = add(app, 'dialog', { id: 'am-dialog' });
  add(secondModal, 'h3'); add(secondModal, 'button');
  const toast = add(document.body, 'div', { id: 'toast' });
  const group = add(app, 'div', { class: 'view-switch', role: 'tablist' });
  const week = add(group, 'button', { class: 'active' }); const month = add(group, 'button');
  close.addEventListener('click', () => { drawer.hidden = true; });
  document.addEventListener('keydown', event => { if (event.key === 'Escape' && !drawer.hidden) drawer.hidden = true; });
  class MutationObserver {
    constructor(fn) { this.fn = fn; this.targets = []; this.pending = false; observers.push(this); }
    observe(target, options) { this.targets.push([target, options]); }
  }
  class ResizeObserver { constructor(fn) { this.fn = fn; resizeObservers.push(this); } observe() {} }
  const window = { scrollX: 0, scrollY: 540, innerWidth: 400, getComputedStyle: () => ({ paddingRight: '8px' }),
    scrollTo: (...args) => scrolls.push(args), matchMedia: () => ({ matches: reducedMotion }), ResizeObserver,
    setTimeout: fn => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id), addEventListener: () => {} };
  const context = vm.createContext({ document, window, MutationObserver, ResizeObserver, console, clearTimeout: window.clearTimeout });
  vm.runInContext(fs.readFileSync(path.join(root, 'ui.js'), 'utf8'), context);
  function flush() {
    for (let round = 0; observers.some(observer => observer.pending); round++) {
      if (round > 20) throw new Error('Mutation observer loop');
      observers.filter(observer => observer.pending).forEach(observer => { observer.pending = false; observer.fn([]); });
    }
  }
  function finishTimers() { const current = [...timers.values()]; timers.clear(); current.forEach(fn => fn()); flush(); }
  flush();
  return { document, window, drawer, app, menu, close, sync, modal, modalClose, secondModal, toast, week, month, group, backgroundButton, header, resizeObservers, dispatch, flush, finishTimers, timers, scrolls };
}

const h = harness();
h.menu.focus(); h.drawer.hidden = false; h.flush();
assert.equal(h.document.activeElement, h.close);
assert.equal(h.app.inert, true);
assert.equal(h.menu.getAttribute('aria-expanded'), 'true');
assert.equal(h.document.body.style.position, 'fixed');
assert.equal(h.document.body.style.top, '-540px');
assert.equal(h.document.body.style.paddingRight, '18px');
h.sync.focus();
assert.equal(h.dispatch(h.sync, 'keydown', { key: 'Tab', shiftKey: false }).defaultPrevented, true);
assert.equal(h.document.activeElement, h.close);
h.dispatch(h.close, 'keydown', { key: 'Tab', shiftKey: true });
assert.equal(h.document.activeElement, h.sync);
h.backgroundButton.focus();
assert.equal(h.document.activeElement, h.close);
console.log('PASS drawer focuses, isolates background, traps Tab in both directions, and locks the current scroll position');

h.sync.focus(); h.modal.showModal(); h.flush();
assert.equal(h.toast.parentElement, h.modal);
assert.equal(h.modal.hasAttribute('aria-labelledby'), true);
h.dispatch(h.modal, 'keydown', { key: 'Escape' });
assert.equal(h.drawer.hidden, false, 'Escape must not close drawer underneath a native dialog');
const cancel = h.dispatch(h.modal, 'cancel');
assert.equal(cancel.defaultPrevented, true);
assert.equal(h.modal.open, true, 'modal remains in the top layer during its short exit');
assert.equal(h.modal.classList.contains('is-closing'), true);
h.finishTimers();
assert.equal(h.modal.open, false);
assert.equal(h.document.activeElement, h.sync);
assert.equal(h.document.body.style.position, 'fixed', 'underlying drawer keeps scroll locked');
assert.equal(h.toast.parentElement, h.document.body);
h.close.click(); h.flush();
assert.equal(h.document.activeElement, h.menu);
assert.equal(h.app.inert, false);
assert.equal(h.menu.getAttribute('aria-expanded'), 'false');
assert.equal(h.document.body.style.position, '');
assert.deepEqual(h.scrolls.at(-1), [0, 540]);
console.log('PASS nested dialog Escape preserves drawer, returns focus, and unlocks scrolling only after the last overlay closes');

h.modal.showModal(); h.flush();
for (const type of ['pointerdown', 'click']) h.dispatch(h.modal, type, { clientX: 105, clientY: 110 });
assert.equal(h.timers.size, 0, 'clicking dialog padding must not dismiss it');
h.dispatch(h.modal, 'pointerdown', { clientX: 150, clientY: 150 });
h.dispatch(h.modal, 'click', { clientX: 10, clientY: 10 });
assert.equal(h.timers.size, 0, 'dragging from inside to outside must not dismiss it');
for (const type of ['pointerdown', 'click']) h.dispatch(h.modal, type, { clientX: 10, clientY: 10 });
assert.equal(h.timers.size, 1);
h.finishTimers(); assert.equal(h.modal.open, false);
h.modal.showModal(); h.flush(); h.modalClose.click(); h.finishTimers();
assert.equal(h.modal.open, false, 'shared header close works');
console.log('PASS backdrop and header dismissal work while interior padding and drag-out clicks remain safe');

h.modal.showModal(); h.flush(); h.secondModal.showModal(); h.flush();
assert.equal(h.toast.parentElement, h.secondModal);
h.secondModal.close(); h.flush();
assert.equal(h.toast.parentElement, h.modal);
h.toast.textContent = 'Previous message'; h.toast.classList.add('show'); h.window.AppUI.hideToast();
assert.equal(h.toast.textContent, ''); assert.equal(h.toast.classList.contains('show'), false);
h.modal.close(); h.flush();
assert.equal(h.toast.parentElement, h.document.body);
console.log('PASS toast follows the topmost dialog, returns safely, and can be cleared before local completion feedback');

h.week.classList.remove('active'); h.month.classList.add('active'); h.flush();
assert.equal(h.group.getAttribute('role'), 'group');
assert.equal(h.week.getAttribute('aria-pressed'), 'false');
assert.equal(h.month.getAttribute('aria-pressed'), 'true');
assert.equal(h.document.documentElement.style.getPropertyValue('--app-header-height'), '64px');
h.header.rect.height = 123.3; h.resizeObservers[0].fn();
assert.equal(h.document.documentElement.style.getPropertyValue('--app-header-height'), '124px');
console.log('PASS filter states reflect active controls and sticky offset follows changing header/safe-area height');

const reduced = harness({ reducedMotion: true });
reduced.modal.showModal(); reduced.flush(); reduced.modalClose.click(); reduced.flush();
assert.equal(reduced.modal.open, false); assert.equal(reduced.timers.size, 0);
assert.equal(reduced.document.body.style.position, '');
console.log('PASS reduced motion dismisses immediately without scheduling animation');

const preexisting = harness();
preexisting.app.inert = true;
preexisting.document.body.style.setProperty('position', 'relative');
preexisting.document.body.style.setProperty('overflow', 'clip');
preexisting.document.documentElement.style.setProperty('scroll-behavior', 'smooth');
preexisting.drawer.hidden = false; preexisting.flush(); preexisting.drawer.hidden = true; preexisting.flush();
assert.equal(preexisting.app.inert, true, 'an existing inert state is preserved');
assert.equal(preexisting.document.body.style.position, 'relative');
assert.equal(preexisting.document.body.style.overflow, 'clip');
assert.equal(preexisting.document.documentElement.style.getPropertyValue('scroll-behavior'), 'smooth');
console.log('PASS existing page styles and inert state are restored exactly');

const manager = harness();
manager.menu.focus(); manager.drawer.hidden = false; manager.flush(); manager.sync.focus();
// Manage habits closes the menu before opening the manager in the same task.
manager.drawer.hidden = true; manager.modal.showModal(); manager.flush();
assert.equal(manager.app.inert, false);
manager.modal.close(); manager.flush();
assert.equal(manager.document.activeElement, manager.menu, 'hidden drawer trigger falls back to the visible menu button');
manager.modal.showModal(); manager.flush();
manager.modal.open = false;
manager.backgroundButton.focus(); // A feature explicitly chooses its next logical target.
manager.flush();
assert.equal(manager.document.activeElement, manager.backgroundButton, 'explicit feature focus is preserved');
console.log('PASS manager returns focus to a visible control when its opener is hidden, without overriding explicit feature focus');
