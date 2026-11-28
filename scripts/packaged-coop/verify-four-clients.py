"""Re-qualify four X11 window captures against the one native PG journal."""
import hashlib
import json
from pathlib import Path
import sys

from PIL import Image
from board_capture import populated_board

run = Path(sys.argv[1])
expected_size = list(map(int, sys.argv[2].split('x')))
acceptance = json.loads((run/'four-native-run.json').read_text())
assert acceptance['harnessRevision'] == (run/'source-sha.txt').read_text().strip()
assert acceptance['playerRevision'] == (run/'player-source-sha.txt').read_text().strip()
assert acceptance['accounts'] == acceptance['sessions'] == 4
assert acceptance['distinctTickets'] >= 4
assert acceptance['startVersion'] == 1
opening_started = acceptance['openingStartedUnixMs']
opening_ended = acceptance['openingEndedUnixMs']
assert 0 < opening_ended - opening_started <= 15_000
assert [item['seat'] for item in acceptance['seats']] == [0, 1, 2, 3]
displays, processes, assigned = set(), set(), set()
clients = []
for slot in range(4):
    local = run/f'client-{slot}'
    evidence = json.loads((local/'board.json').read_text())
    assert evidence['clientSlot'] == slot
    window = (local/'window-id').read_text().strip()
    assert int(window, 16) > 0
    display = (local/'display').read_text().strip()
    pid = int((local/'player-pid').read_text())
    assert pid > 0
    assigned.add(evidence['assignedSeat'])
    displays.add(display)
    processes.add(pid)
    name = '09-native-jewel-board.png'
    assert evidence['picture'] == name
    frame = local/name
    with Image.open(frame) as image:
        assert image.format == 'PNG'
        size = list(image.size)
        assert size == expected_size
    assert list(populated_board(frame) or []) == evidence['bounds']
    frame_hash = hashlib.sha256(frame.read_bytes()).hexdigest()
    assert (evidence['visibleTurn'], evidence['visibleActiveSeat']) == (0, 0)
    assert opening_started <= evidence['capturedUnixMs'] < opening_ended
    clients.append({**evidence, 'picture': f'client-{slot}/{name}', 'dimensions': size,
                    'display': display, 'window': window, 'pid': pid, 'sha256': frame_hash})
assert len(displays) == len(processes) == 4
assert assigned == {0, 1, 2, 3}
assert clients[0]['assignedSeat'] == 0
print(json.dumps({**acceptance, 'result': 'PASS', 'clients': clients}, indent=2))
