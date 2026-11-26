#!/usr/bin/env python3
"""Scan changed source before staging. Emit only rule names and aggregate counts."""

import argparse
import json
from pathlib import Path
import re
import subprocess

MAX_BYTES = 8 * 1024 * 1024
RULES = {
    'private-key': re.compile(rb'-----BEGIN (?:[A-Z]+ )*PRIVATE KEY-----'),
    'github-token': re.compile(rb'\b(?:gh[pousr]_|github_pat_)[A-Za-z0-9_]{22,}'),
    'provider-token': re.compile(rb'\b(?:sk-|msy_)[A-Za-z0-9_-]{24,}'),
    'assigned-secret': re.compile(
        rb'(?im)^[ \t]*(?:export[ \t]+)?[\w.-]*(?:api[_-]?key|mesh[yY][_\w-]*key|'
        rb'access[_-]?token|secret[_-]?access[_-]?key)\s*[:=]\s*'
        rb'["\x27]?[A-Za-z0-9_-]{24,}["\x27]?[ \t]*$'),
}


def git(args):
    return subprocess.run(['git', *args], check=True, stdout=subprocess.PIPE,
                          stderr=subprocess.DEVNULL, timeout=20).stdout


def names(args):
    return set(git(args).decode('utf-8').rstrip('\0').split('\0')) - {''}


def scan(root, paths, tree):
    hits = {rule: 0 for rule in RULES}
    for name in sorted(paths):
        path = root / name
        if tree is None:
            if path.is_symlink() or not path.is_file() or not path.resolve().is_relative_to(root):
                raise ValueError('non-regular candidate')
            with path.open('rb') as source:
                data = source.read(MAX_BYTES + 1)
        else:
            spec = f'{tree}:{name}'
            if int(git(['cat-file', '-s', spec])) > MAX_BYTES:
                raise ValueError('oversized candidate')
            data = git(['show', spec])
        if len(data) > MAX_BYTES:
            raise ValueError('oversized candidate')
        for rule, expression in RULES.items():
            if expression.search(data):
                hits[rule] += 1
    hits = {rule: count for rule, count in hits.items() if count}
    return {'status': 'FAIL' if hits else 'PASS', 'files': len(paths), 'findings': hits}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    modes = parser.add_mutually_exclusive_group()
    modes.add_argument('--staged', action='store_true')
    modes.add_argument('--range', nargs=2, metavar=('BASE', 'HEAD'))
    modes.add_argument('--self-test', action='store_true')
    args = parser.parse_args()
    try:
        if args.self_test:
            checks = {
                'private-key': b'-----BEGIN ' + b'PRIVATE KEY-----',
                'github-token': b'gh' + b'p_' + b'x' * 30,
                'provider-token': b'sk' + b'-' + b'x' * 30,
                'assigned-secret': b'MESHY_API_KEY=' + b'x' * 30,
            }
            for rule, sample in checks.items():
                if not RULES[rule].search(sample) or RULES[rule].search(b'api_key = os.environ["KEY"]'):
                    raise ValueError('synthetic fixture mismatch')
            print(json.dumps({'status': 'PASS', 'syntheticRulesExercised': len(checks)}))
            return 0
        root = Path(git(['rev-parse', '--show-toplevel']).decode().strip()).resolve()
        if root != Path.cwd().resolve():
            raise ValueError('run from the repository root')
        if args.range:
            if not all(re.fullmatch('[a-f0-9]{40}', value) for value in args.range):
                raise ValueError('use exact Git revisions')
            base, head = args.range
            paths = names(['diff', '--name-only', '--diff-filter=ACMR', '-z', base, head, '--'])
            result = scan(root, paths, head)
        elif args.staged:
            paths = names(['diff', '--cached', '--name-only', '--diff-filter=ACMR', '-z', '--'])
            result = scan(root, paths, '')
        else:
            paths = names(['diff', '--name-only', '--diff-filter=ACMR', '-z', 'HEAD', '--'])
            paths |= names(['ls-files', '--others', '--exclude-standard', '-z'])
            result = scan(root, paths, None)
        print(json.dumps(result))
        return int(result['status'] != 'PASS')
    except (ValueError, OSError, subprocess.SubprocessError):
        print(json.dumps({'status': 'BLOCKED', 'reason': 'SCAN_INCOMPLETE'}))
        return 2


if __name__ == '__main__':
    raise SystemExit(main())
