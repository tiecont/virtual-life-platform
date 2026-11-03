import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { AvatarKeySchema, AvatarOutfitSchema, AnimationStateSchema } from '@virtual-city/contracts';
import { avatarAtlasSvg, avatarAtlasSpec } from '../packages/pixi-scene/src/avatar-art';

async function main() {
const directory = 'apps/portal-web/public/assets/avatars';
const svg = avatarAtlasSvg();
const manifest = JSON.stringify({ ...avatarAtlasSpec, palettes: AvatarKeySchema.options, outfits: AvatarOutfitSchema.options, actions: AnimationStateSchema.options,
  sha256: createHash('sha256').update(svg).digest('hex'), source: 'Original code-authored pixel geometry in packages/pixi-scene/src/avatar-art.ts',
  authoring: 'Created in this workspace for virtual-life-platform; no imported media or character references',
  attribution: 'No third-party attribution requirements identified; no external artwork used',
  rights: 'Project owner retains distribution/license decision; this manifest does not assign a media license', releaseApproved: false,
}, null, 2) + '\n';
const files = [[`${directory}/starter-v1.svg`, svg], [`${directory}/provenance.json`, manifest]];
if (process.argv.includes('--check')) {
  for (const [path, expected] of files) if (await readFile(path, 'utf8') !== expected) throw new Error(`Stale avatar asset: ${path}`);
  console.log('Original avatar atlas and provenance reproduce exactly.');
} else {
  await mkdir(directory, { recursive: true }); for (const [path, body] of files) await writeFile(path, body);
  console.log('Generated original avatar atlas and provenance.');
}
}
void main().catch(error => { console.error(error instanceof Error ? error.message : 'Avatar generation failed'); process.exitCode = 1; });
