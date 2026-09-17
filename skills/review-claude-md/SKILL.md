---
name: review-claude-md
description: >
  Audit the three CLAUDE.md tiers for a project - global (~/.claude/CLAUDE.md),
  project (CLAUDE.md, checked in), and personal-project (CLAUDE.local.md,
  uncommitted). Only invoke when the user explicitly runs /review-claude-md or
  asks to review, audit, or clean up their CLAUDE.md files - never
  auto-trigger this during normal work. Checks for cross-tier redundancy,
  contradictions, staleness against the current codebase, and draft-tier
  rules ready to promote to a more permanent/shared tier.
---

Three tiers, in order of reach: global `~/.claude/CLAUDE.md` (every project),
project `CLAUDE.md` (checked in, every teammate's Claude reads it), project
`CLAUDE.local.md` (personal, this project only, uncommitted).

If `~/.claude/CLAUDE.md` is a symlink (common with dotfiles setups), resolve
it with `readlink -f` and read/edit the real target - editing through the
symlink will be refused.

1. **Read all three in full.** Don't rely on a partial read or a summary from
   earlier in the conversation - re-read each file fresh, since the whole
   point is to catch drift you might already be assuming away.

2. **Also read `.claude/settings.json` and `.claude/settings.local.json`**
   (project and global). A permission `ask`/`deny` rule can make a written
   CLAUDE.md rule fully redundant even though nothing else covers it - this
   is exactly how `feedback_destructive_ops` turned out to be redundant in
   an earlier memory-review pass.

3. **Check for four things, across all three tiers together:**
   - **Redundancy** - the same rule stated in more than one tier. Flag which
     tier should keep it (usually the broadest applicable one) and which
     copy to drop.
   - **Contradiction** - one tier says X, another says Y, or a tier's stated
     rule contradicts actual established practice (check recent commits,
     `.claude/agents/`, or ask the user directly if unsure). This is the
     class of bug that motivated this skill: CLAUDE.md's TDD breakpoint step
     said "Commit" unconditionally while actual practice drew a commit/push
     distinction it didn't know about.
   - **Staleness** - a rule names a specific file, agent, tool, or command
     that no longer exists. Verify with Read/Grep against the current
     codebase before flagging, same as `/review-memory` does.
   - **Draft-tier promotion candidates** - CLAUDE.local.md may have a
     section explicitly marked as draft (e.g. "Workflow (draft - promote to
     CLAUDE.md once proven)"). Check whether items under it have since
     proven durable enough to move up a tier, and whether anything in
     project CLAUDE.md has, in turn, proven durable enough to move to the
     global tier.

4. **Go one at a time, not a dump.** For each finding, present it
   individually and ask what to do - don't batch unrelated findings into one
   question. This mirrors `/tko` and `/review-memory`'s existing pattern so
   the user can actually track what's being decided.

5. **Execute only after confirmation.** For a promotion: write the rule into
   the target tier in that file's own voice, then remove it from the
   lower tier. For a contradiction: ask which version is actually correct
   before changing anything - don't assume the more restrictive or the more
   recent one wins. For staleness: fix the reference if it moved, delete the
   line if it's genuinely gone, per what the user says.

6. **Summarise at the end.** List what moved tiers (and where), what was
   fixed in place, what was deleted, and what was left as-is with a one-line
   reason.

## What not to do

- Do not run this automatically during normal work - only on explicit
  invocation
- Do not edit any of the three files without per-item confirmation
- Do not assume which tier "should" win a contradiction - ask
- Do not fold this into `/review-memory` - keep them separate even though
  the one-at-a-time mechanics are the same; the inputs and failure modes
  differ (memory drifts from reality one correction at a time, CLAUDE.md
  drifts from itself across tiers written at different times)
