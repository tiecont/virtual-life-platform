#!/bin/bash
set -eu
qa_dir="${PACKAGED_QA_RUN:?}"
export DISPLAY=$(cat "$qa_dir/display")
for retry in $(seq 12); do
  if window=$(PACKAGED_QA_RUN="$qa_dir" python3 "$(dirname -- "$0")/window.py" 2>/dev/null); then
    import -window "$window" "$qa_dir/$1.capture.png"
    read -r width height colors < <(identify -format '%w %h %k\n' "$qa_dir/$1.capture.png")
    if [[ $width == 1024 && $height == 768 && $colors -gt 100 ]]; then
      mv "$qa_dir/$1.capture.png" "$qa_dir/$1.png"
      exit
    fi
  fi
  sleep .3
done
echo "Readable frame unavailable" >&2
exit 1
