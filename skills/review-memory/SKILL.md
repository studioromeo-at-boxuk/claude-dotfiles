---
name: review-memory
description: >
  Audit the auto-memory system for the current project. Only invoke when the
  user explicitly runs /review-memory or asks to review, audit, or clean up
  memories - never auto-trigger this while saving or recalling memories
  during normal work. Checks every memory for staleness against the current
  codebase, and surfaces feedback memories that look settled enough to
  promote into CLAUDE.md or CLAUDE.local.md.
---

The memory directory for this project is the one described in your system
context (`~/.claude/projects/<project-slug>/memory/`). Work only in that
directory - do not touch other projects' memory.

1. **Read everything first.** Read `MEMORY.md`, then read every linked memory
   file in full. Do not skip any on the assumption the index line is enough.

2. **Check each memory for staleness.** For any memory that names a specific
   file path, function, tool, flag, or config value: verify it still exists
   (Read/Grep the current codebase). For `project`-type memories: check
   whether the stated deadline, decision, or in-flight state has clearly
   passed or resolved. For `feedback`-type memories about tool permissions
   or destructive operations, also check `.claude/settings.json` /
   `settings.local.md` - a permission `ask`/`deny` rule can make the memory
   fully redundant even when nothing in CLAUDE.md covers it. Sort findings
   into three buckets:
   - **Stale** - the concrete thing it names no longer exists, or the
     project fact has clearly resolved/expired
   - **Settled feedback** - a `feedback`-type memory that has held up,
     reads as a durable rule rather than a one-off, and isn't already
     covered in CLAUDE.md / CLAUDE.local.md / settings.json permissions
   - **Fine as-is** - still accurate, still belongs in memory

3. **Go one at a time, not a dump.** For each Stale or Settled-feedback
   memory, present it individually and ask what to do:
   - Stale → propose deletion, but let the user confirm or correct you
     (you may be missing context - e.g. a rename you didn't catch)
   - Settled feedback → propose promoting it into CLAUDE.local.md (personal)
     or CLAUDE.md (team-wide, if it's about the codebase/process rather than
     your personal working style) - ask which, don't assume
   - Do not batch multiple memories into one question - this mirrors how
     tko handles one thread at a time, so the user can actually track what's
     being decided

4. **Execute only after confirmation.** For a promotion: add the rule to the
   target file in the target file's own voice (not the memory's frontmatter
   structure - write it as a normal instruction/rule), then delete the memory
   file and its `MEMORY.md` line. For a deletion: remove the memory file and
   its `MEMORY.md` line. Never do either without that item's explicit go-ahead.

5. **Summarise at the end.** List what was promoted (and where), what was
   deleted, and what was left as-is with a one-line reason.

## What not to do

- Do not run this automatically during normal work - only on explicit
  invocation
- Do not delete or promote anything without per-item confirmation
- Do not promote a memory verbatim - reword it to fit the target file's
  existing tone and structure
- Do not treat "used multiple times" as something to count mechanically -
  there is no tracking field for this; judge it from whether the memory
  reads as a settled rule versus a one-off observation
