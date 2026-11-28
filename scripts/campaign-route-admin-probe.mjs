import assert from 'node:assert/strict';
import {join} from 'node:path';

const first='recruit-fire-coalwhisk';
const next='recruit-fire-emberloom';

export async function verifyCampaignRouteAdmin({
 page,expect,artifact,installed,dbConfig,dbActive,validator,ruleset,mark,clickMutation,button,versionRow,activeEntry,auditSection,
 refreshOperatorVerification,
}){
 const baseline=await dbConfig(installed.version);
 assert.equal(baseline.bundle.schemaVersion,7);
 const routes=baseline.bundle.campaignRoutes;
 assert.equal(routes.length,48);
 assert.ok(routes.every(route=>!route.enabled));
 const editor=page.locator('section').filter({has:page.getByRole('heading',{name:'Map encounter routes',exact:true})}).last();
 const selection=editor.getByRole('combobox',{name:'Encounter route',exact:true});
 const prior=editor.getByRole('combobox',{name:'Prior clear',exact:true});
 const mode=editor.getByRole('combobox',{name:'Admission',exact:true});
 const enabled=editor.getByRole('checkbox',{name:'Enable encounter on publication',exact:true});
 const recruit=editor.getByRole('checkbox',{name:'Recruit fire-emberloom on first qualifying clear',exact:true});
 await expect(selection.locator('option')).toHaveCount(48);
 await expect(enabled).toBeDisabled();

 const created=await clickMutation('New draft from active','draft');
 await expect(page.getByRole('heading',{name:'Version '+created.version+' · DRAFT',exact:true})).toBeVisible();
 await selection.selectOption(first);
 await expect(prior).toBeEnabled();
 await prior.selectOption(next); // Together with Emberloom's authored prior, this creates a cycle.
 const rejected=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/gameplay-config-validate')
  &&response.request().method()==='POST');
 await button('Save and validate').click();
 assert.equal((await rejected).status(),422);
 assert.equal((await dbActive()).version,installed.version);
 await expect(prior).toBeEnabled();
 assert.equal((await dbConfig(created.version)).state,'DRAFT');

 await prior.selectOption('');
 await enabled.check();
 await selection.selectOption(next);
 await expect(prior).toHaveValue(first);
 await mode.selectOption('either');
 await enabled.check();
 await expect(recruit).toBeChecked();
 await recruit.uncheck();

 const authored=routes.find(route=>route.id===next);
 const edited={
  maxHp:authored.profile.maxHp+7,
  attack:authored.profile.attack+1,
  defense:authored.profile.defense+1,
  requiredRoomPoints:authored.profile.requiredRoomPoints+37,
 };
 for(const [label,key] of [['Opponent max HP','maxHp'],['Opponent attack','attack'],['Opponent defense','defense'],['Host achievement points','requiredRoomPoints']]){
  const input=editor.getByLabel(label,{exact:true});
  await input.fill(String(edited[key]));
  await expect(input).toHaveValue(String(edited[key]));
 }
 const payoutEdits=[
  {payout:'firstClear',group:'First route victory',label:'Achievement Points',key:'achievementPoints',delta:5},
  {payout:'firstClear',group:'First route victory',label:'Coins',key:'coins',delta:11},
  {payout:'repeatClear',group:'Repeat route victory',label:'Pet EXP',key:'exp',delta:9},
  {payout:'defeat',group:'Route defeat',label:'Artifact materials',key:'materials',delta:2},
 ].map(edit=>({...edit,value:authored.profile.rewardPolicy[edit.payout][edit.key]+edit.delta}));
 const rewardField=({group,label})=>editor.getByRole('group',{name:group,exact:true}).getByLabel(label,{exact:true});
 for(const edit of payoutEdits){
  const field=rewardField(edit);
  await field.fill(String(edit.value));
  await expect(field).toHaveValue(String(edit.value));
 }
 const victoryActions=editor.getByRole('group',{name:'Route minimum committed combat actions',exact:true})
  .getByLabel('Victory actions',{exact:true});
 const rewardMinimum=authored.profile.rewardPolicy.minimumActions.victory+1;
 await victoryActions.fill(String(rewardMinimum));
 await expect(victoryActions).toHaveValue(String(rewardMinimum));
 await editor.screenshot({path:join(artifact,'campaign-route-draft.png')});
 await button('Compare with active').click();
 await expect(page.getByRole('heading',{name:'Differences from active'})).toBeVisible();

 const validated=await clickMutation('Save and validate','validate');
 await expect(page.getByRole('heading',{name:'Version '+created.version+' · VALIDATED',exact:true})).toBeVisible();
 const publication=await clickMutation('Publish validated version','publish');
 await expect(page.getByRole('heading',{name:'Version '+created.version+' · PUBLISHED',exact:true})).toBeVisible();
 await expect(enabled).toBeDisabled();
 await selection.selectOption(next);
 await expect(prior).toHaveValue(first);
 await expect(mode).toHaveValue('either');
 await expect(recruit).not.toBeChecked();
 for(const edit of payoutEdits){
  await expect(rewardField(edit)).toHaveValue(String(edit.value));
  await expect(rewardField(edit)).toBeDisabled();
 }
 await expect(victoryActions).toHaveValue(String(rewardMinimum));
 await expect(victoryActions).toBeDisabled();
 await editor.screenshot({path:join(artifact,'campaign-route-published.png')});

 const saved=await dbConfig(created.version);
 const expected=globalThis.structuredClone(baseline.bundle);
 expected.campaignRoutes.find(route=>route.id===first).enabled=true;
 const nextRoute=expected.campaignRoutes.find(route=>route.id===next);
 Object.assign(nextRoute,{enabled:true,mode:'either'});
 Object.assign(nextRoute.profile,edited);
 for(const {payout,key,value} of payoutEdits)nextRoute.profile.rewardPolicy[payout][key]=value;
 nextRoute.profile.rewardPolicy.minimumActions.victory=rewardMinimum;
 delete nextRoute.profile.rewardPolicy.recruitmentPetIds;
 assert.deepEqual(saved.bundle,expected);
 const verified=await validator.validate(ruleset,saved.bundle);
 assert.equal(verified.engineCapability,'arena8-coop-v6');
 assert.equal(saved.content_digest,verified.digest);
 assert.equal(validated.contentDigest,verified.digest);
 assert.equal(publication.contentDigest,verified.digest);
 assert.deepEqual(await dbActive(),{version:created.version,revision:publication.activeRevision});

 // Qualification can outlast the operator's five-minute elevation. Use
 // the same fresh MFA step an operator uses before a sensitive rollback.
 await refreshOperatorVerification();
 await expect(page.getByRole('heading',{name:'Version '+created.version+' · PUBLISHED',exact:true})).toBeVisible();
 const rolled=await clickMutation('Roll back','rollback',versionRow(installed.version));
 await expect(activeEntry('Digest')).toHaveAttribute('title',installed.digest);
 assert.deepEqual(await dbActive(),{version:installed.version,revision:rolled.activeRevision});
 const restored=await dbConfig(installed.version);
 assert.deepEqual(restored.bundle,baseline.bundle);
 // Rollback moves the active pointer to an immutable published version.
 assert.equal(restored.state,'SUPERSEDED');
 const historical=await dbConfig(created.version);
 assert.equal(historical.state,'PUBLISHED');
 assert.equal(historical.content_digest,verified.digest);
 assert.deepEqual(historical.bundle,expected);

 const request=page.waitForResponse(response=>new URL(response.url()).pathname.endsWith('/gameplay-config-audit'));
 await button('Load audit',auditSection()).click();
 assert.equal((await request).status(),200);
 for(const [name,version] of [['publish',created.version],['rollback',installed.version]]){
  const record=auditSection().locator('tbody tr').filter({has:page.getByRole('cell',{name,exact:true})})
   .filter({has:page.locator('td:nth-child(3)').filter({hasText:new RegExp('^'+version+'$')})});
  await expect(record).toHaveCount(1);
 }
 mark('Chromium authored and rolled back schema 7 routes through authenticated Admin, Nest, Rust and PostgreSQL',{
  routeCount:routes.length,rejectedCyclicPrerequisite:422,route:next,profile:edited,rewardPolicy:nextRoute.profile.rewardPolicy,
  prerequisite:first,mode:'either',recruitmentEnabled:false,publishedVersion:created.version,
  publishedDigest:verified.digest,restoredVersion:installed.version,restoredDigest:installed.digest,
  activationScope:'disposable PostgreSQL only',
 });
}
