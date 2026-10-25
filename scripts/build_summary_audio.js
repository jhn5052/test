// Records the 필수 암기 page as one audio file per subject so phones can keep playing with the screen locked.
// Usage: node scripts/build_summary_audio.js [--dry-run [path]]   (macOS only: uses `say` and `afconvert`)
// Re-run after editing data/core-summary.json; subjects whose spoken text did not change are skipped.
// The voice is Siri 민지: download it first in System Settings > Accessibility > Spoken Content > System voice > Manage Voices > 한국어.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');
const { execFileSync } = require('node:child_process');

const root = path.resolve(__dirname, '..');
const audioDir = path.join(root, 'audio/summary');
const outPath = path.join(root, 'data/summary-audio.json');
const VOICE = { id: 'com.apple.ttsbundle.gryphon-neural_Minji_ko-KR_premium', name: 'Siri 민지' };
const RATE = 22050;
const BITRATE = 32000;
const GAP = 0.8;
const dryRun = process.argv.includes('--dry-run');

// Korean particles depend on whether the last sound has a final consonant (받침).
const DIGIT_HAS_FINAL = { 0: true, 1: true, 2: false, 3: true, 4: false, 5: false, 6: true, 7: true, 8: true, 9: false };
function hasFinal(word) {
  const last = word.trim().slice(-1), code = last.charCodeAt(0);
  if (code >= 0xac00 && code <= 0xd7a3) return (code - 0xac00) % 28 !== 0;
  if (/\d/.test(last)) return DIGIT_HAS_FINAL[last];
  return false;
}
const particle = (word, withFinal, withoutFinal) => `${word.trim()}${hasFinal(word) ? withFinal : withoutFinal}`;
// Rewrite symbols the voice would skip or misread (‰, ×, 2/3, →, ·, >, 4m) into spoken Korean.
function speechText(text) {
  return text
    .replace(/\*\*|`/g, '')
    .replace(/\s*\n\s*[•▪◦-]?\s*/g, '. ')
    .replace(/\s+vs\.?\s+/gi, '와 ')
    .replace(/\(\s*[+＋]\s*\)|\(\s*[-−–]\s*\)/g, '')
    .replace(/\)(?=[가-힣])/g, '').replace(/\s*[()]\s*/g, ', ')
    .replace(/;/g, '.')
    .replace(/테마\s*0?(\d+)/g, '테마 $1')
    .replace(/도시·군/g, '도시군').replace(/시·군·구/g, '시군구').replace(/시·도/g, '시도').replace(/시·군/g, '시군').replace(/읍·면/g, '읍면')
    .replace(/(\d{4})\.\s?(\d{1,2})\.\s?(\d{1,2})\.?/g, '$1년 $2월 $3일')
    .replace(/([\d][\d,.]*)\s*‰/g, '천분의 $1')
    .replace(/\d+(?:\s*\/\s*\d+){2,}/g, match => match.split('/').map(part => part.trim()).join(', '))
    .replace(/(\d+)\s*\/\s*(\d+)/g, (match, top, bottom) => `${bottom}분의 ${top}`)
    .replace(/%p/g, '퍼센트포인트')
    .replace(/㎡|m²/g, '제곱미터').replace(/㎢/g, '제곱킬로미터').replace(/(\d)\s*m(?![a-zA-Z])/g, '$1미터')
    .replace(/×/g, ' 곱하기 ').replace(/÷/g, ' 나누기 ')
    .replace(/(\S+)\s*>\s*(\d+)이면/g, (match, left, value) => `${particle(left, '이', '가')} ${value}보다 크면`)
    .replace(/([^\s:.,]+)\s*>\s*([^:.,]+)/g, (match, left, right) => `${particle(left, '이', '가')} ${right.trim()}보다 큼`)
    .replace(/([^\s:.,]+)\s*≠\s*([^:.,]+)/g, (match, left, right) => `${particle(left, '은', '는')} ${particle(right, '과', '와')} 다름`)
    .replace(/(\S)\s*[=＝]\s*/g, (match, previous) => `${particle(previous, '은', '는')} `)
    .replace(/≥/g, ' 이상 ').replace(/≤/g, ' 이하 ').replace(/≒|≈/g, ' 약 ').replace(/±/g, ' 플러스마이너스 ')
    .replace(/\s*[→⇒←]\s*/g, ', ')
    .replace(/(\S+)\s*↔\s*/g, (match, left) => `${particle(left, '과', '와')} `)
    .replace(/(\S+?)([,.]?)\s*⊕\s*/g, (match, left, mark) => mark ? `${left}${mark} 그리고 ` : `${particle(left, '과', '와')} `)
    .replace(/(^|\s)[+＋](?=\d)/g, '$1플러스 ').replace(/(^|\s|에서)[−–-](?=\d)/g, '$1마이너스 ')
    .replace(/(\d)\s*[~∼]\s*(\d)/g, '$1에서 $2').replace(/\s*[~∼]\s*/g, '에서 ')
    .replace(/\s*[·ㆍ•]\s*/g, ', ')
    .replace(/\s+\/\s+/g, '. ').replace(/\//g, ', ')
    .replace(/\s*\+\s*/g, ' 더하기 ')
    .replace(/\s*[−]\s*/g, ' 빼기 ').replace(/(\d)\s*[–-]\s*(\d)/g, '$1 빼기 $2').replace(/\s[–—]\s?/g, ', ')
    .replace(/[①②③④⑤]/g, mark => `${'①②③④⑤'.indexOf(mark) + 1}번 `)
    .replace(/[[\]{}「」『』《》〈〉"“”‘’]/g, ', ')
    .replace(/'/g, '')
    .replace(/\s*,(?:\s*,)+/g, ',').replace(/,\s*([.!?:])/g, '$1').replace(/([.!?:])\s*,/g, '$1').replace(/^\s*,\s*/, '')
    .replace(/\s+([,.!?])/g, '$1').replace(/\s+/g, ' ').trim();
}

// Notation the general rules cannot read: formulas, 건폐율/용적률 pairs, and "+" used to mean "and".
// Each " / " part is handled on its own, because one item can mix a formula with plain sentences.
function spokenPart(part) {
  if (/[=−×÷√]/.test(part)) {
    return part
      .replace(/\|([^|]+)\|/g, '$1의 절댓값')
      .replace(/\(([^()]+)\)²/g, '$1의 제곱')
      .replace(/√\(([^()]+)\)/g, (match, inner) => `루트 ${inner.replace(/\//g, ' 나누기 ')}`)
      .replace(/\^λ/g, '의 람다 제곱')
      .replace(/식을 P= 형태로 바꿨을 때/g, '식을 P에 대해 정리했을 때');
  }
  return part
    .replace(/(\S+)\s*>\s*(\S+)\s*>\s*(\S+)/g, '$1, $2, $3 순으로 많음')
    .replace(/(\S+)\s*<\s*([^·)]+?)면/g, (match, left, right) => `${particle(left, '이', '가')} ${right}보다 작으면`)
    .replace(/\s*\+\s*/g, ' ⊕ ');
}
function spokenItem(text) {
  const pairs = /^(?:건폐율\/용적률|시행령 세분)/.test(text);
  return text.replace(/^건폐율\/용적률/, '건폐율과 용적률').replace(/대체재 \+, 보완재 −/g, '대체재는 양수, 보완재는 음수').split(' / ')
    .map(part => spokenPart(pairs ? part.replace(/(\d+)\/(\d+)/g, '$1에 $2') : part)).join(' / ');
}
const sentence = text => /[.!?다요]$/.test(text.trim()) ? text.trim() : `${text.trim()}.`;
// Table cells use marks the page reads at a glance: O/X, — and short dates like 6.1 or 12.1~15.
function cellText(cell) {
  return cell.trim()
    .replace(/^O(?=\s|$)/, '가능').replace(/^X(?=\s|$)/, '불가').replace(/^—$/, '해당 없음')
    .replace(/^(\d{1,2})\.(\d{1,2})~(\d{1,2})$/, '$1월 $2일부터 $3일까지').replace(/^(\d{1,2})\.(\d{1,2})$/, '$1월 $2일');
}
function blockText(block) {
  if (block.type !== 'table') return block.items.map(item => sentence(spokenItem(item))).join(' ');
  const columns = block.head.slice(1).map(spokenItem);
  return block.rows.map(([label, ...cells]) => columns.length === 1
    ? `${spokenItem(label)}: ${sentence(spokenItem(cellText(cells[0])))}`
    : `${sentence(spokenItem(label))} ${cells.map((cell, index) => `${particle(columns[index], '은', '는')} ${sentence(spokenItem(cellText(cell)))}`).join(' ')}`).join(' ');
}
function subjectParts(subject) {
  const opening = [`${subject.name} 필수 암기입니다.`, subject.goal ? sentence(spokenItem(subject.goal)) : '', subject.intro ? sentence(spokenItem(subject.intro)) : ''];
  return [
    { title: subject.name, text: opening.filter(Boolean).join(' ') },
    ...subject.sections.map(section => ({
      title: section.title.replace(/\*\*/g, ''),
      text: [sentence(spokenItem(section.note ? `${section.title}, ${section.note}` : section.title)), ...section.blocks.map(blockText)].join(' '),
    })),
  ];
}

// `say` writes WAVE files with extra chunks (FLLR), so find the PCM data chunk instead of assuming a 44-byte header.
function wavSamples(file) {
  const bytes = fs.readFileSync(file);
  for (let offset = 12; offset + 8 <= bytes.length;) {
    const id = bytes.toString('ascii', offset, offset + 4), size = bytes.readUInt32LE(offset + 4);
    if (id === 'data') return bytes.subarray(offset + 8, offset + 8 + size);
    offset += 8 + size + (size & 1);
  }
  throw new Error(`${file}: no data chunk`);
}
function wavFile(pcm) {
  const header = Buffer.alloc(44);
  header.write('RIFF', 0); header.writeUInt32LE(36 + pcm.length, 4); header.write('WAVE', 8); header.write('fmt ', 12);
  header.writeUInt32LE(16, 16); header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22); header.writeUInt32LE(RATE, 24);
  header.writeUInt32LE(RATE * 2, 28); header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34); header.write('data', 36); header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

const summary = JSON.parse(fs.readFileSync(path.join(root, 'data/core-summary.json'), 'utf8'));
const previous = fs.existsSync(outPath) ? JSON.parse(fs.readFileSync(outPath, 'utf8')) : { subjects: [] };
const previousById = new Map(previous.subjects.map(subject => [subject.id, subject]));
if (!dryRun) fs.mkdirSync(audioDir, { recursive: true });
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'summary-audio-'));
let made = 0, kept = 0;
// `say -v` cannot pick Siri voices; it only speaks with one as the system voice. Switch it for this run and put it back afterwards.
const VOICE_SETTING = ['com.apple.Accessibility', 'SpeechVoiceIdentifierForLanguage'];
let originalVoice = null;
if (!dryRun) {
  try { originalVoice = execFileSync('defaults', ['read', ...VOICE_SETTING], { encoding: 'utf8' }); } catch {}
  execFileSync('defaults', ['write', ...VOICE_SETTING, '-dict-add', '2', `{ ko = "${VOICE.id}"; }`]);
}
function restoreVoice() {
  if (dryRun) return;
  if (originalVoice) execFileSync('defaults', ['write', ...VOICE_SETTING, originalVoice]);
  else execFileSync('defaults', ['delete', ...VOICE_SETTING]);
}
let output;
try {
  output = summary.subjects.map(subject => {
    const parts = subjectParts(subject).map(part => ({ ...part, speech: speechText(part.text) }));
    const hash = crypto.createHash('sha1').update([VOICE.id, BITRATE, GAP, ...parts.map(part => part.speech)].join('|')).digest('hex').slice(0, 12);
    const file = `audio/summary/${subject.id}.m4a`;
    if (dryRun) return { id: subject.id, parts };
    const old = previousById.get(subject.id);
    if (old?.hash === hash && fs.existsSync(path.join(root, file))) { kept++; return old; }
    const gap = Buffer.alloc(Math.round(GAP * RATE) * 2);
    const chunks = [];
    let bytes = 0;
    const timed = parts.map((part, index) => {
      const textPath = path.join(tmp, 'part.txt'), wavPath = path.join(tmp, 'part.wav');
      fs.writeFileSync(textPath, part.speech);
      execFileSync('say', ['-f', textPath, '-o', wavPath, '--file-format=WAVE', `--data-format=LEI16@${RATE}`]);
      const pcm = wavSamples(wavPath), start = bytes / 2 / RATE;
      chunks.push(pcm); bytes += pcm.length;
      if (index < parts.length - 1) { chunks.push(gap); bytes += gap.length; }
      return { title: part.title, start: Number(start.toFixed(2)) };
    });
    const joined = path.join(tmp, 'subject.wav');
    fs.writeFileSync(joined, wavFile(Buffer.concat(chunks)));
    execFileSync('afconvert', [joined, '-o', path.join(root, file), '-f', 'm4af', '-d', 'aac', '-b', String(BITRATE)]);
    const info = execFileSync('afinfo', [path.join(root, file)], { encoding: 'utf8' });
    made++;
    console.log(`${subject.short}: ${parts.length} parts, ${(bytes / 2 / RATE / 60).toFixed(1)} min`);
    return { id: subject.id, file, hash, seconds: Number(Number(info.match(/estimated duration: ([\d.]+)/)[1]).toFixed(2)), parts: timed };
  });
} finally {
  restoreVoice();
  fs.rmSync(tmp, { recursive: true, force: true });
}

if (dryRun) {
  const symbols = {};
  output.forEach(subject => subject.parts.forEach(part => [...part.speech].forEach(char => { if (!/[\p{Script=Hangul}\p{L}\d\s.,!?%:]/u.test(char)) symbols[char] = (symbols[char] || 0) + 1; })));
  console.log(`${output.length} subjects, ${output.reduce((sum, subject) => sum + subject.parts.reduce((total, part) => total + part.speech.length, 0), 0)} spoken characters`);
  console.log('symbols left in speech text:', JSON.stringify(symbols));
  const dryPath = process.argv[process.argv.indexOf('--dry-run') + 1];
  if (dryPath && !dryPath.startsWith('--')) { fs.writeFileSync(dryPath, JSON.stringify(output, null, 2)); console.log('speech text written to', dryPath); }
} else {
  const used = new Set(output.map(subject => path.basename(subject.file)));
  fs.readdirSync(audioDir).filter(name => !used.has(name)).forEach(name => fs.rmSync(path.join(audioDir, name)));
  fs.writeFileSync(outPath, JSON.stringify({ voice: VOICE.name, subjects: output }, null, 2) + '\n');
  const total = output.reduce((sum, subject) => sum + subject.seconds, 0);
  console.log(`${output.length} subjects (${made} recorded, ${kept} unchanged), ${(total / 60).toFixed(1)} minutes of audio → ${path.relative(root, outPath)}`);
}
