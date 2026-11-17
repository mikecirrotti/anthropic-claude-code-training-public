#!/usr/bin/env bash
#
# PreToolUse hook for the Bash tool: guard `git push`.
#
# Claude Code passes the pending tool call as JSON on stdin. If the command is
# a `git push`, run the merchant console's tests and then its build. If either
# fails, exit 2 (which blocks the call and shows stderr to Claude); if both
# pass, exit 0 and let the push through. Any other command passes straight
# through.
#
# Optional overrides, mainly for testing the hook itself:
#   PRE_PUSH_TEST_CMD   default: npm test
#   PRE_PUSH_BUILD_CMD  default: npm run build

set -u

input=$(cat)

# Pull the command out of the hook payload. Without jq, extract the "command"
# field with sed. It is cruder (escaped quotes stay escaped) but still sees a
# push, so the guard does not quietly switch itself off.
if command -v jq >/dev/null 2>&1; then
  command_text=$(printf '%s' "$input" | jq -r '.tool_input.command // empty')
else
  command_text=$(printf '%s' "$input" | sed -n 's/.*"command"[[:space:]]*:[[:space:]]*"\(.*\)".*/\1/p')
fi
[ -z "$command_text" ] && exit 0

# `git [-C dir] [-c k=v] push ...` at the start of a command or after ; & | (.
# Only option tokens may sit between `git` and `push`, so
# `git commit -m "fix push"` does not match.
push_pattern='(^|[;&|(])[[:space:]]*git([[:space:]]+-[^[:space:]]+([[:space:]]+[^[:space:]-][^[:space:]]*)?)*[[:space:]]+push([[:space:]]|$)'
printf '%s' "$command_text" | grep -Eq -- "$push_pattern" || exit 0

# Pushes that publish nothing do not need a green build.
if printf '%s' "$command_text" | grep -Eq -- '(^|[[:space:]])(--delete|--dry-run)([[:space:]]|$)'; then
  exit 0
fi

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || pwd)}"
app="$root/build-battle/merchant-console"
logdir="${TMPDIR:-/tmp}/pre-push-check"
mkdir -p "$logdir"

if [ ! -d "$app" ]; then
  echo "pre-push-check: cannot find $app, so the push was not checked." >&2
  exit 2
fi

test_cmd="${PRE_PUSH_TEST_CMD:-npm test}"
build_cmd="${PRE_PUSH_BUILD_CMD:-npm run build}"

run_step() {
  local name=$1 cmd=$2 log="$logdir/$1.log"
  echo "pre-push-check: running $name ($cmd)..." >&2
  if (cd "$app" && bash -c "$cmd") >"$log" 2>&1; then
    return 0
  fi
  {
    echo "Push blocked: $name failed."
    echo "See the full output: cat $log"
    echo "Re-run it yourself: cd $app && $cmd"
    echo "Last lines:"
    tail -n 15 "$log" | sed 's/^/  /'
  } >&2
  exit 2
}

run_step tests "$test_cmd"
run_step build "$build_cmd"

echo "pre-push-check: tests and build passed, allowing the push." >&2
exit 0
