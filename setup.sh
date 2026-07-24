#!/usr/bin/env bash
set -euo pipefail

DOTFILES_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
CLAUDE_DIR="$HOME/.claude"

ITEMS=(CLAUDE.md settings.json agents output-styles)

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

  ln -s "$src" "$dest"
  echo "linked: $item"
done
