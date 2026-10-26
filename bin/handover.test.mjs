// Tests for the code-practice scripts. Run with: node --test bin/
//
// Each test gets its own HOME so nothing touches the real ~/.claude state.
import { test } from "node:test";
import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const LOG_SCRIPT = join(ROOT, "bin", "handover-log.mjs");
const REPORT_SCRIPT = join(ROOT, "bin", "handover-report.mjs");

const freshHome = () => {
  const home = mkdtempSync(join(tmpdir(), "handover-test-"));
  mkdirSync(join(home, ".claude"));
  return home;
};

const run = (script, args, home, env = {}) =>
  spawnSync("node", [script, ...args], {
    encoding: "utf8",
    env: { ...process.env, HOME: home, ...env },
  });

const logLines = (home) =>
  readFileSync(join(home, ".claude", "handover-log.jsonl"), "utf8")
    .trim()
    .split("\n")
    .map((l) => JSON.parse(l));

test("handover records where the code was located", () => {
  const home = freshHome();
  const r = run(LOG_SCRIPT, ["handover", "--unit=A::b", "--located=self"], home);
  assert.equal(r.status, 0, r.stderr);
  assert.equal(logLines(home)[0].located, "self");
});

test("handover rejects an unknown located value", () => {
  const home = freshHome();
  const r = run(LOG_SCRIPT, ["handover", "--unit=A::b", "--located=guessed"], home);
  assert.equal(r.status, 1);
  assert.match(r.stderr, /self, hinted, told/);
});

test("rotation refuses navigation and diagnosis - they are permanently the human's", () => {
  const home = freshHome();
  for (const owns of ["navigation", "diagnosis"]) {
    const r = run(LOG_SCRIPT, ["rotation", `--owns=${owns}`], home);
    assert.equal(r.status, 1, `${owns} should be rejected`);
  }
});

test("rotation accepts spec, tests and none", () => {
  const home = freshHome();
  for (const owns of ["spec", "tests", "none"]) {
    const r = run(LOG_SCRIPT, ["rotation", `--owns=${owns}`], home);
    assert.equal(r.status, 0, r.stderr);
  }
});

test("report shows how often you found the code yourself", () => {
  const home = freshHome();
  for (const located of ["self", "self", "hinted", "told"]) {
    run(LOG_SCRIPT, ["handover", "--unit=A::b", `--located=${located}`], home);
  }
  const r = run(REPORT_SCRIPT, [], home);
  assert.equal(r.status, 0, r.stderr);
  assert.match(r.stdout, /you found the code\s+50%\s+\(2\/4\)/);
  assert.match(r.stdout, /you found the code\s+times you located/);
});

test("trace records a located-only event", () => {
  const home = freshHome();
  const r = run(LOG_SCRIPT, ["trace", "--located=hinted", "--project=hl"], home);
  assert.equal(r.status, 0, r.stderr);
  const [entry] = logLines(home);
  assert.equal(entry.event, "trace");
  assert.equal(entry.located, "hinted");
  assert.equal(entry.project, "hl");
});

test("trace requires a valid located value", () => {
  const home = freshHome();
  assert.equal(run(LOG_SCRIPT, ["trace"], home).status, 1);
  assert.equal(run(LOG_SCRIPT, ["trace", "--located=maybe"], home).status, 1);
});

test("nudge records whether a Mentor suggestion was taken", () => {
  const home = freshHome();
  const r = run(LOG_SCRIPT, ["nudge", "--kind=mentor", "--taken=false"], home);
  assert.equal(r.status, 0, r.stderr);
  const [entry] = logLines(home);
  assert.equal(entry.event, "nudge");
  assert.equal(entry.kind, "mentor");
  assert.equal(entry.taken, false);
});

test("nudge requires --taken", () => {
  const home = freshHome();
  assert.equal(run(LOG_SCRIPT, ["nudge", "--kind=mentor"], home).status, 1);
});

test("report counts traces towards finding the code", () => {
  const home = freshHome();
  run(LOG_SCRIPT, ["handover", "--unit=A::b", "--located=told"], home);
  run(LOG_SCRIPT, ["trace", "--located=self"], home);
  const r = run(REPORT_SCRIPT, [], home);
  assert.match(r.stdout, /you found the code\s+50%\s+\(1\/2\)/);
});

test("report shows Mentor nudges taken instead of switches off Mentor day", () => {
  const home = freshHome();
  run(LOG_SCRIPT, ["handover", "--unit=A::b"], home);
  run(LOG_SCRIPT, ["nudge", "--kind=mentor", "--taken=true"], home);
  run(LOG_SCRIPT, ["nudge", "--kind=mentor", "--taken=false"], home);
  const r = run(REPORT_SCRIPT, [], home);
  assert.match(r.stdout, /took the Mentor nudge\s+1 of 2/);
  assert.doesNotMatch(r.stdout, /mentor day/i);
});
