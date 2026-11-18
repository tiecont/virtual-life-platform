import { createHash } from 'node:crypto';
import { createReadStream } from 'node:fs';
import { readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { parseArgs } from 'node:util';

const { values } = parseArgs({ options: { output: { type: 'string' } } });
if (!values.output) throw new Error('Usage: node scripts/art/icarus-focal-verify.mjs --output DIR');
const directory = path.resolve(values.output);
const report = JSON.parse(await readFile(path.join(directory, 'inspection.json'), 'utf8'));
const checks = [];
function check(name, passed) {
  checks.push({ name, passed: Boolean(passed) });
}
async function sha256(filename) {
  const hash = createHash('sha256');
  for await (const chunk of createReadStream(filename)) hash.update(chunk);
  return hash.digest('hex');
}

check('Study retains nonproduction label', report.productionReady === false);
check('Exact source triangle extraction, without fallback rays', report.projectionMisses === 0
  && report.projectionMethod.startsWith('Exact source triangle extraction'));
check('Source vertices preserved', report.extraction.sourceVertexErrorMeters <= 1e-7);
check('Neutral binding drift below 1 micrometer', report.neutralMaxDriftMeters <= 1e-6);
check('Control cage contains quad joint rings', report.cageQuadFaces >= 300);
for (const source of [report.source, report.reduced]) {
  check(`Recorded input hash: ${path.basename(source.path)}`, await sha256(source.path) === source.sha256);
}
const keys = ['TEST_Head_Yaw_30', 'TEST_Head_Pitch_15'];
for (const name of keys) {
  const pose = report.deformations[name];
  check(`${name}: finite, moving geometry`, pose?.nonFiniteVertices === 0 && pose.movedVertices > 1000);
  check(`${name}: no newly collapsed triangles`, pose?.collapsedTriangles === 0);
  check(`${name}: no triangle normal reversals for these sub-90-degree poses`, pose?.normalReversals === 0);
  check(`${name}: central 98% edge stretch within 10%`, pose?.edgeStretchP01P50P99[0] >= .9
    && pose?.edgeStretchP01P50P99[2] <= 1.1);
}
for (const name of ['preserved-front', 'preserved-quarter', 'reduced-front', 'reduced-quarter', ...keys]) {
  const png = await readFile(path.join(directory, `${name}.png`));
  check(`${name}: complete PNG at expected dimensions`, png.subarray(0, 8).toString('hex') === '89504e470d0a1a0a'
    && png.readUInt32BE(16) === 896 && png.readUInt32BE(20) === 896 && png.length > 10000
    && png.subarray(-8, -4).toString() === 'IEND');
}
const verification = {
  productionReady: false,
  scope: 'Source extraction, rest binding and measured head proxy deformation only; visual approval and production gates remain separate',
  checks,
  passed: checks.every((entry) => entry.passed),
};
await writeFile(path.join(directory, 'verification.json'), `${JSON.stringify(verification, null, 2)}\n`);
console.log(JSON.stringify(verification, null, 2));
if (!verification.passed) process.exitCode = 1;
