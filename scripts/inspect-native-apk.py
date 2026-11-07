"""Inspect only task-built APK/public certificates; never open signing keys."""
from pathlib import Path
import argparse, hashlib, json, os, re, subprocess, uuid, zipfile, shutil

parser = argparse.ArgumentParser()
parser.add_argument('mode', choices=['auth', 'normal', 'release-unsigned'])
mode = parser.parse_args().mode
config = json.loads(Path('artifacts/vnext/n10-02/android-native/local-env.json').read_text())
sdk = Path(config['sdkRoot'])
apk = Path('apps/mobile/android/app/build/outputs/apk/release/app-release-unsigned.apk' if mode == 'release-unsigned' else 'apps/mobile/android/app/build/outputs/apk/debug/app-debug.apk')
directory = Path('artifacts/vnext/n10-03/apk-' + mode + '-' + uuid.uuid4().hex[:8])
directory.mkdir(mode=0o700)
digest = lambda value: hashlib.sha256(value).hexdigest()
env = {**os.environ, 'JAVA_HOME': config['javaHome'], 'PATH': config['javaHome'] + '/bin:' + os.environ['PATH']}
facts = {'mode': mode, 'commands': [], 'distributed': False}
try:
    data = apk.read_bytes()
    facts['apk'] = {'sha256': digest(data), 'bytes': len(data)}
    shutil.copyfile(apk, directory / 'application.apk')
    def run(label, command):
        result = subprocess.run(command, env=env, capture_output=True, timeout=30)
        output = result.stdout + result.stderr
        (directory / (label + '.log')).write_bytes(output)
        facts['commands'].append({'label': label, 'exitCode': result.returncode, 'sha256': digest(output)})
        assert result.returncode == 0, label
        return result.stdout.decode()
    aapt = str(sdk / 'build-tools/36.0.0/aapt2')
    badging = run('badging', [aapt, 'dump', 'badging', str(apk)])
    assert "package: name='life.virtualcity.spike'" in badging
    assert "targetSdkVersion:'36'" in badging
    assert ('application-debuggable' in badging) == (mode != 'release-unsigned')
    if mode != 'release-unsigned':
        run('signature', [str(sdk / 'build-tools/36.0.0/apksigner'), 'verify', '--verbose', '--print-certs', str(apk)])
    resources = run('resources', [aapt, 'dump', 'resources', str(apk)])
    resource = re.search(r'resource [^\n]*xml/native_network_security\n\s+\(\) \(file\) ([^\s]+)', resources)
    assert resource, 'Network resource missing'
    policy = run('network-policy', [aapt, 'dump', 'xmltree', str(apk), '--file', resource.group(1)])
    assert 'cleartextTrafficPermitted=false' in policy and 'cleartextTrafficPermitted=true' not in policy and 'system' in policy
    assert 'src="user"' not in policy
    assert ('raw/vlp_native_test_ca' in resources) == (mode == 'auth')
    assert ('localhost' in policy) == (mode == 'auth')
    with zipfile.ZipFile(apk) as archive:
        matched = 0
        for file in Path('apps/mobile/dist').rglob('*'):
            if file.is_file():
                assert archive.read('assets/public/' + str(file.relative_to('apps/mobile/dist'))) == file.read_bytes(), 'Packaged asset differs'
                matched += 1
        facts['packagedLocalFilesMatched'] = matched
        capacitor = json.loads(archive.read('assets/capacitor.config.json'))
        assert not capacitor['server'].get('url') and capacitor['server']['cleartext'] is False
        assert capacitor['android']['allowMixedContent'] is False
        raw_ca = 'res/raw/vlp_native_test_ca.pem'
        assert (raw_ca in archive.namelist()) == (mode == 'auth')
        if mode == 'auth':
            assert archive.read(raw_ca) == Path('artifacts/vnext/n10-03/tls/ca.pem').read_bytes()
        html = archive.read('assets/public/index.html').decode()
        js = b''.join(archive.read(name) for name in archive.namelist() if name.startswith('assets/public/') and name.endswith('.js'))
        assert (b'nativeAccountQualification' in js) == (mode == 'auth')
        if mode == 'auth':
            assert "connect-src 'self' wss://localhost:18443;" in html
        else:
            assert "connect-src 'self';" in html and 'wss://localhost:18443' not in html
            dex = b''.join(archive.read(name) for name in archive.namelist() if name.endswith('.dex'))
            assert b'https://localhost:18443' not in dex
        facts.update({'debugTestCaPresent': mode == 'auth', 'qualificationFixturePresent': mode == 'auth', 'remoteServerURL': False, 'mixedContent': False})
    facts['result'] = 'PASS'
finally:
    if 'result' not in facts:
        facts['result'] = 'FAIL'
    (directory / 'facts.json').write_text(json.dumps(facts, indent=2) + '\n')
    print(json.dumps({'result': facts['result'], 'mode': mode, 'artifactDirectory': str(directory)}))
