"""Re-qualify four X11 window captures against the one native PG journal."""
import hashlib
import json
import os
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
if os.environ.get('PACKAGED_QA_FOUR_ROTATION') == '1':
    rotation = json.loads((run/'four-rotation-journal.json').read_text())
    assert rotation['matchId'] == acceptance['matchId']
    assert [row['issuerSeat'] for row in rotation['turns']] == [0, 1, 2, 3]
    assert [row['version'] for row in rotation['turns']] == [2, 3, 4, 5]
    assert len({row['commandId'] for row in rotation['turns']}) == 4
    windows = [clients]
    opening_ended = min(opening_ended, rotation['turns'][0]['startedUnixMs'])
    assert all(opening_started <= client['captureStartedUnixMs'] <= client['capturedUnixMs'] < opening_ended
               for client in clients)
    for row in rotation['turns']:
        turn = row['turn']
        assert (turn, row['activeSeat']) == (row['version'] - 1, turn % 4)
        row['captures'] = []
        for slot, client in enumerate(clients):
            local = run/f'client-{slot}'
            screen = json.loads((local/f'handoff-{turn}.json').read_text())
            assert screen['clientSlot'] == slot and screen['assignedSeat'] == client['assignedSeat']
            assert screen['turn'] == turn and screen['activeSeat'] == row['activeSeat']
            assert row['startedUnixMs'] <= screen['captureStartedUnixMs'] <= screen['capturedUnixMs'] < row['endedUnixMs']
            name = f'10-team-turn-{turn}.png'
            assert screen['picture'] == name
            path = local/name
            with Image.open(path) as image:
                assert image.format == 'PNG' and list(image.size) == expected_size
            assert list(populated_board(path) or []) == screen['bounds']
            row['captures'].append({**screen, 'picture': f'client-{slot}/{name}',
                                    'sha256': hashlib.sha256(path.read_bytes()).hexdigest()})
        windows.append(row['captures'])
    recoveries = []
    submissions = {}
    for slot, client in enumerate(clients):
        seat = client['assignedSeat']
        local = run/f'client-{slot}'
        inputs = json.loads((local/'rotation-input.json').read_text())
        for index, item in enumerate(inputs, start=1):
            action = item['action']
            assert action in {'end-turn', 'reconnect', 'retry'}
            name = f'rotation-input-{index:02d}-{action}.png'
            assert name == item['picture']
            path = local/name
            with Image.open(path) as image:
                assert image.format == 'PNG' and list(image.size) == expected_size
                x, y = item['position']
                assert 0 <= x < image.width and 0 <= y < image.height
            at = item['clickedUnixMs']
            start = item['captureStartedUnixMs']
            end = item['capturedUnixMs']
            assert opening_started <= start <= end <= at < windows[-1][slot]['capturedUnixMs']
            entry = {**item, 'clientSlot': slot, 'assignedSeat': seat,
                     'picture': f'client-{slot}/{name}',
                     'sha256': hashlib.sha256(path.read_bytes()).hexdigest()}
            if action == 'end-turn':
                assert seat == item['turn'] and seat not in submissions
                assert max(frame['capturedUnixMs'] for frame in windows[seat]) <= at
                assert at <= rotation['turns'][seat]['startedUnixMs']
                assert populated_board(path) is not None
                submissions[seat] = entry
            else:
                recoveries.append(entry)
    assert set(submissions) == {0, 1, 2, 3}
    for seat, row in enumerate(rotation['turns']):
        row['input'] = submissions[seat]
    for slot in {entry['clientSlot'] for entry in recoveries}:
        seat = clients[slot]['assignedSeat']
        first_click = min(entry['clickedUnixMs'] for entry in recoveries if entry['clientSlot'] == slot)
        assert any(admission['seat'] == seat and first_click <= admission['consumedUnixMs'] <= windows[-1][slot]['capturedUnixMs']
                   for admission in rotation['admissions']), f'Visible recovery for seat {seat} had no subsequent consumed admission'
    rotation['visibleRecovery'] = {'exercised': bool(recoveries),
                                   'inputs': sorted(recoveries, key=lambda entry: entry['clickedUnixMs'])}
    acceptance['rotation'] = rotation
print(json.dumps({**acceptance, 'result': 'PASS', 'clients': clients}, indent=2))
