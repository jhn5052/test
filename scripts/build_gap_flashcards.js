const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const questions = JSON.parse(fs.readFileSync(path.join(root, 'data/questions.json'), 'utf8')).questions;
const studyPath = path.join(root, 'data/study-types.json');
const study = JSON.parse(fs.readFileSync(studyPath, 'utf8'));
const letters = ['①', '②', '③', '④', '⑤'];
const manualCoverageIds = new Set(['2024-1-3','2024-1-21','2026-1-7','2026-1-8','2026-1-9','2026-1-10','2026-1-12','2026-1-18','2026-1-19','2021-2-16','2021-2-18','2022-2-14','2022-2-15','2026-2-9','2026-2-11','2022-3-4','2025-3-2','2025-3-39','2026-3-17','2026-4-15','2021-5-3','2022-5-4','2025-5-2','2026-5-5']);
const reviewHoldIds = new Set(['2023-5-4']);
const STOP = new Set(['법령상', '관한', '설명으로', '옳은', '틀린', '모두', '고른', '것은', '경우', '다음', '부동산', '공인중개사', '민법상', '지방세법상']);

function labelAnswer(question) {
  const answers = Array.isArray(question.answer) ? question.answer : [question.answer];
  return answers.map(value => {
    const index = Number(value) - 1;
    return Number.isInteger(index) && question.choices[index] !== undefined
      ? `${letters[index]} ${question.choices[index]}`
      : String(value);
  }).join(' / ');
}
function topicFor(question) {
  const text = question.text;
  const matchers = [
    [/분기점|컨버스/i, '컨버스 분기점 모형'], [/레일리|소매중력/i, '레일리 소매중력모형'], [/허프|거리마찰/i, '허프 입지모형'], [/베버|최소비용/i, '베버 최소비용이론'], [/크리스탈러|중심지이론/i, '크리스탈러 중심지이론'],
    [/메자닌/i, '메자닌 금융'], [/민간투자사업/i, '민간투자사업 방식'], [/자산유동화|PF-ABCP/i, '자산유동화·PF'], [/수익가액|순수익|환원율/i, '수익환원법 계산'], [/주택금융/i, '주택금융'], [/수요를 감소|공급을 감소/i, '수요·공급 변화'], [/다중주택|다가구주택|다세대주택/i, '주택 종류 구분'], [/용도별 건축물|건축물의 종류/i, '주택·건축물 용도 분류'], [/등기의 방법으로 소유권|선박등기/i, '등기·등록 대상 물건'], [/도시개발사업/i, '도시개발 시행 방식'], [/정비사업/i, '정비사업 유형'], [/투자 위험/i, '투자 위험과 수익'],
    [/계약해제|계약 해제/i, '계약 해제·해지'], [/물권적 청구권/i, '물권적 청구권'], [/물권에 관한/i, '물권의 효력·특성'], [/소유권에 관한/i, '소유권'], [/점유보호청구권/i, '점유보호청구권'], [/점유자와 회복자/i, '점유자·회복자 관계'], [/점유권/i, '점유권'], [/상린관계/i, '상린관계'], [/분묘기지권/i, '분묘기지권'], [/약관/i, '약관의 해석·효력'], [/예약완결권/i, '매매예약·예약완결권'], [/교환하자|교환계약/i, '교환계약'],
    [/겸업|업무범위/i, '법인 중개업자의 업무 범위'], [/명의신탁/i, '명의신탁 중개 설명'], [/분묘|묘지|장사 등에 관한/i, '분묘·사설묘지 설명'], [/자격증/i, '공인중개사 자격증'], [/집합건물/i, '집합건물 중개 설명'], [/계약금등을 예치|예치명의자/i, '계약금 예치제도'], [/강제경매/i, '강제경매와 권리관계'],
    [/임야도.*축척|지적도.*축척/i, '지적도·임야도 축척'], [/지목의 구분/i, '지목 구분'], [/면적을 측정|등록할 면적|면적의 결정/i, '지적 면적 결정·반올림'], [/지적위원회/i, '중앙지적위원회'], [/등록전환.*지번|지번부여/i, '등록전환 지번 부여'], [/면적합계|경계점좌표등록부/i, '토지분할 면적 조정'], [/가산세/i, '지방세 가산세'], [/완화 적용|완화 요청/i, '건축기준 완화 적용']
  ];
  for (const [pattern, title] of matchers) if (pattern.test(text)) return title;
  const first = text.replace(/\s+/g, ' ').split(/[?？]/)[0].slice(0, 24).trim();
  return first || `${question.year}년 기출 ${question.number}번`;
}
function explanationParts(question, correct) {
  const body = question.explanation.trim().replace(/^(?:정답은\s*[^.。]*[.。]|[①②③④⑤][.。])\s*/, '');
  const sentences = body.match(/[^.!?。]+[.!?。]?/g)?.map(value => value.trim()).filter(Boolean) || [];
  const keyFact = sentences.shift() || body;
  const concept = sentences.join(' ').trim() || body;
  return { concept, keyFact: sentences.length ? keyFact : `정답 포인트: ${correct}` };
}
function relatedTermsFor(question, title) {
  const text = question.text;
  const terms = [title];
  const subjectTerms = [
    [/컨버스|분기점/, '상권분기점'], [/레일리|소매중력/, '소매중력모형'], [/허프|거리마찰/, '허프모형'], [/베버|최소비용/, '최소비용이론'], [/크리스탈러|중심지이론/, '중심지이론'], [/메자닌/, '메자닌금융'], [/민간투자사업/, '민간투자사업'], [/자산유동화|PF-ABCP/, '자산유동화'], [/수익가액|환원율/, '수익환원법'], [/주택금융/, '주택금융'],
    [/계약해제|계약 해제/, '계약해제'], [/물권적 청구권/, '물권적청구권'], [/물권에 관한/, '물권'], [/소유권에 관한/, '소유권'], [/점유보호청구권/, '점유보호청구권'], [/점유자와 회복자/, '점유자와 회복자'], [/점유권/, '점유권'], [/상린관계/, '상린관계'], [/분묘기지권/, '분묘기지권'], [/약관/, '약관'], [/예약완결권/, '예약완결권'], [/교환하자|교환계약/, '교환계약'],
    [/겸업|업무범위/, '겸업'], [/명의신탁/, '명의신탁'], [/분묘|묘지|장사/, '분묘'], [/자격증/, '자격증 양도 대여'], [/집합건물/, '집합건물'], [/계약금등을 예치|예치명의자/, '계약금 예치'], [/강제경매/, '강제경매'],
    [/임야도.*축척|지적도.*축척/, '지적도 임야도 축척'], [/지목의 구분/, '지목'], [/면적을 측정|등록할 면적|면적의 결정/, '면적 등록'], [/지적위원회/, '중앙지적위원회'], [/등록전환.*지번|지번부여/, '등록전환 지번'], [/면적합계|경계점좌표등록부/, '토지분할 면적'], [/가산세/, '가산세'], [/완화 적용|완화 요청/, '건축기준 완화']
  ];
  for (const [pattern, term] of subjectTerms) if (pattern.test(text)) terms.push(term);
  return [...new Set(terms)];
}
function matchingCard(question, cards) {
  const scopedCards = cards.filter(card => card.subject === question.subject && !card.id.startsWith('gap-'));
  const searchable = `${question.text} ${question.explanation || ''} ${question.choices.join(' ')}`;
  return scopedCards.some(card => card.sourceId === question.id || card.relatedTerms.some(term => term.length > 2 && searchable.includes(term)));
}

const existing = new Set(study.cards.map(card => card.sourceId));
const candidates = questions.filter(question => !reviewHoldIds.has(question.id) && !existing.has(question.id) && ((question.year < 2026 && !matchingCard(question, study.cards) && question.explanation?.replace(/\s/g, '').length >= 40) || manualCoverageIds.has(question.id)));
const skippedAmbiguous = candidates.filter(question => (Array.isArray(question.answer) ? question.answer : [question.answer]).length >= 5);
const additions = candidates.filter(question => (Array.isArray(question.answer) ? question.answer : [question.answer]).length < 5).map(question => {
  const title = topicFor(question);
  const correct = labelAnswer(question);
  const explanation = question.explanation.trim();
  const parts = explanationParts(question, correct);
  const id = `gap-${question.id}`;
  return {
    id,
    subject: question.subject,
    title,
    concept: [parts.concept],
    sourceId: question.id,
    relatedTerms: relatedTermsFor(question, title),
    bookQuestionNumber: question.number,
    prompt: question.text,
    answer: correct,
    memorize: [parts.keyFact]
  };
});

for (const card of additions) study.cards.push(card);
fs.writeFileSync(studyPath, `${JSON.stringify(study, null, 2)}\n`);
console.log(`Added ${additions.length} source-linked cards; skipped ${skippedAmbiguous.length} whole-key/all-choice items; held ${reviewHoldIds.size} conflicting items for source verification.`);
for (const subject of [...new Set(questions.map(question => question.subject))]) {
  const items = additions.filter(card => card.subject === subject);
  console.log(`${subject}: +${items.length}`);
}
const structurallyMapped = questions.filter(question => study.cards.some(card => {
  if (card.subject !== question.subject) return false;
  if (card.sourceId === question.id) return true;
  const searchable = `${question.text} ${question.explanation || ''} ${question.choices.join(' ')}`;
  return card.relatedTerms.some(term => term.length > 2 && searchable.includes(term));
}));
const unmappedIds = questions.filter(question => !structurallyMapped.includes(question)).map(question => question.id);
console.log(`Question-to-card structural map: ${structurallyMapped.length}/${questions.length}; unmapped: ${unmappedIds.join(', ') || 'none'}.`);
