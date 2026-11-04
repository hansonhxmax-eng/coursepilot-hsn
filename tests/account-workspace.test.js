import test from "node:test";
import assert from "node:assert/strict";
import { normalizeWorkspace, createWorkspaceSync } from "../src/auth/workspace.js";

const config = {
  demoCourses: [{ id: "DEMO1000" }, { id: "DEMO2000" }],
  realCourses: Array.from({ length: 8 }, (_, i) => ({
    id: `REAL${i}`, sections: [
      { id: `REAL${i}-L1`, kind: "lecture" },
      { id: `REAL${i}-T1`, kind: "tutorial" },
      { id: `REAL${i}-X1`, kind: "unknown" },
    ],
  })),
  demoDefaults: { noEarly: true, noAttendance: true, noQuizzes: true, noGroups: false, domains: [], days: [0, 1, 2, 3, 4], count: 3, maxDays: 4, priority: "balanced" },
  realDefaults: { noEarly: false, noAttendance: false, noQuizzes: false, noGroups: false, snapshotOpen: false, days: [0, 1, 2, 3, 4, 5, 6], maxDays: 7 },
};
const defaults = () => normalizeWorkspace(null, config);
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
};

test("account data restores known values, rejects malformed preferences and cannot inject object keys", () => {
  const raw = JSON.parse('{"__proto__":{"polluted":true},"demo":{"watched":["DEMO1000","DEMO1000","MISSING"],"prefs":{"days":[0,6,6,9,"2"],"domains":["A","A","BAD"],"noEarly":"false","count":500,"maxDays":0,"priority":"fit","admin":true}},"schedules":{"selected":["REAL0","REAL0","MISSING","REAL1","REAL2","REAL3","REAL4","REAL5","REAL6","REAL7"]}}');
  const normalized = normalizeWorkspace(raw, config);
  assert.deepEqual(normalized.demo.watched, ["DEMO1000"]);
  assert.deepEqual(normalized.demo.prefs.days, [0, 6]);
  assert.deepEqual(normalized.demo.prefs.domains, ["A"]);
  assert.equal(normalized.demo.prefs.noEarly, true);
  assert.equal(normalized.demo.prefs.count, 3);
  assert.equal(normalized.demo.prefs.maxDays, 4);
  assert.equal(normalized.demo.prefs.priority, "fit");
  assert.equal(normalized.demo.prefs.admin, undefined);
  assert.deepEqual(normalized.schedules.selected, ["REAL0", "REAL1", "REAL2", "REAL3", "REAL4", "REAL5"]);
  assert.equal({}.polluted, undefined);
  assert.equal(Object.hasOwn(normalized, "__proto__"), false);
  assert.deepEqual(defaults().demo.watched, []);
  assert.deepEqual(defaults().schedules.selected, []);
  normalized.demo.prefs.days.push(3);
  assert.deepEqual(config.demoDefaults.days, [0, 1, 2, 3, 4]);
});

test("section locks belong to selected courses and matching component kinds; calendar week is a real Monday", () => {
  const raw = { schedules: {
    selected: ["REAL0"],
    locks: { REAL0: { lecture: "REAL0-L1", tutorial: "REAL0-L1", unknown: "REAL0-X1" }, REAL1: { lecture: "REAL1-L1" } },
    week: "2026-11-09", prefs: { days: [] },
  }, demo: { prefs: { domains: [], days: [] } } };
  const value = normalizeWorkspace(raw, config);
  assert.deepEqual(value.schedules.locks, { REAL0: { lecture: "REAL0-L1" } });
  assert.equal(value.schedules.week, "2026-11-09");
  assert.deepEqual(value.schedules.prefs.days, []);
  assert.deepEqual(value.demo.prefs.days, []);
  for (const week of ["2026-11-10", "2026-02-30", "invalid", 17]) {
    assert.equal(normalizeWorkspace({ schedules: { week } }, config).schedules.week, "2026-11-02");
  }
  const inherited = Object.create({ demo: { watched: ["DEMO1000"] } });
  assert.deepEqual(normalizeWorkspace(inherited, config).demo.watched, []);
});

test("cloud writes are serialized and keep newer edits across both workspace sections", async () => {
  const writes = [], statuses = [], gates = [deferred(), deferred()];
  let active = 0, maximum = 0;
  const sync = createWorkspaceSync({ initial: defaults(), delay: 60_000, onStatus: s => statuses.push(s.status), write: async value => {
    const index = writes.length; writes.push(value); active += 1; maximum = Math.max(maximum, active);
    await gates[index].promise; active -= 1;
  } });
  try {
    sync.update("demo", { ...defaults().demo, watched: ["DEMO1000"] });
    const saving = sync.flush();
    assert.equal(writes.length, 1);
    sync.update("schedules", { ...defaults().schedules, selected: ["REAL1"] });
    sync.update("demo", { ...defaults().demo, watched: ["DEMO2000"] });
    gates[0].resolve();
    await new Promise(resolve => setImmediate(resolve));
    assert.equal(writes.length, 2);
    assert.equal(maximum, 1);
    assert.equal(statuses.includes("saved"), false);
    assert.deepEqual(writes[0].demo.watched, ["DEMO1000"]);
    assert.deepEqual(writes[1].demo.watched, ["DEMO2000"]);
    assert.deepEqual(writes[1].schedules.selected, ["REAL1"]);
    gates[1].resolve();
    await saving;
    assert.equal(statuses.at(-1), "saved");
    const external = sync.getSnapshot(); external.schedules.selected.push("REAL2");
    assert.deepEqual(sync.getSnapshot().schedules.selected, ["REAL1"]);
  } finally { sync.dispose(); }
});

test("failed saves retain the latest edits for explicit retry without an automatic retry loop", async () => {
  let attempts = 0; const statuses = [], written = [];
  const sync = createWorkspaceSync({ initial: defaults(), delay: 0, onStatus: s => statuses.push(s), write: async value => {
    attempts += 1;
    if (attempts === 1) throw new Error("Connection lost");
    written.push(value);
  } });
  try {
    sync.update("demo", { ...defaults().demo, watched: ["DEMO1000"] });
    await assert.rejects(sync.flush(), /Connection lost/);
    assert.equal(statuses.at(-1).status, "unsaved");
    sync.update("schedules", { ...defaults().schedules, selected: ["REAL3"] });
    await new Promise(resolve => setTimeout(resolve, 10));
    assert.equal(attempts, 1);
    await sync.retry();
    assert.equal(attempts, 2);
    assert.deepEqual(written[0].demo.watched, ["DEMO1000"]);
    assert.deepEqual(written[0].schedules.selected, ["REAL3"]);
    assert.equal(statuses.at(-1).status, "saved");
  } finally { sync.dispose(); }
});

test("disposed account controllers stop queued writes and ignore completions from their old owner", async () => {
  const statuses = [], gate = deferred(); let writes = 0;
  const sync = createWorkspaceSync({ initial: defaults(), onStatus: s => statuses.push(s), write: async () => { writes += 1; await gate.promise; } });
  sync.update("demo", { ...defaults().demo, watched: ["DEMO1000"] });
  const saving = sync.flush();
  const before = statuses.length;
  sync.dispose();
  gate.resolve();
  await saving;
  assert.equal(writes, 1);
  assert.equal(statuses.length, before);
  assert.throws(() => sync.update("demo", {}), /no longer active/);
  await assert.rejects(sync.flush(), /no longer active/);
  const queued = createWorkspaceSync({ initial: defaults(), delay: 0, write: async () => { writes += 1; } });
  queued.update("demo", {}); queued.dispose();
  await new Promise(resolve => setTimeout(resolve, 10));
  assert.equal(writes, 1);
});

test("independent account controllers never share personal changes or mutable snapshots", async () => {
  const initial = defaults(), writtenA = [], writtenB = [];
  const a = createWorkspaceSync({ initial, write: async value => writtenA.push(value), delay: 60_000 });
  const b = createWorkspaceSync({ initial, write: async value => writtenB.push(value), delay: 60_000 });
  try {
    a.update("schedules", { ...initial.schedules, selected: ["REAL4"] });
    await a.flush(); await b.flush();
    assert.equal(writtenB.length, 0);
    assert.deepEqual(writtenA[0].schedules.selected, ["REAL4"]);
    assert.deepEqual(b.getSnapshot().schedules.selected, []);
    assert.deepEqual(initial.schedules.selected, []);
    assert.throws(() => a.update("user_id", "another-account"), /Unknown workspace section/);
  } finally { a.dispose(); b.dispose(); }
});
