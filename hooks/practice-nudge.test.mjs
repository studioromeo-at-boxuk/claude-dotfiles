// Tests for the practice-nudge SessionStart hook. Run with: node --test bin/ hooks/
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, writeFileSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { decide } from "./practice-nudge.mjs";

const HOOK_SCRIPT = join(dirname(fileURLToPath(import.meta.url)), "practice-nudge.mjs");
const NOW = new Date("2026-09-29T09:00:00");
const DAY = 864e5;
const daysAgo = (n) => new Date(NOW.getTime() - n * DAY).toISOString();
const FRESH_ROTATION = { owns: "spec", since: "2026-09-01" };

const handover = (age, extra = {}) => ({
  ts: daysAgo(age),
  event: "handover",
  written_by: "human",
  help_depth: 1,
  rounds: 1,
  located: "self",
  ...extra,
});

const base = (entries, extra = {}) => ({
  entries,
  style: "Learning (Aggressive)",
  rotation: FRESH_ROTATION,
  now: NOW,
  ...extra,
});

// ---------- mentor nudge ----------

test("stays quiet with fewer than 10 handovers, however much was given back", () => {
  const entries = Array.from({ length: 9 }, (_, i) => handover(i, { written_by: "claude" }));
  assert.equal(decide(base(entries)).context, "");
});

test("suggests Mentor when 20% or more of recent handovers were given back", () => {
  const entries = Array.from({ length: 10 }, (_, i) =>
    handover(i, { written_by: i < 2 ? "claude" : "human" }),
  );
  const { context } = decide(base(entries));
  assert.match(context, /\/output-style mentor/);
  assert.match(context, /nudge --kind=mentor --taken=/);
});

test("does not suggest Mentor when under 20% was given back", () => {
  const entries = Array.from({ length: 10 }, (_, i) =>
    handover(i, { written_by: i < 1 ? "claude" : "human" }),
  );
  assert.doesNotMatch(decide(base(entries)).context, /output-style mentor/);
});

test("suggests Mentor when help needed is rising and review rounds are not falling", () => {
  const entries = [
    ...Array.from({ length: 5 }, (_, i) => handover(20 + i, { help_depth: 0, rounds: 1 })),
    ...Array.from({ length: 5 }, (_, i) => handover(i, { help_depth: 2, rounds: 1 })),
  ];
  assert.match(decide(base(entries)).context, /\/output-style mentor/);
});

test("does not count rising help as leaning when review rounds fell", () => {
  const entries = [
    ...Array.from({ length: 5 }, (_, i) => handover(20 + i, { help_depth: 0, rounds: 3 })),
    ...Array.from({ length: 5 }, (_, i) => handover(i, { help_depth: 2, rounds: 1 })),
  ];
  assert.doesNotMatch(decide(base(entries)).context, /output-style mentor/);
});

test("ignores handovers older than 28 days", () => {
  const entries = Array.from({ length: 10 }, (_, i) => handover(30 + i, { written_by: "claude" }));
  assert.doesNotMatch(decide(base(entries)).context, /output-style mentor/);
});

const leaning = Array.from({ length: 10 }, (_, i) => handover(i, { written_by: "claude" }));
const answered = (age, taken) => ({ ts: daysAgo(age), event: "nudge", kind: "mentor", taken });

test("keeps suggesting Mentor every session until it is answered", () => {
  // Showing the nudge records nothing, so an ignored nudge comes straight back.
  assert.match(decide(base(leaning)).context, /output-style mentor/);
  assert.match(decide(base(leaning)).context, /output-style mentor/);
});

test("backs off for a week after an answer, whether yes or no", () => {
  for (const taken of [true, false]) {
    const recent = decide(base([...leaning, answered(5, taken)]));
    assert.doesNotMatch(recent.context, /output-style mentor/, `taken=${taken}, 5 days ago`);
    const lastWeek = decide(base([...leaning, answered(7, taken)]));
    assert.match(lastWeek.context, /output-style mentor/, `taken=${taken}, 7 days ago`);
  }
});

test("does not suggest Mentor when already in Mentor", () => {
  const entries = Array.from({ length: 10 }, (_, i) => handover(i, { written_by: "claude" }));
  assert.equal(decide(base(entries, { style: "Mentor (Guided)" })).context, "");
});

// ---------- map nudge ----------

const trace = (age, located) => ({ ts: daysAgo(age), event: "trace", located });

test("tightens navigation hints when finding the code yourself is falling", () => {
  const entries = [
    ...Array.from({ length: 5 }, (_, i) => trace(20 + i, "self")),
    ...Array.from({ length: 5 }, (_, i) => trace(i, i < 2 ? "self" : "told")),
  ];
  const { context } = decide(base(entries));
  assert.match(context, /no starting-place hints/i);
  assert.match(context, /do not mention/i);
});

test("leaves navigation hints alone when finding the code is steady", () => {
  const entries = [
    ...Array.from({ length: 5 }, (_, i) => trace(20 + i, "self")),
    ...Array.from({ length: 5 }, (_, i) => trace(i, "self")),
  ];
  assert.equal(decide(base(entries)).context, "");
});

// ---------- rotation ----------

test("asks to re-pick a rotation that owns a now-permanent item", () => {
  const rotation = { owns: "navigation", since: "2026-09-20" };
  const { context } = decide(base([], { rotation }));
  assert.match(context, /Rotation is due/);
  assert.match(context, /navigation.*permanent/);
  assert.match(context, /spec \(they write Must-handle\) \| tests/);
});

test("keeps asking for a rotation every session until one is picked", () => {
  const rotation = { owns: "navigation", since: "2026-09-20" };
  assert.match(decide(base([], { rotation })).context, /Rotation is due/);
  assert.match(decide(base([], { rotation })).context, /Rotation is due/);
  const picked = { owns: "tests", since: "2026-09-29" };
  assert.equal(decide(base([], { rotation: picked })).context, "");
});

test("asks to pick a rotation after 90 days", () => {
  const rotation = { owns: "spec", since: "2026-06-01" };
  assert.match(decide(base([], { rotation })).context, /owned "spec" for \d+ days/);
});

// ---------- never in the way ----------

test("tells Claude to put questions after the user's request, never before it", () => {
  const { context } = decide(base(leaning, { rotation: null }));
  assert.match(context, /do what the user asked first/i);
  assert.match(context, /end of your first reply/i);
  assert.match(context, /if they skip it, drop it for this session/i);
});

test("adds no questions framing when only the silent map nudge is due", () => {
  const entries = [
    ...Array.from({ length: 5 }, (_, i) => trace(20 + i, "self")),
    ...Array.from({ length: 5 }, (_, i) => trace(i, "told")),
  ];
  assert.doesNotMatch(decide(base(entries)).context, /end of your first reply/i);
});

// ---------- the hook as a process ----------

test("prints nothing when there is nothing to say", () => {
  const home = mkdtempSync(join(tmpdir(), "nudge-test-"));
  mkdirSync(join(home, ".claude"));
  writeFileSync(join(home, ".claude", "practice-rotation.json"), JSON.stringify(FRESH_ROTATION));
  const r = spawnSync("node", [HOOK_SCRIPT], { encoding: "utf8", env: { ...process.env, HOME: home } });
  assert.equal(r.status, 0, r.stderr);
  assert.equal(r.stdout, "");
});

test("emits SessionStart context when a nudge is due", () => {
  const home = mkdtempSync(join(tmpdir(), "nudge-test-"));
  mkdirSync(join(home, ".claude"));
  const r = spawnSync("node", [HOOK_SCRIPT], { encoding: "utf8", env: { ...process.env, HOME: home } });
  assert.equal(r.status, 0, r.stderr);
  const out = JSON.parse(r.stdout).hookSpecificOutput;
  assert.equal(out.hookEventName, "SessionStart");
  assert.match(out.additionalContext, /Rotation is due - none is set yet/);
});

test("runs when invoked through a symlink, as ~/.claude/hooks is", () => {
  const home = mkdtempSync(join(tmpdir(), "nudge-test-"));
  mkdirSync(join(home, ".claude"));
  const link = join(home, "linked-hooks");
  symlinkSync(dirname(HOOK_SCRIPT), link);
  const r = spawnSync("node", [join(link, "practice-nudge.mjs")], {
    encoding: "utf8",
    env: { ...process.env, HOME: home },
  });
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /Rotation is due/);
});
