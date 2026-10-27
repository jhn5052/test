const {test}=require('node:test');
const assert=require('node:assert/strict');
const e=require('../learning-engine');
const summary=require('../data/core-summary.json');
const old=require('../data/study-types.json').cards;
const questions=require('../data/questions.json').questions;
const subjects=['부동산학개론','민법 및 민사특별법','공인중개사법령 및 중개실무','부동산공법','부동산공시에 관한 법령 및 부동산 관련 세법'];
const core=e.canonicalCards(summary);
const cards=[...core,...old];
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
 assert.deepEqual(linked('2025-2-21'),[],'general 지상권 must not substitute for 법정지상권');
 assert.deepEqual(linked('2025-3-40'),[],'a topic in the body must not replace 주택임대차');
 assert.ok(linked('2025-5-29').every(c=>c.summarySubject==='tax'));
});
test('source-linked cards win; specific date questions select the date table',()=>{
 const q=questions.find(q=>old.some(c=>c.id.startsWith('gap-')&&c.sourceId===q.id&&c.prompt===q.text));
 assert.ok(e.related(q,cards,subjects)[0].id.startsWith('gap-'));
 const date=linked('2026-5-12');assert.ok(date.length);assert.ok(date[0].title.includes('기준'));
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
 assert.ok(mapped>400,`expected meaningful improvement over 85 links; got ${mapped}`);
});
