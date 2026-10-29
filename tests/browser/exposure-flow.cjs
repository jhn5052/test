const {chromium}=require(process.env.PLAYWRIGHT_MODULE||'playwright');const assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,...(process.env.CHROME_PATH?{executablePath:process.env.CHROME_PATH}:{})});try{
 const context=await browser.newContext({viewport:{width:390,height:844},serviceWorkers:'block'}),page=await context.newPage(),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const subject='부동산학개론';
 await page.addInitScript(({subject})=>localStorage.setItem('gyeol-study-v1',JSON.stringify({history:[{id:'old',year:2020,scope:'subject',subject,total:1,correct:1,score:100,completedAt:'2026-10-20T00:00:00Z',results:[{questionId:'2020-1-1',correct:true}]}],mistakes:[{questionId:'2020-1-3',chosen:1}],flashcards:['2020-1-2'],recallProgress:{},active:null})),{subject});
 await page.goto(process.env.APP_URL||'http://127.0.0.1:8020',{waitUntil:'networkidle'});await page.waitForSelector('.today-tasks');
 await page.locator('[data-view="exam"]').first().click();await page.selectOption('#exam-year','2020');await page.click('[data-scope="subject"]');
 await page.check('#fresh-only');assert.equal((await page.locator('#question-total').innerText()).trim(),'37문항');await page.selectOption('#question-count','10');await page.click('#begin-exam');
 let active=await page.evaluate(()=>quiz);assert.equal(active.questions.length,10);assert.equal(active.firstSeenIds.length,10);assert.ok(!active.questions.some(x=>['2020-1-1','2020-1-2','2020-1-3'].includes(x)));
 const answer=await page.evaluate(()=>{const q=bank.find(x=>x.id===quiz.questions[0]);return Array.isArray(q.answer)?q.answer[0]:q.answer;});await page.click(`[data-answer="${answer}"]`);await page.click('#mobile-submit');await page.waitForSelector('.result-hero');
 assert.match(await page.locator('.exposure-panel').innerText(),/1\/10문제/);assert.match(await page.locator('.exposure-panel').innerText(),/다시 푼 문제\s*기록 없음/);
 let saved=await page.evaluate(()=>store.history[0]);assert.ok(saved.results.every(x=>x.firstSeen===true));
 await page.locator('[data-view="dashboard"]').first().click();assert.match(await page.locator('.dashboard-exposure').innerText(),/부동산학개론/);assert.match(await page.locator('.dashboard-exposure').innerText(),/10% \(1\/10\)/);
 await page.locator('[data-view="exam"]').first().click();await page.selectOption('#exam-year','2020');await page.click('[data-scope="subject"]');await page.selectOption('#question-count','40');await page.click('#begin-exam');
 active=await page.evaluate(()=>quiz);assert.equal(active.questions.length,40);assert.equal(active.firstSeenIds.length,27);
 await page.evaluate(()=>{for(const id of [quiz.firstSeenIds[0],quiz.questions.find(id=>!quiz.firstSeenIds.includes(id))]){const q=bank.find(x=>x.id===id);quiz.answers[id]=Array.isArray(q.answer)?q.answer[0]:q.answer;}persist();render();});
 await page.click('#mobile-submit');await page.waitForSelector('.result-hero');saved=await page.evaluate(()=>store.history[0]);assert.equal(saved.results.filter(x=>x.firstSeen).length,27);assert.equal(saved.results.filter(x=>x.firstSeen===false).length,13);
 const result=await page.locator('.exposure-panel').innerText();assert.match(result,/1\/27문제/);assert.match(result,/1\/13문제/);
 for(const width of [375,390,820,1366]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true,'horizontal overflow '+width);}
 assert.deepEqual(errors,[]);console.log('Exposure flow passed: unseen filtering, snapshots, mixed results, subject dashboard and four widths.');
 } finally {await browser.close();}})().catch(e=>{console.error(e);process.exit(1)});
