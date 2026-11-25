#!/usr/bin/env python3
"""Validate the project configuration with the installed Codex, without account data."""

import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import tomllib

ROOT = Path(__file__).resolve().parents[2]


def run(command, cwd, env):
    return subprocess.run(command, cwd=cwd, env=env, check=True,
                          capture_output=True, text=True, timeout=30).stdout


def verify():
    codex = shutil.which('codex')
    if codex is None:
        raise SystemExit('Codex CLI is required for this check')
    artifacts = ROOT / 'artifacts'
    artifacts.mkdir(exist_ok=True)
    with tempfile.TemporaryDirectory(prefix='harness-config-', dir=artifacts) as scratch:
        base = Path(scratch).resolve()
        repo = base / 'repo'
        home = base / 'home'
        home.mkdir(mode=0o700)
        codex_home = home / '.codex'
        codex_home.mkdir(mode=0o700)
        shutil.copytree(ROOT / '.codex/agents', repo / '.codex/agents')
        shutil.copy2(ROOT / '.codex/config.toml', repo / '.codex/config.toml')
        (codex_home / 'config.toml').write_text(
            f'[projects.{json.dumps(str(repo))}]\ntrust_level = "trusted"\n')
        (repo / '.env').write_text('SYNTHETIC=yes\n')
        (repo / 'nested').mkdir()
        (repo / 'nested/.env.private').touch()
        (repo / 'tracked.txt').touch()
        (base / 'sibling.txt').touch()
        (codex_home / 'auth.fixture').touch()
        env = {name: os.environ[name] for name in ('PATH', 'LANG', 'USER')
               if name in os.environ}
        env.update(HOME=str(home), CODEX_HOME=str(codex_home))
        run(['git', 'init', '-q'], repo, env)

        startup = json.loads(run([codex, 'app-server', '--strict-config',
                                  '--print-startup-config'], repo, env))
        settings = tomllib.loads((repo / '.codex/config.toml').read_text())
        catalog = json.loads(run([codex, 'debug', 'models', '--bundled'], repo, env))
        by_slug = {item['slug']: item for item in catalog['models']}
        root = settings['model']
        worker = settings['agents']['default_subagent_model']
        roles = []
        for path in sorted((repo / '.codex/agents').glob('*.toml')):
            role = tomllib.loads(path.read_text())
            assert role['name'] == path.stem
            assert all(role[name].strip() for name in ('description', 'developer_instructions'))
            roles.append(role)
        routes = [(root, settings['model_reasoning_effort']),
                  (worker, settings['agents']['default_subagent_reasoning_effort'])]
        routes.extend((role.get('model', worker), role['model_reasoning_effort'])
                      for role in roles)
        for model, effort in routes:
            assert effort in {level['effort'] for level in by_slug[model]['supported_reasoning_levels']}

        def sandbox(*command, review=False):
            config = ['-c', 'default_permissions="aetheria-review"'] if review else []
            run([codex, 'sandbox', *config, '--', *command], repo, env)

        sandbox('/bin/sh', '-ec',
                'test ! -r .env && test ! -r nested/.env.private && '
                'test ! -r "$HOME/.codex/auth.fixture" && '
                'test -w tracked.txt && test ! -w ../sibling.txt')
        sandbox('/bin/sh', '-ec',
                'test -r tracked.txt && test ! -w tracked.txt && test ! -r .env', review=True)
        sandbox(shutil.which('python3'), '-c', """
import socket
try:
    socket.create_connection(('127.0.0.1', 1), 1)
except PermissionError:
    pass
else:
    raise SystemExit('network access unexpectedly permitted')
""")
        print(json.dumps({'status': 'PASS', 'codexVersion': startup['appServerVersion'],
                          'rootModel': root, 'workerModel': worker,
                          'roles': [role['name'] for role in roles],
                          'checks': ['strict-config', 'model-efforts', 'workspace-write',
                                     'sibling-write-denial', 'review-write-denial',
                                     'credential-read-denial', 'network-denial']}))


if __name__ == '__main__':
    verify()
