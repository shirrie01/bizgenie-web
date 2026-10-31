import {test,expect} from '@playwright/test';
test('six-step business-neutral onboarding and workspace navigation',async({page})=>{
 const outbound=[];page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4178/'))outbound.push(r.url())});
 await page.goto('/studio-preview/v3/');
 await expect(page.getByRole('heading',{name:'Your next chapter in marketing starts here.'})).toBeVisible();
 await page.locator('#next').click();
 await page.locator('#next').click();
 await expect(page.locator('#business-error')).toContainText('Please enter');
 await page.locator('#business-input').fill('Wow Charity <script>alert(1)</script>');
 await page.locator('#next').click();
 await page.getByRole('button',{name:/Increase repeat purchases/}).click();
 await page.locator('#next').click();
 await expect(page.locator('.identity h2')).toHaveText('Wow Charity <script>alert(1)</script>');
 await page.locator('#next').click();
 await page.getByRole('button',{name:/LinkedIn/}).click();
 await page.locator('#next').click();
 await expect(page.locator('#step-content')).toContainText('Increase repeat purchases');
 await expect(page.locator('#step-content')).not.toContainText('Make a splash');
 await expect(page.locator('#step-content')).not.toContainText('BRAND IDEA');
 await page.locator('#next').click();
 await expect(page.getByRole('heading',{name:/Your growth plan/})).toBeVisible();
 await page.getByRole('button',{name:/Explore campaign concepts/}).click();
 await expect(page.getByRole('heading',{name:/Make every campaign/})).toBeVisible();
 await page.getByRole('button',{name:/Plan in calendar/}).click();
 await expect(page.getByRole('heading',{name:/A clear view/})).toBeVisible();
 expect(outbound).toEqual([]);
});
test('responsive page width, no external calls and fixture labelling',async({page})=>{
 await page.goto('/studio-preview/v3/');
 const widths=await page.evaluate(()=>({document:document.documentElement.scrollWidth,viewport:innerWidth}));
 expect(widths.document).toBeLessThanOrEqual(widths.viewport+1);
 await page.locator('#next').click();
 await expect(page.locator('#step-content')).toContainText('No website scanned');
});
test('campaign proposal is a reviewable, honest brief with next steps and no publishing implication',async({page})=>{
 const outbound=[];page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4178/'))outbound.push(r.url())});
 await page.goto('/studio-preview/v3/');
 await page.locator('#next').click();
 await page.locator('#business-input').fill('Wow Partners <b>x</b>');
 await page.locator('#next').click();
 await page.getByRole('button',{name:/Build brand awareness/}).click();
 await page.locator('#next').click();await page.locator('#next').click();
 await page.getByRole('button',{name:/LinkedIn/}).click();
 await page.locator('#next').click();
 const step=page.locator('#step-content');
 await expect(page.getByRole('heading',{name:/campaign direction to review/i})).toBeVisible();
 await expect(step.locator('.proposal-title')).toHaveText('A clear next step for Wow Partners <b>x</b>.');
 await expect(step.locator('.proposal-title b')).toHaveCount(0);
 for(const [label,status] of [['Business','Your input'],['Goal','Your choice'],['Channels','For planning only'],['Audience','To confirm'],['Content','Not started'],['Timeline','Not scheduled']]){
  await expect(step.locator('.basis-row',{has:page.locator('dt',{hasText:new RegExp('^'+label+'$')})})).toContainText(status);
 }
 await expect(step.locator('.basis-row',{hasText:'Goal'})).toContainText('Build brand awareness');
 await expect(step.locator('.basis-channels')).toContainText('LinkedIn');
 await expect(page.getByRole('list',{name:'What happens next'}).getByRole('listitem')).toHaveCount(4);
 await expect(step).toContainText('Approval records your decision; it does not publish');
 await expect(step).toContainText('Approval never publishes automatically');
 await expect(step).not.toContainText('Make a splash');
 await expect(step).not.toContainText('12 assets');
 await expect(page.locator('#next')).toHaveText(/Approve brief and explore workspace/);
 const w=await page.evaluate(()=>({d:document.documentElement.scrollWidth,v:innerWidth}));
 expect(w.d).toBeLessThanOrEqual(w.v+1);
 expect(outbound).toEqual([]);
});
test('proposal sector illustration styles are clearly labelled as illustrative and keyboard operable',async({page})=>{
 await page.goto('/studio-preview/v3/');
 await page.locator('#next').click();
 await page.locator('#business-input').fill('Harbour Partners');
 for(let i=0;i<4;i++)await page.locator('#next').click();
 await expect(page.locator('#step-content')).toContainText('No imagery, colours or claims have been invented');
 const select=page.getByLabel('Illustration style for your sector');
 await select.selectOption('charity');
 await expect(page.locator('.proposal-title')).toHaveText('Every act makes a difference.');
 await expect(page.locator('.demo-note')).toContainText('not your business and not a generated creative');
 await expect(select).toBeFocused();
 await select.selectOption('neutral');
 await expect(page.locator('.proposal-title')).toHaveText('A clear next step for Harbour Partners.');
});
const toStep=async(page,n)=>{for(let i=0;i<n;i++){const b=page.locator('#business-input');if(await b.count()&&!(await b.inputValue()))await b.fill('Harbour Community Trust');await page.locator('#next').click()}};
test('welcome states the control promise and the progress bar is accessible navigation',async({page})=>{
 await page.goto('/studio-preview/v3/');
 await expect(page.locator('#step-content')).toContainText('No publishing without your approval');
 await expect(page.locator('#stepbar button')).toHaveCount(6);
 await expect(page.locator('#stepbar [aria-current="step"]')).toHaveAttribute('aria-label',/Step 1 of 6: Welcome/);
 await expect(page.locator('#stepbar button').nth(3)).toBeDisabled();
 await toStep(page,3);
 await expect(page.locator('#stepbar [aria-current="step"]')).toHaveAttribute('aria-label',/Step 4 of 6: Brand/);
 await page.locator('#stepbar button').nth(1).click();
 await expect(page.locator('#business-input')).toHaveValue('Harbour Community Trust');
 await expect(page.locator('#stepbar [aria-current="step"]')).toHaveAttribute('aria-label',/Step 2 of 6: Business/);
});
test('business discovery never simulates import and shows an honest live profile',async({page})=>{
 await page.goto('/studio-preview/v3/');await page.locator('#next').click();
 const imp=page.getByRole('button',{name:/Import from website/});
 await expect(imp).toBeDisabled();await expect(imp).toContainText('not available yet');
 await expect(page.locator('.planned .status')).toHaveCount(5);
 await expect(page.locator('#step-content')).toContainText('Nothing is scanned today');
 await page.locator('#business-input').fill('Acme <img src=x onerror=alert(1)>');
 await page.locator('#website-input').fill('https://example.org');
 await expect(page.locator('#profile-summary')).toContainText('Acme <img src=x onerror=alert(1)>');
 await expect(page.locator('#profile-summary img')).toHaveCount(0);
 await expect(page.locator('#profile-summary')).toContainText('Your input · not verified');
 await expect(page.locator('#profile-summary')).toContainText('Not provided');
});
test('goal cards include an honest not-sure path that flows into the proposal',async({page})=>{
 await page.goto('/studio-preview/v3/');await toStep(page,2);
 await expect(page.getByRole('group',{name:'Primary goal'}).getByRole('button')).toHaveCount(7);
 await page.getByRole('button',{name:/Not sure yet/}).click();
 await expect(page.getByRole('button',{name:/Not sure yet/})).toHaveAttribute('aria-pressed','true');
 await toStep(page,3);
 const goalRow=page.locator('.basis-row',{has:page.locator('dt',{hasText:/^Goal$/})});
 await expect(goalRow).toContainText('To be defined with you');await expect(goalRow).toContainText('To confirm');
});
test('brand setup is user-entered only: no upload, bounded colours and messages, XSS-safe, feeds the proposal',async({page})=>{
 await page.goto('/studio-preview/v3/');await toStep(page,3);
 await expect(page.getByRole('button',{name:/Upload logo/})).toBeDisabled();
 await expect(page.locator('#step-content')).toContainText('No logo has been supplied or verified');
 const add=page.getByRole('button',{name:'Add a colour'});
 for(let i=0;i<5;i++)await add.click();
 await expect(page.locator('.swatch')).toHaveCount(5);await expect(add).toBeDisabled();
 await page.getByRole('button',{name:'Remove brand colour 5'}).click();
 await expect(page.locator('.swatch')).toHaveCount(4);await expect(add).toBeEnabled();
 await page.locator('#message-input').fill('<img src=x onerror=alert(1)>');await page.keyboard.press('Enter');
 await page.locator('#message-input').fill('Free weekly meals');await page.getByRole('button',{name:'Add message'}).click();
 await expect(page.locator('.chips .chip')).toHaveCount(2);await expect(page.locator('.chips img')).toHaveCount(0);
 await page.getByRole('button',{name:'Remove message Free weekly meals'}).click();
 await expect(page.locator('.chips .chip')).toHaveCount(1);
 await page.locator('#voice-select').selectOption('Calm and expert');
 await toStep(page,2);
 await expect(page.locator('.basis-row',{has:page.locator('dt',{hasText:/^Brand voice$/})})).toContainText('Calm and expert');
 await expect(page.locator('.basis-row',{has:page.locator('dt',{hasText:/^Key messages$/})})).toContainText('<img src=x onerror=alert(1)>');
 await expect(page.locator('.basis img')).toHaveCount(0);
});
test('channels separate selection from connection and never claim a connected account',async({page})=>{
 const outbound=[];page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4178/'))outbound.push(r.url())});
 await page.goto('/studio-preview/v3/');await toStep(page,4);
 await expect(page.locator('.channel-card')).toHaveCount(6);
 const connect=page.getByRole('button',{name:'Connect account (not available yet)'});
 await expect(connect).toHaveCount(6);for(const b of await connect.all())await expect(b).toBeDisabled();
 await expect(page.locator('.channel-card .status',{hasText:/^Not connected$/})).toHaveCount(6);
 await expect(page.locator('.channel-card .status',{hasText:/^Connected$/})).toHaveCount(0);
 await page.getByRole('button',{name:/TikTok/}).click();
 await expect(page.locator('.channel-card.on')).toHaveCount(3);
 await expect(page.locator('#step-content')).toContainText('never publish without your approval');
 expect(outbound).toEqual([]);
});
test('every enabled interactive control on the six onboarding steps meets the 24px target size',async({page})=>{
 await page.goto('/studio-preview/v3/');
 const small=[];
 for(let i=1;i<=6;i++){
  if(i===2)await page.locator('#business-input').fill('Harbour Community Trust');
  if(i===4){await page.getByRole('button',{name:'Add a colour'}).click();await page.locator('#message-input').fill('Free weekly meals for everyone in the neighbourhood');await page.keyboard.press('Enter');}
  const found=await page.evaluate(()=>[...document.querySelectorAll('main button,main a,main input,main select,main textarea,#stepbar button')].filter(e=>!e.disabled).map(e=>{const r=e.getBoundingClientRect();return {w:r.width,h:r.height,n:(e.getAttribute('aria-label')||e.textContent||e.id||e.tagName).trim().slice(0,40)}}).filter(x=>x.w>0&&(x.w<24||x.h<24)));
  small.push(...found.map(x=>`step ${i}: ${x.n} ${Math.round(x.w)}x${Math.round(x.h)}`));
  if(i<6)await page.locator('#next').click();
 }
 expect(small).toEqual([]);
});
test('proposal hero artwork never overlaps its label or headline at any width',async({page})=>{
 await page.goto('/studio-preview/v3/');
 await page.locator('#next').click();
 await page.locator('#business-input').fill('Harbour Community Trust and Neighbourhood Kitchen Partnership');
 for(let i=0;i<4;i++)await page.locator('#next').click();
 for(const style of ['neutral','charity','takeaway']){
  await page.getByLabel('Illustration style for your sector').selectOption(style);
  const hit=await page.evaluate(()=>{const box=s=>document.querySelector(s).getBoundingClientRect();const a=box('.proposal-hero .art-symbol');return ['.proposal-hero .art-kicker','.proposal-hero .proposal-title'].some(s=>{const b=box(s);return a.left<b.right&&a.right>b.left&&a.top<b.bottom&&a.bottom>b.top})});
  expect(hit,style).toBe(false);
 }
});

test('onboarding is a focused standalone flow; the workspace rail returns afterwards',async({page})=>{
 await page.goto('/studio-preview/v3/');
 const rail=page.getByRole('navigation',{name:'Studio sections'});
 for(let i=0;i<6;i++){
  await expect(rail).toBeHidden();
  await expect(page.locator('.brand:visible')).toHaveCount(1);
  if(i===1)await page.locator('#business-input').fill('Harbour Community Trust');
  if(i<5)await page.locator('#next').click();
 }
 await page.locator('#next').click();
 await expect(page.getByRole('heading',{name:/Your growth plan/})).toBeVisible();
 const w=await page.evaluate(()=>innerWidth);
 if(w>850)await expect(rail).toBeVisible();
 await expect(page.locator('body')).not.toHaveClass(/\bob\b/);
});
test('goals keep all original options and add online sales and a specific promotion',async({page})=>{
 await page.goto('/studio-preview/v3/');await toStep(page,2);
 const group=page.getByRole('group',{name:'Primary goal'});
 for(const name of ['Get more customers','Increase online sales','Increase repeat purchases','Build brand awareness','Launch a product or service','Support a specific promotion','Not sure yet'])await expect(group.getByRole('button',{name:new RegExp(name)})).toHaveCount(1);
 await group.getByRole('button',{name:/Support a specific promotion/}).click();
 await expect(group.getByRole('button',{name:/Support a specific promotion/})).toHaveAttribute('aria-pressed','true');
 await toStep(page,3);
 await expect(page.locator('.basis-row',{has:page.locator('dt',{hasText:/^Goal$/})})).toContainText('Support a specific promotion');
});
test('welcome shows original multi-industry illustrations, honestly labelled, and the proposal offers more demo styles',async({page})=>{
 await page.goto('/studio-preview/v3/');
 const list=page.getByRole('list',{name:/examples of sectors/i});
 await expect(list.getByRole('listitem')).toHaveCount(5);
 for(const label of ['Aesthetics','Vehicle leasing','Fragrance','Drinks','Charities'])await expect(list).toContainText(label);
 await expect(page.locator('#step-content')).toContainText('not photographs, not generated for your business');
 await expect(list.locator('img')).toHaveCount(0);
 await page.locator('#next').click();await page.locator('#business-input').fill('Harbour');
 for(let i=0;i<4;i++)await page.locator('#next').click();
 const select=page.getByLabel('Illustration style for your sector');
 await select.selectOption('leasing');
 await expect(page.locator('.proposal-title')).toHaveText('A clearer way to lease.');
 await expect(page.locator('.demo-note')).toContainText('not your business and not a generated creative');
 await select.selectOption('perfume');
 await expect(page.locator('.proposal-title')).toHaveText('A signature worth remembering.');
});

// ---- BG-STUDIO-007-FE: industry-aware workspace regression ------------------------------------------------
import {signatureTerms} from './industry-profiles.js';
const SCENARIOS=[
 {sector:'leasing',business:'Northgate Vehicle Leasing',industry:'',label:'Vehicle leasing'},
 {sector:'perfume',business:'Maison Aurelle',industry:'Fragrance house',label:'Fragrance & perfume'},
 {sector:'aesthetics',business:'Clearskin Studio',industry:'Aesthetics clinic',label:'Aesthetics clinic'},
 {sector:'beverage',business:'Fonzo',industry:'Soft drinks',label:'Soft drinks & beverages'},
 {sector:'charity',business:'WOW Charity',industry:'',label:'Charity & community'},
 {sector:'neutral',business:'Harbour Partners',industry:'Business consulting',label:'Not specified'},
];
const esc=s=>s.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
const mentions=(text,term)=>new RegExp('\\b'+esc(term)+'\\b','i').test(text);
async function journey(page,{business,industry='',goal=/Get more customers/,channels=null}){
 await page.goto('/studio-preview/v3/');
 await page.locator('#next').click();
 await page.locator('#business-input').fill(business);
 if(industry)await page.locator('#industry-input').fill(industry);
 await page.locator('#next').click();
 await page.getByRole('button',{name:goal}).click();
 await page.locator('#next').click();await page.locator('#next').click();
 if(channels){for(const c of ['Instagram','TikTok','Facebook','LinkedIn','Email','Website']){const on=channels.includes(c);const btn=page.locator('.channel-choice',{hasText:new RegExp(c)});const pressed=(await btn.getAttribute('aria-pressed'))==='true';if(on!==pressed)await btn.click()}}
 await page.locator('#next').click();await page.locator('#next').click();
 await expect(page.locator('#home h1')).toBeVisible();
}
for(const s of SCENARIOS){
 test(`workspace for ${s.business} shows its own business and sector, and no other industry's fixture`,async({page})=>{
  const outbound=[],errors=[];
  page.on('request',r=>{if(!r.url().startsWith('http://127.0.0.1:4178/'))outbound.push(r.url())});
  page.on('pageerror',e=>errors.push(e.message));
  await journey(page,s);
  await expect(page.locator('#home h1')).toHaveText(`Your growth plan for ${s.business}.`);
  await expect(page.locator('#home-inputs')).toContainText(s.label);
  const sector=page.locator('#home-inputs .basis-row',{has:page.locator('dt',{hasText:/^Sector shown$/})});
  await expect(sector).toContainText(s.sector==='neutral'?'Not identified · neutral layout':'Inferred from what you typed');
  const home=(await page.locator('#home').innerText()).split(s.business).join(' ');
  for(const other of SCENARIOS.filter(o=>o.sector!==s.sector&&o.sector!=='neutral'))for(const term of signatureTerms(other.sector))expect(mentions(home,term),`${s.sector} workspace must not mention "${term}"`).toBe(false);
  if(s.business!=='Fonzo')expect(home).not.toMatch(/fonzo/i);
  await expect(page.locator('#home .v5-product-scene')).toHaveAttribute('aria-label',/Illustrative/);
  await expect(page.locator('#home .notice')).toContainText('no content is generated or published');
  if(s.sector==='beverage')await expect(page.locator('#home .v5-brand').first()).toHaveText('FONZO');
  else await expect(page.locator('#home .v5-brand')).toHaveCount(0);
  // Studio and Calendar follow the same business and sector.
  await page.locator('[data-view="studio"]:visible').first().click();
  await expect(page.locator('#studio-context')).toContainText(s.label.toLowerCase());
  await expect(page.locator('#studio-context')).toContainText(s.business);
  await expect(page.locator('#industry-fixture')).toHaveValue('');
  await expect(page.locator('#fixture-posts .post')).toHaveCount(2);
  // The sector <select> legitimately lists every sector, so scan the rendered concepts and context, not the control.
  const studio=((await page.locator('#studio-context').innerText())+' '+(await page.locator('#fixture-posts').innerText())).split(s.business).join(' ');
  for(const other of SCENARIOS.filter(o=>o.sector!==s.sector&&o.sector!=='neutral'))for(const term of signatureTerms(other.sector))expect(mentions(studio,term),`${s.sector} studio must not mention "${term}"`).toBe(false);
  await page.locator('[data-view="calendar"]:visible').first().click();
  expect(await page.locator('#calendar-grid .event').count()).toBe(5);
  const cal=await page.locator('#calendar-grid').innerText();
  for(const other of SCENARIOS.filter(o=>o.sector!==s.sector&&o.sector!=='neutral'))for(const term of signatureTerms(other.sector))expect(mentions(cal,term),`${s.sector} calendar must not mention "${term}"`).toBe(false);
  const w=await page.evaluate(()=>({d:document.documentElement.scrollWidth,v:innerWidth}));
  expect(w.d).toBeLessThanOrEqual(w.v+1);
  expect(outbound).toEqual([]);expect(errors).toEqual([]);
 });
}
test('the vehicle-leasing workspace never shows Fonzo, cans or flavour content (founder-reported defect)',async({page})=>{
 await journey(page,{business:'Northgate Vehicle Leasing'});
 const all=await page.locator('main').innerText();
 for(const term of ['Fonzo','FONZO','Zero sugar','Blue raspberry','Cherry cola','Mango','flavour','beverage'])expect(all.toLowerCase().includes(term.toLowerCase()),term).toBe(false);
 await expect(page.locator('#home .v5-can')).toHaveCount(0);
 await expect(page.locator('#home h1')).toHaveText('Your growth plan for Northgate Vehicle Leasing.');
});
test('an unrecognised industry gets a neutral, brand-safe workspace that says so',async({page})=>{
 await journey(page,{business:'Harbour Partners',industry:'Business consulting'});
 await expect(page.locator('#home .v5-hero-copy h2')).toContainText('A clear next step');
 await expect(page.locator('#home .v5-hero-copy h2')).toContainText('Harbour Partners');
 await expect(page.locator('#home-inputs')).toContainText('Not identified · neutral layout');
 const text=await page.locator('#home').innerText();
 for(const s of SCENARIOS.filter(o=>o.sector!=='neutral'))for(const term of signatureTerms(s.sector))expect(mentions(text.split('Harbour Partners').join(' '),term),term).toBe(false);
});
test('a missing business name falls back to neutral wording and a Missing status, never a demo brand',async({page})=>{
 await page.goto('/studio-preview/v3/');
 await page.locator('#next').click();await page.locator('#business-input').fill('x');await page.locator('#business-input').fill('');
 // Reach the workspace through the rail without ever entering a business name.
 await page.evaluate(()=>document.querySelector('[data-view="home"]').click());
 await expect(page.locator('#home h1')).toHaveText('Your growth plan.');
 await expect(page.locator('#home-inputs .basis-row',{has:page.locator('dt',{hasText:/^Business$/})})).toContainText('Missing');
 // textContent, not innerText: the hero status card is display:none on narrower screens but is still in the page.
 const text=await page.locator('#home').textContent();
 expect(text).not.toMatch(/fonzo/i);
 expect(text).toContain('First campaign');
 await expect(page.locator('#home .v5-brand')).toHaveCount(0);
});
test('goal and channel choices carry into the workspace and no unselected channel is invented',async({page})=>{
 await journey(page,{business:'Northgate Vehicle Leasing',goal:/Support a specific promotion/,channels:['LinkedIn']});
 await expect(page.locator('#home .v5-actions button').first()).toContainText('Promote your offer');
 await expect(page.locator('#home .v5-kpis .focus')).toContainText('Conversions');
 await expect(page.locator('#home .v5-chart > div')).toHaveCount(1);
 await expect(page.locator('#home .v5-chart')).toContainText('LinkedIn');
 const text=await page.locator('#home').innerText();
 for(const c of ['Instagram','TikTok','Facebook','Email'])expect(text.includes(c),c).toBe(false);
 await expect(page.locator('#home-inputs')).toContainText('Support a specific promotion');
 await expect(page.locator('#home-inputs')).toContainText('For planning only');
});
test('with no channel selected the workspace and studio say so instead of inventing channels',async({page})=>{
 await journey(page,{business:'Northgate Vehicle Leasing',channels:[]});
 await expect(page.locator('#home .v5-social')).toContainText('No channels selected');
 await expect(page.locator('#home .v5-chart')).toHaveCount(0);
 await page.locator('[data-view="studio"]:visible').first().click();
 await expect(page.locator('#fixture-posts')).toContainText('No channels selected');
});
test('an explicit sector choice overrides inference everywhere and stays in sync across screens',async({page})=>{
 await page.goto('/studio-preview/v3/');
 await page.locator('#next').click();
 await page.locator('#business-input').fill('Northgate Vehicle Leasing');
 await page.getByLabel('Sector used for illustrations (optional)').selectOption('perfume');
 await expect(page.locator('#profile-summary')).toContainText('Your choice');
 for(let i=0;i<4;i++)await page.locator('#next').click();
 await expect(page.getByLabel('Illustration style for your sector')).toHaveValue('perfume');
 await expect(page.locator('.proposal-title')).toHaveText('A signature worth remembering.');
 await page.locator('#next').click();
 await expect(page.locator('#home .v5-hero-copy h2')).toContainText('signature');
 const text=(await page.locator('#home').innerText()).split('Northgate Vehicle Leasing').join(' ');
 expect(mentions(text,'lease')).toBe(false);
 await page.locator('[data-view="studio"]:visible').first().click();
 await expect(page.locator('#industry-fixture')).toHaveValue('perfume');
 await page.locator('#industry-fixture').selectOption('leasing');
 await expect(page.locator('#fixture-posts')).toContainText('A clearer way to lease.');
 await page.locator('[data-view="home"]:visible').first().click();
 await expect(page.locator('#home .v5-hero-copy h2')).toContainText('to lease.');
});
test('"Not sure yet" sends the next-step action back to the goals screen',async({page})=>{
 await journey(page,{business:'Northgate Vehicle Leasing',goal:/Not sure yet/});
 await expect(page.locator('#home .v5-kpis .focus')).toHaveCount(0);
 await page.locator('#home .v5-actions button').first().click();
 await expect(page.getByRole('heading',{name:/What should success look like/})).toBeVisible();
 await expect(page.locator('body')).toHaveClass(/\bob\b/);
});
test('workspace text from the customer is inert: markup in the business name never becomes elements',async({page})=>{
 await journey(page,{business:'<img src=x onerror=window.__x=1> Leasing'});
 await expect(page.locator('#home img')).toHaveCount(0);
 await expect(page.locator('#home h1')).toContainText('<img src=x onerror=window.__x=1> Leasing');
 expect(await page.evaluate(()=>window.__x)).toBeUndefined();
});
test('workspace controls are keyboard operable and meet the 24px target size',async({page})=>{
 await journey(page,{business:'Northgate Vehicle Leasing'});
 const small=await page.evaluate(()=>[...document.querySelectorAll('#home button,#home a,#home select')].filter(e=>e.offsetParent!==null).map(e=>({t:(e.textContent||'').trim().slice(0,30),r:e.getBoundingClientRect()})).filter(x=>x.r.width<24||x.r.height<24).map(x=>x.t+' '+Math.round(x.r.width)+'x'+Math.round(x.r.height)));
 expect(small).toEqual([]);
 await page.locator('#home .v5-actions button').nth(2).focus();
 await page.keyboard.press('Enter');
 await expect(page.getByRole('heading',{name:/A clear view of what/})).toBeVisible();
});

test('on small screens the workspace sections stay reachable and onboarding stays focused',async({page})=>{
 await journey(page,{business:'Northgate Vehicle Leasing'});
 const nav=page.getByRole('navigation',{name:'Studio sections'});
 await expect(nav).toBeVisible();
 for(const [view,heading] of [['studio',/Make every campaign/],['calendar',/A clear view of what/],['home',/Your growth plan/]]){
  await page.locator('[data-view="'+view+'"]:visible').first().click();
  await expect(page.getByRole('heading',{name:heading})).toBeVisible();
  const w=await page.evaluate(()=>({d:document.documentElement.scrollWidth,v:innerWidth}));
  expect(w.d).toBeLessThanOrEqual(w.v+1);
 }
 const small=await nav.locator('button').evaluateAll(bs=>bs.map(b=>b.getBoundingClientRect()).filter(r=>r.width<24||r.height<24).length);
 expect(small).toBe(0);
 await page.locator('[data-view="onboard"]:visible').first().click();
 await expect(nav).toBeHidden();
});
