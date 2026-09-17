#!/usr/bin/env node
//
// mentor-day - SessionStart hook. Tuesday is Mentor day.
//
// Prints nothing on other days. On Tuesday it tells the session that Mentor mode is
// the scheduled default, and if the session is not in Mentor it asks for a one-word
// reason so the deviation is recorded rather than silently absorbed.
//
// It deliberately does NOT rewrite outputStyle in settings: a settings write mid-session
// would not apply to the running session, and the point is a visible prompt, not a lock.
//
// State lives in ~/.claude/.mentor-day-state.json so the ask happens at most once a day.
//
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

// 0 = Sunday ... 6 = Saturday. Override with MENTOR_DAY to move the hard leg without
// editing this file (set it in the hook's env in settings.json).
const MENTOR_DAY = Number(process.env.MENTOR_DAY ?? 2);
const HOME = homedir();
const STATE = join(HOME, ".claude", ".mentor-day-state.json");

const emit = (text) => {
  process.stdout.write(
    JSON.stringify({
      hookSpecificOutput: { hookEventName: "SessionStart", additionalContext: text },
    }),
  );
};

const readJson = (path, fallback) => {
  try {
    return existsSync(path) ? JSON.parse(readFileSync(path, "utf8")) : fallback;
  } catch {
    return fallback;
  }
};

const DAY_NAME = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"][MENTOR_DAY] ?? "Mentor";

const now = new Date();
if (now.getDay() !== MENTOR_DAY) process.exit(0);

const today = now.toISOString().slice(0, 10);
const state = readJson(STATE, {});
if (state.askedDate === today) process.exit(0); // already handled today

// Which style is this project actually in? Read the same file /output-style writes.
const projectDir = process.env.CLAUDE_PROJECT_DIR || process.cwd();
const settings = {
  ...readJson(join(HOME, ".claude", "settings.json"), {}),
  ...readJson(join(projectDir, ".claude", "settings.json"), {}),
  ...readJson(join(projectDir, ".claude", "settings.local.json"), {}),
};
const style = String(settings.outputStyle ?? "");
const inMentor = /mentor/i.test(style);

try {
  writeFileSync(STATE, JSON.stringify({ askedDate: today, seenStyle: style }, null, 2) + "\n");
} catch {
  // Non-fatal: worst case the prompt appears twice in one day.
}

// Quarterly rotation: which default has the human taken back, and is it stale? Absent state
// counts as stale, so the first Mentor day asks them to pick one.
const ROTATION_DAYS = 90;
const rotationNudge = (() => {
  const rot = readJson(join(HOME, ".claude", "practice-rotation.json"), null);
  const age = rot?.since ? Math.floor((Date.now() - Date.parse(rot.since)) / 864e5) : null;
  if (age !== null && age < ROTATION_DAYS) return "";
  return [
    "",
    "Rotation is due" + (rot?.owns ? ` - they have owned "${rot.owns}" for ${age} days.` : " - none is set yet."),
    "Ask which default they want to take back for this quarter, one only:",
    "  navigation (you stop pointing at prior art) | spec (they write Must-handle)",
    "  diagnosis (they debug from raw output) | tests (they write the assertions)",
    "Then record it: node ~/.claude/bin/handover-log.mjs rotation --owns=<choice>",
    "Ask once. If they decline, record --owns=none and drop it.",
  ].join("\n");
})();

if (inMentor) {
  emit(
    [
      `It is ${DAY_NAME} - Mentor day. This session is already in Mentor (Guided): the user writes all`,
      "production code, you write the failing tests and guide. Do not offer to write implementation.",
      "Log closed handovers with ~/.claude/bin/handover-log.mjs as that style describes.",
      rotationNudge,
    ].join("\n"),
  );
} else {
  emit(
    [
      `It is ${DAY_NAME} - Mentor day - and this project is in "${style || "the default style"}" instead.`,
      "",
      "Tell the user once, in two lines at most:",
      `  - ${DAY_NAME} is the scheduled hard leg. Run \`/output-style mentor\` to take it.`,
      "  - Staying put is fine, it just gets logged.",
      "",
      "If they choose to stay, ask for a one-word reason (deadline, tired, spike, ...), then record it:",
      `  node ~/.claude/bin/handover-log.mjs mode-switch --from=mentor --to="${style || "default"}" --reason=<word> --project=<repo>`,
      "",
      "Ask at most once. Do not argue with the reason, do not raise it again this session, and do not",
      "mention the numbers - those belong to /handover-report only.",
      rotationNudge,
    ].join("\n"),
  );
}
