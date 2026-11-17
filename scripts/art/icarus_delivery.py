"""Build and verify an offline Icarus WIP handoff from actual rendered assets."""
import hashlib
import html
import json
import subprocess
import zipfile
from datetime import datetime, timezone
from pathlib import Path

from PIL import Image, ImageChops, ImageStat

ROOT = Path('artifacts/character-production/icarus').resolve()
ASSEMBLY = ROOT / 'blender/assembled-04'
RENDER = ROOT / 'unity/render-05'
VIDEOS = ROOT / 'unity/review-videos'
DESTINATION = ROOT / 'Icarus_V3_Offline_Review.zip'


def sha(path):
    with path.open('rb') as stream:
        return hashlib.file_digest(stream, 'sha256').hexdigest()


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2) + '\n')


def main():
    if DESTINATION.exists():
        raise ValueError('Preserve existing delivery; archive must not be overwritten')
    original = ROOT / 'references/owner-review-v3'
    for line in (original / 'docs/FILES_SHA256.txt').read_text().splitlines():
        expected, relative = line.split(maxsplit=1)
        source = original / relative.lstrip('*')
        assert source.resolve().is_relative_to(original)
        assert sha(source) == expected, relative
    selected = original / 'references/selected_design_01.png'
    assert sha(selected) == '6bb497272dde6d6fa74a1eb4fccf88a60ae147ed529bd894f23e86441623c7fc'
    ledger = json.loads((ROOT / 'provenance/task-ledger-reconciled.json').read_text())
    balance = ledger.get('latestBalance', ledger['balanceAfter'])
    assert sum(job['actualCredits'] for job in ledger['jobs']) == 35
    assert all(not job['taskId'].startswith('00000000') for job in ledger['jobs'])
    unity = json.loads((RENDER / 'inspection.json').read_text())
    reimport = json.loads((ROOT / 'review/export-reimport-final.json').read_text())
    assert all(record['result'] == 'PASS' and record['textureCount'] >= 2 for record in reimport['reimport'])
    assert unity['editor'] == '6000.3.14f1' and unity['bones'] == 44
    assert not unity['productionReady'] and not unity['gameplayEnabled']
    media = []
    VIDEOS.mkdir(exist_ok=True)
    for stem in ('turntable', 'idle', 'wing_fold_test', 'bow_draw_test'):
        frames = sorted(RENDER.glob(f'{stem}-[0-9][0-9][0-9][0-9].png'))
        assert len(frames) >= 25, stem
        output = VIDEOS / f'{stem}.mp4'
        if not output.exists():
            subprocess.run(['ffmpeg', '-hide_banner', '-loglevel', 'error', '-n', '-framerate', '15',
                            '-i', str(RENDER / f'{stem}-%04d.png'), '-c:v', 'libx264', '-crf', '20',
                            '-pix_fmt', 'yuv420p', '-movflags', '+faststart', str(output)], check=True)
        probe = json.loads(subprocess.check_output(['ffprobe', '-v', 'error', '-select_streams', 'v:0',
                            '-show_entries', 'stream=codec_name,width,height,nb_frames,duration', '-of', 'json', str(output)]))['streams'][0]
        assert int(probe['nb_frames']) == len(frames)
        assert probe['width'] == probe['height'] == 640
        # Fixed-camera clips must change body pixels, not only camera or halo.
        first = Image.open(frames[0]).convert('RGB').crop((100, 100, 540, 590))
        changed = 0
        for frame in frames[1:]:
            difference = ImageChops.difference(first, Image.open(frame).convert('RGB').crop((100,100,540,590)))
            changed = max(changed, sum(difference.convert('L').histogram()[9:]))
        assert changed > 100, f'No significant rendered body-pixel change: {stem}'
        front = Image.open(frames[0]).convert('RGB')
        assert max(ImageStat.Stat(front).stddev) > 10, f'Blank frame: {stem}'
        decoded = ROOT / 'review/decoded-video'
        decoded.mkdir(exist_ok=True)
        subprocess.run(['ffmpeg','-hide_banner','-loglevel','error','-y','-i',str(output),
                        '-vf',f'select=eq(n\\,0)+eq(n\\,{len(frames)//4})','-fps_mode','vfr',
                        '-frames:v','2',str(decoded / f'{stem}-%02d.png')],check=True)
        assert max(ImageStat.Stat(Image.open(decoded / f'{stem}-01.png')).stddev) > 10
        media.append({'file': str(output.relative_to(ROOT)), 'frames':len(frames), 'probe':probe,
                      'changedBodyPixels':changed, 'cameraMoves':stem == 'turntable',
                      'canonicalAnimationAcceptance':False})
    issues = [
        {'area':'Skinning/export', 'status':'FIXED', 'detail':'Accessory conversion no longer bakes away Armature modifier; both formats reimport with44 bones,0 unweighted vertices,4 influences and2 texture sets.'},
        {'area':'Wing tearing', 'status':'FIXED', 'detail':'Whole wing shells now follow upper-back root hinges; hard color-region tears removed. This is only a coarse folding probe.'},
        {'area':'Face', 'status':'UNRESOLVED', 'detail':'Muddy grey eyes, missing ruby iris detail/expression and softer facial likeness than V3; facial retopology and texture work required.'},
        {'area':'Wing construction', 'status':'UNRESOLVED', 'detail':'Fused vanes, simplified roots and one rigid hinge per side; full feather articulation, folded rest silhouette and hair clearance not achieved.'},
        {'area':'Halo/root fittings', 'status':'REQUIRES_OWNER_REVIEW', 'detail':'Interpreted geometry from approved sheet; supplements are not independently owner-approved.'},
        {'area':'Hair/costume', 'status':'UNRESOLVED', 'detail':'Good draft silhouette, but fused cloth layers, crude rear detail and heuristic secondary weights require manual repair.'},
        {'area':'Bow', 'status':'UNRESOLVED', 'detail':'Separate arrow asset and LeftHand attachment exist; thin depth, fused string, missing tension, finger grip, nocking and release remain.'},
        {'area':'Production contract', 'status':'UNRESOLVED', 'detail':'44 versus74 bones;12690 body triangles below26000-29500 detail target;4 versus3 materials; PBR, validated LODs and16 accepted canonical actions absent.'},
        {'area':'Scale', 'status':'UNRESOLVED', 'detail':'Meshy rig height1.68m includes appendages;168cm body excluding halo/wings not certified.'},
    ]
    report = {'petId':'pet-v3-fire-icarus', 'recordedAt':datetime.now(timezone.utc).isoformat(),
              'sourceRevision':subprocess.check_output(['git','rev-parse','HEAD'],text=True).strip(),
              'branch':subprocess.check_output(['git','branch','--show-current'],text=True).strip(),
              'state':'ART_REVISION_REQUIRED', 'focalRework':'ARTIST_HANDOFF_REQUIRED',
              'reviewMode':'SINGLE_AGENT_SELF_REVIEW', 'productionReady':False,
              'release':'DRAFT_ONLY / OFFLINE_ONLY / NO_GO_PUBLIC', 'meshy':ledger,
              'unity':unity, 'reimport':reimport, 'media':media, 'issues':issues,
              'reworkAttempts':['Wing-region weights tore feathers; replaced with complete-shell root hinges after actual render review.',
                                'Two UV iris-paint studies produced no accepted visible improvement. Retain assembled-04; both studies are excluded from selected assets.'],
              'gates':{'approvedReferenceIntegrity':'PASS', 'initialOwnerDesignApproval':'PASS',
                       'MeshyPilotAndTraceability':'PASS', 'BlenderExportReimportSkinning':'PASS',
                       'UnityDraftImportAndRenderedMotion':'PASS', 'referenceLikenessAndFinish':'FAIL',
                       'productionRigAndCanonicalActions':'FAIL', 'productionMaterialsAndLODs':'FAIL',
                       'UnityPlayerAndWindowsPerformance':'NOT_RUN', 'reducedMotionAndAudio':'NOT_RUN',
                       'finalArtApproval':'BLOCKED', 'publicRelease':'BLOCKED'},
              'nextWork':'Manually rebuild facial/eye details and feather topology on the retained Meshy base; replace the coarse wing hinge and author finger/face rig before canonical bow/skill/ultimate animation.',
              'excluded':'Temporary project Library, caches, licensing files, runtime databases, signed provider URLs and previous failed assemblies are excluded.'}
    write_json(ROOT / 'review/technical-validation.json', report)
    comparison = Image.new('RGB', (1280, 720), '#292929')
    reference = Image.open(original / 'turnaround/01_front_native_crop.png').convert('RGB')
    reference = reference.resize((round(reference.width*540/reference.height),540),Image.Resampling.NEAREST)
    comparison.paste(reference, (70+(460-reference.width)//2,60))
    rendered = Image.open(RENDER / 'front.png').convert('RGB')
    comparison.paste(rendered, (600,40))
    comparison.save(ROOT / 'review/design-versus-model.png')
    rows = ''.join(f'<tr><td>{html.escape(i["area"])}</td><td>{i["status"]}</td><td>{html.escape(i["detail"])}</td></tr>' for i in issues)
    videos = ''.join(f'<figure><video controls preload="metadata" poster="../unity/render-05/front.png" src="../{m["file"]}"></video><figcaption>{Path(m["file"]).stem} / DRAFT MOTION TEST</figcaption></figure>' for m in media)
    page = f'''<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Icarus V3 offline review</title>
<style>body{{background:#181a1b;color:#eee;font:16px/1.5 system-ui;margin:0;padding:24px;max-width:1280px}}h1{{font-size:32px}}img{{max-width:100%;height:auto}}.media{{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:16px}}figure{{margin:0}}video{{width:100%;aspect-ratio:1;background:#333}}table{{border-collapse:collapse;width:100%;table-layout:fixed}}td,th{{padding:12px;border-bottom:1px solid #555;text-align:left;vertical-align:top;overflow-wrap:anywhere}}th:first-child{{width:18%}}th:nth-child(2){{width:24%}}a{{color:#ffba70}}code{{overflow-wrap:anywhere}}@media(max-width:600px){{body{{padding:12px}}td,th{{padding:6px;font-size:13px}}}}</style>
<h1>Icarus V3</h1><p>ART_REVISION_REQUIRED / partial offline handoff / SINGLE_AGENT_SELF_REVIEW</p>
<p>35 Meshy credits consumed. Latest balance{balance['balance']} ({balance['monthlyCredits']} monthly +{balance['permanentCredits']} permanent). The subsequent50 permanent-credit increase has an unverified cause; no purchase was initiated. Approved V3 direction; final model art is unapproved. DRAFT_ONLY / OFFLINE_ONLY / NO_GO_PUBLIC.</p>
<img src="design-versus-model.png" alt="Approved front reference beside actual Unity draft render"><p>Left: native276px owner crop enlarged only for comparison, without added detail. Right: actual Unity URP draft. The visible gap remains open.</p>
<div class="media">{videos}</div><h2>Quality review</h2><table><tr><th>Area</th><th>State</th><th>Observed result / required correction</th></tr>{rows}</table>
<h2>Real deliverables</h2><p><a href="../blender/assembled-04/icarus-assembled.blend">Editable Blender</a> | <a href="../blender/assembled-04/icarus-review.glb">GLB</a> | <a href="../blender/assembled-04/icarus-review.fbx">FBX</a> | <a href="../unity/render-05/IcarusV3Pilot.unitypackage">Unity package</a> | <a href="technical-validation.json">Validation facts</a></p>
<p>Blender4.5.16 LTS / Unity6000.3.14f1 / URP17.3.0. Licensed Editor import and GPU rendering ran on AMD Radeon Graphics using OpenGLCore. No Windows/player performance claim. Attack, skill and ultimate gameplay demonstrations remain missing.</p>
<p>Open packed Blender source directly. Import Unity package only into an offline copy of the existing pinned project. The draft prefab and controller do not activate gameplay. The three authored probes do not replace16 canonical actions.</p></html>'''
    (ROOT / 'review/index.html').write_text(page)
    work_order = """ICARUS V3: PARTIAL OFFLINE HANDOFF

Preserve the approved celestial humanoid female archer, pink hair, ruby ornaments,
white/pink/red/gold outfit, upper-back feathered wings and Phoenix Fire Bow.
Use the selected V3 sheet and five native views; enlarged references add no detail.
The separate authorization event approves V3 direction and Icarus development,
not newly interpreted hardware, final art or release.

Start from blender/assembled-04/icarus-assembled.blend. Rebuild face/eyes and
feather vanes, root attachment, fold path and cloth separation before animation.
Keep textures portable and two independent character/bow maps. Add normal/ORM/
emissive-mask sets, clean topology/UVs, and validate168cm body excluding halo/wings.
Target26000-29500 triangles,74 useful bones, <=3 materials,2K textures and actual
LOD1/LOD2. Do not pad skeleton or rename motion probes to satisfy bindings.
Separate bow string, nock and arrow; author finger grip and release deformation.
Implement exact16 actions in tools/limited_animation_profiles.json, with real
events, anticipation/impact/recovery and actual rendered body motion.
Reimport both formats, inspect front/side/back and extreme joint/wing poses.
Repeat Unity URP import and motion checks after any source change; measure actual
player loading/frame/memory behavior separately. No public activation or art merge.
"""
    (ROOT / 'review/WORK_ORDER.txt').write_text(work_order)
    raw_log = ROOT / 'review/unity-render-05.log'
    filtered = [line for line in raw_log.read_text(errors='replace').splitlines()
                if any(term in line for term in ('Icarus','ICARUS','Model import','error CS','Exception'))
                and not any(term in line.lower() for term in ('licens','token','serial','entitlement','https://'))]
    (ROOT / 'review/unity-import-sanitized.log').write_text(
        'Actual Unity import/render log extracts; licensing/credential/URL lines excluded.\n'
        'Original local log SHA256: '+sha(raw_log)+'\n'+'\n'.join(filtered)+'\n')
    include = []
    folders = ['references', 'meshy/pilot-01', 'meshy/rig-01', 'meshy/bow-01',
               'blender/assembled-04', 'blender/refined-03', 'unity/review-videos',
               'unity/project/Assets/VirtualLife/ArtStudies/IcarusV3Pilot']
    for folder in folders:
        include.extend(p for p in (ROOT / folder).rglob('*') if p.is_file() and p.suffix not in {'.blend1'})
    for file in ['provenance/owner-authorization-v3.json','provenance/task-ledger-reconciled.json',
                 'provenance/pilot-01-request.json','provenance/bow-01-request.json',
                 'review/index.html','review/WORK_ORDER.txt','review/technical-validation.json',
                 'review/design-versus-model.png','review/export-reimport-final.json',
                 'review/unity-import-sanitized.log','unity/render-05/inspection.json',
                 'unity/render-05/IcarusV3Pilot.unitypackage','unity/render-05/front.png',
                 'unity/render-05/side.png','unity/render-05/back.png']:
        include.append(ROOT / file)
    include.extend((ROOT / 'review/final-blender-v2').glob('*.png'))
    include.extend((ROOT / 'review/decoded-video').glob('*.png'))
    include.append(ROOT / 'review/final-blender-v2/inspection.json')
    mapping = {str(path.relative_to(ROOT)):path for path in include}
    for script in Path('scripts/art').glob('icarus_*.py'):
        mapping['tools/' + script.name] = script
    mapping['tools/IcarusPilotReview.cs'] = Path('scripts/art/unity/IcarusPilotReview.cs')
    mapping['tools/requirements.txt'] = Path('scripts/art/requirements.txt')
    mapping['tools/limited_animation_profiles.json'] = Path('specs/pet-arena/v3.1/data/limited_animation_profiles.json')
    mapping['provenance/production-v3-pilot.json'] = Path('specs/pet-arena/references/icarus/production-v3-pilot.json')
    manifest = {'schemaVersion':1, 'petId':report['petId'], 'sourceRevision':report['sourceRevision'],
                'state':report['state'], 'files':[{'path':name,'sha256':sha(path),'bytes':path.stat().st_size} for name,path in sorted(mapping.items())]}
    write_json(ROOT / 'package-manifest.json', manifest)
    mapping['package-manifest.json'] = ROOT / 'package-manifest.json'
    with zipfile.ZipFile(DESTINATION, 'x', compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for name, path in sorted(mapping.items()):
            assert path.is_file() and not path.is_symlink(), name
            archive.write(path, name)
    with zipfile.ZipFile(DESTINATION) as archive:
        assert archive.testzip() is None
        for record in manifest['files']:
            assert hashlib.sha256(archive.read(record['path'])).hexdigest() == record['sha256']
    (ROOT / 'Icarus_V3_Offline_Review.zip.sha256').write_text(sha(DESTINATION)+'  '+DESTINATION.name+'\n')
    print(json.dumps({'archive':str(DESTINATION),'files':len(mapping),'sha256':sha(DESTINATION),
                      'bytes':DESTINATION.stat().st_size,'result':'PACKAGE_INTEGRITY_PASS','artAcceptance':'ART_REVISION_REQUIRED'}))


if __name__ == '__main__':
    main()
