#!/usr/bin/env bash
set -euo pipefail

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$HOME/.claude"

ITEMS=(CLAUDE.md settings.json agents output-styles statusline-command.sh skills bin commands hooks)

for item in "${ITEMS[@]}"; do
  src="$DOTFILES_DIR/$item"
  dest="$CLAUDE_DIR/$item"

  if [ ! -e "$src" ]; then
    echo "skip: $item not found in dotfiles repo" >&2
    continue
  fi

  if [ -L "$dest" ] && [ "$(readlink "$dest")" = "$src" ]; then
    echo "ok: $item already linked"
    continue
  fi

  # A real file or directory at $dest is never safe to link over: `ln -s` would nest
  # the link inside a directory, or fail outright on a file. Leave it for a human.
  if [ -e "$dest" ] || [ -L "$dest" ]; then
    echo "skip: $dest already exists and is not a link to the dotfiles copy - move it aside first" >&2
    continue
  fi

  ln -s "$src" "$dest"
  echo "linked: $item"
done
