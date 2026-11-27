from pathlib import Path
from os import environ
from PIL import Image
from subprocess import run
from time import monotonic, sleep
import json
import sys
from io import BytesIO
import re

root = Path(__file__).resolve().parent
styles=Path('apps/unity-client/Assets/Aetheria/Features/PetArena/Presentation/Resources/Wave1.uss').read_text()
output = Path(environ['PACKAGED_QA_RUN'])
environ['PACKAGED_QA_RUN'] = str(output.absolute())

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

def board_top(filename):
    pixels=Image.open(filename).convert('RGB').load()
    palette={(142,58,37)} | {
        tuple(map(int, text.split(',')))
        for text in re.findall(r'background-color: rgb\(([\d ,]+)\);', styles.split('.tile-fire')[1].split('.coop-selected')[0])
    }
    for y in range(80,391):
        colors=sum(pixels[15+column*64,y] in palette for column in range(8))
        if colors >= 6:
            return y-1
    raise RuntimeError(f'No visible colored board tile in {filename}')

def ocr(image, box, mode='7', fmt=None):
    data=BytesIO()
    cropped = Image.open(image).convert('RGB').crop(box)
    cropped.resize((cropped.width * 2, cropped.height * 2), Image.Resampling.LANCZOS).save(data,format='PNG')
    argv=['tesseract','stdin','stdout','--tessdata-dir',Path(environ['PACKAGED_QA_TESSDATA']),'--psm',mode]
    if fmt == 'tsv':
        argv.extend(('-c','tessedit_create_tsv=1'))
    return run(argv,input=data.getvalue(),capture_output=True,check=True).stdout.decode()

def word_button(image, words, box):
    lines=ocr(image,box,'11','tsv').splitlines()[1:]
    for line in lines:
        cells=line.split('\t')
        if len(cells)!=12:
            continue
        word=cells[-1].lower().strip()
        if word in words:
            x,y,width,height=map(int,cells[6:10])
            return box[0]+(x+width//2)//2, box[1]+(y+height//2)//2
    return None

def status_button(image):
    return word_button(image,{'reconnect','retry'},(600,732,900,761))

def live_turn(image):
    heard=ocr(image,(0,0,350,28)).lower()
    match=re.search(r'turn\s+(\d+).*?seat\s+(\d+)',heard)
    return tuple(map(int,match.groups())) if match else None

def pending(data):
    state=data['state']
    return state['phase'] in ['won','lost'] or state['phase']=='playing' and state['activeSeat']==0

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
            top=board_top(image)
        except RuntimeError:
            run(['python3',root / 'x11.py','scroll','up'], check=True)
            sleep(.4)
            continue
        print(f'UI action turn={turn} version={current["version"]} action={action} top={top}', flush=True)
        from shutil import copyfile
        copyfile(image,output/f'player-turn-{turn:02d}-{action}.png')
        if action=='swap':
            for i,tile in enumerate([current['move']['first'],current['move']['second']]):
                click(39+(tile%8)*64,top+23+(tile//8)*52)
                sleep(.42)
        else:
            coords=word_button(image,{action,{'guard':'guard','skill':'lance','signature':'flare','ultimate':'descent'}[action]},(0,595,1024,744))
            if not coords and action=='ultimate':
                coords=word_button(image,{'descent'},(12,690,277,728))
            if not coords:
                run(['python3',root / 'x11.py','scroll','down'], check=True)
                image=capture(f'player-turn-{turn:02d}-actions-{attempt+1}')
                coords=word_button(image,{action,{'guard':'guard','skill':'lance','signature':'flare','ultimate':'descent'}[action]},(0,420,1023,726))
            if not coords:
                continue
            click(*coords)
        try:
            result=expect('live-state',lambda result:result['version']>current['version'], timeout=2)
            break
        except RuntimeError:
            sleep(.35)
    else:
        raise RuntimeError(f'Player command did not commit for turn {turn}')
    run(['python3',root / 'x11.py','scroll','up'], check=True)
    print(f'Committed version {result["version"]}, turn {result["state"]["turn"]}',flush=True)


from shutil import copyfile

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

head = (0, 0, 1024, 400)
collection = (855, 705, 1024, 768)
plaza_back = (30, 430, 400, 495)
lobby_buttons = (350, 185, 660, 520)

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
    click(*label(filename, 'ready', (350, 265, 660, 319)))
    for attempt in range(18):
        img = capture(map_name + '-room-ready')
        start = word_button(img, {'start'}, (350, 315, 660, 360))
        if start and min(Image.open(img).convert('RGB').getpixel((40, start[1]))) >= 130:
            click(*start)
            return
        sleep(.4)
    raise RuntimeError(f'{map_name} Start match did not become enabled')

stage = sys.argv[1]
if stage == 'fire':
    label('01-guest-login','guest',(452,74,574,116))
    click(511,96)
    collection_button=label('02-plaza','collection',collection)
    click(*collection_button)
    close_collection=label('02b-guest-owned-collection','back',plaza_back)
    click(*close_collection)
    sleep(.45)
    for symbol, duration in [('a',1.88),('w',3.8),('e',.14)]:
        key(symbol,duration)
    select=label('03-fire-portal','coalwhisk',(160,30,950,125))
    click(*select)
    click(*label('03b-fire-owned-options','dewskip',(160,65,950,275)))
    click(*label('03c-dewskip-chosen','dewskip',(160,40,950,125)))
    click(*label('03d-coalwhisk-option','coalwhisk',(160,65,950,275)))
    click(*label('03e-coalwhisk-chosen','create',head))
    expect('room-id-json',lambda data:data.get('roomId'),timeout=12)
    room_ready('fire','04-four-seats-ready')
elif stage == 'water':
    expect('reward-facts', lambda facts: facts['count']==4, timeout=30)
    def reward(img):
        observed = ocr(img, (0,650,1020,730), '6').lower()
        if 'rewards received' in observed:
            return True
        if 'settlement' in observed:
            click(510,703)
        return False
    wait_for('12-visible-four-seat-reward', reward)
    click(255,747)
    click(*label('13-plaza-after-fire-clear','collection',collection))
    click(*label('14-plaza-collection','artifacts',(35,87,395,152)))
    text('15-plaza-gear-before-equip','unequipped',(35,485,395,548))
    click(*label('15-plaza-gear-before-equip','equip',(35,539,400,585)))
    text('16-plaza-gear-equipped','core: emberglass',(35,350,395,396))
    click(*label('16-plaza-gear-equipped','upgrade',(35,592,400,704)))
    upgraded=text('17-plaza-gear-upgraded','lv2',(35,338,395,394))
    back=word_button(upgraded,{'back'},(38,615,405,743))
    assert back, 'Back to Central Plaza control missing'
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
    text('21-water-equipped-native-hud','start battle',(275,645,730,734),tries=28)
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
        started=word_button(image,{'battle'},(380,685,640,725))
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
            from shutil import copyfile
            copyfile(image,output/'09-same-multiplier-board-after-reconnect.png')
            break
        sleep(.35)
    else:
        raise RuntimeError('Reconnect UI did not restore the held board')
    (output/'go').touch()

elif stage=='resume':
    def scroll(direction):
        run(['python3', root / 'x11.py', 'scroll', direction], check=True)

    names = {'guard': 'guard', 'skill': 'lance', 'signature': 'flare', 'ultimate': 'descent'}
    centers = {'guard': 110, 'skill': 345, 'signature': 605, 'ultimate': 145}

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
            scroll('up')
            sleep(.35)
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
                top = board_top(shot)
            except RuntimeError:
                continue
            if action == 'swap':
                copyfile(shot, output / f'resumed-turn-{turn:02d}-{action}.png')
                for index in (gate['move']['first'], gate['move']['second']):
                    click(39 + (index % 8) * 64, top + 23 + (index // 8) * 52)
                    sleep(.42)
            else:
                original_top = top
                if turn == 4:
                    copyfile(shot, output/'10a-release-turn-before-scroll.png')
                if turn == 4 or top + 493 >= 725:
                    scroll('down')
                    sleep(.4)
                    shot = capture(f'resumed-turn-{turn:02d}-controls')
                    if recover := status_button(shot):
                        print(f'Reconnect after scrolling turn {turn}', flush=True)
                        click(*recover)
                        sleep(1)
                        continue
                    try:
                        top = board_top(shot)
                    except RuntimeError:
                        continue
                if turn == 4 and not (output/'10b-release-turn-after-scroll.png').exists():
                    assert top < original_top, (top, original_top)
                    assert live_turn(shot) == (turn, 0), 'Turn disappeared after scrolling'
                    copyfile(shot,output/'10b-release-turn-after-scroll.png')
                    print('Sticky turn',turn,'row moved from',original_top,'to',top,flush=True)
                center = centers[action]
                y = top + (477 if action == 'ultimate' else 434)
                if y >= 724:
                    continue
                with Image.open(shot) as frame:
                    pixel = frame.convert('RGB').getpixel((center, y - 14))
                if min(pixel) < 120 or max(pixel) - min(pixel) > 30:
                    print(f'Expected visible {action} control at ({center}, {y}): {pixel}', flush=True)
                    continue
                copyfile(shot, output / f'resumed-turn-{turn:02d}-{action}.png')
                click(center, y)
            print('Packaged action submitted', turn, action, flush=True)
            try:
                later = expect('live-state', lambda f: f['version'] > gate['version'], timeout=3)
                print('Canonical receipt', later['version'], later['state']['boss']['hp'], later['state']['boss']['phase'], flush=True)
                if later['state']['boss']['phase'] > state['boss']['phase']:
                    scroll('up')
                    capture('11-boss-transformation')
                break
            except RuntimeError:
                sleep(.3)
        else:
            raise RuntimeError(f'Packaged {action} did not complete turn {turn}')

else:
    raise ValueError(stage)
