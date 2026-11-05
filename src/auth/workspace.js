const DEFAULT_WEEK = "2026-11-02";
import { normalisePreenrolled } from "../schedules/preenroll.js";
const DOMAINS = new Set(["A", "H", "S", "T", "SA", "SUS"]);
const PRIORITIES = new Set(["balanced", "safe", "fit"]);
const UNSAFE_KEYS = new Set(["__proto__", "prototype", "constructor"]);

function object(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const prototype = Object.getPrototypeOf(value);
  return prototype === Object.prototype || prototype === null ? value : {};
}
function own(value, key) {
  return Object.hasOwn(value, key) ? value[key] : undefined;
}
function ids(value, allowed, limit) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter(id => typeof id === "string" && allowed.has(id)))].slice(0, limit);
}
function days(value, fallback) {
  return Array.isArray(value)
    ? [...new Set(value.filter(day => Number.isInteger(day) && day >= 0 && day <= 6))]
    : [...fallback];
}
function integer(value, fallback, minimum, maximum) {
  return Number.isInteger(value) && value >= minimum && value <= maximum ? value : fallback;
}
function preferences(value, defaults, demo) {
  const source = object(value), result = {};
  for (const key of ["noAttendance", "noQuizzes", "noGroups", "noEarly", ...(demo ? [] : ["snapshotOpen"])]) {
    result[key] = typeof own(source, key) === "boolean" ? source[key] : Boolean(defaults[key]);
  }
  result.days = days(own(source, "days"), defaults.days || [0, 1, 2, 3, 4]);
  result.maxDays = integer(own(source, "maxDays"), defaults.maxDays ?? 7, 1, 7);
  if (demo) {
    result.domains = Array.isArray(own(source, "domains"))
      ? [...new Set(source.domains.filter(domain => DOMAINS.has(domain)))]
      : [...(defaults.domains || [])];
    result.count = integer(own(source, "count"), defaults.count ?? 3, 2, 4);
    result.priority = PRIORITIES.has(own(source, "priority")) ? source.priority : defaults.priority || "balanced";
  }
  return result;
}
function monday(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return DEFAULT_WEEK;
  const date = new Date(`${value}T00:00:00Z`);
  return Number.isFinite(date.getTime()) && date.toISOString().slice(0, 10) === value && date.getUTCDay() === 1
    ? value : DEFAULT_WEEK;
}

/** Restore only recognized planner inputs; cloud JSON never supplies course definitions. */
export function normalizeWorkspace(raw, { demoCourses = [], realCourses = [], demoDefaults = {}, realDefaults = {} } = {}) {
  const source = object(raw), demo = object(own(source, "demo")), schedules = object(own(source, "schedules"));
  const real = new Map(realCourses.filter(c => typeof c.id === "string" && !UNSAFE_KEYS.has(c.id)).map(c => [c.id, c]));
  const preenrolled = normalisePreenrolled(own(schedules, "preenrolled"));
  const fixedCodes = new Set(preenrolled.map(row => row.code));
  const selected = ids(own(schedules, "selected"), real, 6).filter(id => !fixedCodes.has(id));
  const rawLocks = object(own(schedules, "locks")), locks = {};
  for (const courseId of selected) {
    const values = object(own(rawLocks, courseId)), valid = {};
    for (const section of real.get(courseId).sections || []) {
      if (typeof section.kind !== "string" || section.kind === "unknown" || UNSAFE_KEYS.has(section.kind)) continue;
      if (own(values, section.kind) === section.id && typeof section.id === "string") valid[section.kind] = section.id;
    }
    if (Object.keys(valid).length) locks[courseId] = valid;
  }
  return {
    version: 1,
    demo: {
      prefs: preferences(own(demo, "prefs"), demoDefaults, true),
      watched: ids(own(demo, "watched"), new Set(demoCourses.map(c => c.id)), demoCourses.length),
    },
    schedules: {
      selected,
      prefs: preferences(own(schedules, "prefs"), realDefaults, false),
      locks,
      week: monday(own(schedules, "week")),
      preenrolled,
    },
  };
}

/** One instance belongs to one authenticated owner, captured by its write callback. */
export function createWorkspaceSync({ initial, write, onStatus = () => {}, delay = 600 }) {
  let snapshot = structuredClone(initial), revision = 0, savedRevision = 0;
  let timer = null, running = null, disposed = false, lastError = null;
  const emit = (status, error = null) => { if (!disposed) onStatus({ status, error }); };
  const cancelTimer = () => { if (timer !== null) clearTimeout(timer); timer = null; };
  const assertActive = () => { if (disposed) throw new Error("This account workspace is no longer active."); };

  function flush() {
    if (disposed) return Promise.reject(new Error("This account workspace is no longer active."));
    cancelTimer();
    if (running) return running;
    if (savedRevision === revision) return Promise.resolve();
    lastError = null;
    emit("saving");
    running = (async () => {
      while (!disposed && savedRevision < revision) {
        const targetRevision = revision, value = structuredClone(snapshot);
        try {
          await write(value);
        } catch (error) {
          lastError = error instanceof Error ? error : new Error("Your changes could not be saved.");
          emit("unsaved", lastError);
          throw lastError;
        }
        if (disposed) return;
        savedRevision = targetRevision;
        if (savedRevision === revision) emit("saved");
      }
    })().finally(() => { running = null; });
    return running;
  }

  function update(section, value) {
    assertActive();
    if (section !== "demo" && section !== "schedules") throw new TypeError("Unknown workspace section.");
    const next = structuredClone(value);
    if (JSON.stringify(snapshot[section]) === JSON.stringify(next)) return structuredClone(snapshot);
    snapshot = { ...snapshot, [section]: next };
    revision += 1;
    cancelTimer();
    if (lastError) {
      emit("unsaved", lastError);
    } else {
      emit("saving");
      if (!running) timer = setTimeout(() => { timer = null; void flush().catch(() => {}); }, Math.max(0, delay));
    }
    return structuredClone(snapshot);
  }

  return {
    update,
    flush,
    retry: flush,
    dispose() { disposed = true; cancelTimer(); },
    getSnapshot() { return structuredClone(snapshot); },
  };
}
