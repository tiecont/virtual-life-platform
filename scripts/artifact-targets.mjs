import assert from 'node:assert/strict';
export function releaseTargets(schemaVersion){assert(schemaVersion===1||schemaVersion===2,'Unsupported artifact schema');return schemaVersion===1?['api','web']:['api','web','admin'];}
export function releasePayloadFiles(schemaVersion){return ['release.json','quality-proof.json','image-checks.json',...releaseTargets(schemaVersion).flatMap(target=>[target+'-sbom.cdx.json',target+'-provenance.json'])];}
