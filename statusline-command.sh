#!/usr/bin/env bash

input=$(cat)

model=$(echo "$input" | jq -r '.model.display_name // "Claude"')
used_pct=$(echo "$input" | jq -r '.context_window.used_percentage // empty')
total_input=$(echo "$input" | jq -r '.context_window.total_input_tokens // empty')
window_size=$(echo "$input" | jq -r '.context_window.context_window_size // empty')
five_hour_pct=$(echo "$input" | jq -r '.rate_limits.five_hour.used_percentage // empty')
five_hour_reset=$(echo "$input" | jq -r '.rate_limits.five_hour.resets_at // empty')
week_pct=$(echo "$input" | jq -r '.rate_limits.seven_day.used_percentage // empty')

RESET="\033[0m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
GREY="\033[90m"

# Classic ascii-progress style: plain "=" characters forming a continuous
# line, a "-" line for the remainder - pure ASCII, always renders at normal
# text height since there's no special glyph metrics involved.
FILLED_CHAR="="
HEAD_CHAR=">"
EMPTY_CHAR="-"

color_for_pct() {
  local pct="$1"
  if awk "BEGIN{exit !($pct >= 80)}" 2>/dev/null; then
    echo "$RED"
  elif awk "BEGIN{exit !($pct >= 50)}" 2>/dev/null; then
    echo "$YELLOW"
  else
    echo "$GREEN"
  fi
}

# Renders an ascii-progress-style bar: "====>----" - a continuous "=" line
# with a ">" arrowhead at the fill point, dim "-" line for the remainder -
# color-coded by severity.
make_bar() {
  local pct="$1"
  local width="${2:-12}"
  local color
  color=$(color_for_pct "$pct")

  local filled
  filled=$(awk "BEGIN{v=(($pct/100)*$width)+0.5; if (v<0) v=0; if (v>$width) v=$width; printf \"%d\", v}")
  local empty=$(( width - filled ))

  local filled_str="" empty_str="" i
  if [ "$filled" -gt 0 ] && [ "$filled" -lt "$width" ]; then
    for (( i=0; i<filled-1; i++ )); do filled_str="${filled_str}${FILLED_CHAR}"; done
    filled_str="${filled_str}${HEAD_CHAR}"
  else
    for (( i=0; i<filled; i++ )); do filled_str="${filled_str}${FILLED_CHAR}"; done
  fi
  for (( i=0; i<empty; i++ )); do empty_str="${empty_str}${EMPTY_CHAR}"; done

  printf "%b%s%b%b%s%b" "$color" "$filled_str" "$RESET" "$GREY" "$empty_str" "$RESET"
}

output="$model"

if [ -n "$used_pct" ]; then
  bar=$(make_bar "$used_pct" 14)
  pct_1dp=$(printf "%.1f" "$used_pct")
  tokens_str=""
  if [ -n "$total_input" ] && [ -n "$window_size" ]; then
    total_k=$(( total_input / 1000 ))
    window_k=$(( window_size / 1000 ))
    tokens_str=" (${total_k}k/${window_k}k)"
  fi
  output="$output  ctx [${bar}] ${pct_1dp}%${tokens_str}"
fi

if [ -n "$five_hour_pct" ]; then
  bar=$(make_bar "$five_hour_pct" 10)
  pct_int=$(printf "%.0f" "$five_hour_pct")
  reset_str=""
  if [ -n "$five_hour_reset" ]; then
    reset_epoch=$(printf "%.0f" "$five_hour_reset" 2>/dev/null)
    reset_time=$(date -r "$reset_epoch" +%H:%M 2>/dev/null)
    [ -n "$reset_time" ] && reset_str=" (resets ${reset_time})"
  fi
  output="$output  5h [${bar}] ${pct_int}%${reset_str}"
fi

if [ -n "$week_pct" ]; then
  bar=$(make_bar "$week_pct" 10)
  pct_int=$(printf "%.0f" "$week_pct")
  output="$output  7d [${bar}] ${pct_int}%"
fi

printf "%s\n" "$output"
