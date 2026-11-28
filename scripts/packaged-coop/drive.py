from pathlib import Path
from os import environ
from PIL import Image
from subprocess import run
from time import monotonic, sleep
import json
import sys
from io import BytesIO
from shutil import copyfile
import re

root = Path(__file__).resolve().parent
output = Path(environ['PACKAGED_QA_RUN'])
environ['PACKAGED_QA_RUN'] = str(output.absolute())
screen_width, screen_height = map(int, environ.get('PACKAGED_QA_SIZE', '1024x768').split('x'))
screen_middle = screen_width // 2


def center_band(top, bottom, half_width=170):
    return (screen_middle - half_width, top, screen_middle + half_width, bottom)

def capture(name):
    run([root / 'capture.sh', name], check=True)
    return output / (name + '.png')

def click(x, y):
    run(['python3',root / 'x11.py','click',str(x),str(y)], check=True)

def read(name):
    try:
        return json.loads((output / (name + '.json')).read_text())
    except (FileNotFoundError, json.JSONDecodeError):
        return None

def expect(name, predicate, timeout=16):
    until=monotonic()+timeout
    while monotonic()<until:
        payload=read(name)
        if payload and predicate(payload):
            return payload
        sleep(.12)
    raise RuntimeError(f'{name} timed out: {read(name)}')

def board_bounds(filename):
    # The frame has the same color for both rulesets. Scan its upper edge on
    # the captured player window so positions follow the actual viewport.
    with Image.open(filename) as image:
        width, height = image.size
        pixels = image.convert('RGB').load()
        center = width // 2
        for y in range(32, min(height, 240)):
            def is_edge(x):
                return pixels[x, y] == (178, 123, 76)
            if not is_edge(center) or not is_edge(center - 100) or not is_edge(center + 100):
                continue
            left, right = center, center
            while left > 0 and is_edge(left - 1):
                left -= 1
            while right < width - 1 and is_edge(right + 1):
                right += 1
            if right - left < 290:
                continue
            # Borders have 8px rounded corners. Four pixels of uncertainty at
            # the edge leave all eight click centers inside their buttons.
            side = right - left + 13
            return (left - 6, y, side)
    raise RuntimeError(f'No centered battle grid in {filename}')


def cell_center(bounds, index):
    left, top, side = bounds
    cell_size = (side - 12) / 8
    return (
        round(left + 6 + (index % 8 + .5) * cell_size),
        round(top + 6 + (index // 8 + .5) * cell_size),
    )

def populated_board(filename):
    try:
        bounds = board_bounds(filename)
    except RuntimeError:
        return None
    left, top, side = bounds
    with Image.open(filename) as frame:
        if left < 0 or left + side > frame.width or top + side > frame.height:
            return None
        for index in range(64):
            x, y = cell_center(bounds, index)
            # The pre-Start cells contain one flat background and a tiny dot.
            # Each functional icon adds texture at the center of its cell.
            if frame.crop((x - 10, y - 10, x + 10, y + 10)).getcolors(maxcolors=64) is not None:
                return None
    return bounds


def ocr(image, box, mode='7', fmt=None):
    data=BytesIO()
    cropped = Image.open(image).convert('RGB').crop(box)
    cropped.resize((cropped.width * 2, cropped.height * 2), Image.Resampling.LANCZOS).save(data,format='PNG')
    argv=['tesseract','stdin','stdout','--tessdata-dir',Path(environ['PACKAGED_QA_TESSDATA']),'--psm',mode]
    if fmt == 'tsv':
        argv.extend(('-c','tessedit_create_tsv=1'))
    return run(argv,input=data.getvalue(),capture_output=True,check=True).stdout.decode()

def word_button(image, words, box, mode='11'):
    lines=ocr(image,box,mode,'tsv').splitlines()[1:]
    for line in lines:
        cells=line.split('\t')
        if len(cells)!=12:
            continue
        word=cells[-1].lower().strip()
        if word in words:
            x,y,width,height=map(int,cells[6:10])
            return box[0]+(x+width//2)//2, box[1]+(y+height//2)//2
    return None

def action_button(image, word, board):
    # Search the enabled skill frames below the grid, then OCR each frame
    # independently. A disabled or unrelated button cannot satisfy the match.
    runs = {}
    left, top, side = board
    with Image.open(image) as frame:
        pixels = frame.convert('RGB').load()
        start = max(0, left - 15)
        end = min(frame.width, left + side + 15)
        for y in range(top + side, min(frame.height - 35, top + side + 111)):
            row = bytes(pixels[x, y] in {(43, 34, 57), (75, 52, 80)} for x in range(start, end))
            for match in re.finditer(rb'\x01{45,}', row):
                begin, stop = match.span()
                runs.setdefault((start + begin, start + stop), []).append(y)
    for (left, right), rows in runs.items():
        top, bottom = rows[0], rows[-1] + 1
        if len(rows) < 8 or not 23 <= bottom - top <= 65:
            continue
        label = ocr(image, (left, top, right, bottom), '6').lower()
        if re.search(r'\b' + re.escape(word) + r'\b', label):
            return ((left + right) // 2, (top + bottom) // 2)
    return None


def status_button(image):
    return word_button(image, {'reconnect', 'retry'}, (screen_middle + 30, screen_height - 37, screen_width - 10, screen_height))


def live_turn(image):
    with Image.open(image) as frame:
        middle = frame.width // 2
    heard = ocr(image, (middle - 200, 6, middle + 200, 32)).lower()
    match = re.search(r'turn\s+([0-9o]+).*?seat\s+([0-9o]+)', heard)
    return tuple(int(value.replace('o', '0')) for value in match.groups()) if match else None

def pending(data):
    state=data['state']
    return state['phase'] in ['won','lost'] or state['phase']=='playing' and state['activeSeat']==0

ability_labels = {'guard': 'guard', 'skill': 'lance', 'signature': 'flare', 'ultimate': 'descent'}


def play(current):
    state=current['state']
    phase=state['phase']
    if phase in ['won','lost']:
        return
    assert phase=='playing' and state['activeSeat']==0, current
    turn=state['turn']
    action=current['playerAction']
    for attempt in range(15):
        image=capture(f'player-turn-{turn:02d}-attempt-{attempt+1}')
        if recover:=status_button(image):
            print(f'UI recovery at turn {turn}', flush=True)
            click(*recover)
            try:
                result=expect('live-state',lambda result:result['version']>current['version'],timeout=1.3)
                break
            except RuntimeError:
                sleep(.35)
                continue
        observed=live_turn(image)
        if observed != (turn,0):
            sleep(.45)
            continue
        try:
            board = board_bounds(image)
        except RuntimeError:
            sleep(.4)
            continue
        print(f'UI action turn={turn} version={current["version"]} action={action} board={board}', flush=True)
        copyfile(image, output / f'player-turn-{turn:02d}-{action}.png')
        if action == 'swap':
            for tile in (current['move']['first'], current['move']['second']):
                click(*cell_center(board, tile))
                sleep(.42)
        else:
            coords = action_button(image, ability_labels[action], board)
            if coords is None:
                continue
            click(*coords)
        try:
            result=expect('live-state',lambda result:result['version']>current['version'], timeout=2)
            break
        except RuntimeError:
            sleep(.35)
    else:
        raise RuntimeError(f'Player command did not commit for turn {turn}')
    print(f'Committed version {result["version"]}, turn {result["state"]["turn"]}',flush=True)


def wait_for(shot, condition, tries=24):
    for _ in range(tries):
        img = capture(shot)
        if result := condition(img):
            return result, img
        sleep(.33)
    raise RuntimeError(f'Expected UI was absent: {shot}')

def label(shot, word, box, tries=24):
    return wait_for(shot, lambda img: word_button(img, {word}, box), tries)[0]

def text(shot, phrase, box, tries=24):
    return wait_for(shot, lambda img: phrase.lower() in ocr(img, box, '6').lower(), tries)[1]

def key(symbol, duration):
    run(['python3', root/'x11.py', 'key', symbol, str(duration)], check=True)

head = (0, 0, screen_width, 400)
collection = (screen_width - 175, screen_height - 65, screen_width, screen_height)
plaza_back = (30, 430, 400, 495)
lobby_buttons = center_band(185, 520)
pet_selection = (165, 67, 430, 101)
pet_options = (165, 106, 430, 220)

def room_ready(map_name, filename):
    box = (0, 180, 300, 265)
    for _ in range(20):
        img = capture(filename)
        if re.search(r'4\s*/\s*4', ocr(img, box, '6')):
            break
        if refresh := word_button(img, {'refresh'}, lobby_buttons):
            click(*refresh)
        sleep(.4)
    else:
        raise RuntimeError(f'{map_name} room did not render four seats')
    click(*label(filename, 'ready', center_band(265, 319)))
    for attempt in range(18):
        img = capture(map_name + '-room-ready')
        start = word_button(img, {'start'}, center_band(315, 360))
        if start and min(Image.open(img).convert('RGB').getpixel((40, start[1]))) >= 130:
            click(*start)
            return
        sleep(.4)
    raise RuntimeError(f'{map_name} Start match did not become enabled')

stage = sys.argv[1]
if stage == 'fire':
    label('01-guest-login','guest',center_band(74,116,65))
    click(screen_middle,96)
    collection_button=label('02-plaza','collection',collection)
    click(*collection_button)
    close_collection=label('02b-guest-owned-collection','back',plaza_back)
    click(*close_collection)
    sleep(.45)
    for symbol, duration in [('a',1.88),('w',3.8),('e',.14)]:
        key(symbol,duration)
    select=label('03-fire-portal','coalwhisk',pet_selection)
    click(*select)
    click(*label('03b-fire-owned-options','dewskip',pet_options))
    click(*label('03c-dewskip-chosen','dewskip',pet_selection))
    click(*label('03d-coalwhisk-option','coalwhisk',pet_options))
    click(*label('03e-coalwhisk-chosen','create',head))
    expect('room-id-json',lambda data:data.get('roomId'),timeout=12)
    room_ready('fire','04-four-seats-ready')
elif stage == 'water':
    expect('reward-facts', lambda facts: facts['count']==4, timeout=30)
    def reward(img):
        observed = ocr(img, (0, screen_height - 119, screen_width, screen_height - 31), '6').lower()
        if 'rewards received' in observed:
            return True
        if 'settlement' in observed:
            click(screen_middle, screen_height - 65)
        return False
    wait_for('12-visible-four-seat-reward', reward)
    click(screen_width // 4, screen_height - 20)
    click(*label('13-plaza-after-fire-clear','collection',collection))
    click(*label('14-plaza-collection','artifacts',(35,87,395,152)))
    text('15-plaza-gear-before-equip','unequipped',(35,485,395,548))
    click(*label('15-plaza-gear-before-equip','equip',(35,539,400,585)))
    text('16-plaza-gear-equipped','core: emberglass',(35,350,395,396))
    click(*label('16-plaza-gear-equipped','upgrade',(35,592,400,704)))
    text('17-plaza-gear-upgraded','lv2',(35,338,395,394))
    def artifact_back(img):
        back = word_button(img, {'back'}, (38, 560, 370, screen_height))
        if back is None:
            run(['python3', root/'x11.py', 'scroll', 'down'], check=True)
        return back
    back, _ = wait_for('17b-plaza-artifact-back', artifact_back, tries=8)
    click(*back)
    sleep(.7)
    for symbol,duration in [('d',1.88),('w',3.8),('e',.14)]:
        key(symbol,duration)
    text('18-water-portal-earned-entry','333 / 333',head)
    click(*label('18-water-portal-earned-entry','create',head))
    gear=expect('gear-water-facts',lambda facts:facts['materialsSpent']==60,timeout=22)
    assert gear['preUpgrade']['acquired_from']=='starter'
    expect('water-roster-ready',lambda facts:facts['seats']==4,timeout=22)
    room_ready('water','20-water-four-seats-ready')
    facts=expect('water-allocation-facts',lambda facts:facts['seats']==4,timeout=30)
    print('Water allocation', facts, flush=True)
    start_box = center_band(screen_height - 115, screen_height - 18)
    if environ.get('PACKAGED_QA_BOARD', 'functional') == 'functional':
        def water_start_button(image):
            if 'start battle' in ocr(image, start_box, '6').lower():
                return word_button(image, {'battle'}, start_box, mode='6')

        start, _ = wait_for('21-water-equipped-native-hud', water_start_button, tries=28)
        (output/'water-hud-observed').touch()
        for attempt in range(5):
            if attempt:
                start = water_start_button(capture(f'water-start-retry-{attempt}'))
            started = read('water-started')
            if started:
                break
            if start:
                print(f'Water Start click {attempt + 1} at {start}', flush=True)
                click(*start)
            try:
                started = expect('water-started', lambda result: result['version'] == 1,
                                 timeout=8 if attempt == 4 else 4)
                break
            except RuntimeError:
                if attempt == 4:
                    raise

        def playing_board(img, state):
            if status_button(img) or live_turn(img) != (state['turn'], state['activeSeat']):
                return None
            return populated_board(img)

        board, _ = wait_for('22-water-started-board', lambda img: playing_board(img, started['state']))
        for attempt in range(5):
            swapped = read('water-swapped')
            if swapped:
                break
            for tile in (started['move']['first'], started['move']['second']):
                click(*cell_center(board, tile))
                sleep(.42)
            try:
                swapped = expect('water-swapped', lambda result: result['version'] == 2, timeout=3)
                break
            except RuntimeError:
                if attempt == 4:
                    raise
        wait_for('23-water-after-host-swap', lambda img: playing_board(img, swapped['state']))
        (output/'water-swap-observed').touch()
    else:
        text('21-water-equipped-native-hud', 'start battle', start_box, tries=28)
        (output/'water-hud-observed').touch()

elif stage=='first':
    for attempt in range(14):
        current=read('live-state')
        if current and pending(current):
            break
        image=capture(f'05-native-admission-{attempt+1:02d}')
        if recover:=status_button(image):
            click(*recover)
            sleep(1.1)
            continue
        started=word_button(image,{'battle'},center_band(screen_height - 115, screen_height - 18))
        if started:
            click(*started)
            try:
                current=expect('live-state',pending,timeout=3)
                break
            except RuntimeError:
                sleep(.3)
        else:
            sleep(.6)
    else:
        raise RuntimeError('Could not start battle in the packaged HUD')
    sleep(.6)
    play(current)
elif stage=='recover':
    before=expect('before-restart',lambda _:True)
    stage_turn=before['state']['turn']
    for attempt in range(16):
        image=capture('07-multiplier-board-before-restart')
        if recover:=status_button(image):
            click(*recover)
        elif live_turn(image)==(stage_turn,before['state']['activeSeat']):
            break
        sleep(.7)
    else:
        raise RuntimeError('Before-restart board did not render')
    (output/'restart').touch()
    for attempt in range(18):
        image=capture(f'08-runtime-offline-{attempt+1:02d}')
        if status_button(image):
            break
        sleep(.25)
    else:
        raise RuntimeError('Runtime loss never reached the packaged Reconnect control')
    (output/'offline-observed').touch()
    after=expect('after-restart',lambda _:True,timeout=25)
    assert before['state']==after['state']
    target=(after['state']['turn'],after['state']['activeSeat'])
    clicked=False
    for attempt in range(20):
        image=capture(f'08-runtime-disconnected-{attempt+1:02d}')
        if not clicked and (recover:=status_button(image)):
            print('Packaged Reconnect', recover, flush=True)
            click(*recover)
            clicked=True
        elif clicked and live_turn(image)==target and not status_button(image):
            copyfile(image,output/'09-same-multiplier-board-after-reconnect.png')
            break
        sleep(.35)
    else:
        raise RuntimeError('Reconnect UI did not restore the held board')
    (output/'go').touch()

elif stage=='resume':
    while True:
        gate = expect('live-state', lambda f: f['state']['phase'] in ('won', 'lost') or
                      f['state']['phase'] == 'playing' and f['state']['activeSeat'] == 0, timeout=40)
        state = gate['state']
        turn = state['turn']
        if state['phase'] != 'playing':
            print('Terminal', state['phase'], 'version', gate['version'], flush=True)
            assert state['phase'] == 'won'
            expect('terminal', lambda _: True, timeout=15)
            (output / 'settle').touch()
            break
        action = gate['playerAction']
        for attempt in range(24):
            shot = capture(f'resumed-turn-{turn:02d}-attempt-{attempt+1}')
            if recover := status_button(shot):
                print(f"Reconnect before turn {turn}", flush=True)
                click(*recover)
                sleep(1)
                continue
            if live_turn(shot) != (turn, 0):
                sleep(.4)
                continue
            try:
                board = board_bounds(shot)
            except RuntimeError:
                sleep(.3)
                continue
            if action == 'swap':
                copyfile(shot, output / f'resumed-turn-{turn:02d}-{action}.png')
                for index in (gate['move']['first'], gate['move']['second']):
                    click(*cell_center(board, index))
                    sleep(.42)
            else:
                position = action_button(shot, ability_labels[action], board)
                if position is None:
                    continue
                # Use a second frame to confirm the action is still available.
                sleep(.25)
                settled_shot = capture(f'resumed-turn-{turn:02d}-settled-{attempt+1}')
                if live_turn(settled_shot) != (turn, 0) or status_button(settled_shot):
                    continue
                try:
                    settled_board = board_bounds(settled_shot)
                except RuntimeError:
                    continue
                if action_button(settled_shot, ability_labels[action], settled_board) != position:
                    continue
                copyfile(settled_shot, output / f'resumed-turn-{turn:02d}-{action}.png')
                click(*position)
            print('Packaged action submitted', turn, action, flush=True)
            try:
                later = expect('live-state', lambda f: f['version'] > gate['version'], timeout=3)
                print('Canonical receipt', later['version'], later['state']['boss']['hp'], later['state']['boss']['phase'], flush=True)
                if later['state']['boss']['phase'] > state['boss']['phase']:
                    capture('11-boss-transformation')
                break
            except RuntimeError:
                sleep(.3)
        else:
            raise RuntimeError(f'Packaged {action} did not complete turn {turn}')

else:
    raise ValueError(stage)
