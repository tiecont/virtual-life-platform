import {adminConfig,createAdminHandler} from '../../../../server/proxy';
export const runtime='nodejs';
export const dynamic='force-dynamic';
const handler=createAdminHandler(adminConfig(process.env));
export const GET=handler;
export const POST=handler;
