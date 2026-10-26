#!/usr/bin/env node
//
// handover-log - append one line to ~/.claude/handover-log.jsonl
//
// Called by Claude when a handover closes, the output style changes, or the quarterly
// rotation moves, so the numbers in /handover-report are recorded rather than remembered.
//
//   node ~/.claude/bin/handover-log.mjs handover \
//     --unit="CartTotal::calculate" --area=logic --lines=22 \
//     --written-by=human --rounds=2 --self-caught=true --help-depth=1 --located=self --project=hl
//
//   node ~/.claude/bin/handover-log.mjs handover \
//     --unit="ServiceImporter::parseRow" --written-by=claude --reason=deadline --help-depth=4
//
//   node ~/.claude/bin/handover-log.mjs mode-switch --from=mentor \
//     --to=learning-aggressive --reason=tired
//
//   node ~/.claude/bin/handover-log.mjs trace --located=self --project=hl
//
//   node ~/.claude/bin/handover-log.mjs nudge --kind=mentor --taken=false
//
//   node ~/.claude/bin/handover-log.mjs rotation --owns=spec
//
// `trace` records a codebase-location attempt that did not become a handover - a Predict
// First "where would it go?", or a trace for code Claude then wrote - so the located measure
// fills at the rate the practice actually happens. `nudge` records whether a suggestion from
// the practice-nudge hook was taken.
//
// help-depth is the deepest rung of the help ladder reached on that unit:
//   0 no help  1 pointed at prior art  2 narrowed the question
//   3 talked through the approach      4 Claude took the unit
//
// located is who found where the change belongs - the codebase-knowledge measure:
//   self  the human traced it unaided   hinted  Claude pointed at a starting place
//   told  Claude named the location
//
// `rotation` records which default the human has taken back for this quarter. Navigation
// and diagnosis are permanently the human's, so only spec and tests rotate. It writes
// ~/.claude/practice-rotation.json as well as a log line, so the practice-nudge hook can nudge
// when the rotation goes stale.
//
import { appendFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const [kind, ...rest] = process.argv.slice(2);

const flags = {};
for (const a of rest) {
  const m = a.match(/^--([\w-]+)=(.*)$/s);
  if (m) flags[m[1]] = m[2];
}

const HOME = homedir();
const LOG = flags.log || join(HOME, ".claude", "handover-log.jsonl");
const ROTATION = flags.rotationFile || join(HOME, ".claude", "practice-rotation.json");
const ROTATABLE = ["spec", "tests", "none"];
const LOCATED = ["self", "hinted", "told"];

const num = (v) => (v === undefined || v === "" ? undefined : Number(v));
const bool = (v) => (v === undefined || v === "" ? undefined : v === "true");
const now = new Date().toISOString();

let entry;
if (kind === "handover") {
  if (flags.located !== undefined && !LOCATED.includes(flags.located)) {
    console.error(`handover --located must be one of: ${LOCATED.join(", ")}`);
    process.exit(1);
  }
  entry = {
    ts: now,
    event: "handover",
    project: flags.project,
    mode: flags.mode,
    unit: flags.unit,
    area: flags.area,
    lines: num(flags.lines),
    written_by: flags["written-by"] || "human",
    reason: flags.reason,
    rounds: num(flags.rounds),
    self_caught: bool(flags["self-caught"]),
    help_depth: num(flags["help-depth"]),
    located: flags.located,
  };
} else if (kind === "mode-switch") {
  entry = {
    ts: now,
    event: "mode_switch",
    project: flags.project,
    from: flags.from,
    to: flags.to,
    reason: flags.reason,
  };
} else if (kind === "trace") {
  if (!LOCATED.includes(flags.located)) {
    console.error(`trace --located must be one of: ${LOCATED.join(", ")}`);
    process.exit(1);
  }
  entry = { ts: now, event: "trace", project: flags.project, located: flags.located };
} else if (kind === "nudge") {
  if (!["true", "false"].includes(flags.taken)) {
    console.error("nudge --taken must be true or false");
    process.exit(1);
  }
  entry = { ts: now, event: "nudge", project: flags.project, kind: flags.kind, taken: bool(flags.taken) };
} else if (kind === "rotation") {
  const owns = flags.owns;
  if (!ROTATABLE.includes(owns)) {
    console.error(`rotation --owns must be one of: ${ROTATABLE.join(", ")}`);
    process.exit(1);
  }
  entry = { ts: now, event: "rotation", owns };
  writeFileSync(ROTATION, JSON.stringify({ owns, since: now.slice(0, 10) }, null, 2) + "\n");
} else {
  console.error("usage: handover-log.mjs <handover|trace|nudge|mode-switch|rotation> --flag=value ...");
  process.exit(1);
}

for (const k of Object.keys(entry)) if (entry[k] === undefined) delete entry[k];

appendFileSync(LOG, JSON.stringify(entry) + "\n");
const summary =
  entry.unit ||
  entry.owns ||
  (entry.event === "trace" && entry.located) ||
  (entry.event === "nudge" && `${entry.kind} taken=${entry.taken}`) ||
  `${entry.from} -> ${entry.to}`;
console.log(`logged: ${entry.event} ${summary}`);
