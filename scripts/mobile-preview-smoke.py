"""Explicit owner-device preview check. Not N10-04 gameplay/performance smoke."""
from pathlib import Path
import datetime, hashlib, json, os, re, subprocess, time, uuid, xml.etree.ElementTree as ET

app = 'life.virtualcity.spike'
adb = os.environ.get('ADB_PATH')
if not adb or not Path(adb).is_file():
    raise SystemExit('Set ADB_PATH to the reviewed executable for the authorized USB device')
output = Path('artifacts') / ('mobile-preview-phone-' + uuid.uuid4().hex[:8])
output.mkdir(mode=0o700)
commands = []
observations = []
capture_attempts = []
probe = subprocess.run([adb, 'devices', '-l'], capture_output=True, timeout=10)
(output / 'devices.log').write_bytes(probe.stdout + probe.stderr)
devices = [line.split()[0] for line in probe.stdout.decode().splitlines()[1:]
           if len(line.split()) > 1 and line.split()[1] == 'device' and 'usb:' in line]
if probe.returncode or len(devices) != 1:
    raise SystemExit('Exactly one authorized USB device is required; no emulator/wireless fallback')
serial = devices[0]

class UiDumpError(RuntimeError):
    pass

def run(label, args, timeout=20):
    result = subprocess.run([adb, '-s', serial, *args], capture_output=True, timeout=timeout)
    log = output / (str(len(commands)) + '-' + label + '.log')
    log.write_bytes(result.stdout + result.stderr)
    log.chmod(0o600)
    commands.append({'label': label, 'argv': ['adb', '-s', '<private-usb-device>', *args],
                     'exitCode': result.returncode, 'log': str(log)})
    if result.returncode:
        if label.startswith('dump-'):
            raise UiDumpError(label + ' failed; see private command log')
        raise RuntimeError(label + ' failed; see private command log')
    return result.stdout

def foreground():
    data = run('foreground', ['shell', 'dumpsys', 'window']).decode()
    if not any(app + '/' in line for line in data.splitlines() if 'mCurrentFocus=' in line):
        raise RuntimeError('Our app must have focus before UI inspection/input')

def snapshot(label, expected):
    # Cold WebView startup can expose an empty accessibility tree before content.
    # Bounded probes preserve every failure; this is not a startup performance test.
    deadline = time.monotonic() + 30
    for attempt in range(4):
        foreground()
        temporary = '/data/local/tmp/vlp-preview-' + uuid.uuid4().hex + '.xml'
        ready = False
        try:
            run('dump-' + label, ['shell', 'uiautomator', 'dump', temporary])
            xml = run('read-' + label, ['exec-out', 'cat', temporary])
            (output / (label + '-' + str(attempt) + '.xml')).write_bytes(xml)
            nodes = [n for n in ET.fromstring(xml).iter('node') if n.get('package') == app]
            ready = all(contains(nodes, text) for text in expected)
            capture_attempts.append({'label': label, 'attempt': attempt, 'expectedContentReady': ready})
        except UiDumpError:
            capture_attempts.append({'label': label, 'attempt': attempt, 'dumpCommandFailed': True})
        finally:
            run('remove-own-dump', ['shell', 'rm', '-f', temporary])
        if ready:
            (output / (label + '.png')).write_bytes(run('screen-' + label, ['exec-out', 'screencap', '-p']))
            return nodes
        if time.monotonic() >= deadline:
            break
        time.sleep(0.5)
    raise RuntimeError('Expected own-app accessibility content unavailable: ' + label)

def contains(nodes, text):
    return any(text == (n.get('text') or n.get('content-desc')) for n in nodes)

def tap(nodes, text):
    foreground()
    for node in nodes:
        if text != (node.get('text') or node.get('content-desc')) or node.get('enabled') != 'true':
            continue
        match = re.fullmatch(r'\[(\d+),(\d+)\]\[(\d+),(\d+)\]', node.get('bounds', ''))
        if match:
            x1, y1, x2, y2 = map(int, match.groups())
            if x2 > x1 and y2 > y1:
                run('tap-own-' + text.replace(' ', '-'), ['shell', 'input', 'touchscreen', 'tap', str((x1+x2)//2), str((y1+y2)//2)])
                return
    raise RuntimeError('Owned visible control missing: ' + text)

facts = {'scope': 'PHYSICAL_ANDROID_LOCAL_PREVIEW_ONLY_NOT_N10_04', 'observedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
         'appId': app, 'commands': commands, 'scenarios': observations, 'captureAttempts': capture_attempts, 'distributed': False,
         'sourceRevision': subprocess.check_output(['git', 'rev-parse', 'HEAD'], text=True).strip(),
         'trackedDiffSha256': hashlib.sha256(subprocess.check_output(['git', 'diff', '--binary', 'HEAD'])).hexdigest()}
try:
    package = run('own-package', ['shell', 'pm', 'path', app]).decode().strip()
    assert re.fullmatch(r'package:/data/app/[^\s]+/base\.apk', package), 'Expected a single installed own-app APK'
    installed_hash = run('installed-apk-hash', ['shell', 'sha256sum', package.removeprefix('package:')]).decode().split()[0]
    assert re.fullmatch(r'[a-f0-9]{64}', installed_hash)
    facts['installedApkSHA256'] = installed_hash
    run('initial-stop-own-preview', ['shell', 'am', 'force-stop', app])
    run('launch', ['shell', 'am', 'start', '-W', '-n', app + '/.MainActivity'], 45)
    nodes = snapshot('initial', ['Local Test Cafe', 'Original starter art', 'No confirmed visible visitors.'])
    assert contains(nodes, 'Local Test Cafe') and contains(nodes, 'Original starter art')
    assert contains(nodes, 'No confirmed visible visitors.')
    seats = [n for n in nodes if re.fullmatch(r'(Window|Garden) table \d\d', (n.get('text') or n.get('content-desc', '')))]
    assert len(seats) == 8 and all(n.get('enabled') == 'false' for n in seats), 'Eight logged-out seats must remain disabled'
    observations.append({'name': 'local canvas and logged-out authority', 'outcome': 'PASS'})
    tap(nodes, 'Identity')
    nodes = snapshot('identity-fallback', ["You're offline", 'Return to preview'])
    assert contains(nodes, "You're offline") and contains(nodes, 'Return to preview')
    tap(nodes, 'Return to preview')
    nodes = snapshot('navigation-return', ['Local Test Cafe', 'Original starter art'])
    assert contains(nodes, 'Local Test Cafe') and contains(nodes, 'Original starter art')
    observations.append({'name': 'actual local navigation and return', 'outcome': 'PASS'})
    tap(nodes, 'Identity')
    run('native-back', ['shell', 'input', 'keyevent', '4'])
    nodes = snapshot('native-back', ['Local Test Cafe', 'Original starter art'])
    assert contains(nodes, 'Local Test Cafe')
    observations.append({'name': 'Android back bridge', 'outcome': 'PASS'})
    foreground()
    run('background-home', ['shell', 'input', 'keyevent', '3'])
    time.sleep(2)
    run('foreground-return', ['shell', 'am', 'start', '-W', '-n', app + '/.MainActivity'], 45)
    nodes = snapshot('foreground-return', ['Local Test Cafe', 'No confirmed visible visitors.'])
    assert contains(nodes, 'Local Test Cafe') and contains(nodes, 'No confirmed visible visitors.')
    observations.append({'name': 'basic native background/foreground preview', 'outcome': 'PASS'})
    run('stop-own-preview', ['shell', 'am', 'force-stop', app])
    run('cold-restart', ['shell', 'am', 'start', '-W', '-n', app + '/.MainActivity'], 45)
    nodes = snapshot('cold-restart', ['Local Test Cafe', 'Original starter art'])
    assert contains(nodes, 'Local Test Cafe') and contains(nodes, 'Original starter art')
    observations.append({'name': 'own preview process restart', 'outcome': 'PASS'})
    facts['result'] = 'PASS'
except Exception as error:
    facts['result'] = 'FAIL'
    facts['error'] = str(error)
finally:
    for file in output.iterdir():
        file.chmod(0o600)
    facts['artifacts'] = [{'ref': str(file), 'sha256': hashlib.sha256(file.read_bytes()).hexdigest()} for file in sorted(output.iterdir())]
    (output / 'facts.json').write_text(json.dumps(facts, indent=2) + '\n')
    (output / 'facts.json').chmod(0o600)
    print(json.dumps({'result': facts['result'], 'scenarios': observations, 'artifactDirectory': str(output),
                      'scope': facts['scope'], 'error': facts.get('error')}))
if facts['result'] != 'PASS':
    raise SystemExit(1)
