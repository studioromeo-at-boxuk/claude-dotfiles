---
description: Show the code-practice report from the handover log
allowed-tools: Bash(node:*)
---

Run the report and show its output verbatim:

!`node ~/.claude/bin/handover-report.mjs $ARGUMENTS`

Then add at most three lines of your own:

- the single number that moved most since it would last have been checked, and what that means in practice
- the weakest area, and one concrete thing to hand over next to strengthen it
- nothing else - no encouragement, no restating what the table already says

If the log is empty or thin, say so plainly and stop. Do not extrapolate from fewer than
ten handovers; a trend needs data it does not have yet.

Accepts the script's flags, e.g. `/handover-report --days=30`.
