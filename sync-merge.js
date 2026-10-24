(function (root) {
  "use strict";

  // Pure snapshot reconciliation. Authentication and network operations belong
  // to the caller; this module never accesses storage or makes requests.
  const ABSENT = Symbol("absent");
  const LOCAL_FIELDS = ["auth", "cloud", "activeTopTab", "viewMode", "sidebarMode"];
  const FORBIDDEN = new Set(["__proto__", "constructor", "prototype"]);
  const own = (value, key) => value !== ABSENT && value != null && Object.prototype.hasOwnProperty.call(value, key);
  const object = value => value !== ABSENT && value !== null && typeof value === "object" && !Array.isArray(value);
  const keys = value => object(value) ? Object.keys(value).filter(key => !FORBIDDEN.has(key)) : [];
  const read = (value, key) => own(value, key) ? value[key] : ABSENT;
  function copy(value) {
    if (value === ABSENT) return ABSENT;
    if (Array.isArray(value)) return value.map(copy);
    if (!object(value)) return value;
    const result = {};
    for (const key of keys(value)) result[key] = copy(value[key]);
    return result;
  }
  function equal(a, b) {
    if (a === b) return true;
    if (a === ABSENT || b === ABSENT || a == null || b == null || typeof a !== typeof b) return false;
    if (Array.isArray(a) || Array.isArray(b)) return Array.isArray(a) && Array.isArray(b) && a.length === b.length && a.every((item, i) => equal(item, b[i]));
    if (!object(a) || !object(b)) return false;
    const ak = keys(a), bk = keys(b);
    return ak.length === bk.length && ak.every(key => own(b, key) && equal(a[key], b[key]));
  }
  const pathText = path => path.join(".");
  const time = value => typeof value === "string" && Number.isFinite(Date.parse(value)) ? Date.parse(value) : null;
  function newerSide(local, remote, inherited, path) {
    if (!object(local) || !object(remote)) return inherited;
    // createdAt is an update clock for daily weight, but is immutable on meals,
    // workouts and wishes; using it there would guess which edit happened last.
    const weight = path[0] === "exercise" && path[1] === "weights" && path.length === 3;
    const lt = time(local.updatedAt || (weight ? local.createdAt : ""));
    const rt = time(remote.updatedAt || (weight ? remote.createdAt : ""));
    return lt !== null && rt !== null && lt !== rt ? (lt > rt ? "local" : "remote") : inherited;
  }
  function arrayKey(base, local, remote, path) {
    const values = [base, local, remote].filter(Array.isArray).flat();
    if (!values.length || !values.every(object)) return "";
    if (values.every(item => typeof item.id === "string" && item.id)) return "id";
    if (path[path.length - 1] === "versions" && values.every(item => typeof item.from === "string" && item.from)) return "from";
    return "";
  }
  function describe(value) { return value === ABSENT ? { deleted: true } : copy(value); }
  function recordConflict(ctx, path, kind, local, remote, resolution) {
    ctx.conflicts.push({ path: pathText(path), kind, local: describe(local), remote: describe(remote), resolution });
  }
  function savedHabitOrder(value) {
    return object(value) && ((Array.isArray(value.ids) && value.ids.length > 0) || time(value.updatedAt) !== null);
  }
  function preferredHabitOrder(local, remote) {
    const lt = time(local.updatedAt) ?? 0, rt = time(remote.updatedAt) ?? 0;
    const orderKey = value => JSON.stringify([Array.isArray(value.ids) ? value.ids : [], typeof value.updatedAt === "string" ? value.updatedAt : ""]);
    return lt !== rt ? (lt > rt ? "local" : "remote") : (orderKey(local) >= orderKey(remote) ? "local" : "remote");
  }
  function preserveLegacyHabitOrder(base, local, remote) {
    // Old app versions omit the field; the empty unstamped default also carries
    // no reorder. Preserve a saved order before parent-level ancestor shortcuts
    // can select the legacy snapshot wholesale. The ancestor stays untouched.
    const orders = [local, remote, base].filter(object).map(snapshot => snapshot.amulet?.habitOrder).filter(savedHabitOrder);
    if (!orders.length) return;
    const latest = orders.reduce((left, right) => preferredHabitOrder(left, right) === "local" ? left : right);
    for (const snapshot of [local, remote]) {
      if (object(snapshot.amulet) && !savedHabitOrder(snapshot.amulet.habitOrder)) snapshot.amulet.habitOrder = copy(latest);
    }
  }
  function mergeValue(base, local, remote, path, ctx, inherited = "local") {
    const habitOrder = path.length === 2 && path[0] === "amulet" && path[1] === "habitOrder";
    if (equal(local, remote)) return copy(local);
    if (base !== ABSENT && equal(local, base)) return copy(remote);
    if (base !== ABSENT && equal(remote, base)) return copy(local);
    if (base !== ABSENT && (local === ABSENT || remote === ABSENT)) {
      const present = local === ABSENT ? remote : local;
      const dictionary = (path[0] === "entries" && path.length <= 2)
        || (path[0] === "exercise" && ["meals", "workouts", "weights"].includes(path[1]) && path.length === 2)
        || (path[0] === "caffeine" && path[1] === "entries" && path.length === 2);
      const keyedList = Array.isArray(base) && Array.isArray(present) && arrayKey(base, local, remote, path);
      if ((dictionary && object(base) && object(present)) || keyedList) {
        if (local === ABSENT) local = keyedList ? [] : {};
        else remote = keyedList ? [] : {};
      }
    }
    if (local === ABSENT || remote === ABSENT) {
      // Without an ancestor, absence says nothing about deletion. With one,
      // deletion vs unchanged was handled above; preserve a simultaneous edit.
      const value = local === ABSENT ? remote : local;
      if (base !== ABSENT) recordConflict(ctx, path, "delete-edit", local, remote, local === ABSENT ? "remote" : "local");
      return copy(value);
    }
    const preferred = newerSide(local, remote, inherited, path);
    if (habitOrder && object(local) && object(remote)) {
      // A reordered sequence is one operation. Merging its fields separately can
      // combine the newest clock with an older sequence, particularly when a
      // user intentionally moves the list back to its original order.
      const side = preferredHabitOrder(local, remote);
      recordConflict(ctx, path, "concurrent-edit", local, remote, side);
      return copy(side === "remote" ? remote : local);
    }
    if (object(local) && object(remote)) {
      const result = {};
      const allKeys = new Set([...keys(remote), ...keys(local), ...keys(base)]);
      for (const key of allKeys) {
        const merged = mergeValue(read(base, key), read(local, key), read(remote, key), [...path, key], ctx, preferred);
        if (merged !== ABSENT) result[key] = merged;
      }
      return result;
    }
    if (Array.isArray(local) && Array.isArray(remote)) {
      const idKey = arrayKey(base, local, remote, path);
      if (idKey) {
        const index = list => new Map((Array.isArray(list) ? list : []).map(item => [item[idKey], item]));
        const bi = index(base), li = index(local), ri = index(remote);
        const result = [];
        const ids = new Set([...ri.keys(), ...li.keys(), ...bi.keys()]);
        for (const id of ids) {
          const merged = mergeValue(bi.has(id) ? bi.get(id) : ABSENT, li.has(id) ? li.get(id) : ABSENT, ri.has(id) ? ri.get(id) : ABSENT, [...path, id], ctx, preferred);
          if (merged !== ABSENT) result.push(merged);
        }
        return result;
      }
    }
    recordConflict(ctx, path, "concurrent-edit", local, remote, preferred);
    return copy(preferred === "remote" ? remote : local);
  }

  function flattenBuckets(snapshot, ctx, side) {
    if (!object(snapshot.exercise)) return;
    for (const kind of ["meals", "workouts"]) {
      const flattened = {};
      const buckets = snapshot.exercise[kind];
      for (const date of keys(buckets)) {
        for (const entry of Array.isArray(buckets[date]) ? buckets[date] : []) {
          if (!object(entry) || typeof entry.id !== "string" || !entry.id || FORBIDDEN.has(entry.id)) continue;
          const value = { ...copy(entry), __habitSyncDate: date };
          if (own(flattened, entry.id) && !equal(flattened[entry.id], value)) {
            recordConflict(ctx, ["exercise", kind, entry.id], "duplicate-record-id", flattened[entry.id], value, side);
          }
          flattened[entry.id] = value;
        }
      }
      snapshot.exercise[kind] = flattened;
    }
  }
  function restoreBuckets(snapshot) {
    if (!object(snapshot.exercise)) return;
    for (const kind of ["meals", "workouts"]) {
      const buckets = {};
      for (const id of keys(snapshot.exercise[kind])) {
        const value = copy(snapshot.exercise[kind][id]);
        const date = value.__habitSyncDate;
        delete value.__habitSyncDate;
        if (typeof date !== "string") continue;
        if (!own(buckets, date)) buckets[date] = [];
        buckets[date].push(value);
      }
      snapshot.exercise[kind] = buckets;
    }
  }

  function ledgerOf(snapshot) { return object(snapshot) && object(snapshot.amulet) && Array.isArray(snapshot.amulet.ledger) ? snapshot.amulet.ledger : []; }
  function canonicalLedgers(base, local, remote, ctx) {
    const input = [ledgerOf(base), ledgerOf(local), ledgerOf(remote)];
    const aliases = new Map();
    const resolve = id => {
      const seen = new Set();
      while (aliases.has(id) && aliases.get(id) !== id && !seen.has(id)) { seen.add(id); id = aliases.get(id); }
      return id;
    };
    function aliasGroups(groups) {
      for (const group of groups.values()) {
        const ids = [...new Set(group.map(item => resolve(item.event.id)))];
        if (ids.length < 2) continue;
        // IDs that coexist in one source cannot be duplicate operations. This
        // can happen with incomplete legacy histories and shifted generations.
        const sameSource = input.some(ledger => new Set(ledger.map(event => resolve(event.id)).filter(id => ids.includes(id))).size > 1);
        if (sameSource) {
          ctx.unsafeAliasIds.push(...ids);
          continue;
        }
        const ancestor = group.find(item => item.side === 0);
        const canonical = ancestor ? resolve(ancestor.event.id) : [...ids].sort()[0];
        for (const id of ids) if (id !== canonical) aliases.set(id, canonical);
      }
    }
    // The nth award for one habit/day is one completion generation. Separate
    // generations remain separate, so earn -> undo -> earn is never flattened.
    const earnings = new Map();
    input.forEach((ledger, side) => {
      const generation = new Map();
      for (const event of ledger) {
        if (!object(event) || event.type !== "earn" || typeof event.id !== "string") continue;
        const key = `${event.habitId}|${event.date}`;
        const ordinal = generation.get(key) || 0;
        generation.set(key, ordinal + 1);
        const signature = `${key}|${ordinal}`;
        if (!earnings.has(signature)) earnings.set(signature, []);
        earnings.get(signature).push({ event, side });
      }
    });
    aliasGroups(earnings);
    // Undoing the same original on two devices is also one operation. Refunds
    // use the same causal identity, while independent withdrawals remain apart.
    const reversals = new Map();
    input.forEach((ledger, side) => {
      for (const event of ledger) {
        if (!object(event) || !["undo-earn", "refund"].includes(event.type) || typeof event.id !== "string") continue;
        const signature = `${event.type}|${resolve(event.refId)}`;
        if (!reversals.has(signature)) reversals.set(signature, []);
        reversals.get(signature).push({ event, side });
      }
    });
    aliasGroups(reversals);
    const result = input.map(ledger => {
      const byId = new Map();
      for (const original of ledger) {
        if (!object(original) || typeof original.id !== "string") continue;
        const event = copy(original);
        event.id = resolve(event.id);
        if (event.refId) event.refId = resolve(event.refId);
        if (byId.has(event.id) && !equal(byId.get(event.id), event)) recordConflict(ctx, ["amulet", "ledger", event.id], "duplicate-event-id", byId.get(event.id), event, "last");
        byId.set(event.id, event);
      }
      return [...byId.values()];
    });
    ctx.aliases = Object.fromEntries([...aliases.keys()].map(id => [id, resolve(id)]));
    return result;
  }

  function orderLedger(events, sources) {
    const map = new Map(events.map(event => [event.id, event]));
    const edges = new Map(events.map(event => [event.id, new Set()]));
    const indegree = new Map(events.map(event => [event.id, 0]));
    const reachable = (from, to) => {
      const pending = [from], seen = new Set();
      while (pending.length) {
        const id = pending.pop();
        if (id === to) return true;
        if (seen.has(id)) continue;
        seen.add(id);
        for (const next of edges.get(id) || []) pending.push(next);
      }
      return false;
    };
    const add = (from, to) => {
      if (!map.has(from) || !map.has(to) || from === to || edges.get(from).has(to)) return true;
      if (reachable(to, from)) return false;
      edges.get(from).add(to); indegree.set(to, indegree.get(to) + 1);
      return true;
    };
    // References are mandatory. Branch ordering is a preference: two independent
    // awards can have opposite order on each phone after duplicate aliasing.
    for (const event of events) if (event.refId && !add(event.refId, event.id)) return null;
    for (const source of sources) {
      const ids = source.map(event => event.id).filter(id => map.has(id));
      for (let i = 1; i < ids.length; i++) add(ids[i - 1], ids[i]);
    }
    const compare = (a, b) => {
      const at = time(map.get(a).at), bt = time(map.get(b).at);
      return (at === null ? 0 : at) - (bt === null ? 0 : bt) || a.localeCompare(b);
    };
    const ready = [...map.keys()].filter(id => indegree.get(id) === 0).sort(compare);
    const result = [];
    while (ready.length) {
      const id = ready.shift(); result.push(map.get(id));
      for (const next of edges.get(id)) {
        indegree.set(next, indegree.get(next) - 1);
        if (indegree.get(next) === 0) { ready.push(next); ready.sort(compare); }
      }
    }
    return result.length === events.length ? result : null;
  }

  function merge(base, local, remote) {
    if (!object(local) || !object(remote) || (base != null && !object(base))) return { ok: false, state: null, code: "INVALID_SNAPSHOT", conflicts: [] };
    const ctx = { conflicts: [], aliases: {}, unsafeAliasIds: [] };
    const b = base == null ? ABSENT : copy(base), l = copy(local), r = copy(remote);
    preserveLegacyHabitOrder(b, l, r);
    const sources = canonicalLedgers(b, l, r, ctx);
    // Local credentials/configuration must never enter a recovery journal.
    for (const snapshot of [b, l, r]) if (snapshot !== ABSENT) {
      for (const field of LOCAL_FIELDS) delete snapshot[field];
    }
    if (b !== ABSENT) { flattenBuckets(b, ctx, "base"); if (object(b.amulet)) b.amulet.ledger = []; }
    flattenBuckets(l, ctx, "local"); flattenBuckets(r, ctx, "remote");
    if (object(l.amulet)) l.amulet.ledger = [];
    if (object(r.amulet)) r.amulet.ledger = [];
    const merged = mergeValue(b, l, r, [], ctx);
    restoreBuckets(merged);
    // Definitions referenced by a concurrently retained log must survive too;
    // otherwise app normalization silently relabels the workout as a default.
    if (object(merged.exercise) && Array.isArray(merged.exercise.exercises)) {
      const ids = new Set(merged.exercise.exercises.map(item => item.id));
      const used = new Set(Object.values(merged.exercise.workouts || {}).flat().map(item => item.exerciseId));
      for (const id of used) if (!ids.has(id)) {
        const definition = [local, remote, base].filter(object).flatMap(snapshot => snapshot.exercise?.exercises || []).find(item => item.id === id);
        if (definition) {
          merged.exercise.exercises.push(copy(definition)); ids.add(id);
          recordConflict(ctx, ["exercise", "exercises", id], "referenced-record-delete", read(local.exercise || {}, "exercises"), read(remote.exercise || {}, "exercises"), "preserved-reference");
        }
      }
    }
    if (Array.isArray(merged.habits) && object(merged.entries)) {
      const ids = new Set(merged.habits.map(item => item.id));
      for (const id of keys(merged.entries)) if (!ids.has(id) && keys(merged.entries[id]).length) {
        const definition = [local, remote, base].filter(object).flatMap(snapshot => snapshot.habits || []).find(item => item.id === id);
        if (definition) {
          merged.habits.push(copy(definition)); ids.add(id);
          recordConflict(ctx, ["habits", id], "referenced-record-delete", (local.habits || []).find(item => item.id === id) || ABSENT, (remote.habits || []).find(item => item.id === id) || ABSENT, "preserved-reference");
        }
      }
    }
    for (const field of LOCAL_FIELDS) {
      if (own(local, field)) merged[field] = copy(local[field]);
      else delete merged[field];
    }
    const ledger = mergeValue(b === ABSENT ? ABSENT : sources[0], sources[1], sources[2], ["amulet", "ledger"], ctx);
    const ordered = orderLedger(ledger, sources);
    if (!object(merged.amulet)) merged.amulet = {};
    merged.amulet.ledger = ordered || ledger;
    const failure = (code, lostEventIds, details) => {
      ctx.conflicts.push({ path: "amulet.ledger", kind: "financial-conflict", resolution: "review", lostEventIds, details });
      return { ok: false, state: null, candidateState: merged, code, conflicts: ctx.conflicts, aliases: ctx.aliases, lostEventIds };
    };
    if (ctx.unsafeAliasIds.length) return failure("FINANCIAL_CONFLICT", [...new Set(ctx.unsafeAliasIds)], "Incomplete wallet histories cannot safely identify duplicate awards.");
    if (!ordered) return failure("FINANCIAL_CONFLICT", ledger.map(event => event.id), "Ledger references form a cycle.");
    const amulet = root.Amulet;
    if (!amulet || typeof amulet.normalize !== "function") return failure("FINANCIAL_CONFLICT", [], "Wallet validator is unavailable.");
    // Reversals derive their value from the canonical original, including when
    // two differently priced duplicate awards were reconciled into one award.
    const byId = new Map(ordered.map(event => [event.id, event]));
    for (const event of ordered) {
      if (!["undo-earn", "refund"].includes(event.type)) continue;
      const original = byId.get(event.refId);
      if (original) { event.amountOre = -original.amountOre; event.label = original.label; }
    }
    const normalized = amulet.normalize(merged.amulet);
    const accepted = new Map(normalized.ledger.map(event => [event.id, event]));
    const lost = ordered.filter(event => {
      const acceptedEvent = accepted.get(event.id);
      return !acceptedEvent || acceptedEvent.type !== event.type || acceptedEvent.amountOre !== event.amountOre;
    }).map(event => event.id);
    if (lost.length) return failure("FINANCIAL_CONFLICT", lost, "Both wallet histories cannot be retained under the wallet rules.");
    merged.amulet = normalized;
    return { ok: true, state: merged, conflicts: ctx.conflicts, aliases: ctx.aliases };
  }

  root.HabitSyncMerge = Object.freeze({ merge });
})(typeof window !== "undefined" ? window : globalThis);
