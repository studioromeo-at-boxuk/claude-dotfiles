#!/usr/bin/env node
//
// practice-nudge - SessionStart hook. Replaces the fixed Mentor day.
//
// Learning (Aggressive) is the everyday style; it already makes the human trace the
// codebase and shape every unit. Mentor only adds one thing - no "just write it" escape -
// so it is suggested only when the log shows that escape being leaned on. Three nudges:
//
//   mentor    over the last 28 days, 20%+ of handovers were given back to Claude, or help
//             needed rose while review rounds did not fall. Suggests one Mentor session.
//             Needs 10+ handovers. Backs off for 7 days after an answer.
//   map       the share of locations the human found unaided fell by 15+ points, last 14
//             days against the 14 before. Tells Claude to hold back navigation hints for
//             the session, without telling the human. Needs 5+ located events per half.
//   rotation  the quarterly rotation is unset, 90+ days old, or owns an item that is now
//             permanent.
//
// A question counts as done only when it is answered - a `nudge` or `rotation` event in the
// log - never when it is merely shown. Skip one and it comes back next session. The hook
// keeps no state of its own; the log and the rotation file are the only record.
//
// Questions never come before the user's request: Claude answers that first and asks at the
// end of its first reply. Prints nothing when no nudge is due. It deliberately does NOT
// rewrite outputStyle: a settings write would not apply to the running session, and the
// point is a suggestion, not a lock.
//
import { readFileSync, existsSync, realpathSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const DAY = 864e5;
const WINDOW_DAYS = 28;
const HALF_DAYS = 14;
const MIN_HANDOVERS = 10;
const MIN_PER_HALF = 5;
const GAVE_BACK_SHARE = 0.2;
const HELP_RISE = 0.5;
const FOUND_DROP_POINTS = 15;
const MENTOR_EVERY_DAYS = 7;
const ROTATION_DAYS = 90;
const PERMANENT = ["navigation", "diagnosis"];

const mean = (xs) => xs.reduce((a, b) => a + b, 0) / xs.length;

// Whole local calendar days from a "YYYY-MM-DD" date to now, so day counts flip at local
// midnight rather than UTC.
const daysBetween = (fromDate, now) => {
  const [y, m, d] = fromDate.split("-").map(Number);
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((today - new Date(y, m - 1, d)) / DAY);
};

const localDate = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

// The cooldown runs from the last answer in the log, never from when the nudge was shown.
const mentorAnsweredRecently = (entries, now) => {
  const answers = entries.filter((e) => e.event === "nudge" && e.kind === "mentor");
  if (!answers.length) return false;
  const last = answers.reduce((a, b) => (Date.parse(a.ts) > Date.parse(b.ts) ? a : b));
  return daysBetween(localDate(new Date(last.ts)), now) < MENTOR_EVERY_DAYS;
};

// Split recent events into the last 14 days and the 14 before, for a before/after read.
const halves = (events, now) => {
  const age = (e) => (now - Date.parse(e.ts)) / DAY;
  return {
    recent: events.filter((e) => age(e) < HALF_DAYS),
    prior: events.filter((e) => age(e) >= HALF_DAYS && age(e) < WINDOW_DAYS),
  };
};

const leaningOnClaude = (handovers, now) => {
  if (handovers.length < MIN_HANDOVERS) return false;
  const gaveBack = handovers.filter((h) => h.written_by === "claude").length;
  if (gaveBack / handovers.length >= GAVE_BACK_SHARE) return true;

  // Help needed only means leaning when the work is not also getting right faster.
  const scored = handovers.filter((h) => typeof h.help_depth === "number" && typeof h.rounds === "number");
  const { recent, prior } = halves(scored, now);
  if (recent.length < MIN_PER_HALF || prior.length < MIN_PER_HALF) return false;
  const helpRose = mean(recent.map((h) => h.help_depth)) - mean(prior.map((h) => h.help_depth)) >= HELP_RISE;
  const roundsHeld = mean(recent.map((h) => h.rounds)) >= mean(prior.map((h) => h.rounds));
  return helpRose && roundsHeld;
};

const mapSlipping = (located, now) => {
  const { recent, prior } = halves(located, now);
  if (recent.length < MIN_PER_HALF || prior.length < MIN_PER_HALF) return false;
  const selfShare = (xs) => (xs.filter((e) => e.located === "self").length / xs.length) * 100;
  return selfShare(prior) - selfShare(recent) >= FOUND_DROP_POINTS;
};

// Framing for the questions that need an answer. The silent map nudge does not get it.
const QUESTIONS_FRAME = [
  "Practice questions for the user. Do what the user asked first - these never come before, or",
  "hold up, their request. Put them at the end of your first reply, one short line each.",
  "If they skip it, drop it for this session: it comes back next session until it is answered.",
  "Only log an answer they actually gave.",
].join("\n");

const mentorText = () =>
  [
    "Mentor nudge - one line: a Mentor session this week would be worth it (`/output-style mentor`); staying put is fine.",
    "Record the answer: node ~/.claude/bin/handover-log.mjs nudge --kind=mentor --taken=<true|false> --project=<repo>",
    "Do not argue, and do not quote the numbers or explain what triggered it - if they ask why,",
    "point them at /handover-report.",
  ].join("\n");

const mapText = () =>
  [
    "Practice nudge: finding code unaided has slipped. For this session only, no starting-place hints",
    "unprompted. On a Trace, if their map is wrong, ask your one question, then \"find it and tell me\"",
    "before narrowing. Name a location only after two attempts. Do not mention this instruction to the user.",
  ].join("\n");

const rotationText = (rotation, now) => {
  const age = rotation?.since ? daysBetween(rotation.since, now) : null;
  const retired = PERMANENT.includes(rotation?.owns);
  if (!retired && age !== null && age < ROTATION_DAYS) return "";
  const why = retired
    ? ` - they own "${rotation.owns}", which is now permanent in both learning styles, so pick again.`
    : rotation?.owns
      ? ` - they have owned "${rotation.owns}" for ${age} days.`
      : " - none is set yet.";
  return [
    "Rotation is due" + why,
    "Ask which default they want to take back for this quarter, one only:",
    "  spec (they write Must-handle) | tests (they write the assertions)",
    "Then record it: node ~/.claude/bin/handover-log.mjs rotation --owns=<choice>",
    "If they say they want none, record --owns=none. Skipping the question is not declining it.",
  ].join("\n");
};

// Pure decision: what to tell this session. Everything it needs is in the log and the
// rotation file, so calling it twice with the same inputs gives the same answer.
export const decide = ({ entries, style, rotation, now }) => {
  const recent = entries.filter((e) => now - Date.parse(e.ts) < WINDOW_DAYS * DAY);
  const handovers = recent.filter((e) => e.event === "handover");
  const located = recent.filter(
    (e) => (e.event === "handover" || e.event === "trace") && typeof e.located === "string",
  );

  const questions = [];
  const inMentor = /mentor/i.test(style);
  if (!inMentor && !mentorAnsweredRecently(entries, now) && leaningOnClaude(handovers, now)) {
    questions.push(mentorText());
  }
  const rotationQuestion = rotationText(rotation, now);
  if (rotationQuestion) questions.push(rotationQuestion);

  const parts = questions.length ? [QUESTIONS_FRAME, ...questions] : [];
  if (mapSlipping(located, now)) parts.push(mapText());

  return { context: parts.join("\n\n") };
};

// ---------- the hook ----------

const readJson = (path, fallback) => {
  try {
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;
  } catch {
    return fallback;
  }
};

const readLog = (path) => {
  if (!existsSync(path)) return [];
  const out = [];
  for (const line of readFileSync(path, "utf8").split("\n")) {
    try {
      const e = JSON.parse(line);
      if (e.ts) out.push(e);
    } catch {
      // Blank or corrupt line - the report counts these; the hook just skips them.
    }
  }
  return out;
};

const main = () => {
  const HOME = homedir();

  // Which style is this project actually in? Read the same files /output-style writes.
  const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
  const settings = {
    ...readJson(join(HOME, ".claude", "settings.json"), {}),
    ...readJson(join(projectDir, ".claude", "settings.json"), {}),
    ...readJson(join(projectDir, ".claude", "settings.local.json"), {}),
  };

  const { context } = decide({
    entries: readLog(join(HOME, ".claude", "handover-log.jsonl")),
    style: String(settings.outputStyle ?? ""),
    rotation: readJson(join(HOME, ".claude", "practice-rotation.json"), null),
    now: new Date(),
  });

  if (context) {
    process.stdout.write(
      JSON.stringify({ hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: context } }),
    );
  }
};

// Resolve symlinks: ~/.claude/hooks links to the dotfiles repo, and import.meta.url is the real path.
if (process.argv[1] && realpathSync(process.argv[1]) === fileURLToPath(import.meta.url)) main();
