"""Build or verify a local, immutable reference review package. No network or Meshy calls."""

import argparse
import hashlib
import html
import io
import json
import re
import sys
from pathlib import Path

from PIL import Image, __version__ as pillow_version

STAGES = ("concept", "turnaround", "details", "meshy", "blender", "exports",
          "unity", "review", "provenance")
RELEASE = "DRAFT_ONLY / OFFLINE_ONLY / NO_GO_PUBLIC"


def digest(data):
    return hashlib.sha256(data).hexdigest()


def json_bytes(value):
    return (json.dumps(value, ensure_ascii=True, indent=2) + "\n").encode()


def require(condition, message):
    if not condition:
        raise ValueError(message)


def identifier(value):
    require(isinstance(value, str) and re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", value),
            "Invalid identifier")
    return value


def safe_file(root, relative):
    path = root / relative
    require(not Path(relative).is_absolute() and ".." not in Path(relative).parts,
            "Path escapes package")
    require(path.resolve().is_relative_to(root.resolve()), "Path escapes package")
    require(not path.is_symlink(), "Symlinks are not package assets")
    return path


def put(root, relative, data):
    path = safe_file(root, relative)
    path.parent.mkdir(parents=True, exist_ok=True)
    if path.exists():
        require(path.is_file() and path.read_bytes() == data,
                f"Immutable file differs: {relative}; use a new design revision")
    else:
        with path.open("xb") as output:
            output.write(data)
    return {"path": relative, "sha256": digest(data), "bytes": len(data)}


def read_design(manifest, source_override=None):
    raw = Path(manifest).read_bytes()
    design = json.loads(raw)
    require(design["schemaVersion"] == 1 and design["release"] == RELEASE,
            "Unsupported design or release policy")
    for key in ("petId", "designRevision"):
        identifier(design[key])
    gate = design["generationGate"]
    require(gate == {"ownerDesignApproval": None, "creditAuthorization": None,
                     "allowedPaidJobs": 0, "jobs": [], "creditsConsumedByThisIntake": 0},
            "Intake cannot authorize generation or record approval")
    require(design["source"]["approval"] == "NOT_APPROVED" and
            design["source"]["rights"] == "PENDING_REVIEW",
            "Intake cannot confer approval or rights")
    source = Path(source_override or design["source"]["path"])
    require(source.is_file(), "Reference must be a regular file")
    source_bytes = source.read_bytes()
    require(digest(source_bytes) == design["source"]["sha256"], "Source hash mismatch")
    image = Image.open(io.BytesIO(source_bytes))
    require(image.format == "PNG", "Reference must be PNG")
    image.load()
    require(list(image.size) == design["source"]["dimensions"], "Source dimensions mismatch")
    ids = set()
    for crop in design["crops"]:
        identifier(crop["id"])
        require(crop["id"] not in ids, "Duplicate crop ID")
        ids.add(crop["id"])
        require(crop["folder"] in ("concept", "turnaround", "details"), "Invalid crop folder")
        box = crop["box"]
        require(len(box) == 4 and all(type(v) is int for v in box), "Invalid crop box")
        left, top, right, bottom = box
        require(0 <= left < right <= image.width and 0 <= top < bottom <= image.height,
                "Crop out of bounds")
    require({"front", "front-three-quarter", "side", "rear-three-quarter", "back"} <= ids,
            "Missing turnaround extraction")
    return design, raw, source_bytes, image


def review_page(design):
    escape = html.escape
    title = escape(design["name"] + " / " + design["designRevision"])
    width, height = design["source"]["dimensions"]
    figures = "".join(
        f'<figure><a href="../{c["folder"]}/{c["id"]}.png">'
        f'<img src="../{c["folder"]}/{c["id"]}.png" alt="{escape(c["label"])}" '
        f'loading="lazy"></a><figcaption>{escape(c["label"])}</figcaption></figure>'
        for c in design["crops"])
    rows = "".join(f'<tr><td>{escape(c["requirement"])}</td><td>{escape(c["status"])}</td>'
                   f'<td>{escape(c.get("note", ""))}</td></tr>' for c in design["coverage"])
    questions = "".join(f'<li><strong>{escape(q["id"])}</strong>: {escape(q["question"])}</li>'
                        for q in design["designCompletionTasks"])
    return f'''<!doctype html>
<html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow"><title>{title} design review</title>
<style>
*{{box-sizing:border-box}}body{{margin:0;background:#f5f6f7;color:#20232a;font:16px/1.5 system-ui}}
main{{max-width:1720px;margin:auto;padding:24px}}h1{{font-size:30px}}h2{{font-size:22px}}
.gate{{border-left:4px solid #a12645;padding:12px;background:#fff}}img{{display:block;max-width:100%;height:auto}}
.sheet{{width:100%;margin:20px 0}}.gallery{{display:flex;flex-wrap:wrap;gap:20px;align-items:start}}
figure{{margin:0;max-width:100%;background:#fff;padding:8px;border:1px solid #c8cbd0;border-radius:4px}}
figure img{{max-height:460px;width:auto}}figcaption{{max-width:440px;font-size:14px}}
table{{border-collapse:collapse;width:100%}}td,th{{border-bottom:1px solid #bbc0c6;padding:10px;text-align:left;vertical-align:top}}
code,a,td,li{{overflow-wrap:anywhere}}li{{margin-bottom:12px}}a{{color:#165888}}
@media(max-width:600px){{main{{padding:12px}}td,th{{padding:6px;font-size:13px}}}}
</style><main><h1>{title}</h1>
<p class="gate">DESIGN_REVIEW / NOT APPROVED. Paid jobs authorized: 0. {RELEASE}.</p>
<p>Source SHA-256: <code>{design["source"]["sha256"]}</code><br>
Original: {width} x {height} pixels. Native lossless crops; no generated or reconstructed views.</p>
<a href="../concept/source.png"><img class="sheet" src="../concept/source.png" alt="Original owner-supplied concept sheet"></a>
<h2>Reference panels</h2><div class="gallery">{figures}</div>
<h2>Design coverage</h2><table><tr><th>Requirement</th><th>State</th><th>Observation</th></tr>{rows}</table>
<h2>Owner decisions</h2><ol>{questions}</ol>
<p><a href="../provenance/design.json">Design input</a> |
<a href="../provenance/package.sha256">Immutable snapshot checksum</a> |
<a href="../provenance/manifest.sha256">Package index checksum</a></p>
</main></html>'''.encode()


def build(manifest, output_root, source_override=None):
    design, raw, source_bytes, source = read_design(manifest, source_override)
    root = Path(output_root) / "pets" / design["petId"] / design["designRevision"]
    require(not root.is_symlink(), "Symlink package root")
    if safe_file(root, "provenance/manifest.json").exists():
        require(safe_file(root, "provenance/design.json").read_bytes() == raw,
                "Immutable design differs; use a new design revision")
        return verify(root)
    root.mkdir(parents=True, exist_ok=True)
    for stage in STAGES:
        safe_file(root, stage).mkdir(exist_ok=True)
    files = [put(root, "provenance/design.json", raw),
             put(root, "concept/source.png", source_bytes)]
    for crop in design["crops"]:
        pixels = source.crop(crop["box"])
        buffer = io.BytesIO()
        pixels.save(buffer, format="PNG", icc_profile=source.info.get("icc_profile"))
        entry = put(root, f'{crop["folder"]}/{crop["id"]}.png', buffer.getvalue())
        entry.update({"cropBox": crop["box"], "dimensions": list(pixels.size), "scale": 1})
        files.append(entry)
    files.append(put(root, "review/index.html", review_page(design)))
    snapshot = {"schemaVersion": 1, "petId": design["petId"],
                "designRevision": design["designRevision"], "state": "DESIGN_REVIEW",
                "release": RELEASE, "runtimeEnabled": False, "productionReady": False,
                "designApproval": None, "creditAuthorization": None, "jobs": [],
                "producer": {"toolSha256": digest(Path(__file__).read_bytes()),
                             "pillow": pillow_version}, "files": files}
    data = json_bytes(snapshot)
    snapshot_path = f"provenance/design-{digest(data)}.json"
    put(root, snapshot_path, data)
    put(root, "provenance/package.sha256", f"{digest(data)}  {snapshot_path}\n".encode())
    index = json_bytes({"snapshot": snapshot_path, "sha256": digest(data)})
    put(root, "provenance/manifest.json", index)
    put(root, "provenance/manifest.sha256", f"{digest(index)}  provenance/manifest.json\n".encode())
    return verify(root)


def verify(root):
    root = Path(root)
    index_bytes = safe_file(root, "provenance/manifest.json").read_bytes()
    expected = safe_file(root, "provenance/manifest.sha256").read_text().split()
    require(expected == [digest(index_bytes), "provenance/manifest.json"], "Index hash mismatch")
    index = json.loads(index_bytes)
    snapshot_bytes = safe_file(root, index["snapshot"]).read_bytes()
    require(index["sha256"] == digest(snapshot_bytes) and
            index["snapshot"] == f'provenance/design-{digest(snapshot_bytes)}.json',
            "Snapshot hash mismatch")
    expected = safe_file(root, "provenance/package.sha256").read_text().split()
    require(expected == [digest(snapshot_bytes), index["snapshot"]], "Snapshot checksum mismatch")
    snapshot = json.loads(snapshot_bytes)
    require(snapshot["state"] == "DESIGN_REVIEW" and snapshot["release"] == RELEASE and
            snapshot["runtimeEnabled"] is False and snapshot["productionReady"] is False and
            snapshot["designApproval"] is None and snapshot["creditAuthorization"] is None and
            snapshot["jobs"] == [], "Intake cannot pass production or generation gates")
    paths = set()
    for entry in snapshot["files"]:
        require(entry["path"] not in paths, "Duplicate package file")
        paths.add(entry["path"])
        file = safe_file(root, entry["path"])
        require(file.is_file(), "Missing package file")
        data = file.read_bytes()
        require(digest(data) == entry["sha256"] and len(data) == entry["bytes"],
                f'Package hash mismatch: {entry["path"]}')
    design, _, _, source = read_design(root / "provenance/design.json", root / "concept/source.png")
    require(snapshot["petId"] == design["petId"] and
            snapshot["designRevision"] == design["designRevision"], "Package identity mismatch")
    required = {"concept/source.png", "provenance/design.json", "review/index.html"}
    for crop in design["crops"]:
        relative = f'{crop["folder"]}/{crop["id"]}.png'
        required.add(relative)
        actual = Image.open(safe_file(root, relative))
        expected = source.crop(crop["box"])
        require(actual.mode == expected.mode and actual.size == expected.size and
                actual.tobytes() == expected.tobytes(), f"Crop pixel mismatch: {relative}")
    require(paths == required, "Incomplete or unexpected package index")
    return {"status": "PASS", "scope": "Reference integrity and exact crop pixels only",
            "package": str(root), "snapshotSha256": digest(snapshot_bytes),
            "filesVerified": len(paths), "cropsVerified": len(design["crops"]),
            "state": "DESIGN_REVIEW", "ownerApproval": "MISSING",
            "paidJobsAllowed": 0, "runtimeEnabled": False, "productionReady": False}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest")
    parser.add_argument("--source", help="Relocated source with exactly the same SHA-256")
    parser.add_argument("--output-root", default="artifacts/design-intake")
    parser.add_argument("--verify", metavar="PACKAGE")
    args = parser.parse_args()
    try:
        if args.verify:
            require(not args.manifest and not args.source, "Use build or verify, not both")
            result = verify(args.verify)
        else:
            require(args.manifest is not None, "--manifest is required")
            result = build(args.manifest, args.output_root, args.source)
        print(json.dumps(result, indent=2))
    except (ValueError, OSError, KeyError, TypeError) as error:
        print(f"FAIL: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    sys.exit(main())
