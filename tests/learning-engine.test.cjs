const {test}=require('node:test');
const assert=require('node:assert/strict');
const e=require('../learning-engine');
const summary=require('../data/core-summary.json');
const old=require('../data/study-types.json').cards;
const questions=require('../data/questions.json').questions;
const subjects=['부동산학개론','민법 및 민사특별법','공인중개사법령 및 중개실무','부동산공법','부동산공시에 관한 법령 및 부동산 관련 세법'];
const core=e.canonicalCards(summary);
const cards=e.conceptCatalog(summary,old);
const linked=id=>e.related(questions.find(q=>q.id===id),cards,subjects);
test('canonical definitions and table values come from the same summary, with stable unique ids',()=>{
 assert.equal(core.length,new Set(core.map(c=>c.id)).size);
 assert.deepEqual(core,e.canonicalCards(summary));
 const flattened=summary.subjects.flatMap(s=>s.sections.flatMap(sec=>sec.blocks.flatMap(b=>b.items||[]))).map(e.plain).join('\n');
 assert.ok(core.every(c=>c.concept.every(fact=>flattened.includes(fact)||c.comparison.some(row=>fact===`${row.label}: ${row.value}`))));
 assert.deepEqual(new Set(core.map(c=>c.summarySubject)),new Set(['intro','civil','public','broker','registry','tax']));
});
test('related concepts use the question topic and never a word in an incorrect choice',()=>{
 assert.deepEqual(e.related({id:'x',subject:subjects[1],text:'민법상 권리능력에 관한 설명은?',choices:['유치권','표현대리']},core,subjects),[]);
 assert.deepEqual(linked('2025-2-36').map(c=>c.title),['집합건물']);
 assert.deepEqual(linked('2025-2-37').map(c=>c.title),['가등기담보']);
 assert.ok(linked('2025-2-21').every(c=>c.title.includes('법정지상권')),'general 지상권 must not substitute for 법정지상권');
 assert.deepEqual(linked('2025-3-40'),[],'a topic in the body must not replace 주택임대차');
 assert.ok(linked('2025-5-29').every(c=>/재산세/.test(c.concept.join(' '))));
});
test('question-derived records cannot override concepts; specific date questions select the date table',()=>{
 const q=questions.find(q=>old.some(c=>c.id.startsWith('gap-')&&c.sourceId===q.id&&c.prompt===q.text));
 assert.ok(e.related(q,cards,subjects).every(c=>!c.id.startsWith('gap-')));
 const date=linked('2026-5-12');assert.ok(date.length);assert.ok(date[0].title.includes('기준'));
});
test('all concept modes use a catalog without questions, answer keys, scenario fragments or exam metadata',()=>{
 assert.ok(cards.length>400);
 for(const c of cards){
  assert.equal(c.sourceId,undefined);assert.equal(c.prompt,undefined);assert.equal(c.answer,undefined);
  assert.ok(!c.id.startsWith('gap-'));
  assert.ok(!/[?？①②③④⑤]|정답표|甲|乙|丙/.test([...(c.concept||[]),...(c.memorize||[])].join(' ')),c.id);
 }
 assert.ok(cards.find(c=>c.id==='econ-01').concept.some(t=>t.includes('정착물')));
 assert.ok(cards.find(c=>c.id==='civil-37').concept.some(t=>t.includes('도급')));
 assert.ok(!cards.find(c=>c.id==='econ-24').memorize.some(t=>t.includes('정답')));
});
test('related concepts stay focused on the actual subtopic and never return a whole chapter of alternatives',()=>{
 const law=linked('2025-2-21');assert.ok(law.length);assert.ok(law[0].title.includes('법정지상권'));
 assert.equal(linked('2020-1-2')[0].title,'부동산업과 부동산 관련 서비스업');
 for(const q of questions)assert.ok(e.related(q,cards,subjects).length<=1);
 const q={id:'regression',subject:subjects[2],text:'공인중개사법령상 자격정지에 관한 설명으로 옳은 것은?'};
 assert.ok(e.related(q,cards,subjects).every(c=>c.concept.join(' ').includes('자격정지')));
});
function attempt(stage,year,corrects,date='2026-10-27T10:00:00Z'){
 const ss=stage==='first'?subjects.slice(0,2):stage==='secondFirst'?subjects.slice(2,4):subjects.slice(4);
 return {stage,year,completedAt:date,subjects:Object.fromEntries(ss.map((s,i)=>[s,{total:40,correct:corrects[i]}]))};
}
test('readiness separates first and second stages and distinguishes pass line from personal goal',()=>{
 const history=[attempt('first',2025,[24,24]),attempt('secondFirst',2025,[28,16]),attempt('secondSecond',2025,[20])];
 const r=e.stageReadiness(history,subjects);
 assert.equal(r.first.result.mean,60);assert.equal(r.first.result.pass,true);assert.equal(r.first.result.goal,false);
 assert.equal(r.second.result.mean,(70+40+50)/3);assert.equal(r.second.result.pass,false);
 assert.equal(e.stageReadiness([attempt('secondFirst',2025,[28,20]),attempt('secondSecond',2024,[24])],subjects).second.result,null);
 assert.equal(e.stageReadiness([{...attempt('first',2025,[24,24]),stage:'practice'}],subjects).first.result,null);
});
test('readiness rejects insufficient or invalid subject samples and follows the latest real trial',()=>{
 const a=attempt('first',2025,[32,32]);a.subjects[subjects[1]].total=10;
 assert.equal(e.stageReadiness([a],subjects).first.result,null);
 a.subjects[subjects[1]]={total:40,correct:'bad'};assert.equal(e.stageReadiness([a],subjects).first.result,null);
 const r=e.stageReadiness([attempt('first',2024,[30,30],'2026-10-25'),attempt('first',2025,[16,16],'2026-10-27')],subjects);
 assert.equal(r.first.result.mean,40);
});
test('first-seen accuracy is not inflated by repeatedly solving the same question',()=>{
 const r=e.firstAttemptAccuracy([{completedAt:'2026-10-27',results:[{questionId:'q',correct:true}]},{completedAt:'2026-10-26',results:[{questionId:'q',correct:false},{questionId:'q2',correct:true}]}]);
 assert.deepEqual(r,{total:2,correct:1,rate:50});
});
test('review schedule advances by 1, 3, 7 days, and again resets the streak',()=>{
 const now=Date.parse('2026-10-27T10:00:00Z');let p;
 for(const day of [1,3,7]){p=e.reviewSchedule(p,true,now);assert.equal(Date.parse(p.dueAt)-now,day*86400000);}
 p=e.reviewSchedule(p,false,now);assert.equal(p.streak,0);assert.equal(p.dueAt,new Date(now).toISOString());
});
test('backup import validates the schema and merges without erasing existing history',()=>{
 assert.throws(()=>e.readBackup({data:{}}));
 const data={history:[],mistakes:[],flashcards:[]};assert.equal(e.readBackup({schema:'realtor-study-backup',version:1,data}),data);
 assert.throws(()=>e.readBackup({schema:'realtor-study-backup',version:1,data:{...data,quickMemoryProgress:'bad'}}));
 const current={...data,history:[{id:'new',completedAt:'2026-10-27',results:[{questionId:'q',correct:true}]}],resolvedMistakes:{q:'2026-10-27'}};
 const incoming={...data,history:[{id:'old',completedAt:'2026-10-26'}],mistakes:[{questionId:'q',attemptedAt:'2026-10-26'}],flashcards:['q']};
 const merged=e.mergeBackup(current,incoming);assert.equal(merged.history.length,2);assert.deepEqual(merged.mistakes,[]);assert.deepEqual(merged.flashcards,['q']);
 assert.equal(e.mergeBackup(merged,incoming).history.length,2);
});
test('topic links remain inside the correct subject and reference existing cards',()=>{
 const ids=new Set(cards.map(c=>c.id));let mapped=0;
 for(const q of questions){const matches=e.related(q,cards,subjects);if(matches.length)mapped++;assert.ok(matches.every(c=>ids.has(c.id)&&c.subject===q.subject));}
 assert.ok(mapped>200,`expected usable focused links; got ${mapped}`);
});

test('regressions: penalties, consent ratios, application methods and investment criteria use their own topic',()=>{
 const checks=[['2025-5-26',/가산세/],['2025-4-25',/동의|리모델링/],['2025-5-13',/단독신청|공동신청/],['2025-1-28',/수익성지수/],['2025-5-9',/적부심사/]];
 for(const [id,topic] of checks){const matches=linked(id);assert.ok(matches.length,id+' should have a focused concept');assert.ok(matches.every(c=>topic.test(c.concept.join(' '))),id+': '+matches.map(c=>c.title));}
 assert.ok(linked('2025-3-28').every(c=>/이용의무/.test(c.concept.join(' '))));
});
