// Scripted Supabase double for cron-handler tests: an in-memory table set
// with the subset of the PostgREST builder the crons use (select / insert /
// update / eq / filter / in / gte / order / range / limit / maybeSingle /
// single), including `details->>field` JSON filters. Inserts stamp
// created_at from an injectable clock plus a per-insert sequence, so the
// order two overlapping handlers insert in is the order Supabase would
// report, and a race test is deterministic.
//
// opts.fail: { insert?: "message", list?: "message", update?: "message" }
// makes the matching operation return { error } the way supabase-js does
// (it never throws), so fail-closed paths can be exercised.
export function fakeSupabase(store = [], opts = {}) {
  const clock = opts.clock || (() => new Date("2026-09-14T13:15:00Z"));
  const fail = opts.fail || {};
  let seq = 0;
  const jsonKey = (col) => (col.startsWith("details->>") ? col.slice("details->>".length) : null);
  const get = (row, col) => { const k = jsonKey(col); return k ? (row.details || {})[k] : row[col]; };

  function builder(table) {
    const q = { table, method: "select", filters: [], orders: [], lim: null, range: null, single: false, payload: null };
    const api = {
      select() { return api; },
      insert(row) { q.method = "insert"; q.payload = row; return api; },
      update(patch) { q.method = "update"; q.payload = patch; return api; },
      eq(col, val) { q.filters.push({ op: "eq", col, val }); return api; },
      filter(col, op, val) { q.filters.push({ op, col, val }); return api; },
      in(col, vals) { q.filters.push({ op: "in", col, vals }); return api; },
      gte(col, val) { q.filters.push({ op: "gte", col, val }); return api; },
      order(col, o) { q.orders.push({ col, asc: !o || o.ascending !== false }); return api; },
      range(from, to) { q.range = [from, to]; return api; },
      limit(n) { q.lim = n; return api; },
      maybeSingle() { q.single = true; return api; },
      single() { q.single = true; return api; },
      then(resolve, reject) { Promise.resolve().then(() => run(q)).then(resolve, reject); },
    };
    return api;
  }

  function matches(row, f) {
    const v = get(row, f.col);
    if (f.op === "eq") return v === f.val || (v != null && f.val != null && String(v) === String(f.val));
    if (f.op === "in") return f.vals.includes(v);
    if (f.op === "gte") return String(v) >= String(f.val);
    return true;
  }

  function run(q) {
    const rows = store.filter((r) => r.__table === q.table);
    const hits = () => rows.filter((r) => q.filters.every((f) => matches(r, f)));
    if (q.method === "insert") {
      if (fail.insert) return { data: null, error: { message: fail.insert } };
      // Ids and created_at derive from the SHARED store, not this instance, so
      // two handlers that each build their own client (as the crons do) still
      // get distinct, ordered rows, the way Supabase would stamp them.
      seq = store.length + 1;
      const row = { ...q.payload, __table: q.table, id: `ev-${seq}`, created_at: new Date(clock().getTime() + seq).toISOString() };
      store.push(row);
      return { data: q.single ? { id: row.id } : [{ id: row.id }], error: null };
    }
    if (q.method === "update") {
      if (fail.update) return { data: null, error: { message: fail.update } };
      hits().forEach((r) => Object.assign(r, q.payload));
      return { data: null, error: null };
    }
    if (fail.list && q.orders.length) return { data: null, error: { message: fail.list } };
    let out = hits();
    for (const o of [...q.orders].reverse()) {
      out = [...out].sort((a, b) => {
        const x = get(a, o.col), y = get(b, o.col);
        return (x < y ? -1 : x > y ? 1 : 0) * (o.asc ? 1 : -1);
      });
    }
    if (q.range) out = out.slice(q.range[0], q.range[1] + 1);
    if (q.lim) out = out.slice(0, q.lim);
    return { data: q.single ? (out[0] || null) : out, error: null };
  }

  return { from: builder };
}

export const rowsOf = (store, table, eventType) =>
  store.filter((r) => r.__table === table && (eventType === undefined || r.event_type === eventType));
