import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
// Fixed source path: neither a request path nor an external URL can reach the FS.
// Keep unapproved concept media out of public/ and Next static image imports.
export function readWorldConcept(){return readFile(join(process.cwd(),'features/prelaunch/modules/site/infrastructure/world-concept.webp'));}
