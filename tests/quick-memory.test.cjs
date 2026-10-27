const { test } = require('node:test');
const assert = require('node:assert/strict');
const { buildUnits, select, rate } = require('../quick-memory.js');
const subjects = ['부동산학개론', '민법 및 민사특별법', '공인중개사법령 및 중개실무', '부동산공법', '공시·세법'];
const card = { id: 'econ-1', title: '토지', subject: subjects[0], relatedTerms: ['후보지'], memorize: ['후보지: 용도지역 사이의 전환이다.', '① 정답이다.', '이 문제에서 해당하는 것은 토지다.'] };
test('extracts real memorization facts, excludes answer keys and generated question cards', () => {
  const units = buildUnits([card, { ...card, id: 'gap-1' }], subjects);
  assert.equal(units.length, 1);
  assert.equal(units[0].label, '후보지');
  assert.equal(units[0].text, card.memorize[0]);
});
test('splits bullet definitions without losing context and includes comparison rows', () => {
  const units = buildUnits([{ ...card, comparison: [{ label: '전', value: '상시 물 이용 없이 경작한다.' }], memorize: ['경작 형태\n• 전: 상시 물 이용 없이 경작한다.\n• 답: 물을 상시 이용한다.'] }], subjects);
  assert.equal(units.length, 3);
  assert.equal(units[2].label, '답');
});
test('deduplicates facts across cards and splits the combined subject', () => {
  const units = buildUnits([card, { ...card, id: 'econ-2' }, { ...card, id: 'tax', subject: subjects[4], title: '재산세' }, { ...card, id: 'reg', subject: subjects[4], title: '등기부' }], subjects);
  assert.deepEqual(units.map(u => u.subject), [subjects[0], '세법', '공시법']);
});
test('prioritizes repeat cards, exact-source mistakes, unseen, then known cards', () => {
  const units = ['again', 'wrong', 'new', 'known'].map(id => ({ id, sourceId: id, subject: subjects[0] }));
  const progress = { again: { rating: 'again' }, known: { rating: 'known' } };
  assert.deepEqual(select(units, 'first', 10, progress, ['wrong'], () => 0), ['again', 'wrong', 'new', 'known']);
  assert.deepEqual(select(units, subjects[1], 10), []);
});
test('previously reviewed repeat cards rotate behind older repeat cards', () => {
  const units = ['a','b'].map(id => ({ id, subject: subjects[0] }));
  assert.deepEqual(select(units, 'all', 10, { a:{ rating:'again', updatedAt:'2026-10-27T10:00:00Z' }, b:{ rating:'again', updatedAt:'2026-10-26T10:00:00Z' } }), ['b','a']);
});
test('rating requires reveal, advances once, hides the next answer and survives JSON storage', () => {
  const session = { ids:['a','b'], index:0, revealed:false, ratings:{} };
  assert.equal(rate(session, true), null);
  const next = rate({ ...session, revealed:true }, false);
  assert.deepEqual(next, { ...session, index:1, ratings:{ a:'again' } });
  assert.equal(rate(next, true), null);
  const restored = JSON.parse(JSON.stringify(next));
  const completed = rate({ ...restored, revealed:true }, true);
  assert.equal(completed.index, 2);
  assert.equal(completed.ratings.b, 'known');
  assert.equal(rate({ ...completed, revealed:true }, true), null);
});
test('the current deck has usable facts for all six fields, without leaked choices', () => {
  const realSubjects = [...subjects.slice(0, 4), '부동산공시에 관한 법령 및 부동산 관련 세법'];
  const units = buildUnits(require('../data/study-types.json').cards, realSubjects);
  assert.equal(new Set(units.map(u => u.subject)).size, 6);
  assert.equal(new Set(units.map(u => u.id)).size, units.length);
  assert.ok(units.every(u => !/[①②③④⑤]/.test(u.text)));
  for (const subject of [realSubjects[0], realSubjects[1], realSubjects[2], realSubjects[3], '공시법', '세법']) assert.ok(select(units, subject, 10).length > 0);
});
