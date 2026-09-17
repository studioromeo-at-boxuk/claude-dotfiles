#!/usr/bin/env node
//
// handover-report - what your code-practice log says about you.
//
// Reads ~/.claude/handover-log.jsonl and prints a plain-language summary.
// Zero dependencies. Run via /handover-report or:
//
//   node ~/.claude/bin/handover-report.mjs [--days=90] [--log=PATH]
//
// Log line schema (one JSON object per line, append-only):
//
//   { "ts": "2026-08-17T10:22:00.000Z",   // ISO timestamp, required
//     "event": "handover",                 // "handover" | "mode_switch"
//     "project": "healthy-leicestershire",
//     "mode": "learning-aggressive",
//
//     // event: "handover"
//     "unit": "CartTotal::calculate",      // what was handed over
//     "area": "logic",                     // logic | data structures | integration | drupal api | ...
//     "lines": 22,                         // rough size of the unit
//     "written_by": "human",               // "human" = you wrote it | "claude" = you gave it back
//     "reason": "deadline",                // one word, only when written_by = "claude"
//     "rounds": 2,                         // review passes before tests went green
//     "self_caught": true,                 // did a question alone get you there? null if nothing was wrong
//     "help_depth": 1,                      // deepest ladder rung reached: 0 none, 1 prior art,
//                                           // 2 narrowed question, 3 talked through, 4 Claude took it
//
//     // event: "mode_switch"
//     "from": "mentor", "to": "learning-aggressive", "reason": "tired" }
//
//   { "ts": "...", "event": "rotation", "owns": "navigation" }
//
// Current rotation state also lives in ~/.claude/practice-rotation.json.
//
import { readFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

const args = process.argv.slice(2);
const arg = (name, fallback) => {
  const hit = args.find((a) => a.startsWith(`--${name}=`));
  return hit ? hit.slice(name.length + 3) : fallback;
};

const DAYS = Number(arg("days", 90));
const LOG = arg("log", join(homedir(), ".claude", "handover-log.jsonl"));
const BUCKETS = 8;
const SPARK = "▁▂▃▄▅▆▇█";

// ---------- load ----------

if (!existsSync(LOG)) {
  console.log(`No log yet at ${LOG}`);
  console.log(`It fills up as work gets handed over. Nothing to report until then.`);
  process.exit(0);
}

const entries = [];
let skipped = 0;
for (const line of readFileSync(LOG, "utf8").split("\n")) {
  if (!line.trim()) continue;
  try {
    const e = JSON.parse(line);
    if (e.ts) entries.push(e);
    else skipped++;
  } catch {
    skipped++;
  }
}

const cutoff = Date.now() - DAYS * 864e5;
const inWindow = entries.filter((e) => Date.parse(e.ts) >= cutoff);
const handovers = inWindow.filter((e) => e.event === "handover");
const switches = inWindow.filter((e) => e.event === "mode_switch");

// Nothing to summarise without handovers or style switches. Rotation events alone are state,
// not practice, so say what is actually in the log rather than implying it is all stale.
if (!handovers.length && !switches.length) {
  const older = entries.filter((e) => Date.parse(e.ts) < cutoff).length;
  const other = inWindow.length;
  const entryCount = (n) => `${n} ${n === 1 ? "entry" : "entries"}`;
  console.log(`No handovers logged in the last ${DAYS} days.`);
  if (other) console.log(`${entryCount(other)} in that window, none of them a handover.`);
  if (older) console.log(`${entryCount(older)} older than the window.`);
  console.log(`The log fills as work gets handed over - there is nothing to read yet.`);
  process.exit(0);
}

// ---------- maths ----------

const pct = (n, d) => (d ? Math.round((n / d) * 100) : 0);
const mean = (xs) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const median = (xs) => {
  if (!xs.length) return 0;
  const s = [...xs].sort((a, b) => a - b);
  const m = s.length >> 1;
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
};

// Split the window into equal buckets and reduce each one to a single number,
// so a metric can be drawn as a sparkline over time.
const bucketise = (items, reduce) => {
  const span = Date.now() - cutoff;
  const out = Array.from({ length: BUCKETS }, () => []);
  for (const e of items) {
    const i = Math.min(BUCKETS - 1, Math.floor(((Date.parse(e.ts) - cutoff) / span) * BUCKETS));
    out[i].push(e);
  }
  return out.map(reduce);
};

const sparkline = (values) => {
  const real = values.filter((v) => v !== null);
  if (!real.length) return " ".repeat(BUCKETS);
  const lo = Math.min(...real);
  const hi = Math.max(...real);
  return values
    .map((v) => {
      if (v === null) return "·";
      if (hi === lo) return SPARK[3];
      return SPARK[Math.round(((v - lo) / (hi - lo)) * (SPARK.length - 1))];
    })
    .join("");
};

// Direction of travel: mean of the first half of the window vs the second.
// `goodWhen` says which way is progress, so the arrow can be judged not just drawn.
const trend = (values, goodWhen) => {
  const real = values.map((v, i) => [i, v]).filter(([, v]) => v !== null);
  if (real.length < 4) return "";
  const half = Math.floor(BUCKETS / 2);
  const first = mean(real.filter(([i]) => i < half).map(([, v]) => v));
  const second = mean(real.filter(([i]) => i >= half).map(([, v]) => v));
  if (!first && !second) return "";
  const delta = second - first;
  const scale = Math.max(Math.abs(first), 1);
  if (Math.abs(delta) / scale < 0.15) return "flat";
  const rising = delta > 0;
  const good = goodWhen === "up" ? rising : !rising;
  return `${rising ? "↑" : "↓"} ${good ? "good" : "watch"}`;
};

const wroteIt = handovers.filter((h) => h.written_by === "human");
const gaveBack = handovers.filter((h) => h.written_by === "claude");
const reviewed = handovers.filter((h) => typeof h.self_caught === "boolean");
const selfCaught = reviewed.filter((h) => h.self_caught);
const rounds = handovers.map((h) => h.rounds).filter((r) => typeof r === "number");
const sizes = handovers.map((h) => h.lines).filter((n) => typeof n === "number");
const helped = handovers.filter((h) => typeof h.help_depth === "number");

// Per-bucket series for the two numbers that must be read together: how much help was
// needed, and whether the work still took more passes to get right.
const helpBuckets = bucketise(helped, (b) => (b.length ? mean(b.map((h) => h.help_depth)) : null));
const roundsBuckets = bucketise(
  handovers.filter((h) => typeof h.rounds === "number"),
  (b) => (b.length ? mean(b.map((h) => h.rounds)) : null),
);

// Direction of a series as a bare sign, for cross-reading. null when too thin to call.
const direction = (values) => {
  const t = trend(values, "down");
  if (!t || t === "flat") return t === "flat" ? 0 : null;
  return t.startsWith("↑") ? 1 : -1;
};

const row = (label, value, spark = "", note = "") =>
  `  ${label.padEnd(26)}${value.padEnd(16)}${spark.padEnd(11)}${note}`.trimEnd();

// ---------- report ----------

const plural = (n, word) => `${n} ${word}${n === 1 ? "" : "s"}`;

console.log("");
console.log(`YOUR CODE PRACTICE - last ${DAYS} days`.padEnd(48) + `${plural(handovers.length, "handover")}`);
console.log("");

console.log(
  row(
    "you wrote it",
    `${pct(wroteIt.length, handovers.length)}%  (${wroteIt.length}/${handovers.length})`,
    sparkline(bucketise(handovers, (b) => (b.length ? pct(b.filter((h) => h.written_by === "human").length, b.length) : null))),
    trend(bucketise(handovers, (b) => (b.length ? pct(b.filter((h) => h.written_by === "human").length, b.length) : null)), "up"),
  ),
);

const gaveBackReasons = [...new Set(gaveBack.map((h) => h.reason).filter(Boolean))];
console.log(
  row(
    "you asked me to write it",
    `${pct(gaveBack.length, handovers.length)}%  (${gaveBack.length}/${handovers.length})`,
    "",
    gaveBackReasons.length ? `(${gaveBackReasons.join(", ")})` : "",
  ),
);

if (reviewed.length) {
  const catchRate = bucketise(reviewed, (b) => (b.length ? pct(b.filter((h) => h.self_caught).length, b.length) : null));
  console.log(
    row(
      "you found your own bugs",
      `${pct(selfCaught.length, reviewed.length)}%  (${selfCaught.length}/${reviewed.length})`,
      sparkline(catchRate),
      trend(catchRate, "up"),
    ),
  );
}

if (helped.length) {
  console.log(
    row(
      "average help needed",
      mean(helped.map((h) => h.help_depth)).toFixed(1),
      sparkline(helpBuckets),
      trend(helpBuckets, "down"),
    ),
  );
}

if (rounds.length) {
  console.log(
    row("review rounds to green", mean(rounds).toFixed(1), sparkline(roundsBuckets), trend(roundsBuckets, "down")),
  );
}

if (sizes.length) console.log(row("typical size handed over", `${median(sizes)} lines`));

if (switches.length) {
  const offMentor = switches.filter((s) => s.from === "mentor");
  const reasons = offMentor.map((s) => s.reason).filter(Boolean);
  console.log(
    row(
      "switched off mentor day",
      plural(offMentor.length, "time"),
      "",
      reasons.length ? `(${reasons.join(", ")})` : "",
    ),
  );
}

// ---------- rotation ----------

const rotation = (() => {
  const path = join(homedir(), ".claude", "practice-rotation.json");
  try {
    if (!existsSync(path)) return null;
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
})();

if (rotation?.owns && rotation.owns !== "none") {
  const days = Math.floor((Date.now() - Date.parse(rotation.since)) / 864e5);
  console.log(row("you have taken back", rotation.owns, "", `(${plural(days, "day")}${days >= 90 ? ", due to move" : ""})`));
}

// ---------- by area ----------

const areas = [...new Set(handovers.map((h) => h.area).filter(Boolean))];
if (areas.length) {
  const stats = areas
    .map((area) => {
      const mine = handovers.filter((h) => h.area === area);
      const rev = mine.filter((h) => typeof h.self_caught === "boolean");
      return {
        area,
        n: mine.length,
        catch: rev.length ? pct(rev.filter((h) => h.self_caught).length, rev.length) : null,
        thin: rev.length < 3,
      };
    })
    .sort((a, b) => b.n - a.n);

  const scored = stats.filter((s) => s.catch !== null);
  const weakest = scored.length > 1 ? Math.min(...scored.map((s) => s.catch)) : null;

  console.log("");
  console.log(`  ${"by area".padEnd(26)}${"handed to you".padEnd(16)}found own bugs`);
  for (const s of stats) {
    const flag = s.catch !== null && s.catch === weakest ? "  <- weakest" : "";
    const thin = s.thin ? " (thin data)" : "";
    console.log(
      `  ${s.area.padEnd(26)}${String(s.n).padEnd(16)}${(s.catch === null ? "-" : `${s.catch}%`).padEnd(11)}${flag}${thin}`.trimEnd(),
    );
  }
}

// ---------- the cross-read ----------
//
// Help needed on its own is confounded: a hard quarter looks like decline, and leaning
// less while shipping worse code looks like growth. It only means something read against
// whether the work still took more passes to get right.

if (helped.length >= 10 && rounds.length >= 10) {
  const helpDir = direction(helpBuckets);
  const roundsDir = direction(roundsBuckets);
  if (helpDir !== null && roundsDir !== null) {
    const verdict =
      helpDir < 0 && roundsDir > 0
        ? "Needing less help but taking more passes - that is decline wearing independence as a costume."
        : helpDir < 0 && roundsDir <= 0
          ? "Needing less help, same or fewer passes. That is real."
          : helpDir > 0 && roundsDir < 0
            ? "Asking for more help and getting it right faster - productive struggle, nothing to fix."
            : helpDir > 0 && roundsDir > 0
              ? "More help and more passes - either the work got harder or the units are too big. Check size."
              : "Help and passes both flat.";
    console.log("");
    console.log(`  ${verdict}`);
  }
}

// ---------- legend, every time ----------

console.log("");
console.log("  what these mean");
console.log("    you asked me to write it  times you gave a unit back to me part-way through");
console.log("    you found your own bugs   I asked a question, you spotted it without being told");
console.log("    average help needed       0 none, 1 prior art, 2 narrowed question,");
console.log("                              3 talked through, 4 I took the unit");
console.log("    review rounds to green    passes over your code before the tests went green");
console.log("    switched off mentor day   times you moved off Mentor on a scheduled day");
console.log("    you have taken back       the default you own this quarter, and for how long");
console.log("");
console.log("  Watch 'you found your own bugs' first - it is the slowest to fake.");
console.log("  Never read 'average help needed' alone - see the line above the legend.");
if (skipped) console.log(`  (${plural(skipped, "log line")} unreadable, skipped)`);
console.log("");
