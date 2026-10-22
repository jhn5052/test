// Builds the 오늘의 라디오 narration as audio files so phones can keep playing with the screen locked.
// Usage: node scripts/build_radio_audio.js [--dry-run]   (macOS only: uses `say` and `afconvert`)
// Re-run after editing data/study-types.json; unchanged clips are skipped by text hash.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const audioDir = path.join(root, 'audio/radio');
const outPath = path.join(root, 'data/radio.json');
const VOICE = 'Yuna (Enhanced)';
const BITRATE = 32000;
const dryRun = process.argv.includes('--dry-run');

// Reuse the app's own text clean-up so the narration matches what the cards show.
const appSource = fs.readFileSync(path.join(root, 'app.js'), 'utf8');
function topLevel(header) {
  const start = appSource.indexOf(header);
  if (start < 0) throw new Error(`${header} not found in app.js`);
  const rest = appSource.slice(start + header.length);
  const next = rest.search(/\n(?:async function|function|const|let|class) /);
  return header + (next < 0 ? rest : rest.slice(0, next));
}
const { normalizeStudyText, isAnswerKeyConcept } = vm.runInNewContext(
  ['const OCR_WORD_FIXES =', 'const STUDY_WORD_FIXES =', 'function normalizeStudyText(', 'function isAnswerKeyConcept('].map(topLevel).join('\n')
  + '\n({ normalizeStudyText, isAnswerKeyConcept })'
);

const SUBJECTS = vm.runInNewContext(`${topLevel('const SUBJECTS =')}\nSUBJECTS`);
const questions = JSON.parse(fs.readFileSync(path.join(root, 'data/questions.json'), 'utf8')).questions;
const questionIds = new Set(questions.map(q => q.id));
const cards = JSON.parse(fs.readFileSync(path.join(root, 'data/study-types.json'), 'utf8')).cards
  .filter(card => card.id && SUBJECTS.includes(card.subject) && card.title && !card.id.startsWith('gap-')
    && Array.isArray(card.concept) && card.concept.length && Array.isArray(card.relatedTerms)
    && (!card.sourceId || questionIds.has(card.sourceId)));

const sentence = text => /[.!?다요]$/.test(text) ? text : `${text}.`;
function cardText(card) {
  const concepts = card.concept.map(normalizeStudyText).filter(Boolean).map(sentence);
  const memorize = (card.memorize || []).map(normalizeStudyText).filter(point => point && !isAnswerKeyConcept(point)).map(sentence);
  return [
    `이번 개념은 ${normalizeStudyText(card.title)}입니다.`,
    ...concepts,
    memorize.length ? `시험 직전 암기 포인트입니다. ${memorize.join(' ')}` : '',
  ].filter(Boolean).join(' ');
}

// Korean particles depend on whether the last sound has a final consonant (받침).
const DIGIT_HAS_FINAL = { 0: true, 1: true, 2: false, 3: true, 4: false, 5: false, 6: true, 7: true, 8: true, 9: false };
function hasFinal(word) {
  const last = word.trim().slice(-1), code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  if (/\d/.test(last)) return DIGIT_HAS_FINAL[last];
  return false;
}
const particle = (word, withFinal, withoutFinal) => `${word.trim()}${hasFinal(word) ? withFinal : withoutFinal}`;
// Rewrite symbols the voice would skip or misread (‰, ×, 2/3, →, ·, >) into spoken Korean.
function speechText(text) {
  return text
    .replace(/\*\*|`/g, '')
    .replace(/\s*\n\s*[•▪◦-]?\s*/g, '. ')
    .replace(/\(\s*[+＋]\s*\)|\(\s*[-−–]\s*\)/g, '')
    .replace(/\s*[()]\s*/g, ' ')
    .replace(/;/g, '.')
    .replace(/(\d{4})\.\s?(\d{1,2})\.\s?(\d{1,2})\.?/g, '$1년 $2월 $3일')
    .replace(/([\d][\d,.]*)\s*‰/g, '천분의 $1')
    .replace(/\d+(?:\s*\/\s*\d+){2,}/g, match => match.split('/').map(part => part.trim()).join(', '))
    .replace(/(\d+)\s*\/\s*(\d+)/g, (match, top, bottom) => `${bottom}분의 ${top}`)
    .replace(/%p/g, '퍼센트포인트')
    .replace(/㎡|m²/g, '제곱미터')
    .replace(/×/g, ' 곱하기 ').replace(/÷/g, ' 나누기 ')
    .replace(/(\S+)\s*>\s*(\d+)이면/g, (match, left, value) => `${particle(left, '이', '가')} ${value}보다 크면`)
    .replace(/([^\s:.,]+)\s*>\s*([^:.,]+)/g, (match, left, right) => `${particle(left, '이', '가')} ${right.trim()}보다 큼`)
    .replace(/([^\s:.,]+)\s*≠\s*([^:.,]+)/g, (match, left, right) => `${particle(left, '은', '는')} ${particle(right, '과', '와')} 다름`)
    .replace(/(\S)\s*[=＝]\s*/g, (match, previous) => `${particle(previous, '은', '는')} `)
    .replace(/≥/g, ' 이상 ').replace(/≤/g, ' 이하 ').replace(/≒|≈/g, ' 약 ').replace(/±/g, ' 플러스마이너스 ')
    .replace(/\s*[→⇒←]\s*/g, ', ')
    .replace(/(^|\s)[+＋](?=\d)/g, '$1플러스 ').replace(/(^|\s|에서)[−–-](?=\d)/g, '$1마이너스 ')
    .replace(/(\d)\s*[~∼]\s*(\d)/g, '$1에서 $2').replace(/\s*[~∼]\s*/g, '에서 ')
    .replace(/\s*[·ㆍ•]\s*/g, ', ')
    .replace(/\s+\/\s+/g, '. ').replace(/\//g, ', ')
    .replace(/\s*\+\s*/g, ' 더하기 ')
    .replace(/\s*[−]\s*/g, ' 빼기 ').replace(/(\d)\s*[–-]\s*(\d)/g, '$1 빼기 $2').replace(/\s[–]\s?/g, ', ')
    .replace(/[①②③④⑤]/g, mark => `${'①②③④⑤'.indexOf(mark) + 1}번 `)
    .replace(/[[\]{}「」『』《》〈〉"“”‘’]/g, ', ')
    .replace(/'/g, '')
    .replace(/\s*,(?:\s*,)+/g, ',').replace(/,\s*([.!?:])/g, '$1').replace(/([.!?:])\s*,/g, '$1').replace(/^\s*,\s*/, '')
    .replace(/\s+([,.!?])/g, '$1').replace(/\s+/g, ' ').trim();
}

const clips = [
  { id: 'intro', kind: 'intro', title: '오늘의 방향', text: '오늘의 학습 라디오입니다. 오늘은 다섯 과목을 차례로 돌며 시험에 자주 나오는 개념을 듣습니다. 화면을 보지 않아도 괜찮습니다. 들으면서 각 개념을 내 말로 설명할 수 있는지 떠올려 보세요.' },
  ...SUBJECTS.map((subject, index) => ({ id: `subject-${index + 1}`, kind: 'subject', subject, title: subject, text: `이번 과목은 ${subject}입니다.` })),
  ...cards.map(card => ({ id: card.id, kind: 'concept', subject: card.subject, title: normalizeStudyText(card.title), text: cardText(card) })),
  { id: 'outro', kind: 'outro', title: '마무리', text: '오늘의 라디오는 여기까지입니다. 바로 설명하기 어려웠던 개념은 암기카드에서 다시 확인하고, 관련 기출을 풀어 보세요. 내일은 다른 개념으로 찾아오겠습니다.' },
];

const previous = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : { clips: [] };
const previousById = new Map(previous.clips.map(clip => [clip.id, clip]));
if (!dryRun) fs.mkdirSync(audioDir, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'radio-'));
let made = 0, kept = 0;
const output = clips.map(clip => {
  const speech = speechText(clip.text);
  const hash = crypto.createHash('sha1').update(`${VOICE}|${BITRATE}|${speech}`).digest('hex').slice(0, 12);
  const file = `audio/radio/${clip.id}.m4a`;
  const old = previousById.get(clip.id);
  const entry = { id: clip.id, kind: clip.kind, subject: clip.subject, title: clip.title, text: clip.text, file, hash };
  if (dryRun) return { ...entry, speech };
  if (old?.hash === hash && fs.existsSync(path.join(root, file))) { kept++; return { ...entry, seconds: old.seconds }; }
  const textPath = path.join(tmp, 'clip.txt'), aiffPath = path.join(tmp, 'clip.aiff');
  fs.writeFileSync(textPath, speech);
  execFileSync('say', ['-v', VOICE, '-f', textPath, '-o', aiffPath]);
  execFileSync('afconvert', [aiffPath, '-o', path.join(root, file), '-f', 'm4af', '-d', 'aac', '-b', String(BITRATE)]);
  const info = execFileSync('afinfo', [path.join(root, file)], { encoding: 'utf8' });
  const seconds = Number(Number(info.match(/estimated duration: ([\d.]+)/)[1]).toFixed(2));
  made++;
  if (made % 25 === 0) console.log(`${made} clips…`);
  return { ...entry, seconds };
});
fs.rmSync(tmp, { recursive: true, force: true });

if (dryRun) {
  const symbols = {};
  output.forEach(clip => [...clip.speech].forEach(char => { if (!/[\p{Script=Hangul}\p{L}\d\s.,!?%]/u.test(char)) symbols[char] = (symbols[char] || 0) + 1; }));
  console.log(`${output.length} clips, ${output.reduce((sum, clip) => sum + clip.speech.length, 0)} spoken characters`);
  console.log('symbols left in speech text:', JSON.stringify(symbols));
  const dryPath = process.argv[process.argv.indexOf('--dry-run') + 1];
  if (dryPath && !dryPath.startsWith('--')) { fs.writeFileSync(dryPath, JSON.stringify(output, null, 2)); console.log('speech text written to', dryPath); }
} else {
  const used = new Set(output.map(clip => path.basename(clip.file)));
  fs.readdirSync(audioDir).filter(name => !used.has(name)).forEach(name => fs.rmSync(path.join(audioDir, name)));
  fs.writeFileSync(outPath, JSON.stringify({ voice: VOICE, clips: output }, null, 2) + '\n');
  const total = output.reduce((sum, clip) => sum + clip.seconds, 0);
  console.log(`${output.length} clips (${made} made, ${kept} unchanged), ${(total / 60).toFixed(1)} minutes of audio → ${path.relative(root, outPath)}`);
}
