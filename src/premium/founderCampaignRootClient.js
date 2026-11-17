// R2 acceptance only: one fixed server-pinned intent; no content-item or provider call.
export const FOUNDER_CAMPAIGN_KEY='bg-r2-founder-campaign-v1';
export function createFounderCampaignRootClient(){
 let pending=null;
 return async function save({apiBaseUrl,accessToken,session,recommendation,fetchImpl=(...a)=>fetch(...a)}){
  if(session?.status!=='ready'||!accessToken)throw Error('Sign in again before creating the campaign.');
  const p=recommendation?.create_campaign_payload;
  if(!p||!recommendation.recommendation_id||recommendation.brand_id!==session.brandId)throw Error('Reload the accepted recommendation for this workspace.');
  const body={tenant_id:session.tenantId,project_id:session.projectId,brand_id:session.brandId,name:p.name,goal:p.goal,display_timezone:p.display_timezone,idempotency_key:FOUNDER_CAMPAIGN_KEY};
  if(Object.values(body).some(v=>typeof v!=='string'||!v.trim()))throw Error('The accepted campaign details are incomplete.');
  const intent=JSON.stringify(body),headers={authorization:`Bearer ${accessToken}`,'content-type':'application/json'};
  if(pending&&pending!==intent)throw Error('The earlier campaign save is unconfirmed. Keep its original details before retrying.');
  pending=intent;
  const reconcile=async()=>{try{const q=new URLSearchParams({tenant_id:body.tenant_id,project_id:body.project_id});await fetchImpl(`${apiBaseUrl}/customer/campaigns?${q}`,{method:'GET',headers:{authorization:headers.authorization}});}catch{} };
  let response;
  try{response=await fetchImpl(`${apiBaseUrl}/customer/campaigns`,{method:'POST',headers,body:intent});}
  catch{await reconcile();throw Error('Campaign save unconfirmed. No second request was sent. Retry the same saved details to recover it safely.');}
  if(!response.ok){if(response.status>=500){await reconcile();throw Error('Campaign save unconfirmed. Retry the same saved details; its request key will not change.');}throw Error(response.status===401?'Sign in again; keep the same campaign details.':response.status===409?'The saved campaign request conflicts. Stop and check the existing campaign.':'Campaign creation is unavailable. Nothing else was requested.');}
  let result;try{result=await response.json();}catch{await reconcile();throw Error('Campaign save unconfirmed. Retry the same details safely.');}
  const c=result?.campaign;
  if(response.status!==201||!c?.campaign_id||!Number.isInteger(result?.result?.campaign_version)||['tenant_id','project_id','brand_id'].some(k=>c[k]!==body[k]))throw Error('Campaign save could not be verified for this workspace. Stop and check the saved campaign.');
  pending=null;return c;
 };
}
