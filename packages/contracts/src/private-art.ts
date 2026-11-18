import {z} from 'zod';

const hash=z.string().regex(/^[a-f0-9]{64}$/),id=z.string().regex(/^[a-z0-9][a-z0-9-]{0,63}$/);
const path=z.string().max(240).regex(/^[a-zA-Z0-9][a-zA-Z0-9._-]*(\/[a-zA-Z0-9][a-zA-Z0-9._-]*)*$/);
const types={'.png':'image/png','.webp':'image/webp','.glb':'model/gltf-binary','.blend':'application/x-blender','.fbx':'application/vnd.autodesk.fbx','.mp4':'video/mp4','.wav':'audio/wav'};
export const PrivateArtFileSchema=z.strictObject({path,bytes:z.number().int().positive().max(256*1024*1024),sha256:hash,mime:z.enum(['image/png','image/webp','model/gltf-binary','application/x-blender','application/vnd.autodesk.fbx','video/mp4','audio/wav'])}).refine(file=>Object.entries(types).some(([ext,mime])=>file.path.endsWith(ext)&&file.mime===mime));
// Intake is an unverified declaration. It grants neither art acceptance nor an
// object capability; credentials, provider URLs and review receipts are absent.
export const PrivateArtMetadataSchema=z.strictObject({characterId:id,designRevision:id,manifestSha256:hash,provenanceSha256:hash,file:PrivateArtFileSchema});
export const PrivateArtIntakeSchema=z.strictObject({requestId:z.uuid().transform(value=>value.toLowerCase()),metadata:PrivateArtMetadataSchema});
export const PrivateArtQuerySchema=z.strictObject({draftId:z.uuid().transform(value=>value.toLowerCase())});
export const PrivateArtDraftSchema=z.strictObject({draftId:z.uuid(),metadata:PrivateArtMetadataSchema,createdAt:z.iso.datetime(),publication:z.literal('UNPUBLISHED'),artGate:z.literal('NOT_REVIEWED'),contentVerification:z.literal('UNVERIFIED')});
export type PrivateArtMetadata=z.infer<typeof PrivateArtMetadataSchema>;
