#!/usr/bin/env bash
# Refuse risky deletions in the Aetheria checkout.
# usage: check-cleanup-target.sh <path> [...]
set -uo pipefail

repo=${AETHERIA_REPO:-/home/tiecont/Projects/Aetheria}
status=0

protected_prefixes=(
  "$repo/artifacts/private-workspace"
  "$repo/artifacts/wave-d4-art"
  "$repo/artifacts/wave-d4-functional-gems"
  "$repo/specs"
  "$repo/.agents/skills"
  "$repo/.git"
  "/home/tiecont/Projects/Aetheria-Workspace"
  "/home/tiecont/Aetheria-Workspace"
)

for raw in "$@"; do
  [ -z "$raw" ] && continue
  abs=$(readlink -f -- "$raw" 2>/dev/null || true)
  if [ -z "$abs" ]; then
    abs=$(cd "$(dirname -- "$raw")" 2>/dev/null && printf '%s/%s' "$(pwd -P)" "$(basename -- "$raw")") || abs="$raw"
  fi

  verdict="ok"
  reason=""

  for p in "${protected_prefixes[@]}"; do
    case "$abs" in
      "$p"|"$p"/*)
        verdict="protected"
        reason="matches protected path $p"
        break
        ;;
    esac
  done

  if [ "$verdict" = "ok" ] && { [ -d "$abs/.git" ] || [ -f "$abs/.git" ]; }; then
    verdict="protected"
    reason="is a git worktree root"
  fi

  if [ "$verdict" = "ok" ]; then
    case "$abs" in
      "$repo"/*) needle="${abs#"$repo"/}" ;;
      *) needle=$(basename -- "$abs") ;;
    esac
    hits=$(cd "$repo" && grep -rIl --exclude-dir=node_modules --exclude-dir=.git -- "$needle" config specs scripts .agents 2>/dev/null | head -5)
    if [ -n "$hits" ]; then
      verdict="referenced"
      reason="referenced by: $(printf '%s ' $hits)"
    fi
  fi

  case "$verdict" in
    ok) printf 'OK        %s\n' "$abs" ;;
    protected) printf 'PROTECTED %s (%s)\n' "$abs" "$reason"; status=2 ;;
    referenced) printf 'REVIEW    %s (%s)\n' "$abs" "$reason"; status=1 ;;
  esac
done

exit "$status"
