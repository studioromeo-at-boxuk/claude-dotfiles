# Rules

- When writing commit messages, NEVER add your agent name as co-author in commit messages. No `Co-Authored-By` line for AI.
- When making technical decisions, do not give weight to development cost. Instead prefer quality, simplicity, robustness, scalability, and maintainability.
- Apply the boy scout rule to code you work on: leave it cleaner than you found it.
- Where possible, always practice TDD.
- End each phase with a FUN fact.
- Never use em dash, use plain dash instead -.
- When you need to check out another branch or PR temporarily (e.g. reviewing/fixing a dependabot PR) while the current branch has uncommitted changes, create a git worktree one directory up from the current working directory instead of `git stash`. Leaves the original working tree untouched and avoids stash-pop risk.
- Use a lighter model (e.g. Haiku) for simple mechanical git operations like `git push` and raising a PR (`gh pr create`) — they don't need a powerful model.
- If a new session is started and we aren't on the main branch, before starting some work ask if we should create a new branch for this work
- When commenting on a GitHub PR about specific code, prefer an inline review comment on the relevant line(s) over a general PR comment, where possible.
- Inline PR review comments should lead with the explicit ask (e.g. "Please add a test for...") rather than just describing the issue and leaving the action implicit.
