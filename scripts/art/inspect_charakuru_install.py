"""Audit the local Charakuru v1.1.1 release. Reads files and prints JSON.

Pass the install directory and optionally --port 8766 to inspect a running
loopback app. The probe fetches only the static entry page and its capability
flags. It never opens a project or submits a job.
"""

import argparse
import hashlib
import json
import sys
from http.client import HTTPConnection, HTTPException
from pathlib import Path


# Digest of the manifest in the published release ZIP after verifying the
# archive against GitHub's SHA-256. No upstream source or assets are bundled.
RELEASE = "https://github.com/nanocle/Charakuru/releases/tag/v1.1.1"
COMMIT = "8eb22f6c6700dcc310896336596682594928024c"
ARCHIVE_SHA256 = "130efef11e087263729842b5523e67d660b33d160e8c118df1c96a9ce50faf3d"
MANIFEST_SHA256 = "af0503ec14cba27228ef01d19ae01c7ae7cfdc5c4e630c7ef6fc9d481e7f5f9d"


def sha256(data):
    return hashlib.sha256(data).hexdigest()


def audit_install(root):
    manifest = (root / "RELEASE-MANIFEST.json").read_bytes()
    if sha256(manifest) != MANIFEST_SHA256:
        raise ValueError("Installed manifest differs from the pinned v1.1.1 release")
    release = json.loads(manifest)
    missing, changed, matching = [], [], []
    for row in release["files"]:
        name = row["path"]
        file = root / name
        if not file.is_file():
            missing.append(name)
        elif sha256(file.read_bytes()) != row["sha256"]:
            changed.append(name)
        else:
            matching.append(name)
    skills = [Path(name).parent.name for name in matching
              if name.startswith("skills/") and name.endswith("/SKILL.md")]
    return {
        "release": RELEASE,
        "releaseCommit": COMMIT,
        "releaseArchiveSha256": ARCHIVE_SHA256,
        "releaseManifestSha256": MANIFEST_SHA256,
        "version": release["version"],
        "manifestFiles": len(release["files"]),
        "matchingFiles": len(matching),
        "missingFiles": missing,
        "changedFiles": changed,
        "matchingSkills": sorted(skills),
        "matchingScripts": sorted(name for name in matching if name.startswith("scripts/")),
        "licenseSha256": next(row["sha256"] for row in release["files"] if row["path"] == "LICENSE"),
    }


def read_route(port, route):
    connection = HTTPConnection("127.0.0.1", port, timeout=5)
    try:
        connection.request("GET", route)
        response = connection.getresponse()
        if response.status != 200:
            raise ValueError(f"{route} returned HTTP {response.status}")
        body = response.read(1024 * 1024 + 1)
        if len(body) > 1024 * 1024:
            raise ValueError(f"{route} exceeded the expected response size")
        return body
    finally:
        connection.close()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("install", type=Path)
    parser.add_argument("--port", type=int, help="Also read the loopback app on this port")
    args = parser.parse_args()
    if args.port is not None and not 1 <= args.port <= 65535:
        parser.error("--port must be between 1 and 65535")
    try:
        report = audit_install(args.install)
        valid = not report["missingFiles"] and not report["changedFiles"]
        if args.port is not None:
            page = read_route(args.port, "/")
            matches = sha256(page) == sha256((args.install / "public/index.html").read_bytes())
            capabilities = json.loads(read_route(args.port, "/api/capabilities"))
            flags = ("production", "rigExport", "weightTransfer")
            if not isinstance(capabilities, dict) or any(type(capabilities.get(key)) is not bool for key in flags):
                raise ValueError("Unexpected capabilities response")
            report["loopback"] = {
                "port": args.port,
                "matchesInstalledIndex": matches,
                "capabilities": {key: capabilities[key] for key in flags},
            }
            valid = valid and matches
        print(json.dumps(report, indent=2))
        return 0 if valid else 1
    except (OSError, HTTPException, ValueError) as error:
        print(f"Charakuru inspection failed: {error}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
