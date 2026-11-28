from pathlib import Path
from os import environ
from PIL import Image, ImageOps
from board_capture import board_bounds, cell_center, enabled_action_frames, populated_board
from subprocess import run
from time import monotonic, sleep, time_ns
import json
from math import hypot, radians, tan
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
    # A hovered jewel opens a tooltip over the board frame. Observe the HUD
    # with the pointer parked in the window margin between real clicks.
    if stage in ('first', 'recover', 'resume', 'water', 'shared-board', 'four-battle'):
        run(['python3', root / 'x11.py', 'move', '3', '3'], check=True)
        sleep(.15)
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

def start_button(image):
    # Start spans the viewport above the footer. Excluding the surrounding scene
    # lets single-line OCR read the label on both compact and desktop panels.
    box = center_band(screen_height - 83, screen_height - 45)
    button = word_button(image, {'battle'}, box, mode='7')
    if button:
        return button
    # Older packaged panels give Start a share of the available height.
    # Read its actual centered label down to the footer at native 1440p/4K.
    return word_button(image, {'battle'}, center_band(screen_height // 2, screen_height - 18, 90))


def enter_or_start(img):
    start = start_button(img)
    if start:
        return start
    # A started room can remain in the lobby after a refresh or re-admission.
    # Follow its normal Enter button before looking for the in-match Start.
    enter = word_button(img, {'enter'}, center_band(375, 445), mode='6')
    if enter:
        click(*enter)
        sleep(.4)
    return None


def action_button(image, word, board):
    for left, top, right, bottom in enabled_action_frames(image, board):
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

def shared_hud_turn(image):
    with Image.open(image) as frame:
        middle = frame.width // 2
        hud = frame.crop((middle - 160, 7, middle + 160, 30)).convert('L')
    # A small light-on-dark UI Toolkit label sits above a textured viewport.
    # Isolate the light text, then give the OCR line a clean white margin.
    hud = hud.resize((hud.width * 4, hud.height * 4), Image.Resampling.BICUBIC)
    hud = ImageOps.expand(hud.point(lambda value: 0 if value >= 125 else 255), border=18, fill=255)
    data = BytesIO()
    hud.save(data, format='PNG')
    args = ['tesseract', 'stdin', 'stdout', '--tessdata-dir', environ['PACKAGED_QA_TESSDATA'], '--psm', '7']
    heard = run(args, input=data.getvalue(), capture_output=True, check=True).stdout.decode().strip()
    # The centered dot may be read as punctuation or attach to the preceding
    # glyph. Accept joined label/digit text and normalize zero-shaped glyphs.
    match = re.search(r'\bturn\s*([0-9oq]+)[^a-z0-9]*seat\s*([0-3oq])(?=\W|$)', heard.lower())
    if match:
        return tuple(int(value.translate(str.maketrans('oq', '00'))) for value in match.groups()), heard
    return None, heard


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
        # Ready and playing can both show turn 0. Wait for all 64 actual
        # jewels before clicking or retaining this frame as swap evidence.
        board = populated_board(image)
        if board is None:
            sleep(.3)
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
    box = (2, 215, 140, 242)
    for _ in range(20):
        img = capture(filename)
        if re.search(r'4\s*/\s*4', ocr(img, box, '7')):
            break
        # The native lobby uses fixed-height rows at all supported resolutions.
        # Read only the Refresh row so the labels on adjacent rows cannot win OCR.
        refresh = word_button(img, {'refresh'}, center_band(362, 396, 90), mode='7')
        if refresh is None:
            refresh = word_button(img, {'refresh'}, lobby_buttons)
        if refresh:
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

def plaza_position(image):
    # Use the visible orange avatar body and the authored static Plaza camera
    # to recover ground position. Holding a key for a fixed second count
    # under four renderers can leave clients on the neighboring bench collider.
    with Image.open(image) as frame:
        sampled = frame.convert('RGB').resize((screen_width // 2, screen_height // 2))
        points = []
        for y in range(80, sampled.height-18):
            for x in range(30, sampled.width-30):
                red, green, blue = sampled.getpixel((x,y))
                if red >= 228 and 91 <= green <= 182 and blue <= 72:
                    points.append((2*x,2*y))
    if len(points) < 8:
        return None
    # The projected avatar is compact even at the front of the plaza. Use
    # the median to reject isolated warm pixels from distant portal props.
    x = sorted(point[0] for point in points)[len(points)//2]
    y = sorted(point[1] for point in points)[len(points)//2]
    camera_length = hypot(14.3,24.5)
    slope, forward_z = 14.3/camera_length, 24.5/camera_length
    focal = (screen_height/2) / tan(radians(22.5))
    vertical = (screen_height/2-y) / focal
    dy = .95-15.5
    dz = -(forward_z + slope*vertical)*dy/(slope-forward_z*vertical)
    depth = -slope*dy+forward_z*dz
    return (x-screen_middle)*depth/focal, dz-22.5

def walk_four_client_to_fire():
    # Follow the outer west lane, then turn inward while south of the north
    # bench. Accept the actual portal label before interacting through E.
    waypoints = [(0,-10.2),(1,4.6),(0,-8.1),(1,6.6)]
    for index, (axis, target) in enumerate(waypoints):
        for attempt in range(14):
            image = capture(f'03-plaza-waypoint-{index}')
            prompt = ocr(image,(24,88,415,120),'7').lower()
            if re.search(r'\bcinder\s+terraces\b',prompt):
                copyfile(image,output/'03-plaza-fire-sign.png')
                key('e',.18)
                return
            position = plaza_position(image)
            if position is None:
                # The fire arch can cover the figure a frame before or after
                # its entry prompt. Step south to get the marker back in view.
                key('s',.30)
                sleep(.4)
                continue
            error = target-position[axis]
            if abs(error) < .42:
                break
            negative, positive = ('a','d') if axis == 0 else ('s','w')
            key(negative if error < 0 else positive, min(1.3,max(.24,abs(error)/4.2)))
            sleep(.4)
        else:
            raise RuntimeError(f'Plaza waypoint {index} stalled around {position}')
    text('03-plaza-fire-sign','cinder terraces',(24,88,365,120))
    key('e',.18)

stage = sys.argv[1]
if stage == 'read-plaza-position':
    for image in sys.argv[2:]:
        point = plaza_position(Path(image))
        description = f'x={point[0]:.2f} z={point[1]:.2f}' if point else 'figure occluded'
        print(f'{Path(image).name}: {description}', flush=True)
elif stage == 'read-shared-label':
    for image in sys.argv[2:]:
        visible, heard = shared_hud_turn(image)
        print(f'{Path(image).name}: {visible} {heard}', flush=True)
elif stage == 'four-lobby':
    seat = int(environ['PACKAGED_QA_SEAT'])
    shared = output.parent
    label('01-guest-login','guest',center_band(74,116,65), tries=45)
    click(screen_middle,96)
    click(*label('02-plaza','collection',collection, tries=45))
    click(*label('02b-owned-collection','back',plaza_back))
    sleep(.45)
    walk_four_client_to_fire()
    label('03-fire-portal','coalwhisk',pet_selection, tries=45)
    if seat == 0:
        click(*label('04-host-room','create',head))
    else:
        until = monotonic() + 100
        while not (shared/'room-id').is_file() and monotonic() < until:
            sleep(.25)
        room_id = (shared/'room-id').read_text().strip()
        assert re.fullmatch(r'[a-f0-9-]{36}', room_id)
        room_label = label('04-join-form','room',(0,315,160,430))
        click(max(220,screen_middle//2),room_label[1])
        run(['python3', root/'x11.py', 'replace-text', room_id], check=True)
        click(*label('04-join-form-filled','join',center_band(315,465)))
    def visible_seat(img):
        match = re.search(r'you\s+are\s+seat\s*([0-3])', ocr(img,(0,225,360,286),'6').lower())
        return match.group(1) if match else None
    assigned, _ = wait_for('05-assigned-lobby-seat', visible_seat)
    (output/'assigned-seat').write_text(assigned + '\n')
    click(*label('06-ready','ready',center_band(265,319)))
elif stage == 'four-host-room-start':
    def ready_start(img):
        start = word_button(img, {'start'}, center_band(315,360))
        if start and min(Image.open(img).convert('RGB').getpixel((40,start[1]))) >= 130:
            return start
        refresh = word_button(img, {'refresh'}, center_band(360,399))
        if refresh:
            click(*refresh)
        return None
    click(*wait_for('07-fully-ready-room',ready_start, tries=45)[0])
elif stage == 'four-battle':
    seat = int(environ['PACKAGED_QA_SEAT'])
    condition = lambda name: (output.parent / name).is_file()
    until = monotonic() + 100
    while not condition('four-allocation.json') and monotonic() < until:
        sleep(.25)
    assert condition('four-allocation.json'), 'Missing actual room allocation'

    def admit(img):
        if 'cooperative' in ocr(img, (0,0,290,34), '7').lower():
            # Refresh moves from y379 to y336 when the server marks the room
            # started. Enter then occupies y379. Read complete, centered rows.
            for top in (360, 317, 403):
                row = center_band(top, top + 37, 170)
                enter = word_button(img, {'enter'}, row, mode='7')
                if enter:
                    click(*enter)
                    return
            for top in (360, 317):
                refresh = word_button(img, {'refresh'}, center_band(top, top + 37), mode='7')
                if refresh:
                    click(*refresh)
                    return
            return None
        if recover := status_button(img):
            click(*recover)
            return None
        return start_button(img) if seat == 0 else None

    if seat == 0:
        wait_for('08-native-admission', admit, tries=45)
        until = monotonic() + 100
        while not condition('four-native-ready.json') and monotonic() < until:
            admit(capture('08a-waiting-for-native-members'))
            sleep(.4)
        assert condition('four-native-ready.json'), 'Missing four actual player tickets'
        start, _ = wait_for('08b-native-start', admit, tries=40)
        print(f'Client 0: Start battle at {start}', flush=True)
        click(*start)

    def board_evidence(img):
        board = populated_board(img)
        if board is not None:
            turn, _ = shared_hud_turn(img)
            if turn is not None:
                return board, turn
        if seat != 0:
            admit(img)
        return None

    (board, turn), image = wait_for('09-native-jewel-board', board_evidence, tries=80)
    (output/'board.json').write_text(json.dumps({
        'clientSlot': seat, 'assignedSeat': int((output/'assigned-seat').read_text()),
        'picture': image.name, 'bounds': list(board),
        'visibleTurn': turn[0], 'visibleActiveSeat': turn[1],
        'capturedUnixMs': time_ns() // 1_000_000,
    }) + '\n')
elif stage == 'fire':
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
    if environ.get('PACKAGED_QA_BOARD', 'functional') in ('functional', 'advanced-water'):
        start, _ = wait_for('21-water-equipped-native-hud', enter_or_start, tries=28)
        (output/'water-hud-observed').touch()
        for attempt in range(5):
            if attempt:
                start = start_button(capture(f'water-start-retry-{attempt}'))
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
            if live_turn(img) != (state['turn'], state['activeSeat']):
                return None
            return populated_board(img)

        board, img = wait_for('22-water-started-board', populated_board)
        for attempt in range(6):
            swapped = read('water-swapped')
            if swapped:
                break
            if read('water-version-two-observed'):
                raise RuntimeError('Water observer saw version 2 without verifying a host swap')
            if attempt:
                img = capture(f'water-swap-retry-{attempt}')
                board = populated_board(img)
            # An expired admission can leave a populated but disabled board.
            # Follow its visible recovery control even on the very first frame.
            recover = status_button(img)
            if recover:
                print('Water recovery click', recover, flush=True)
                click(*recover)
            elif board:
                for tile in (started['move']['first'], started['move']['second']):
                    click(*cell_center(board, tile))
                    sleep(.42)
            try:
                swapped = expect('water-swapped', lambda result: result['version'] == 2, timeout=1.2)
                break
            except RuntimeError:
                if attempt == 5:
                    raise
        wait_for('23-water-after-host-swap',
                 lambda img: not status_button(img) and playing_board(img, swapped['state']))
        (output/'water-swap-observed').touch()
    else:
        wait_for('21-water-equipped-native-hud', enter_or_start, tries=28)
        (output/'water-hud-observed').touch()

elif stage == 'shared-board':
    clicks = []

    def click_record(action, position, cell=None):
        record = {'action': action, 'position': list(position), 'unixMs': time_ns() // 1_000_000}
        if cell is not None:
            record['cell'] = cell
        click(*position)
        record['sentUnixMs'] = time_ns() // 1_000_000
        clicks.append(record)
        (output / 'shared-input.json').write_text(json.dumps(clicks, indent=2) + '\n')

    for attempt in range(14):
        image = capture('05-shared-native-admission')
        if recover := status_button(image):
            click_record('reconnect', recover)
            sleep(.7)
            continue
        if start := enter_or_start(image):
            click_record('start', start)
            try:
                initial = expect('shared-started', lambda result: result['version'] == 1, timeout=2)
                break
            except RuntimeError:
                sleep(.3)
    else:
        raise RuntimeError('Shared jewel Start did not commit from the packaged HUD')

    def capture_candidate(name, attempt):
        image = capture(f'{name}-attempt-{attempt:02d}')
        return image, time_ns() // 1_000_000, populated_board(image)

    def qualified_frame(name, captures, projection):
        state = projection['state']
        target = (state['turn'], state['activeSeat'])
        began = state['turnDeadlineUnixMs'] - state['turnTimeoutMs']
        for image, captured_at, board in captures:
            if board is None or not began <= captured_at < state['turnDeadlineUnixMs']:
                continue
            visible, heard = shared_hud_turn(image)
            print(f'Window {image.name} visible={visible} OCR={heard!r}', flush=True)
            if visible == target:
                copyfile(image, output / f'{name}.png')
                return {'turn': visible[0], 'activeSeat': visible[1], 'capturedUnixMs': captured_at, 'hudText': heard}
        raise RuntimeError(f'Expected a visible populated board {target} captured within its deadline for {name}')

    assert initial['state']['activeSeat'] == 0 and initial['state']['turn'] == 0
    start_name = '06-shared-board-start'
    for attempt in range(1, 7):
        opening = capture_candidate(start_name, attempt)
        _, captured_at, board = opening
        if captured_at >= initial['state']['turnDeadlineUnixMs']:
            raise RuntimeError('Shared jewel opening expired before a populated board could be captured')
        if board is not None:
            break
    else:
        raise RuntimeError('Expected a populated shared jewel opening')
    for cell in (initial['move']['first'], initial['move']['second']):
        click_record('swap-cell', cell_center(board, cell), cell)
        sleep(.24)

    # Capture live while the observer reads its authorized projection and
    # verifies the durable receipt. OCR runs after both input clicks.
    swap_name = '07-shared-board-host-swap'
    swap_captures = []
    observed_at_attempt = None
    for attempt in range(1, 9):
        swap_captures.append(capture_candidate(swap_name, attempt))
        if observed_at_attempt is None and read('shared-swapped'):
            observed_at_attempt = attempt
        if observed_at_attempt is not None and attempt - observed_at_attempt >= 2:
            break
    swapped = expect('shared-swapped', lambda result: result['version'] == 2, timeout=3)
    frames = {
        'start': qualified_frame(start_name, [opening], initial),
        'afterHostSwap': qualified_frame(swap_name, swap_captures, swapped),
    }
    (output / 'shared-visible-frames.json').write_text(json.dumps(frames, indent=2) + '\n')
    (output / 'shared-swap-observed').touch()

    if environ.get('PACKAGED_QA_SCOPE') == 'feedback':
        for attempt in range(1, 7):
            name = f'feedback-{attempt}'
            deadline = monotonic() + 32
            while not (turn := read(name)):
                if read('feedback-finished'):
                    break
                if monotonic() >= deadline:
                    raise RuntimeError(f'No next authenticated host turn for {name}')
                sleep(.12)
            if not turn:
                break
            assert turn['state']['activeSeat'] == 0
            # Wait for the new visible turn before dispatching either cell.
            while time_ns() // 1_000_000 < turn['state']['turnDeadlineUnixMs']:
                image = capture(name + '-before')
                board = populated_board(image)
                visible, _ = shared_hud_turn(image)
                if board is not None and visible == (turn['state']['turn'], 0):
                    break
            else:
                raise RuntimeError(f'{name} expired before the packaged host had the board')
            for cell in (turn['move']['first'], turn['move']['second']):
                click_record(name + '-cell', cell_center(board, cell), cell)
                sleep(.20)
            capture(name + '-after')
            (output / (name + '-observed')).touch()


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
        started=enter_or_start(image)
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
