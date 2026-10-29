const {test}=require('node:test');
const assert=require('node:assert/strict');
const e=require('../learning-engine');
const summary=require('../data/core-summary.json');
const old=require('../data/study-types.json').cards;
const questions=require('../data/questions.json').questions;
const subjects=['부동산학개론','민법 및 민사특별법','공인중개사법령 및 중개실무','부동산공법','부동산공시에 관한 법령 및 부동산 관련 세법'];
const core=e.canonicalCards(summary);
const cards=e.conceptCatalog(summary,old);
const audit=require('../data/concept-links.json');
const linked=id=>e.related(questions.find(q=>q.id===id),cards,subjects,audit);
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
 assert.ok(linked('2025-3-40').length);
 assert.ok(linked('2025-3-40').every(c=>c.id.startsWith('broker-review-') && /임대차|대항력/.test(c.title)));
 assert.ok(linked('2025-5-29').every(c=>/재산세/.test(c.title+' '+c.concept.join(' '))));
});
test('question-derived records cannot override concepts; specific date questions select the date table',()=>{
 const q=questions.find(q=>old.some(c=>c.id.startsWith('gap-')&&c.sourceId===q.id&&c.prompt===q.text));
 assert.ok(e.related(q,cards,subjects,audit).every(c=>!c.id.startsWith('gap-')));
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
test('related concepts stay inside the explicitly reviewed topic',()=>{
 const law=linked('2025-2-21');assert.ok(law.length);assert.ok(law[0].title.includes('법정지상권'));
 assert.equal(linked('2020-1-2')[0].title,'부동산업과 부동산 관련 서비스업');
 for(const q of questions)assert.ok(e.related(q,cards,subjects,audit).every(c=>audit.questions[q.id].cards.some(link=>link.id===c.id)));
 const q={id:'regression',subject:subjects[2],text:'공인중개사법령상 자격정지에 관한 설명으로 옳은 것은?'};
 assert.ok(e.related(q,cards,subjects,audit).every(c=>c.concept.join(' ').includes('자격정지')));
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
 for(const q of questions){const matches=e.related(q,cards,subjects,audit);if(matches.length)mapped++;assert.ok(matches.every(c=>ids.has(c.id)&&c.subject===q.subject));}
 assert.ok(mapped>200,`expected usable focused links; got ${mapped}`);
});

test('regressions: penalties, consent ratios, application methods and investment criteria use their own topic',()=>{
 const checks=[['2025-5-26',/가산세/],['2025-4-25',/동의|리모델링/],['2025-5-13',/공동신청|공동 신청/],['2025-1-28',/수익성지수/],['2025-5-9',/적부심사/]];
 for(const [id,topic] of checks){const matches=linked(id);assert.ok(matches.length,id+' should have a focused concept');assert.ok(matches.some(c=>topic.test([...(c.concept||[]),...(c.memorize||[])].join(' '))),id+': '+matches.map(c=>c.title));}
 assert.ok(linked('2025-3-28').some(c=>/이용.*의무/.test(c.concept.join(' '))));
});

test('the audit has exactly one checked entry for each of the 1300 questions, and all linked targets resolve',()=>{
 assert.equal(questions.length,1300);assert.equal(Object.keys(audit.questions).length,questions.length);
 let linkedCount=0,unmapped=0,hold=0;
 for(const q of questions){const row=audit.questions[q.id];assert.ok(row,q.id);assert.equal(row.questionFingerprint,e.questionFingerprint(q),q.id);assert.ok(row.reason);const matches=linked(q.id);
 if(row.status==='linked'){linkedCount++;assert.ok(matches.length,q.id);assert.equal(matches.length,row.cards.length);}
 else {assert.deepEqual(matches,[],q.id);assert.equal(row.cards.length,0);if(row.status==='unmapped')unmapped++;else if(row.status==='source-review')hold++;else assert.fail(row.status);}
 }
 assert.equal(linkedCount,audit.stats.linked);assert.equal(unmapped,audit.stats.unmapped);assert.equal(hold,audit.stats['source-review']);
});
test('a changed question, choice, subject, answer or card requires fresh review and cannot use an old link',()=>{
 const q=questions.find(q=>q.id==='2025-2-36');
 assert.ok(linked(q.id).length);
 for(const patch of [{text:q.text+' 수정'},{subject:subjects[0]},{choices:['다른 보기']},{answer:999}])assert.deepEqual(e.related({...q,...patch},cards,subjects,audit),[]);
 const changed=cards.map(c=>c.id===linked(q.id)[0].id?{...c,concept:['다른 내용']}:c);
 assert.deepEqual(e.related(q,changed,subjects,audit),[]);
 assert.deepEqual(e.related(q,cards,subjects,null),[]);
});
test('specific cases no longer link through incidental context words',()=>{
 const expected={
 '2022-1-25':'econ-23','2023-1-22':'econ-23','2020-2-28':'civil-05',
 '2021-2-3':'civil-02','2024-2-29':'civil-05','2024-2-37':'core-civil-1afdpyr',
 '2020-3-34':'broker-04','2021-3-29':'broker-sanction-04','2024-3-16':'broker-sanction-04',
 '2023-4-3':'core-public-13a4sfa','2024-4-18':'core-public-w86byu','2023-4-35':'core-public-3jb256',
 '2025-5-4':'core-registry-90t5df','2024-5-34':'tax-57','2025-5-40':'tax-50',
 '2025-5-35':'tax-56','2025-5-38':'tax-32'};
 for(const [id,cardId] of Object.entries(expected))assert.ok(linked(id).some(c=>c.id===cardId),id+' -> '+linked(id).map(c=>c.id));
 for(const id of ['2020-5-1','2020-5-5','2021-5-12','2024-4-38','2025-4-36'])assert.deepEqual(linked(id),[],id);
});
test('known source conflicts are held, and corrected definition cards cannot retain their contradictory old rules',()=>{
 for(const id of ['2023-1-27','2021-2-37']){assert.equal(audit.questions[id].status,'source-review');assert.deepEqual(linked(id),[]);}
 const proxy=cards.find(c=>c.id==='civil-14');assert.ok(proxy.concept.some(x=>/법정대리인은 자기 책임/.test(x)));
 const unfair=cards.find(c=>c.id==='civil-15');assert.ok(unfair.concept.some(x=>x.includes('궁박은 본인, 경솔·무경험은 대리인')));
 assert.ok(!cards.find(c=>c.id==='tax-50').memorize.some(x=>/6,700|2,100/.test(x)));
});
test('seen question detection uses prior results, wrong notes, saved questions and complete old stage records',()=>{
 const b=[{id:'a',year:2025,subject:'A'},{id:'b',year:2025,subject:'B'},{id:'c',year:2025,subject:'C'},{id:'d',year:2024,subject:'A'}];
 const stages={first:{questions:80,subjects:['A','B']}};
 const store={history:[{stage:'first',year:2025,total:80,subjects:{A:{total:40},B:{total:40}},results:[]},{results:[{questionId:'c'}]}],mistakes:[{questionId:'d'}],flashcards:['saved'],uncertainQuestions:['uncertain']};
 assert.deepEqual([...e.seenQuestionIds(store,b,stages)].sort(),['a','b','c','d','saved','uncertain'].sort());
 const partial={...store,history:[{stage:'first',year:2025,total:80,subjects:{A:{total:39},B:{total:40}},results:[] }],mistakes:[],flashcards:[],uncertainQuestions:[]};
 assert.equal(e.seenQuestionIds(partial,b,stages).size,0);
});
test('result summary separates first exposure, repeated and legacy unknown by subject',()=>{
 const b=[{id:'a',subject:'A'},{id:'b',subject:'A'},{id:'c',subject:'B'},{id:'d',subject:'A'}];
 const rows=[{questionId:'a',correct:true,firstSeen:true},{questionId:'b',correct:false,firstSeen:false},{questionId:'c',correct:true,firstSeen:false},{questionId:'d',correct:true}];
 const r=e.exposureSummary(rows,b);assert.deepEqual(r.total,{fresh:{total:1,correct:1},repeat:{total:2,correct:1},unknown:1,excluded:0});
 assert.equal(r.subjects.A.repeat.correct,0);assert.equal(r.subjects.B.repeat.correct,1);assert.equal(r.subjects.A.unknown,1);
 const history=[{completedAt:'2026-10-29',learning:true,results:[{questionId:'a',correct:false,firstSeen:true}]},{completedAt:'2026-10-28',results:rows}];
 assert.equal(e.latestExposure(history,b).A.fresh.correct,1);
});
test('verified source corrections retain official answers and meaningful legal comparisons',()=>{
 for(const id of ['2021-2-37','2023-1-27'])assert.equal(audit.questions[id].status,'source-review');
 for(const id of ['2023-5-4','2025-4-2','2023-2-39','2023-2-7','2022-2-36'])assert.equal(audit.questions[id].status,'linked');
 const q=questions.find(x=>x.id==='2023-2-39');assert.equal(q.answer,1);assert.match(q.explanation,/기간을 정하지 않은/);assert.doesNotMatch(q.explanation,/갱신요구권은 주장할 수 없다/);
 assert.match(questions.find(x=>x.id==='2026-2-11').text,/중단 사유/);assert.doesNotMatch(questions.find(x=>x.id==='2026-2-11').text,/완성유예/);
 assert.ok(cards.find(x=>x.id==='review-civil-commercial-period').comparison.some(x=>x.label.includes('기간 미정')));
});
test('canceled all-answer questions do not inflate first or repeated accuracy, and public registration/tax are shown separately',()=>{
 const combined=subjects[4];
 const b=[{id:'canceled',subject:combined,year:2021,number:1,choices:['a','b','c','d','e'],answer:[1,2,3,4,5]},{id:'registry',subject:combined,year:2025,number:10,choices:['a','b'],answer:1},{id:'tax',subject:combined,year:2025,number:30,choices:['a','b'],answer:1},{id:'predicted-tax',subject:combined,year:2026,number:11,choices:['a','b'],answer:1}];
 const rows=[{questionId:'canceled',correct:true,firstSeen:true},{questionId:'registry',correct:false,firstSeen:true},{questionId:'tax',correct:true,firstSeen:false},{questionId:'predicted-tax',correct:true,firstSeen:true}];
 const out=e.exposureSummary(rows,b);assert.equal(out.total.excluded,1);assert.equal(out.total.fresh.total,2);assert.equal(out.subjects['공시법'].fresh.correct,0);assert.equal(out.subjects['세법'].repeat.correct,1);assert.equal(out.subjects['세법'].fresh.correct,1);
 const all=e.firstAttemptAccuracy([{completedAt:'2026-10-29',results:rows}],b);assert.deepEqual(all,{total:3,correct:2,rate:67});
});
