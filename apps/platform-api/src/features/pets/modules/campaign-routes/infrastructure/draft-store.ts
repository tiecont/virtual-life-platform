import type {PoolClient} from 'pg';
import {campaignRouteDraftDigest, readCampaignRouteDraft} from '../domain/route-draft';

type Queryable=Pick<PoolClient,'query'>;
type DraftRow={version:string;content_digest:string;source_revision:string;draft:unknown};

export class CampaignRouteDraftStore {
  constructor(private readonly db:Queryable){}

  async insert(input:unknown, sourceRevision:string){
    const draft=readCampaignRouteDraft(input);
    if(!/^[0-9a-f]{40}$/.test(sourceRevision))throw new Error('Route draft source revision is required');
    const digest=campaignRouteDraftDigest(draft);
    await this.db.query('INSERT INTO pet_arena_campaign_route_drafts(content_digest,source_revision,draft) '+
      'VALUES($1,$2,$3) ON CONFLICT(content_digest) DO NOTHING',[digest,sourceRevision,draft]);
    const result=await this.read('content_digest',digest);
    if(!result)throw new Error('Route draft was not saved');
    return result;
  }

  async version(version:number){
    if(!Number.isSafeInteger(version)||version<1)throw new Error('Invalid route draft version');
    return this.read('version',version);
  }

  private async read(field:'content_digest'|'version',value:string|number){
    const row=(await this.db.query<DraftRow>(
      `SELECT version,content_digest,source_revision,draft FROM pet_arena_campaign_route_drafts WHERE ${field}=$1`,[value],
    )).rows[0];
    if(!row)return undefined;
    const draft=readCampaignRouteDraft(row.draft);
    if(campaignRouteDraftDigest(draft)!==row.content_digest)throw new Error('Route draft digest mismatch');
    return {version:Number(row.version),digest:row.content_digest,sourceRevision:row.source_revision,draft};
  }
}
