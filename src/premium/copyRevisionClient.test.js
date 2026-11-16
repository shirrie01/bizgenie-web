// @vitest-environment node
import {expect,it,vi} from 'vitest';
import {saveCopyRevision} from './campaignManagementClient';
const args={apiBaseUrl:'http://api.test',accessToken:'synthetic',scope:{tenantId:'t',projectId:'p'},campaign:{campaign_id:'c',version:4},variant:{variant_id:'v',current_revision_id:'r'},content:{title:null,body:'Draft\nCTA: Call',caption:null,alt_text:null}};
it('copy retries use same intent/version key and never submit media references or approval state',async()=>{
 const fetchImpl=vi.fn().mockResolvedValue({ok:true,status:200,json:async()=>({campaign:{campaign_id:'c',version:5}})});
 await saveCopyRevision({...args,fetchImpl});await saveCopyRevision({...args,fetchImpl});const body=JSON.parse(fetchImpl.mock.calls[0][1].body);expect(fetchImpl.mock.calls[0][0]).toBe('http://api.test/customer/campaigns/c/variants/v/revisions');expect(body).toMatchObject({expected_campaign_version:4,revision_id:'r',tenant_id:'t',project_id:'p'});expect(body.idempotency_key).toBe(JSON.parse(fetchImpl.mock.calls[1][1].body).idempotency_key);expect(body.content).not.toHaveProperty('asset_refs');expect(body).not.toHaveProperty('approved');
});
it('bad content is rejected before fetch; stale and lost-response errors remain truthful',async()=>{
 const fetchImpl=vi.fn();await expect(saveCopyRevision({...args,content:{...args.content,asset_refs:[]},fetchImpl})).rejects.toMatchObject({kind:'invalid'});expect(fetchImpl).not.toHaveBeenCalled();
 await expect(saveCopyRevision({...args,fetchImpl:vi.fn().mockResolvedValue({ok:false,status:409,json:async()=>({error:{code:'VERSION_CONFLICT'}})})})).rejects.toMatchObject({kind:'conflict'});
 await expect(saveCopyRevision({...args,fetchImpl:vi.fn().mockRejectedValue(Error('network'))})).rejects.toMatchObject({kind:'unconfirmed'});
});
it('copy editing requires verified capability and stays off behind the unchanged R1 bridge',async()=>{
 const {featureAvailability}=await import('./featureGate');
 expect(featureAvailability('copyEditing',{}).enabled).toBe(false);
 const sha='a'.repeat(40),env={VITE_COPY_EDIT_API:'true',VITE_API_SOURCE_SHA:sha,VITE_API_SERVING_REVISION:'synthetic',VITE_API_ROUTE_LIMITS:'bridge-v1'};
 const manifest={schema:1,revisions:[{sourceSha:sha,servingRevision:'synthetic',verifiedAt:'2026-11-16T12:00:00Z',evidence:'https://example.test/accepted',capabilities:{copyRevisions:true}}]};
 expect(featureAvailability('copyEditing',env,{manifest,mode:'production'}).enabled).toBe(false);
});
