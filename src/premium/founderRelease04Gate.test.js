import {describe,it,expect} from 'vitest';
import {featureAvailability,BRIDGE_V1_NOT_CARRIED} from './featureGate';
import {API_COMPATIBILITY} from './apiCompatibility';
const sha='a'.repeat(40),revision='synthetic-reviewed-revision';
const base={VITE_COPY_EDIT_API:'true',VITE_API_SOURCE_SHA:sha,VITE_API_SERVING_REVISION:revision,VITE_API_ROUTE_LIMITS:'bridge-founder-release04'};
const manifest={schema:1,revisions:[{sourceSha:sha,servingRevision:revision,verifiedAt:'2026-11-24T00:00:00Z',evidence:'https://github.com/shirrie01/bizgenie-api/issues/191#issuecomment-123',capabilities:{copyRevisions:true,billingManagement:true,learning:true}}]};
const options={manifest,mode:'production'};
describe('separate founder release04 route profile',()=>{
 it('legacy bridge-v1 still blocks copy even if API capability exists',()=>{
  expect(BRIDGE_V1_NOT_CARRIED).toContain('copyEditing');
  expect(featureAvailability('copyEditing',{...base,VITE_API_ROUTE_LIMITS:'bridge-v1'},options)).toMatchObject({enabled:false,state:'not_carried_by_bridge'});
 });
 it('new profile needs explicit flag plus exact independently verified serving manifest',()=>{
  expect(featureAvailability('copyEditing',base,options)).toMatchObject({enabled:true,state:'verified'});
  expect(featureAvailability('copyEditing',{...base,VITE_COPY_EDIT_API:'false'},options).enabled).toBe(false);
  expect(featureAvailability('copyEditing',base,{...options,manifest:{schema:1,revisions:[]}}).enabled).toBe(false);
  expect(featureAvailability('copyEditing',{...base,VITE_API_SERVING_REVISION:'unverified'},options).enabled).toBe(false);
 });
 it('new profile does not expose unrelated billing management or analytics',()=>{
  for(const [feature,flag] of [['billingManagement','VITE_BILLING_MANAGEMENT_API'],['analytics','VITE_ANALYTICS_API']])
   expect(featureAvailability(feature,{...base,[flag]:'true'},options)).toMatchObject({enabled:false,state:'not_carried_by_bridge'});
 });
});

it('W1 leaves the shipped manifest empty and copy/planner/social/paid capabilities OFF without verified serving evidence',()=>{
 expect(API_COMPATIBILITY.revisions).toEqual([]);
 for(const [feature,flag]of [['copyEditing','VITE_COPY_EDIT_API'],['contentPlan','VITE_CONTENT_PLAN_API'],['social','VITE_SOCIAL_ACCOUNTS_API'],['generationQuote','VITE_GENERATION_QUOTE_API']])
  expect(featureAvailability(feature,{...base,[flag]:'true'},{mode:'production'}).enabled).toBe(false);
});
