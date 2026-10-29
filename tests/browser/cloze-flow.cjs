const {chromium}=require(process.env.PLAYWRIGHT_MODULE || 'playwright');
const assert=require('node:assert/strict');const path=require('node:path');const os=require('node:os');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});
 try {
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];
 page.on('pageerror',e=>errors.push(e.message));
 await page.goto(process.env.APP_URL || 'http://127.0.0.1:8020',{waitUntil:'networkidle'});
 await page.waitForSelector('.today-tasks');await page.locator('.nav-item[data-view="study-types"]').click();
 await page.locator('[data-study-mode="cloze"]').click();
 assert.ok((await page.locator('.cloze-view').innerText()).includes('150'));
 const groups=await page.locator('#cloze-subject option').evaluateAll(opts=>opts.slice(1).map(x=>x.value));assert.equal(groups.length,6);
 const original=await page.evaluate(()=>JSON.stringify(store.history));
 // Each field has usable, masked prompts; no answer appears before a response.
 for(const group of groups){
  await page.selectOption('#cloze-subject',group);await page.selectOption('#cloze-size','20');await page.click('#cloze-start');
  const info=await page.evaluate(()=>({length:store.clozeSession.ids.length,item:clozeItems().find(x=>x.id===store.clozeSession.ids[0])}));assert.equal(info.length,20);
  assert.equal(await page.locator('.cloze-feedback').count(),0);assert.ok(await page.locator('.cloze-gap').count()>0);
  await page.fill('#cloze-input',info.item.answer);await page.locator('#cloze-form button[type="submit"]').click();
  assert.equal(await page.locator('.cloze-feedback.is-correct').count(),1);
 }
 // A 10-item set: incorrect, correct-but-uncertain, then eight correct answers.
 await page.selectOption('#cloze-subject','세법');await page.selectOption('#cloze-size','10');await page.click('#cloze-start');
 const ids=await page.evaluate(()=>store.clozeSession.ids.slice());
 await page.click('#cloze-skip');assert.equal(await page.locator('.cloze-feedback.is-wrong').count(),1);
 await page.reload({waitUntil:'networkidle'});await page.locator('.nav-item[data-view="study-types"]').click();await page.click('[data-study-mode="cloze"]');
 assert.equal(await page.locator('.cloze-feedback.is-wrong').count(),1);await page.click('#cloze-next');
 for(let i=1;i<10;i++){
  const a=await page.evaluate(()=>clozeItems().find(x=>x.id===store.clozeSession.ids[store.clozeSession.index]).answer);
  await page.fill('#cloze-input',a);await page.press('#cloze-input','Enter');assert.equal(await page.locator('.cloze-feedback.is-correct').count(),1);
  if(i===1)await page.check('#cloze-unsure');
  await page.click('#cloze-next');
 }
 assert.ok((await page.locator('.quick-complete').innerText()).includes('9 / 10'));
 assert.ok((await page.locator('#cloze-again').innerText()).includes('2개'));
 assert.equal(await page.evaluate(()=>JSON.stringify(store.history)),original);
 const progress=await page.evaluate(()=>store.clozeProgress);assert.equal(progress[ids[0]].rating,'again');assert.equal(progress[ids[1]].rating,'again');assert.equal(progress[ids[2]].rating,'known');
 await page.click('#cloze-again');assert.deepEqual(await page.evaluate(()=>store.clozeSession.ids),ids.slice(0,2));assert.equal(await page.locator('.cloze-feedback').count(),0);
 for(const width of [375,390,820,1366]){
  await page.setViewportSize({width,height:900});
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'overflow '+width);
 }
 await page.setViewportSize({width:390,height:844});
 await page.screenshot({path:path.join(os.tmpdir(),'cloze-mobile.png'),fullPage:true});
 await page.click('#cloze-skip');await page.locator('.cloze-feedback [data-open-concept]').click();assert.equal(await page.locator('#study-type-card').count(),1);
 await page.click('[data-study-mode="cloze"]');assert.equal(await page.locator('.cloze-feedback.is-wrong').count(),1);
 assert.deepEqual(errors,[]);console.log('Cloze browser flow passed: six fields, grading, uncertainty, retry, reload, concept links, preserved history, responsive widths.');
 } finally {await browser.close();}
})().catch(e=>{console.error(e);process.exit(1);});
