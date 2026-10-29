const {test}=require('node:test');const assert=require('node:assert/strict');
const C=require('../cloze-practice'),Q=require('../quick-memory'),E=require('../learning-engine');
const S=['부동산학개론','민법 및 민사특별법','공인중개사법령 및 중개실무','부동산공법','부동산공시에 관한 법령 및 부동산 관련 세법'];
const cards=E.conceptCatalog(require('../data/core-summary.json'),require('../data/study-types.json').cards);
const units=Q.buildUnits(cards,S,E.plain),raw=require('../data/essential-cloze.json').items,items=C.build(raw,units);
test('all 120 clozes preserve a real source fact and cover six fields equally',()=>{
 assert.equal(items.length,120);assert.equal(new Set(items.map(x=>x.id)).size,120);
 const counts={};for(const x of items){counts[x.subject]=(counts[x.subject]||0)+1;assert.ok(x.text.includes(x.answer));assert.equal(C.check(x,x.answer),true);assert.doesNotMatch(x.text,/[①②③④⑤]/);}
 assert.equal(Object.keys(counts).length,6);assert.ok(Object.values(counts).every(n=>n===20));
});
test('changed or missing source facts cannot silently keep an old cloze',()=>{
 assert.equal(C.build([{...raw[0],text:raw[0].text+' changed'}],units).length,0);
 assert.equal(C.build(raw,[]).length,0);
});
test('grading tolerates whitespace and commas but preserves units, decimals and signs',()=>{
 assert.ok(C.check({answer:'6월 1일'},'６월１일'));
 assert.ok(C.check({answer:'1,000만원'},'1000 만원'));
 for(const bad of ['2.5%','0.25','25%','-0.25%',''])assert.equal(C.check({answer:'0.25%'},bad),false);
 assert.ok(C.check({answer:'종합부동산세',aliases:['종부세']},'종부세'));
});
test('wrong and due items precede new items; future successes come last; subject filters hold',()=>{
 const now=Date.now(),pick=items.slice(0,4);const progress={ [pick[0].id]:{rating:'known',dueAt:new Date(now+99999).toISOString()},[pick[1].id]:{rating:'again'},[pick[2].id]:{rating:'known',dueAt:new Date(now-1).toISOString()}};
 assert.deepEqual(C.select(pick,'all',4,progress,now,()=>0),[pick[1].id,pick[2].id,pick[3].id,pick[0].id]);
 assert.equal(C.select(items,'세법',30).length,20);
});
test('invalid sessions fail safely and completed sessions resume as completed',()=>{
 assert.equal(C.session({ids:['missing'],index:0,results:{}},items),null);
 assert.equal(C.session({ids:[items[0].id],index:-1,results:{}},items),null);
 const done={ids:[items[0].id],index:1,results:{}};assert.equal(C.session(done,items),done);
});
test('cloze backup merges the latest progress without replacing exam history',()=>{
 const p={schema:'realtor-study-backup',version:1,data:{history:[],mistakes:[],flashcards:[],clozeProgress:{a:{updatedAt:'2026-10-29',rating:'again'}}}};
 const result=E.mergeBackup({history:[],clozeProgress:{a:{updatedAt:'2026-10-28',rating:'known'}}},E.readBackup(p));assert.equal(result.clozeProgress.a.rating,'again');
 assert.throws(()=>E.readBackup({...p,data:{...p.data,clozeProgress:[]}}));
});
test('masking never hides a numeric answer inside a different rate or period',()=>{
 const parts=C.parts('상속 2.3%, 유상 농지 3%, 13년과 3년','3%');
 assert.equal(parts.filter(p=>p.gap).length,1);assert.ok(parts[0].text.includes('2.3%'));
 assert.equal(C.parts('13년과 3년','3년').filter(p=>p.gap).length,1);
 for(const item of items) assert.ok(C.parts(item.text,item.answer).some(p=>p.gap),item.id);
});
