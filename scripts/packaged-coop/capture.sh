#!/bin/bash
set -eu
qa_dir="${PACKAGED_QA_RUN:?}"
export DISPLAY=$(cat "$qa_dir/display")
for retry in $(seq 12); do
  if window=$(PACKAGED_QA_RUN="$qa_dir" python3 "$(dirname -- "$0")/window.py" 2>/dev/null); then
    import -silent -window "$window" -define png:compression-level=1 "$qa_dir/$1.capture.png"
    # Stop counting colors once the image is visibly populated. Building a
    # complete histogram of a 4K frame consumes the live combat deadline.
    if python3 - "$qa_dir/$1.capture.png" "${PACKAGED_QA_SIZE:-1024x768}" <<'PYIMAGE'
import sys
from PIL import Image

with Image.open(sys.argv[1]) as frame:
    dimensions = tuple(map(int, sys.argv[2].split('x')))
    sys.exit(0 if frame.size == dimensions and frame.convert('RGB').getcolors(100) is None else 1)
PYIMAGE
    then
      mv "$qa_dir/$1.capture.png" "$qa_dir/$1.png"
      exit
    fi
  fi
  sleep .3
done
echo "Readable frame unavailable" >&2
exit 1
