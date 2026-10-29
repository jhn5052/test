const STORAGE_KEY = "gyeol-study-v1";
const SUBJECTS = ["부동산학개론", "민법 및 민사특별법", "공인중개사법령 및 중개실무", "부동산공법", "부동산공시에 관한 법령 및 부동산 관련 세법"];
const EXAM_STAGES = {
  first: { label: "1차 실전", subjects: SUBJECTS.slice(0, 2), questions: 80, minutes: 100 },
  secondFirst: { label: "2차 1교시", subjects: SUBJECTS.slice(2, 4), questions: 80, minutes: 100 },
  secondSecond: { label: "2차 2교시", subjects: SUBJECTS.slice(4), questions: 40, minutes: 50 }
};
const LETTERS = ["①", "②", "③", "④", "⑤"];
let bank = [];
let studyTypes = [];
let essentialCloze = [];
const conceptLinkCache = new Map();
let coreSummary = null;
let conceptLinkAudit = null;
let answerKeys = {};
let store = readStore();
let view = "dashboard";
let quiz = store.active || null;
let interval = null;
let toastTimeout = null;
let flashcardIndex = 0;
let flashcardFlipped = false;
let studyTypeIndex = 0;
let studyTypeFlipped = false;
let studyTypeSubject = "all";
let studyTypeMode = "quick";
let studyTypeSelected = null;
let studyTypeRevealed = false;
let studyTypeQuestionOpen = false;
let studyRecallOrder = [];
let studyRecallAgainIds = new Set();
let studyRecallInput = "";
let studyTypeSearch = "";
let showAllHistory = false;
let mistakeRetryQuestionId = null;
let mistakeRetrySelected = null;
let mistakeRetryFeedback = "";
let calculatorState = { display: "0", expression: "", stored: null, operator: null, waitingForOperand: false };
let issueQuestionId = null;
let summaryAudio = null;
const summaryPlayer = { audio: null, subjectId: null, tracks: new Map(), failed: null, partIndex: -1, resumeAt: 0 };

function readStore() {
  const defaults = { history: [], mistakes: [], flashcards: [], questionIssues: [], recallProgress: {}, active: null };
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}");
    ["radioProfile", "radioProgress", "radioDuration"].forEach(key => delete saved[key]);
    return { ...defaults, ...saved, history: Array.isArray(saved.history) ? saved.history.map(normalizeAttempt).filter(Boolean) : [], mistakes: Array.isArray(saved.mistakes) ? saved.mistakes : [], flashcards: Array.isArray(saved.flashcards) ? saved.flashcards : [], questionIssues: Array.isArray(saved.questionIssues) ? saved.questionIssues : [], recallProgress: saved.recallProgress && typeof saved.recallProgress === "object" ? saved.recallProgress : {} };
  } catch { return defaults; }
}
function persist() {
  store.active = quiz;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(store));
  updateCounts();
}
function escapeHTML(value = "") {
  return String(value).replace(/[&<>"']/g, char => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[char]);
}
function fmtDate(value) {
  if (!Number.isFinite(new Date(value).getTime())) return "날짜 미상";
  return new Intl.DateTimeFormat("ko-KR", { month: "long", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(value));
}
function fmtDuration(ms) {
  const total = Math.max(0, Math.ceil(ms / 1000));
  return `${String(Math.floor(total / 60)).padStart(2, "0")}:${String(total % 60).padStart(2, "0")}`;
}
function isCorrect(question, chosen) {
  const accepted = Array.isArray(question.answer) ? question.answer : [question.answer];
  return accepted.includes(Number(chosen));
}
function answerLabel(question) {
  const accepted = Array.isArray(question.answer) ? question.answer : [question.answer];
  return accepted.map(answer => `${LETTERS[answer - 1]} ${question.choices[answer - 1]}`).join(" / ");
}
function finiteStoredNumber(value) {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}
function normalizeAttempt(attempt) {
  if (!attempt || typeof attempt !== "object") return null;
  const results = Array.isArray(attempt.results) ? attempt.results : [];
  const subjectRows = Object.values(attempt.subjects && typeof attempt.subjects === "object" ? attempt.subjects : {});
  const subjectTotal = subjectRows.reduce((sum, item) => sum + (finiteStoredNumber(item?.total) || 0), 0);
  const subjectCorrect = subjectRows.reduce((sum, item) => sum + (finiteStoredNumber(item?.correct) || 0), 0);
  const totalValue = finiteStoredNumber(attempt.total);
  const total = totalValue > 0 ? totalValue : results.length || subjectTotal;
  const correctValue = finiteStoredNumber(attempt.correct);
  const hasResultFlags = results.length && results.every(result => typeof result.correct === "boolean");
  const correct = hasResultFlags ? results.filter(result => result.correct).length : correctValue ?? (subjectTotal ? subjectCorrect : null);
  const rawScore = finiteStoredNumber(attempt.score);
  const score = total > 0 && correct !== null ? Math.round(correct / total * 100) : rawScore;
  if (score === null || score < 0 || score > 100) return null;
  const yearValue = finiteStoredNumber(attempt.year);
  const yearFromQuestion = results.map(result => String(result.questionId || "").match(/^(20\d{2})-/)?.[1]).find(Boolean);
  const year = yearValue >= 2000 && yearValue <= 2100 ? yearValue : yearFromQuestion ? Number(yearFromQuestion) : null;
  return { ...attempt, year, score: Math.round(score), total: total || finiteStoredNumber(attempt.total) || 0, correct: correct ?? correctValue ?? Math.round(score * (total || 100) / 100), subjects: attempt.subjects && typeof attempt.subjects === "object" ? attempt.subjects : {} };
}
function splitLabeledStatements(text) {
  const pattern = /(^|\s|\()([ㄱㄴㄷㄹㅁㅂ])\s*(?:[.．:：)]|\))\s*(?:[:：]\s*)?/g;
  const matches = [...text.matchAll(pattern)];
  if (matches.length < 2) return null;
  const first = matches[0];
  const introEnd = first.index + first[1].length - (first[1] === "(" ? 1 : 0);
  const intro = text.slice(0, introEnd).trim();
  const items = matches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    return { label: match[2], text: text.slice(start, end).replace(/^\s*[:：]\s*/, "").trim() };
  }).filter(item => item.text);
  return items.length >= 2 ? { intro, items } : null;
}
const OCR_WORD_FIXES = [
  "토지거래허가구역", "부동산거래정보망", "도시개발사업", "공공시설용지", "토지취득방식", "부동산개발사업", "한국표준산업분류", "공인중개사법령", "양도소득세", "토지소유자", "도시개발구역", "주택단지가", "도시및주거환경정비법", "부동산공시법", "부동산공법",
  "공인중개사", "금융기관", "건축물", "용도지역", "용도지구", "용도구역", "단독주택", "공동주택", "정비사업", "재산세", "과세표준", "과세대상", "신고기한", "사용검사", "용적률", "공급곡선", "공급량", "수요량", "균형거래량", "수익가액", "소유권", "지상권", "저당권", "매매계약", "균형가격", "공급함수", "수요함수", "감정평가방법", "수익환원법", "대상물건", "토지등소유자", "토지소유자의", "토지소유자가", "토지취득", "개발형태", "개발토지", "개발한", "배분하는", "분류상", "설명에", "설명으로", "내용으로", "내용이다", "들어갈", "알맞은", "해당하는", "해당하지", "분석하는", "분석기법", "타당성분석", "경쟁력을", "분양될", "투입요소", "변화가", "변화하였는가", "결과치", "어떠한", "영향을", "가격수준", "지역분석", "개별분석", "대상부동산", "부동산의", "이용이", "동질적이고", "가치형성", "지역요인", "주어진", "다음의", "기준에", "관련하여", "기초하여", "이용하여", "적용되는", "실시하는", "설치하는", "설명", "내용", "개발", "법령", "토지", "주택", "부동산", "옳은", "틀린", "해당", "경우", "수량의", "가격과", "나타냄", "변화하였다", "대출받았다", "대출금리", "상환액", "원리금", "공시지가", "비교표준지", "기대되는", "신고하여야", "도시개발법", "농어촌정비법", "지적소관청", "등록사항", "정정대상토지", "발급하는", "열람하게", "표시하거나", "공인중개사법", "업무정지처분", "개설등록", "손해배상책임", "공탁금", "회수할", "특별자치도", "가입이용신청", "정보처리기사", "특별시", "광역시", "재건축사업", "재개발사업", "추진위원회", "조합설립", "토지면적", "동의를", "신청하지", "수립고시", "지정고시", "실시계획", "인가를", "다만", "포함된", "아니하는", "정답으로", "문제에서", "관련된", "산정기준", "부과대상", "이었다", "이며", "월복리", "무시하며", "나타내고", "때에는", "기입등기가", "경매에"
].sort((a, b) => b.length - a.length);
const STUDY_WORD_FIXES = OCR_WORD_FIXES.filter(word => word !== "가격수준" && word !== "대상부동산");
const OCR_MATH_GLYPHS = { "":"D", "":"P", "":"Q", "":"S", "":"X", "":"Y", "":"1", "":"2", "":"3", "":"4", "":"5", "":"9", "":"0", "":"−", "":"=", "":"+", "":",", "":"/", "":"{", "":"}", "":".", "":"(", "":")", "":"d", "":"s", "":"x", "":"y", "":"", "":"", "":"", "":"", "":"", "":"", "":"" };
function normalizeQuestionText(text) {
  let value = String(text || "").replace(/[\u200b\ufeff]/g, "");
  value = value.replace(/[\uE000-\uF8FF]/g, glyph => Object.prototype.hasOwnProperty.call(OCR_MATH_GLYPHS, glyph) ? OCR_MATH_GLYPHS[glyph] : "□");
  for (const word of OCR_WORD_FIXES) {
    const pattern = word.split("").map(char => char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*");
    value = value.replace(new RegExp(pattern, "g"), word);
  }
  return value
    .replace(/\(\s+/g, "(").replace(/\s+\)/g, ")")
    .replace(/\[\s+/g, "[").replace(/\s+\]/g, "]")
    .replace(/([?？])(?=\()/g, "$1 ")
    .replace(/\/\s*(\d)\s+(\d)\b/g, "$2/$1")
    .replace(/\s+([,.;:!?？％%])/g, "$1")
    .replace(/\s*\/\s*/g, "/")
    .replace(/\b(Q)\s+([DS])\s+(\d)\b/g, "$1$2$3")
    .replace(/\b(Q[DS])\s+(\d)\b/g, "$1$2")
    .replace(/\b(Q)\s+([ds])\b/g, "$1$2")
    .replace(/\b((?:QD|QS)\d?|Q[dDs]|P|Q)\s+(는|가|은|의|를|와|과|에)/g, "$1$2")
    .replace(/\b([XY])\s+축/g, "$1축")
    .replace(/\s*([=+−])\s*/g, " $1 ")
    .replace(/−\s+(?=[A-Za-z])/g, "−")
    .replace(/(\d)\s+−(?=\s*[A-Za-z])/g, "$1 − ")
    .replace(/(m)\s*2\b/g, "$1²")
    .replace(/[ \t]{2,}/g, " ").trim();
}
function normalizeStudyText(text) {
  let value = String(text || "").replace(/[\u200b\ufeff]/g, "");
  for (const word of STUDY_WORD_FIXES) {
    const pattern = word.split("").map(char => char.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("\\s*");
    value = value.replace(new RegExp(pattern, "g"), word);
  }
  return value.replace(/\s+([,.;:!?？])/g, "$1").replace(/[ \t]{2,}/g, " ").trim();
}
function renderQuestionInline(text) {
  return escapeHTML(normalizeQuestionText(text))
    .replace(/\(\s*([ㄱㄴㄷㄹㅁㅂ])\s*\)/g, '<span class="question-fill-blank">($1)</span>')
    .replace(/\(\s*\)/g, '<span class="question-fill-blank is-empty">(　　)</span>');
}
function renderQuestionText(text) {
  const normalized = normalizeQuestionText(text);
  const questionEnd = normalized.search(/[?？]/);
  if (questionEnd < 0 || !normalized.slice(questionEnd + 1).trim()) return renderQuestionBody(normalized);
  const prompt = normalized.slice(0, questionEnd + 1).trim();
  const body = normalized.slice(questionEnd + 1).trim();
  const conditionList = /^(?:[([{]?\s*단[,，:：]|○\s*|\d+[.)]\s*|[([{]?[ㄱㄴㄷㄹㅁㅂ]\)?\s*[:：])/.test(body) || (body.match(/(?:^|\s)○\s*/g) || []).length > 1;
  return `<div class="question-stem"><span class="question-section-label">질문</span><div class="question-prompt">${renderQuestionInline(prompt)}</div></div><div class="question-body-block"><span class="question-section-label">${conditionList ? "문제 조건" : "문제 본문"}</span><div class="question-body">${renderQuestionBody(body)}</div></div>`;
}
function renderQuestionBody(text) {
  const bullets = [...text.matchAll(/(?:^|\s)○\s*/g)];
  if (bullets.length >= 2) {
    const intro = text.slice(0, bullets[0].index).trim();
    const items = bullets.map((match, index) => {
      const start = match.index + match[0].length;
      const end = bullets[index + 1]?.index ?? text.length;
      return text.slice(start, end).trim();
    }).filter(Boolean);
    return `${intro ? `<div class="statement-intro">${renderQuestionInline(intro)}</div>` : ""}<div class="question-condition-list">${items.map(item => `<div class="question-condition-item">${renderQuestionInline(item)}</div>`).join("")}</div>`;
  }
  const groups = splitLabeledStatements(text);
  if (!groups) return renderQuestionInline(text);
  return `${groups.intro ? `<div class="statement-intro">${renderQuestionInline(groups.intro)}</div>` : ""}<div class="statement-grid">${groups.items.map(item => `<div class="statement-item"><b>${item.label}</b><span>${renderQuestionInline(item.text)}</span></div>`).join("")}</div>`;
}
function renderChoiceText(text) {
  text = normalizeQuestionText(text);
  const groups = splitLabeledStatements(text);
  if (groups) return `<span class="compound-choice">${groups.items.map(item => `<span class="compound-entry"><b>${item.label}</b>${escapeHTML(item.text)}</span>`).join("")}</span>`;
  const combo = text.match(/^([ㄱㄴㄷㄹㅁㅂ](?:\s*[,·ㆍ]\s*[ㄱㄴㄷㄹㅁㅂ])*)$/);
  if (combo) return `<span class="choice-combination">${combo[1].split(/\s*[,·ㆍ]\s*/).map(label => `<b>${label}</b>`).join("")}</span>`;
  return escapeHTML(text);
}
function yearLabel(year) { return year ? (year === 2026 ? "2026년 예상문제" : `${year}년`) : "2020~2026년 전체"; }
function toast(message) {
  const el = document.querySelector("#toast");
  el.textContent = message; el.classList.add("visible");
  clearTimeout(toastTimeout); toastTimeout = setTimeout(() => el.classList.remove("visible"), 2300);
}
function updateCounts() {
  const el = document.querySelector("#mistake-count");
  if (el) el.textContent = store.mistakes.length;
  const days = document.querySelector("#streak-days");
  const cards = document.querySelector("#flashcard-count");
  if (cards) cards.textContent = studyTypes.length || 0;
  if (days) days.textContent = store.history.length ? `누적 ${store.history.length}회 응시` : "오늘도 한 걸음";
}
function setView(next) {
  if (next === "flashcards") { next = "study-types"; studyTypeMode = "saved"; }
  view = next;
  document.querySelectorAll(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.view === next));
  document.querySelector("#page-name").textContent = ({ dashboard: "대시보드", exam: "시험 응시", mistakes: "오답노트", flashcards: "암기카드", "study-types": "암기카드", result: "시험 결과", summary: "필수 암기" })[next] || "학습실";
  render();
}
function render() {
  const root = document.querySelector("#app-main");
  document.body.classList.toggle("exam-taking", Boolean(quiz));
  if (quiz) { view = "taking"; document.querySelector("#page-name").textContent = quiz.learning ? "개념 확인 문제" : "시험 응시"; root.innerHTML = renderQuiz(); bindQuiz(); startClock(); return; }
  stopClock();
  if (view === "exam") { root.innerHTML = renderSetup(); bindSetup(); }
  else if (view === "mistakes") { root.innerHTML = renderMistakes(); bindMistakes(); }
  else if (view === "flashcards") { root.innerHTML = renderFlashcards(); bindFlashcards(); }
  else if (view === "study-types") { root.innerHTML = renderStudyTypes(); bindStudyTypes(); if (studyTypeMode === "saved") bindFlashcards(); }
  else if (view === "summary") { root.innerHTML = renderCoreSummary(); bindCoreSummary(); }
  else if (view === "result" && store.history[0]) { root.innerHTML = renderResult(store.history[0]); bindResult(); }
  else { view = "dashboard"; root.innerHTML = renderDashboard(); bindDashboard(); }
  document.querySelector("#page-name").textContent = ({ dashboard: "대시보드", exam: "시험 응시", mistakes: "오답노트", flashcards: "암기카드", "study-types": "암기카드", result: "시험 결과", summary: "필수 암기" })[view] || "시험 응시";
  document.querySelectorAll(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.view === (view === "taking" ? "exam" : view)));
  updateCounts();
}
function titleBlock(kicker, title, sub, action = "") {
  return `<div class="page-heading"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${sub}</p></div>${action}</div>`;
}
function summaryTime(seconds) { const value = Math.max(0, Math.round(seconds || 0)); return `${Math.floor(value / 60)}:${String(value % 60).padStart(2, "0")}`; }
function summaryTrack(id) { return summaryAudio?.subjects?.find(track => track.id === id) || null; }
function summaryPartAt(track, time) { let index = 0; (track?.parts || []).forEach((part, i) => { if (time >= part.start - 0.05) index = i; }); return index; }
function nextSummarySubject(id) {
  const subjects = (coreSummary?.subjects || []).filter(subject => summaryTrack(subject.id));
  const index = subjects.findIndex(subject => subject.id === id);
  return index >= 0 ? subjects[index + 1] || null : null;
}
// Download the whole subject before playing: a blob URL seeks the same way online and offline, and the service worker keeps a copy.
// The hash in the URL changes whenever a subject is re-recorded, so a cached old recording never plays against new section times.
function loadSummaryTrack(id) {
  const track = summaryTrack(id);
  if (!track) return Promise.reject(new Error(`${id} 음성이 없습니다.`));
  let entry = summaryPlayer.tracks.get(id);
  if (!entry) {
    entry = { url: null };
    entry.promise = fetch(`${track.file}?v=${track.hash}`).then(response => { if (!response.ok) throw new Error(`${track.file} ${response.status}`); return response.blob(); })
      .then(blob => { entry.url = URL.createObjectURL(blob.type ? blob : new Blob([blob], { type: "audio/mp4" })); return entry.url; })
      .catch(error => { summaryPlayer.tracks.delete(id); throw error; });
    summaryPlayer.tracks.set(id, entry);
  }
  return entry.promise;
}
function prepareSummaryTrack(id) {
  if (summaryPlayer.failed === id) summaryPlayer.failed = null;
  loadSummaryTrack(id).then(syncSummaryControls, error => { console.warn(error); summaryPlayer.failed = id; syncSummaryControls(); });
  syncSummaryControls();
}
function summaryListening(id) { const audio = summaryPlayer.audio; return Boolean(audio && summaryPlayer.subjectId === id && audio.currentSrc); }
function saveSummaryProgress() {
  const audio = summaryPlayer.audio;
  if (!audio || !summaryPlayer.subjectId || !audio.currentSrc) return;
  store.summaryListen = { subjectId: summaryPlayer.subjectId, position: audio.ended ? 0 : Math.floor(audio.currentTime) };
  persist();
}
function summaryMediaSession() {
  if (!("mediaSession" in navigator) || typeof MediaMetadata === "undefined") return;
  const audio = summaryPlayer.audio, track = summaryTrack(summaryPlayer.subjectId);
  const subject = coreSummary?.subjects?.find(item => item.id === summaryPlayer.subjectId);
  navigator.mediaSession.metadata = new MediaMetadata({ title: track?.parts[summaryPartAt(track, audio?.currentTime || 0)]?.title || "과목별 필수 암기", artist: `${subject?.short || ""} 필수 암기`, album: "공인중개사 기출연습" });
  if (audio && Number.isFinite(audio.duration) && navigator.mediaSession.setPositionState) {
    try { navigator.mediaSession.setPositionState({ duration: audio.duration, playbackRate: audio.playbackRate, position: Math.min(audio.currentTime, audio.duration) }); } catch {}
  }
}
// When a subject ends, go straight on to the next one so it keeps playing like an album with the screen locked.
function continueSummary() {
  const finished = summaryPlayer.subjectId, next = nextSummarySubject(finished);
  store.summaryListen = { subjectId: finished, position: 0 };
  if (!next || !summaryPlayer.tracks.get(next.id)?.url) { persist(); summaryPlayer.partIndex = -1; syncSummaryControls(); return false; }
  const following = store.summarySubject === finished;
  if (following) store.summarySubject = next.id;
  persist();
  playSummarySubject(next.id, 0);
  if (following && view === "summary") render();
  return true;
}
function summaryAudioElement() {
  if (summaryPlayer.audio) return summaryPlayer.audio;
  const audio = new Audio();
  audio.preload = "auto";
  let lastSaved = 0;
  audio.addEventListener("timeupdate", () => {
    const index = summaryPartAt(summaryTrack(summaryPlayer.subjectId), audio.currentTime);
    if (index !== summaryPlayer.partIndex) { summaryPlayer.partIndex = index; summaryMediaSession(); }
    if (Math.abs(audio.currentTime - lastSaved) >= 10) { lastSaved = audio.currentTime; saveSummaryProgress(); }
    syncSummaryControls();
  });
  audio.addEventListener("loadedmetadata", () => {
    if (summaryPlayer.resumeAt) { audio.currentTime = Math.min(summaryPlayer.resumeAt, Math.max(0, audio.duration - 1)); summaryPlayer.resumeAt = 0; }
    summaryMediaSession();
  });
  audio.addEventListener("play", () => {
    const next = nextSummarySubject(summaryPlayer.subjectId);
    if (next) loadSummaryTrack(next.id).catch(error => console.warn(error));
  });
  ["play", "pause"].forEach(type => audio.addEventListener(type, () => { saveSummaryProgress(); syncSummaryControls(); }));
  audio.addEventListener("ended", continueSummary);
  if ("mediaSession" in navigator) {
    const jumpPart = step => {
      const parts = summaryTrack(summaryPlayer.subjectId)?.parts || [], index = summaryPartAt({ parts }, audio.currentTime) + step;
      if (index >= parts.length) { if (summaryPlayer.tracks.get(nextSummarySubject(summaryPlayer.subjectId)?.id)?.url) continueSummary(); return; }
      audio.currentTime = parts[Math.max(0, index)]?.start || 0;
    };
    const handlers = {
      play: () => audio.play(), pause: () => audio.pause(),
      seekbackward: details => { audio.currentTime = Math.max(0, audio.currentTime - (details?.seekOffset || 15)); },
      seekforward: details => { audio.currentTime = Math.min(audio.duration || 0, audio.currentTime + (details?.seekOffset || 15)); },
      seekto: details => { audio.currentTime = details.seekTime; },
      previoustrack: () => { const parts = summaryTrack(summaryPlayer.subjectId)?.parts || []; jumpPart(audio.currentTime - (parts[summaryPartAt({ parts }, audio.currentTime)]?.start || 0) > 3 ? 0 : -1); },
      nexttrack: () => jumpPart(1),
    };
    Object.entries(handlers).forEach(([action, handler]) => { try { navigator.mediaSession.setActionHandler(action, handler); } catch {} });
  }
  summaryPlayer.audio = audio;
  return audio;
}
function playSummarySubject(id, from = null) {
  const url = summaryPlayer.tracks.get(id)?.url;
  if (!url) return;
  const audio = summaryAudioElement();
  if (summaryPlayer.subjectId !== id || !audio.currentSrc) {
    if (summaryListening(summaryPlayer.subjectId) && !audio.ended) saveSummaryProgress();
    const saved = store.summaryListen?.subjectId === id ? store.summaryListen.position : 0;
    Object.assign(summaryPlayer, { subjectId: id, partIndex: -1, resumeAt: from ?? saved });
    audio.src = url;
  } else if (from !== null) audio.currentTime = from;
  else if (audio.ended) audio.currentTime = 0;
  audio.play().catch(error => { console.warn(error); toast("재생을 시작하지 못했어요. 다시 눌러 주세요."); });
}
function stopSummaryPlayback() {
  const audio = summaryPlayer.audio;
  if (!audio || !audio.currentSrc) return;
  audio.pause(); audio.currentTime = 0;
  store.summaryListen = { subjectId: summaryPlayer.subjectId, position: 0 }; persist();
  summaryPlayer.partIndex = -1; syncSummaryControls();
}
function syncSummaryControls() {
  const panel = document.querySelector("[data-summary-listen]");
  if (!panel) return;
  const id = panel.dataset.summaryListen, track = summaryTrack(id), entry = summaryPlayer.tracks.get(id), audio = summaryPlayer.audio;
  const current = summaryListening(id), playing = current && !audio.paused && !audio.ended, started = current && audio.currentTime > 0 && !audio.ended;
  const saved = store.summaryListen?.subjectId === id ? store.summaryListen.position || 0 : 0;
  const position = started ? audio.currentTime : saved;
  const total = current && Number.isFinite(audio.duration) ? audio.duration : track?.seconds || 0;
  const failed = summaryPlayer.failed === id, ready = Boolean(entry?.url);
  const play = panel.querySelector("[data-summary-play]");
  play.disabled = !ready && !failed;
  play.textContent = failed ? "↻ 다시 불러오기" : !ready ? "준비 중…" : playing ? "❚❚ 일시정지" : started ? "▶ 계속 듣기" : position > 0 ? `▶ ${summaryTime(position)}부터 이어 듣기` : "▶ 이 과목 듣기";
  play.setAttribute("aria-pressed", String(playing));
  panel.querySelector("[data-summary-stop]").disabled = !started;
  panel.querySelector("[data-summary-bar]").style.width = `${total ? Math.min(100, position / total * 100) : 0}%`;
  const other = !current && summaryPlayer.audio && !summaryPlayer.audio.paused ? coreSummary?.subjects?.find(item => item.id === summaryPlayer.subjectId) : null;
  panel.querySelector("[data-summary-label]").textContent = failed ? "음성을 불러오지 못했어요. 연결을 확인해 주세요."
    : started ? `${playing ? "읽는 중" : "일시정지"} · ${summaryTime(position)} / ${summaryTime(total)}`
    : `전체 ${summaryTime(total)}${other ? ` · 지금 ${other.short}을 듣는 중` : ""}`;
  document.querySelectorAll("[data-summary-from]").forEach(button => { button.disabled = !ready; });
  const speaking = started || playing ? summaryPartAt(track, audio.currentTime) : -1;
  document.querySelectorAll("[data-summary-part]").forEach(part => part.classList.toggle("is-speaking", Number(part.dataset.summaryPart) === speaking));
}
function summaryInline(text) {
  return escapeHTML(text).replace(/`([^`]+)`/g, '<code class="summary-code">$1</code>').replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>");
}
function summaryParts(text) {
  return String(text || "").split(" / ").map(part => `<span class="summary-part">${summaryInline(part)}</span>`).join("");
}
function summaryDday(examDate) {
  const [year, month, day] = String(examDate || "").split("-").map(Number);
  if (!year || !month || !day) return "";
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const days = Math.round((new Date(year, month - 1, day) - today) / 86400000);
  return days > 0 ? `D-${days}` : days === 0 ? "D-day" : "시험 종료";
}
function renderSummaryBlock(block) {
  if (block.type === "table") return `<div class="summary-table-wrap"><table class="summary-table"><thead><tr>${block.head.map(cell => `<th scope="col">${summaryInline(cell)}</th>`).join("")}</tr></thead><tbody>${block.rows.map(row => `<tr>${row.map((cell, index) => index === 0 ? `<th scope="row">${summaryInline(cell)}</th>` : `<td>${summaryParts(cell)}</td>`).join("")}</tr>`).join("")}</tbody></table></div>`;
  return `<ul class="summary-list">${(block.items || []).map(item => `<li>${summaryParts(item)}</li>`).join("")}</ul>`;
}
function renderCoreSummary() {
  const heading = titleBlock("CORE SUMMARY", "과목별 필수 암기", "시험 전에 외울 숫자·기한·암기코드를 과목별로 모았습니다.");
  if (!coreSummary?.subjects?.length) return `${heading}<div class="flashcard-empty"><h2>요약을 불러오지 못했어요</h2><p>페이지를 새로고침한 뒤 다시 확인해 주세요.</p></div>`;
  const subjects = coreSummary.subjects;
  const index = Math.max(0, subjects.findIndex(item => item.id === store.summarySubject));
  const subject = subjects[index];
  const next = subjects[(index + 1) % subjects.length];
  const cardCount = studyTypes.filter(card => card.subject === subject.appSubject).length;
  const dday = summaryDday(coreSummary.examDate);
  const hero = `<section class="summary-hero"><div class="summary-dday"><span class="eyebrow">EXAM ${escapeHTML(coreSummary.examDate || "")}</span><strong>${escapeHTML(dday)}</strong></div><div class="summary-plan"><p class="summary-pass">${summaryInline(coreSummary.passRule || "")}</p><ul>${(coreSummary.strategy || []).map(item => `<li>${summaryInline(item)}</li>`).join("")}</ul>${coreSummary.order?.length ? `<ol class="summary-order" aria-label="추천 암기 순서">${coreSummary.order.map(item => `<li>${escapeHTML(item)}</li>`).join("")}</ol>` : ""}</div></section>`;
  const tabs = `<div class="summary-tabs" role="tablist" aria-label="과목 선택">${subjects.map(item => `<button role="tab" aria-selected="${item.id === subject.id}" class="${item.id === subject.id ? "selected" : ""}" data-summary-subject="${escapeHTML(item.id)}"><span>${escapeHTML(item.short)}</span><small>${escapeHTML(item.stage)}</small></button>`).join("")}</div>`;
  const track = summaryTrack(subject.id);
  const listen = track ? `<div class="summary-listen" data-summary-listen="${escapeHTML(subject.id)}"><div class="summary-listen-controls"><button class="button button-primary" data-summary-play disabled>준비 중…</button><button class="button button-quiet" data-summary-stop disabled>처음으로</button><div class="summary-listen-progress"><div class="summary-listen-bar"><i data-summary-bar style="width:0%"></i></div><span data-summary-label>전체 ${summaryTime(track.seconds)}</span></div></div><p>화면을 끄거나 다른 앱으로 가도 계속 읽어 주고, 이 과목이 끝나면 다음 과목으로 이어집니다. 각 항목의 ▶를 누르면 거기부터 듣습니다.</p></div>` : "";
  const sections = subject.sections.map((section, index) => `<section class="summary-section" data-summary-part="${index + 1}"><h3>${track ? `<button class="summary-from" data-summary-from="${index + 1}" aria-label="${escapeHTML(section.title.replace(/\*\*/g, ""))}부터 듣기" disabled>▶</button>` : ""}<span>${summaryInline(section.title)}${section.note ? ` <small>${summaryInline(section.note)}</small>` : ""}</span></h3>${section.blocks.map(renderSummaryBlock).join("")}<button class="button button-outline summary-review-section" data-summary-section="${subject.id}:${index}">이 항목을 카드로 복습 →</button></section>`).join("");
  return `${heading}${hero}${tabs}
    <section class="summary-subject" role="tabpanel" aria-label="${escapeHTML(subject.name)}">
      <div class="summary-subject-head" data-summary-part="0"><div><span class="eyebrow">${escapeHTML(subject.stage)}</span><h2>${escapeHTML(subject.name)}</h2>${subject.goal ? `<p class="summary-goal">${summaryInline(subject.goal)}</p>` : ""}${subject.intro ? `<p>${summaryInline(subject.intro)}</p>` : ""}</div>${cardCount ? `<button class="button button-outline" data-summary-cards="${escapeHTML(subject.appSubject)}">관련 암기카드 ${cardCount}장 →</button>` : ""}</div>
      ${listen}${sections}
      <div class="summary-foot"><span>${summaryInline(coreSummary.basis || "")}</span>${next.id !== subject.id ? `<button class="button button-primary" data-summary-subject="${escapeHTML(next.id)}">다음 과목: ${escapeHTML(next.short)} →</button>` : ""}</div>
    </section>`;
}
function bindCoreSummary() {
  document.querySelectorAll("[data-summary-section]").forEach(button => button.addEventListener("click", () => {
    const [subjectId,index]=button.dataset.summarySection.split(":"); const subject=coreSummary.subjects.find(s=>s.id===subjectId);
    if(!subject)return;studyTypeSearch=LearningEngine.plain(subject.sections[Number(index)].title);studyTypeMode="concept";studyTypeSubject=subject.appSubject;studyTypeIndex=0;studyTypeFlipped=false;setView("study-types");
  }));
  document.querySelectorAll("[data-summary-subject]").forEach(button => button.addEventListener("click", () => {
    store.summarySubject = button.dataset.summarySubject; persist(); render();
    const tabs = document.querySelector(".summary-tabs");
    if (tabs && tabs.getBoundingClientRect().top < 70) tabs.scrollIntoView({ block: "start" });
  }));
  document.querySelector("[data-summary-cards]")?.addEventListener("click", event => openSubjectConcepts(event.currentTarget.dataset.summaryCards));
  const listen = document.querySelector("[data-summary-listen]");
  if (!listen) return;
  const id = listen.dataset.summaryListen;
  listen.querySelector("[data-summary-play]").addEventListener("click", () => {
    if (summaryPlayer.failed === id) { prepareSummaryTrack(id); return; }
    const audio = summaryPlayer.audio;
    if (summaryListening(id) && !audio.paused && !audio.ended) audio.pause();
    else playSummarySubject(id);
  });
  listen.querySelector("[data-summary-stop]").addEventListener("click", stopSummaryPlayback);
  document.querySelectorAll("[data-summary-from]").forEach(button => button.addEventListener("click", () => playSummarySubject(id, summaryTrack(id).parts[Number(button.dataset.summaryFrom)]?.start || 0)));
  prepareSummaryTrack(id);
}
function studyDayKey() {
  const now = new Date(); return `${now.getFullYear()}-${String(now.getMonth()+1).padStart(2,"0")}-${String(now.getDate()).padStart(2,"0")}`;
}
function recordDailyActivity(field, amount) {
  store.dailyActivity ||= {}; const today = store.dailyActivity[studyDayKey()] ||= { cards:0,questions:0 };
  today[field] = (Number(today[field]) || 0) + amount;
}
function startLearningPractice(ids, label) {
  const questions = [...new Set(ids)].filter(id => bank.some(q => q.id === id)).slice(0,10);
  if (!questions.length) { toast("이 개념에 연결된 문제는 아직 없습니다. 개념 카드로 한 번 더 확인해 주세요."); return; }
  const durationMs = 10*60000;
  quiz = { id:crypto.randomUUID(), year:null, scope:"all", subject:label, stage:null, learning:true, label, checked:{}, uncertain:{}, questions,answers:{},index:0,paused:false,durationMs,remaining:durationMs,endsAt:Date.now()+durationMs,startedAt:new Date().toISOString() };
  persist(); setView("exam");
}
function practiceReviewedConcepts() {
  const units = quickMemoryUnits(); const session = quickMemorySession(units); if (!session) return;
  const conceptIds = new Set(units.filter(unit=>session.ids.includes(unit.id)).map(unit=>unit.cardId));
  const ids = bank.filter(q=>sourceConceptCards(q).some(card=>conceptIds.has(card.id))).map(q=>q.id);
  startLearningPractice(ids,"방금 외운 개념 확인");
}
function beginTodayTask(task) {
  const second = store.studyStage === "second";
  const subjects = second ? SUBJECTS.slice(2) : SUBJECTS.slice(0,2);
  if (task === "memory") { studyTypeMode="quick";view="study-types";startQuickMemory(false,{subject:second?"second":"first",size:20}); }
  else if (task === "mistakes") {
    const ids = [...new Set([...store.mistakes.map(m=>m.questionId), ...(store.uncertainQuestions || [])])].filter(id=>subjects.includes(bank.find(q=>q.id===id)?.subject));
    if (!ids.length) { setView("mistakes"); return; }
    startLearningPractice(ids,"오늘의 오답 확인");
  } else { setView("exam"); const select=document.querySelector("#exam-mode"); if(select){select.value=second?"secondFirst":"first";updateQuestionTotal();} }
}
function renderStageReadiness() {
  const report = LearningEngine.stageReadiness(store.history,SUBJECTS);
  return `<section class="stage-readiness" aria-label="1차·2차 최근 실전 성적">${[report.first,report.second].map(stage=>`<article class="stage-result"><div class="stage-result-heading"><h2>${stage.label} 최근 실전</h2><span>${stage.result ? `${Math.round(stage.result.mean*10)/10}점` : "기록 대기"}</span></div>${stage.rows.map(row=>`<div class="stage-subject"><span>${escapeHTML(row.name)}</span><b>${row.score===null?"—":`${row.score}점`}</b></div>`).join("")}<p>${stage.result ? `${stage.result.pass?"최근 실전은 합격 기준 충족":"최근 실전은 보완 필요"} · 개인 목표 ${stage.result.goal?"충족":"평균 65·과목별 45점"}` : stage.id==="first"?"1차 실전 80문항을 마치면 표시합니다.":"같은 회차의 2차 두 교시를 마치면 종합 점수를 표시합니다."}</p></article>`).join("")}<p class="stage-criteria">합격 기준: 과목별 40점 · 평균 60점 / 개인 목표: 과목별 45점 · 평균 65점. <a href="https://www.q-net.or.kr/crf005.do?gId=08&amp;gSite=L&amp;id=crf00503s02&amp;jmCd=9630&amp;jmInfoDivCcd=B0" target="_blank" rel="noopener noreferrer">Q-Net 기준 확인</a></p></section>`;
}
function renderDashboard() {
  const second=store.studyStage==="second";
  const subjects=second?SUBJECTS.slice(2):SUBJECTS.slice(0,2);
  const mistakes=store.mistakes.filter(m=>subjects.includes(bank.find(q=>q.id===m.questionId)?.subject));
  const uncertain=(store.uncertainQuestions || []).filter(id=>subjects.includes(bank.find(q=>q.id===id)?.subject));
  const reviewCount=new Set([...mistakes.map(m=>m.questionId),...uncertain]).size;
  const activity=store.dailyActivity?.[studyDayKey()]||{cards:0,questions:0};
  const unique=LearningEngine.firstAttemptAccuracy(store.history);
  const topicCounts=new Map();
  mistakes.forEach(m=>{const q=bank.find(q=>q.id===m.questionId);if(q)sourceConceptCards(q).forEach(card=>topicCounts.set(card.id,(topicCounts.get(card.id)||0)+1));});
  const weak=[...topicCounts].sort((a,b)=>b[1]-a[1]).slice(0,2).map(([id,count])=>({card:studyTypes.find(c=>c.id===id),count}));
  const dday=coreSummary ? summaryDday(coreSummary.examDate):"";
  return `<section class="today-home"><div class="today-heading"><div><p class="eyebrow">${studyDayKey()} · ${escapeHTML(dday)}</p><h1>오늘은 이 순서로 공부해요</h1><p>개념을 떠올리고, 틀린 이유를 확인하고, 실전으로 점검하세요.</p></div><div class="today-stage" role="group" aria-label="오늘 준비할 시험"><button data-today-stage="first" aria-pressed="${!second}" class="${second?"":"selected"}">1차 집중</button><button data-today-stage="second" aria-pressed="${second}" class="${second?"selected":""}">2차 집중</button></div></div><div class="today-tasks"><article class="today-task main-task"><span class="today-task-number">01</span><h2>핵심 개념 20장</h2><p>필수 암기를 가리고 떠올리세요.<br>헷갈린 개념부터 먼저 나옵니다.</p><span class="today-task-meta">오늘 카드 확인 ${activity.cards}회</span><button class="button button-primary" data-today-task="memory">빠른 암기 시작 →</button></article><article class="today-task"><span class="today-task-number">02</span><h2>오답·헷갈림 ${Math.min(10,reviewCount)}문제</h2><p>${reviewCount?"한 문제씩 답을 확인하고<br>관련 개념을 다시 정리해요.":"현재 이 시험의 오답이 없습니다.<br>실전 또는 과목 연습으로 점검하세요."}</p><span class="today-task-meta">오답 ${mistakes.length}개 · 헷갈림 ${uncertain.length}개</span><button class="button button-outline" data-today-task="mistakes">${reviewCount?"오답 다시 풀기":"오답노트 보기"} →</button></article><article class="today-task"><span class="today-task-number">03</span><h2>실전 점수 점검</h2><p>${second?"2차 1교시와 2교시를 나눠":"학개론·민법 80문항으로"}<br>최근 실전 성적을 확인하세요.</p><span class="today-task-meta">오늘 풀이 ${activity.questions}문항</span><button class="button button-outline" data-today-task="exam">실전 시험 설정 →</button></article></div>${weak.length?`<section class="today-weak"><h2>먼저 확인할 개념</h2>${weak.map(({card,count})=>`<button data-open-concept="${escapeHTML(card.id)}"><span>${escapeHTML(card.title)}</span><small>관련 오답 ${count}개 →</small></button>`).join("")}</section>`:""}${renderStageReadiness()}<div class="first-accuracy"><span>처음 푼 문제 정답률</span><b>${unique.rate===null?"기록 없음":`${unique.rate}%`}</b><small>${unique.total}개 서로 다른 문항 기준 · 반복 풀이와 분리</small></div><details class="dashboard-details" ${showAllHistory?"open":""}><summary>상세 성적·지난 시험 기록</summary>${renderDetailedDashboard()}</details><section class="study-backup"><div><h2>학습 기록 보관</h2><p>휴대폰과 아이패드 사이에서 기록 파일을 옮길 수 있습니다.</p></div><button class="button button-outline" id="export-study">기록 내보내기</button><label class="button button-outline" for="import-study">기록 가져오기</label><input type="file" id="import-study" accept="application/json,.json" hidden></section></section>`;
}
function exportStudyBackup() {
  const {active, ...data}=store;
  const blob=new Blob([JSON.stringify({schema:"realtor-study-backup",version:1,exportedAt:new Date().toISOString(),data},null,2)],{type:"application/json"});
  const url=URL.createObjectURL(blob);const a=document.createElement("a");a.href=url;a.download=`기출연습-학습기록-${studyDayKey()}.json`;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000);
}
async function importStudyBackup(file) {
  if(!file)return;
  try {
    if(file.size>10*1024*1024)throw new Error("10MB 이하의 학습 기록 파일을 선택해 주세요.");
    const incoming=LearningEngine.readBackup(JSON.parse(await file.text()));
    incoming.history=incoming.history.map(normalizeAttempt).filter(Boolean);
    incoming.mistakes=incoming.mistakes.filter(m=>m&&bank.some(q=>q.id===m.questionId));
    incoming.flashcards=incoming.flashcards.filter(id=>typeof id==="string"&&bank.some(q=>q.id===id));
    const merged=LearningEngine.mergeBackup(store,incoming);
    localStorage.setItem(STORAGE_KEY,JSON.stringify({...merged,active:quiz}));store=merged;
    render();toast("기존 기록을 유지하며 가져온 기록을 합쳤어요.");
  } catch(error){toast(error instanceof SyntaxError?"JSON 학습 기록 파일을 선택해 주세요.":error.message);}
}

function renderDetailedDashboard() {
  const attempts = store.history.map(normalizeAttempt).filter(Boolean);
  store.history = attempts;
  const avg = attempts.length ? Math.round(attempts.reduce((sum, a) => sum + a.score, 0) / attempts.length) : 0;
  const solved = attempts.reduce((sum, a) => sum + a.total, 0);
  const correct = attempts.reduce((sum, a) => sum + a.correct, 0);
  const accuracy = solved ? Math.round(correct / solved * 100) : 0;
  const years = [...new Set(bank.map(q => q.year))].sort((a, b) => b - a);
  const recent = showAllHistory ? attempts : attempts.slice(0, 5);
  const subjects = subjectStats(attempts);
  const chart = renderChart(attempts);
  return `${titleBlock("공인중개사 기출연습", "기출로 합격에 가까워져요", "기출을 풀고, 틀린 문제는 오답노트와 암기카드로 복습하세요.", `<button class="button button-primary" data-action="start-exam">새 시험 시작 <span>↗</span></button>`)}
    <section class="stat-grid">
      <article class="stat-card"><span class="stat-label">평균 점수</span><span class="stat-glyph">◉</span><strong>${avg}<em>점</em></strong></article>
      <article class="stat-card"><span class="stat-label">총 풀이 문항</span><span class="stat-glyph">▤</span><strong>${solved.toLocaleString()}<em>문항</em></strong></article>
      <article class="stat-card"><span class="stat-label">누적 정답률</span><span class="stat-glyph">↗</span><strong>${accuracy}<em>%</em></strong></article>
      <article class="stat-card"><span class="stat-label">다시 볼 오답</span><span class="stat-glyph">↺</span><strong>${store.mistakes.length}<em>문항</em></strong></article>
    </section>
    ${renderLearningInsights(attempts, subjects)}
    <section class="content-grid">
      <article class="panel"><div class="panel-head"><div><h2>회차별 점수</h2><p>시험을 마칠 때마다 성적이 쌓입니다</p></div><span class="eyebrow">SCORE / 100</span></div>${chart}</article>
      <article class="panel"><div class="panel-head"><div><h2>과목별 정답률</h2><p>지금까지 푼 문제 기준</p></div></div>${renderSubjectStats(subjects)}</article>
    </section>
    ${renderDataQualityPanel()}
    <section class="section-row">
      <article class="panel recent-panel"><div class="panel-head"><div><h2>${showAllHistory ? "전체 시험 기록" : "최근 시험"}</h2><p>${showAllHistory ? `총 ${attempts.length}회 응시` : "가장 최근에 제출한 기록"}</p></div>${attempts.length ? `<button class="panel-link" data-action="show-history">${showAllHistory ? "최근 5회만 보기" : `전체 기록 ${attempts.length}회`}</button>` : ""}</div>
       ${recent.length ? `<div class="recent-list">${recent.map((item, index) => `<button class="recent-item" data-result="${index}"><span><span class="recent-name">${item.learning ? "개념 확인 연습" : item.year === 2026 ? "2026년 예상문제" : `${yearLabel(item.year)} 기출`} · ${item.stage && EXAM_STAGES[item.stage] ? `${EXAM_STAGES[item.stage].label} 실전` : item.scope === "all" ? "전과목 혼합" : escapeHTML(item.subject)}</span><span class="recent-meta">${fmtDate(item.completedAt)} · ${item.correct}/${item.total} 정답</span></span><span class="recent-score ${item.score >= 60 ? "score-good" : "score-low"}">${item.score}<small>점</small></span><span class="result-date">›</span></button>`).join("")}</div>` : `<div class="no-records">아직 시험 기록이 없어요. 첫 시험을 시작해 보세요.</div>`}</article>
      <article class="panel quick-card"><div><div class="eyebrow">${years.includes(2026) ? "기출 2020—2025 · 예상 2026" : years.length ? `기출 ${Math.min(...years)} — ${Math.max(...years)}` : "기출 데이터"}</div><h3>오늘의 공부를 시작할까요?</h3><p>원하는 시간만큼 집중해 실전 감각을 쌓아보세요.<br>과목을 골라 가볍게 풀어도 좋아요.</p></div><button class="button" data-action="start-exam">시험 설정하기 <span>→</span></button></article>
    </section>`;
}
function accuracyForAttempt(attempt) {
  if (Array.isArray(attempt.results) && attempt.results.length) {
    return { correct: attempt.results.filter(result => result.correct).length, total: attempt.results.length };
  }
  return { correct: Number(attempt.correct) || 0, total: Number(attempt.total) || 0 };
}
function renderLearningInsights(attempts, subjects) {
  const recent = attempts.slice(0, 3).map(accuracyForAttempt);
  const previous = attempts.slice(3, 6).map(accuracyForAttempt);
  const recentTotal = recent.reduce((sum, item) => sum + item.total, 0);
  const recentCorrect = recent.reduce((sum, item) => sum + item.correct, 0);
  const recentRate = recentTotal ? Math.round(recentCorrect / recentTotal * 100) : null;
  const previousTotal = previous.reduce((sum, item) => sum + item.total, 0);
  const previousCorrect = previous.reduce((sum, item) => sum + item.correct, 0);
  const previousRate = previousTotal ? Math.round(previousCorrect / previousTotal * 100) : null;
  const trendReady = attempts.length >= 6 && recentTotal && previousTotal;
  const change = trendReady ? recentRate - previousRate : null;
  const weakSubjects = Object.entries(subjects).filter(([, value]) => value.total >= 5).sort((a, b) => a[1].correct / a[1].total - b[1].correct / b[1].total).slice(0, 2);

  const wrongEvents = [];
  const seenEvents = new Set();
  attempts.forEach(attempt => (attempt.results || []).forEach(result => {
    if (result.correct !== false || !result.questionId) return;
    const session = attempt.id || attempt.completedAt || `history-${attempt.year}-${attempt.score}`;
    const key = `${session}:${result.questionId}`;
    seenEvents.add(key);
    wrongEvents.push({ questionId: result.questionId, session, key });
  }));
  (store.mistakes || []).forEach(mistake => {
    if (!mistake.questionId) return;
    const session = mistake.attemptId || mistake.attemptedAt || mistake.questionId;
    const key = `${session}:${mistake.questionId}`;
    if (!seenEvents.has(key)) wrongEvents.push({ questionId: mistake.questionId, session, key });
  });
  const byConcept = new Map();
  const questionSessions = new Map();
  wrongEvents.forEach(event => {
    const question = bank.find(item => item.id === event.questionId);
    if (!question) return;
    const card = sourceConceptCards(question)[0];
    if (card) {
      const item = byConcept.get(card.id) || { card, wrong: 0, sessions: new Set(), questions: new Set() };
      item.wrong++;
      item.sessions.add(event.session);
      item.questions.add(question.id);
      byConcept.set(card.id, item);
    }
    const sessions = questionSessions.get(question.id) || new Set();
    sessions.add(event.session);
    questionSessions.set(question.id, sessions);
  });
  const concepts = [...byConcept.values()].sort((a, b) => b.sessions.size - a.sessions.size || b.wrong - a.wrong).slice(0, 3);
  const repeatedQuestionCount = [...questionSessions.values()].filter(sessions => sessions.size > 1).length;
  const accuracyLabel = recentRate === null ? "기록 없음" : `${recentRate}%`;
  const trendText = !attempts.length
    ? "첫 시험을 마치면 풀이 흐름과 반복 오답을 분석해 드려요."
    : trendReady
      ? `최근 ${recent.length}회 정답률 ${recentRate}% · 직전 ${previous.length}회보다 ${Math.abs(change)}%p ${change > 0 ? "올랐어요" : change < 0 ? "낮아졌어요" : "같아요"}.`
      : `최근 정답률 ${accuracyLabel}. 비교할 기록이 더 쌓이면 공부 흐름을 보여드려요.`;
  const trendBadge = trendReady ? `<span class="insight-delta ${change > 0 ? "is-up" : change < 0 ? "is-down" : ""}">${change > 0 ? "+" : ""}${change}%p</span>` : `<span class="insight-delta">${attempts.length}회 응시</span>`;
  const subjectContent = weakSubjects.length
    ? `<div class="insight-subjects"><b>보완이 필요한 과목</b>${weakSubjects.map(([name, value]) => `<div><span>${escapeHTML(name)}</span><strong>${Math.round(value.correct / value.total * 100)}% · ${value.total}문항</strong></div>`).join("")}</div>`
    : `<p class="insight-note">과목별 분석은 각 과목을 5문항 이상 풀면 표시됩니다.</p>`;
  const conceptContent = concepts.length
    ? `<div class="insight-concepts">${concepts.map(item => `<button class="insight-concept" data-open-concept="${escapeHTML(item.card.id)}"><span><b>${escapeHTML(item.card.title)}</b><small>${escapeHTML(item.card.subject)} · 연결 문항 ${item.questions.size}개</small></span><strong>${item.sessions.size}회 시험 · ${item.wrong}회 오답</strong><i>›</i></button>`).join("")}</div><p class="insight-note">완료된 시험 기록과 현재 오답을 분석합니다. 개념 연결은 카드의 대표 기출 기준이라 일부 문항은 빠질 수 있어요.</p>`
    : `<div class="insight-empty">${attempts.length ? "현재 기록에서 반복 오답으로 묶인 개념이 아직 없습니다." : "시험 기록이 쌓이면 자주 틀리는 개념을 찾아드려요."}</div>`;
  return `<section class="insight-grid" aria-label="학습 진단">
    <article class="panel insight-panel"><div class="panel-head"><div><h2>학습 흐름</h2><p>최근 정답률과 과목별 보완 지점</p></div>${trendBadge}</div><p class="insight-summary">${trendText}</p>${subjectContent}</article>
    <article class="panel insight-panel"><div class="panel-head"><div><h2>반복 오답 유형</h2><p>틀린 문제를 개념 카드 기준으로 묶었어요</p></div><span class="eyebrow">${repeatedQuestionCount ? `같은 문항 ${repeatedQuestionCount}개 반복` : "LOCAL ANALYSIS"}</span></div>${conceptContent}</article>
    ${renderPassReadiness(subjects)}
  </section>`;
}
function renderChart(attempts) {
  if (!attempts.length) return `<div class="empty-chart">아직 성적 기록이 없어요.<br>첫 시험을 마치면 점수 흐름이 여기에 보여요.</div>`;
  const shown = attempts.slice(0, 8).reverse();
  const w = 600, h = 205, left = 31, right = 12, top = 13, bottom = 27;
  const points = shown.map((a, i) => ({ x: shown.length === 1 ? w / 2 : left + i * (w - left - right) / (shown.length - 1), y: top + (100 - Number(a.score)) * (h - top - bottom) / 100, score: Number(a.score) }));
  const line = points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
  const area = `${line} L${points.at(-1).x},${h - bottom} L${points[0].x},${h - bottom} Z`;
  return `<div class="chart-wrap"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="회차별 점수 그래프"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#8eae8d" stop-opacity=".23"/><stop offset="1" stop-color="#8eae8d" stop-opacity=".015"/></linearGradient></defs>${[0, 50, 100].map(n => { const y = top + (100 - n) * (h - top - bottom) / 100; return `<line class="chart-grid" x1="${left}" x2="${w - right}" y1="${y}" y2="${y}"/><text class="chart-label" x="0" y="${y + 3}">${n}</text>`; }).join("")}<path class="chart-area" d="${area}"/><path class="chart-line" d="${line}"/>${points.map((p, i) => { const date = new Date(shown[i].completedAt); const label = Number.isFinite(date.getTime()) ? `${shown[i].year || "기록"}.${String(date.getMonth() + 1).padStart(2, "0")}` : `${shown[i].year || "회차"} ${i + 1}`; return `<circle class="chart-point" cx="${p.x}" cy="${p.y}" r="4"><title>${p.score}점</title></circle><text class="chart-label" text-anchor="middle" x="${p.x}" y="${h - 4}">${escapeHTML(label)}</text>`; }).join("")}</svg></div>`;
}
function subjectStats(attempts) {
  const stats = Object.fromEntries(SUBJECTS.map(s => [s, { total: 0, correct: 0, wrong: 0 }]));
  attempts.forEach(a => Object.entries(a.subjects || {}).forEach(([name, data]) => {
    stats[name] ||= { total: 0, correct: 0, wrong: 0 };
    stats[name].total += data.total; stats[name].correct += data.correct; stats[name].wrong += data.total - data.correct;
  }));
  return stats;
}
function renderSubjectStats(stats) {
  const active = Object.entries(stats).filter(([, s]) => s.total);
  if (!active.length) return `<div class="empty-small">풀이 기록이 쌓이면<br>과목별 강점과 보완점을 볼 수 있어요.</div>`;
  return `<div class="subject-list">${active.map(([name, s]) => `<div class="subject-row"><span class="subject-name">${escapeHTML(name)}</span><span class="subject-numbers">${Math.round(s.correct / s.total * 100)}% · 오답 ${s.wrong}</span><div class="progress-track"><i style="width:${Math.round(s.correct / s.total * 100)}%"></i></div></div>`).join("")}</div>`;
}
function sameAnswer(left, right) {
  const normalize = value => (Array.isArray(value) ? value : [value]).map(Number).sort((a, b) => a - b);
  return JSON.stringify(normalize(left)) === JSON.stringify(normalize(right));
}
function renderDataQualityPanel() {
  const official = bank.filter(question => question.year >= 2020 && question.year <= 2025);
  const keyed = official.filter(question => Object.prototype.hasOwnProperty.call(answerKeys, question.id));
  const matched = keyed.filter(question => sameAnswer(question.answer, answerKeys[question.id])).length;
  const mismatches = keyed.length - matched;
  const missing = official.length - keyed.length;
  const mismatchIds = keyed.filter(question => !sameAnswer(question.answer, answerKeys[question.id])).slice(0, 8).map(question => `${question.year}년 ${question.subject} ${question.number}번`);
  const linked = new Set(bank.filter(question => sourceConceptCards(question).length).map(question => question.id));
  const openIssues = (store.questionIssues || []).filter(issue => issue.status !== "resolved");
  const coverage = SUBJECTS.map(subject => {
    const items = bank.filter(question => question.subject === subject);
    const count = items.filter(question => linked.has(question.id)).length;
    return { subject, count, total: items.length, percent: items.length ? Math.round(count / items.length * 100) : 0 };
  });
  const stageCoverage = Object.entries(EXAM_STAGES).map(([key, stage]) => {
    const availableYears = [...new Set(bank.filter(question => question.year >= 2020 && question.year <= 2025).map(question => question.year))].filter(year => {
      const rows = bank.filter(question => question.year === year && stage.subjects.includes(question.subject));
      return rows.length === stage.questions && stage.subjects.every(subject => rows.filter(question => question.subject === subject).length === 40);
    });
    return { key, label: stage.label, years: availableYears };
  });
  const keyStatus = answerKeys && Object.keys(answerKeys).length
    ? `${matched.toLocaleString()} / ${official.length.toLocaleString()} 문항 일치`
    : "정답표를 불러오지 못했어요";
  const keyNote = !Object.keys(answerKeys).length
    ? "새로고침 후 다시 확인해 주세요."
    : `${mismatches ? `불일치 ${mismatches}문항${mismatchIds.length ? ` (${mismatchIds.join(", ")}${mismatches > mismatchIds.length ? ", …" : ""})` : ""} · ` : "불일치 없음 · "}${missing ? `정답표 연결 누락 ${missing}문항` : "기출 정답표 연결 완료"} · 2026 예상문제 ${bank.filter(question => question.year === 2026).length}문항은 공식 정답표 대조 대상이 아닙니다.`;
  return `<details class="panel data-quality-panel"><summary><span><b>문항·개념 자료 점검</b><small>정답표 대조, 실전 회차 구성, 개념 카드 연결, 오류 신고 확인</small></span><span class="data-quality-summary"><b class="${mismatches || missing ? "has-data-issue" : ""}">${escapeHTML(keyStatus)}</b><i>${openIssues.length ? `확인 요청 ${openIssues.length}건` : "열어 보기"}</i></span></summary><div class="data-quality-content"><div class="data-quality-top"><div class="audit-stat"><small>2020–2025 정답표 대조</small><b>${escapeHTML(keyStatus)}</b><span>${escapeHTML(keyNote)}</span></div><div class="audit-stat"><small>개념 카드 연결</small><b>${linked.size.toLocaleString()} / ${bank.length.toLocaleString()}문항</b><span>질문 주제로 연결한 필수 암기와 문항에 직접 연결된 카드의 합계입니다. 전체 출제 범위의 완성을 뜻하지 않습니다.</span></div></div><div class="coverage-audit"><b>실전 시험 회차 구성</b>${stageCoverage.map(item => `<div class="coverage-audit-row"><span>${escapeHTML(item.label)}</span><div class="coverage-audit-track"><i style="width:${Math.round(item.years.length / 6 * 100)}%"></i></div><strong>${item.years.length}/6회</strong></div>`).join("")}<small class="audit-footnote">과목마다 40문항이 모두 있을 때만 해당 회차를 실전 모드로 엽니다.</small></div><div class="coverage-audit"><b>과목별 카드 연결 현황</b>${coverage.map(item => `<div class="coverage-audit-row"><span>${escapeHTML(item.subject)}</span><div class="coverage-audit-track"><i style="width:${item.percent}%"></i></div><strong>${item.count}/${item.total}</strong></div>`).join("")}</div><div class="issue-audit"><div class="issue-audit-head"><b>오류 신고 · 확인 요청</b><span>${openIssues.length}건 대기 · ${(store.questionIssues || []).filter(issue => issue.status === "resolved").length}건 확인 완료</span></div>${openIssues.length ? openIssues.slice(0, 8).map(issue => { const question = bank.find(item => item.id === issue.questionId); return `<article class="issue-audit-item"><div><b>${question ? `${question.year}년 ${escapeHTML(question.subject)} ${question.number}번` : escapeHTML(issue.questionId)}</b><small>${escapeHTML(issue.category || "문항 오류")} · ${escapeHTML(issue.description || "상세 내용 없음")}</small></div>${issue.githubUrl?.startsWith("https://github.com/jhn5052/test/issues/new?") ? `<a class="button button-outline" href="${escapeHTML(issue.githubUrl)}" target="_blank" rel="noopener noreferrer">GitHub 신고 작성</a>` : ""}<button class="button button-quiet" data-issue-done="${escapeHTML(issue.id)}">확인 완료</button></article>`; }).join("") : `<p class="issue-audit-empty">아직 신고된 문항이 없습니다. 문제에서 오류를 발견하면 해당 문항의 신고 버튼을 눌러 기록하세요.</p>`}</div></div></details>`;
}
function renderQuestionIssueButton(question) {
  const pending = (store.questionIssues || []).some(issue => issue.questionId === question.id && issue.status !== "resolved");
  return `<button type="button" class="question-issue-button" data-question-issue="${escapeHTML(question.id)}">${pending ? "오류 내용 추가하기" : "문항 오류 신고"}</button>`;
}
function openQuestionIssue(questionId) {
  const question = bank.find(item => item.id === questionId);
  if (!question) return;
  issueQuestionId = questionId;
  document.querySelector("#issue-question-label").textContent = `${question.year}년 ${question.subject} ${question.number}번`;
  document.querySelector("#issue-description").value = "";
  document.querySelector("#question-issue-dialog").showModal();
}
function bindQuestionIssueButtons() {
  document.querySelectorAll("[data-question-issue]").forEach(button => button.addEventListener("click", () => openQuestionIssue(button.dataset.questionIssue)));
}
function saveQuestionIssue(event) {
  event.preventDefault();
  if (!issueQuestionId) return;
  const issue = {
    id: crypto.randomUUID ? crypto.randomUUID() : `issue-${Date.now()}`,
    questionId: issueQuestionId,
    category: document.querySelector("#issue-category").value,
    description: document.querySelector("#issue-description").value.trim().slice(0, 500),
    status: "open",
    createdAt: new Date().toISOString()
  };
  store.questionIssues ||= [];
  store.questionIssues.unshift(issue);
  const question = bank.find(q => q.id === issue.questionId);
  const githubUrl = new URL("https://github.com/jhn5052/test/issues/new");
  githubUrl.searchParams.set("title", `[문항 확인] ${question?.year || ""} ${question?.subject || ""} ${question?.number || ""}번 · ${issue.category}`);
  githubUrl.searchParams.set("body", [`문항 ID: ${issue.questionId}`,`분류: ${issue.category}`,"",issue.description || "문항 내용을 확인해 주세요.","",question?.text || ""].join("\n"));
  issue.githubUrl = githubUrl.toString();
  issueQuestionId = null;
  persist();
  document.querySelector("#question-issue-dialog").close();
  window.open(issue.githubUrl, "_blank", "noopener,noreferrer");
  if (view === "dashboard") render();
  toast("기기에 저장했어요. 열린 GitHub 화면에서 이슈 등록을 마쳐 주세요.");
}
function renderPassReadiness() { return ""; }
function renderSetup() {
  const years = [...new Set(bank.map(q => q.year))].sort((a, b) => b - a);
  return `${titleBlock("PRACTICE MODE", "기출·예상문제를 골라요", "과목 연습 또는 실제 회차 구성에 맞춘 1·2차 실전 시험을 선택하세요.")}
    <div class="exam-layout"><section class="panel setup-card"><h2>시험 구성</h2><p>실전 모드는 해당 회차의 모든 문항이 등록된 경우에만 시작됩니다.</p>
      <label class="form-label" for="exam-mode">풀이 방식</label><select class="year-select" id="exam-mode"><option value="practice" selected>과목 연습</option><option value="first">1차 실전 · 80문항 · 100분</option><option value="secondFirst">2차 1교시 실전 · 80문항 · 100분</option><option value="secondSecond">2차 2교시 실전 · 40문항 · 50분</option></select>
      <label class="form-label" for="exam-year">문제 연도</label><select class="year-select" id="exam-year"><option value="all" selected>2020~2026년 전체</option>${years.map(y => `<option value="${y}">${y === 2026 ? "2026년 예상문제 (100문항)" : `${y}년 제${y - 1989}회`}</option>`).join("")}</select>
      <span class="form-label">풀이 범위</span><div class="segmented" id="scope-switch"><button class="segment selected" data-scope="all">전과목 혼합</button><button class="segment" data-scope="subject">단일 과목</button></div>
      <div id="subject-picker" hidden><span class="form-label">과목 선택</span><div class="subject-options">${SUBJECTS.map((s, i) => `<label class="subject-option ${i === 0 ? "selected" : ""}"><input type="radio" name="subject" value="${escapeHTML(s)}" ${i === 0 ? "checked" : ""}><span>${escapeHTML(s)}</span></label>`).join("")}</div></div>
      <label class="form-label" for="question-count">출제 문항 수</label><select class="year-select" id="question-count"><option value="10">10문제</option><option value="20">20문제</option><option value="30">30문제</option><option value="40" selected>40문제</option><option value="80">80문제</option><option value="120">120문제</option></select>
      <label class="form-label" for="exam-duration">시험 시간</label><select class="year-select" id="exam-duration"><option value="10">10분</option><option value="20">20분</option><option value="30">30분</option><option value="40" selected>40분</option><option value="50">50분</option><option value="100">100분</option></select>
      <div class="setup-summary"><div class="summary-text">문제은행 <b id="question-total">—</b></div><div class="summary-text">이번 시험 <b id="question-benchmark">—</b></div><div class="summary-text">제한 시간 <b id="duration-summary">40</b>분</div></div>
      <p class="coverage-note" id="coverage-note" role="status"></p>
      <button class="button button-primary setup-submit" id="begin-exam">문제 셔플 후 시험 시작 <span>↗</span></button>
    </section><aside class="exam-side"><article class="exam-tip"><div class="eyebrow">A LITTLE GUIDE</div><h3>아는 만큼, 차근차근</h3><p>문제는 무작위 순서로 나옵니다. 답을 고르면 자동 저장되고, 이전 문제로 돌아가 답을 바꿀 수 있어요.</p><div class="tip-stat"><div><b>${bank.length.toLocaleString()}</b><span>등록 문항</span></div><div><b>80 / 40</b><span>실전 교시 문항</span></div><div><b>2020—25 · 26</b><span>기출·예상</span></div></div></article><p class="source-note">응시 중에는 언제든 일시정지하거나 제출할 수 있어요. 시간이 끝나면 답안이 자동으로 제출됩니다.</p></aside></div>`;
}
function bindSetup() {
  const scope = document.querySelector("#scope-switch");
  scope.addEventListener("click", event => {
    const button = event.target.closest("[data-scope]"); if (!button) return;
    scope.querySelectorAll(".segment").forEach(item => item.classList.toggle("selected", item === button));
    document.querySelector("#subject-picker").hidden = button.dataset.scope !== "subject"; updateQuestionTotal();
  });
  document.querySelectorAll(".subject-option input").forEach(input => input.addEventListener("change", () => {
    document.querySelectorAll(".subject-option").forEach(item => item.classList.toggle("selected", item.contains(input) && input.checked)); updateQuestionTotal();
  }));
  document.querySelector("#exam-year").addEventListener("change", updateQuestionTotal);
  document.querySelector("#exam-mode").addEventListener("change", updateQuestionTotal);
  document.querySelector("#question-count").addEventListener("change", updateQuestionTotal);
  document.querySelector("#exam-duration").addEventListener("change", event => { document.querySelector("#duration-summary").textContent = event.target.value; });
  document.querySelector("#begin-exam").addEventListener("click", beginExam);
  updateQuestionTotal();
}
function selectedQuestions() {
  const yearValue = document.querySelector("#exam-year")?.value || "all";
  const mode = document.querySelector("#exam-mode")?.value || "practice";
  const stage = EXAM_STAGES[mode] || null;
  const selectedYear = yearValue === "all" ? null : Number(yearValue);
  const year = stage ? (selectedYear && selectedYear <= 2025 ? selectedYear : 2025) : selectedYear;
  const scope = document.querySelector("[data-scope].selected")?.dataset.scope || "all";
  const subject = document.querySelector("input[name=subject]:checked")?.value || SUBJECTS[0];
  const list = bank.filter(q => (year === null || q.year === year) && (!stage || stage.subjects.includes(q.subject)) && (stage || scope !== "subject" || q.subject === subject));
  return { year, scope: stage ? "all" : scope, subject, stage: mode, list };
}
function updateQuestionTotal() {
  const total = document.querySelector("#question-total"); if (!total) return;
  const { year, scope, stage, list } = selectedQuestions();
  const stageInfo = EXAM_STAGES[stage];
  const yearSelect = document.querySelector("#exam-year");
  if (stageInfo && (yearSelect.value === "all" || Number(yearSelect.value) === 2026)) yearSelect.value = "2025";
  const subjectPicker = document.querySelector("#subject-picker");
  if (subjectPicker) subjectPicker.hidden = Boolean(stageInfo) || scope !== "subject";
  const scopeSwitch = document.querySelector("#scope-switch");
  if (scopeSwitch) scopeSwitch.hidden = Boolean(stageInfo);
  const countSelect = document.querySelector("#question-count");
  const durationSelect = document.querySelector("#exam-duration");
  document.querySelectorAll("#question-count option").forEach(option => { option.hidden = stageInfo ? Number(option.value) !== stageInfo.questions : [80, 120].includes(Number(option.value)); });
  document.querySelectorAll("#exam-duration option").forEach(option => { option.hidden = stageInfo ? Number(option.value) !== stageInfo.minutes : [50, 100].includes(Number(option.value)); });
  if (stageInfo) { countSelect.value = String(stageInfo.questions); durationSelect.value = String(stageInfo.minutes); }
  else {
    if (![10, 20, 30, 40].includes(Number(countSelect.value))) countSelect.value = "40";
    if (![10, 20, 30, 40, 50].includes(Number(durationSelect.value))) durationSelect.value = "40";
  }
  const count = list.length;
  total.textContent = `${count}문항`;
  const requestedCount = stageInfo?.questions || Number(countSelect?.value || 40);
  const examCount = Math.min(count, requestedCount);
  document.querySelector("#question-benchmark").textContent = `${examCount}문항`;
  const note = document.querySelector("#coverage-note");
  const subjectCounts = stageInfo ? Object.fromEntries(stageInfo.subjects.map(name => [name, list.filter(question => question.subject === name).length])) : {};
  const completeStage = !stageInfo || (count === requestedCount && stageInfo.subjects.every(name => subjectCounts[name] === 40));
  note.textContent = !count ? "선택한 범위에 문제가 없습니다." : stageInfo && !completeStage ? `${year}년 ${stageInfo.label} 문항 구성이 불완전합니다. 과목별 ${stageInfo.subjects.map(name => `${name} ${subjectCounts[name] || 0}/40`).join(" · ")} · 실전 시험은 시작할 수 없습니다.` : stageInfo ? `${year}년 ${stageInfo.label} 구성 확인 완료 · ${count}문항 · ${stageInfo.minutes}분` : `선택한 범위에서 무작위로 ${examCount}문항을 출제합니다.${examCount < requestedCount ? ` 선택한 범위의 문항이 ${count}개라 ${count}문항으로 조정했습니다.` : ""}`;
  note.classList.toggle("coverage-incomplete", !completeStage);
  document.querySelector("#begin-exam").disabled = !count || !completeStage;
}
function beginExam() {
  const { year, scope, subject, stage, list } = selectedQuestions();
  const stageInfo = EXAM_STAGES[stage];
  const requestedCount = stageInfo?.questions || Number(document.querySelector("#question-count")?.value || 40);
  const durationMs = Number(document.querySelector("#exam-duration")?.value || 40) * 60 * 1000;
  if (!list.length) { toast("선택한 조건에 등록된 문제가 없어요."); return; }
  if (stageInfo && (list.length !== requestedCount || stageInfo.subjects.some(name => list.filter(question => question.subject === name).length !== 40))) { toast(`${year}년 ${stageInfo.label} 과목별 문항 구성이 완전하지 않아 실전 모드를 시작할 수 없어요.`); return; }
  const shuffled = [...list];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  quiz = { id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`, year, scope, subject, stage, questions: shuffled.slice(0, Math.min(list.length, requestedCount)).map(q => q.id), answers: {}, index: 0, paused: false, durationMs, remaining: durationMs, endsAt: Date.now() + durationMs, startedAt: new Date().toISOString() };
  persist(); setView("exam");
}
function currentQuestions() { return quiz.questions.map(id => bank.find(q => q.id === id)).filter(Boolean); }
function quizDurationMs() { return Number(quiz?.durationMs) || 40 * 60 * 1000; }
function remainingMs() { return quiz.paused ? quiz.remaining : Math.max(0, quiz.endsAt - Date.now()); }
function renderQuiz() {
  const questions = currentQuestions();
  const q = questions[quiz.index];
  if (!q) return `<p>문제를 불러올 수 없습니다.</p>`;
  const checked = Boolean(quiz.learning && quiz.checked?.[q.id]);
  const learningFeedback = !quiz.learning ? "" : `<section class="learning-question-feedback"><button class="button button-primary" id="check-learning" ${!quiz.answers[q.id] || checked ? "disabled" : ""}>${checked ? "이 문항 확인 완료" : "정답·풀이 확인"}</button><button class="button button-quiet" id="flag-learning" aria-pressed="${Boolean(quiz.uncertain?.[q.id])}">${quiz.uncertain?.[q.id] ? "헷갈림 표시됨" : "맞혀도 헷갈려요"}</button>${checked ? `<div class="learning-feedback ${isCorrect(q,quiz.answers[q.id]) ? "is-correct" : "is-wrong"}"><b>${isCorrect(q,quiz.answers[q.id]) ? "정답이에요" : "개념을 다시 확인해요"}</b><p>정답 ${escapeHTML(answerLabel(q))}</p><p>${escapeHTML(q.explanation || "등록된 풀이가 없습니다.")}</p>${sourceConceptCards(q).map(card=>`<details><summary>관련 개념 · ${escapeHTML(card.title)}</summary>${renderConceptSummary(card)}</details>`).join("")}</div>` : ""}</section>`;
  const elapsed = remainingMs();
  const answered = Object.keys(quiz.answers).length;
  const answeredPercent = Math.round(answered / questions.length * 100);
  return `<div class="exam-topline"><div class="exam-topline-copy"><div class="exam-kicker">${quiz.learning ? `학습 모드 · ${escapeHTML(quiz.label)}` : quiz.year === 2026 ? "2026년 예상문제" : `${yearLabel(quiz.year)} 기출`} ${quiz.learning ? "" : `· ${quiz.stage && EXAM_STAGES[quiz.stage] ? `${EXAM_STAGES[quiz.stage].label} 실전` : quiz.scope === "all" ? "전과목 혼합" : escapeHTML(quiz.subject)}`}</div><div class="exam-counter"><b>${quiz.index + 1}</b><span>/ ${questions.length}번</span><small>${answered}개 답변</small></div><div class="exam-progress-track" role="progressbar" aria-label="답변 진행률" aria-valuenow="${answered}" aria-valuemin="0" aria-valuemax="${questions.length}"><i style="width:${answeredPercent}%"></i></div></div><div class="exam-utilities"><button type="button" class="calculator-open-button" id="open-calculator" aria-expanded="false" aria-controls="calculator-panel">▦ <span>계산기 열기</span></button><button class="timer ${quiz.paused ? "paused" : elapsed < 300000 ? "warning" : ""}" id="pause-exam" aria-label="${quiz.paused ? "시험 재개" : "시험 일시정지"}" title="눌러서 ${quiz.paused ? "시험 재개" : "일시정지"}"><span id="timer-value">${quiz.paused ? "일시정지" : fmtDuration(elapsed)}</span><small>${quiz.paused ? "재개 ▶" : "일시정지 Ⅱ"}</small></button></div></div>
   <section class="calculator-panel" id="calculator-panel" aria-label="계산기" hidden><div class="calculator-panel-head"><div><span class="eyebrow">시험 중 도구</span><h2>계산기</h2></div><button type="button" class="calculator-close" id="close-calculator" aria-label="계산기 닫기">×</button></div><div class="calculator-screen" aria-live="polite"><div id="calculator-expression" class="calculator-expression">계산 결과</div><output id="calculator-display" class="calculator-display">0</output></div><div class="calculator-keys">${[["clear","AC"],["backspace","⌫"],["percent","%"],["operator","÷"],["digit","7"],["digit","8"],["digit","9"],["operator","×"],["digit","4"],["digit","5"],["digit","6"],["operator","−"],["digit","1"],["digit","2"],["digit","3"],["operator","+"],["sign","+/−"],["digit","0"],["decimal","."],["equals","="]].map(([action,label])=>`<button type="button" class="calculator-key ${action === "operator" ? "is-operator" : ""} ${action === "equals" ? "is-equals" : ""}" data-calc="${action}" data-value="${label}">${label}</button>`).join("")}</div></section>
   <div class="question-layout"><article class="panel question-card"><div class="question-meta"><span class="question-number">Q ${String(quiz.index + 1).padStart(2, "0")}</span><span class="question-year">${q.year === 2026 ? "2026년 예상" : `${q.year}년 기출`}</span><span>${escapeHTML(q.subject)}</span><span>·</span><span>${q.number}번</span>${renderQuestionIssueButton(q)}</div><div class="question-text">${renderQuestionText(q.text)}</div><div class="option-list">${q.choices.map((choice, i) => `<button class="answer-option ${Number(quiz.answers[q.id]) === i + 1 ? "chosen" : ""}" data-answer="${i + 1}" aria-pressed="${Number(quiz.answers[q.id]) === i + 1}"><span class="option-mark">${LETTERS[i]}</span><span>${renderChoiceText(choice)}</span></button>`).join("")}</div>${learningFeedback}<div class="question-controls"><button class="button button-outline" id="previous-question" ${quiz.index === 0 ? "disabled" : ""}>← 이전</button><button class="button button-outline" id="next-question" ${quiz.index === questions.length - 1 ? "disabled" : ""}>다음 →</button></div></article>
   <aside class="exam-rail"><section class="rail-card" id="question-map"><div class="rail-head"><span>답안 현황</span><small>${answered} / ${questions.length}</small></div><div class="question-grid">${questions.map((item, i) => `<button class="question-dot ${i === quiz.index ? "current" : ""} ${quiz.answers[item.id] ? "answered" : ""}" data-goto="${i}" aria-label="${i + 1}번 문제${quiz.answers[item.id] ? " 답변 완료" : " 미응답"}">${i + 1}</button>`).join("")}</div><div class="rail-legend"><span><i class="legend-dot current"></i>현재</span><span><i class="legend-dot"></i>답변 완료</span></div><div class="progress-info"><span>답변한 문제</span><span>${answeredPercent}%</span></div></section>
   <section class="rail-card rail-actions"><button class="button button-primary" id="submit-exam">답안 제출하기</button></section></aside></div>
   <div class="exam-mobile-bar" aria-label="시험 조작"><button class="mobile-exam-control" id="mobile-prev" ${quiz.index === 0 ? "disabled" : ""} aria-label="이전 문제">←<small>이전</small></button><button class="mobile-exam-control mobile-map-control" id="mobile-map" aria-label="문제 목록 보기"><span>${quiz.index + 1}/${questions.length}</span><small>목록</small></button><button class="mobile-exam-control mobile-next-control" id="mobile-next" ${quiz.index === questions.length - 1 ? "disabled" : ""}>다음<small>문제 →</small></button><button class="mobile-submit-control" id="mobile-submit">제출</button></div>`;
}
function bindQuiz() {
  document.querySelector("#check-learning")?.addEventListener("click", () => { const q=currentQuestions()[quiz.index]; if(!quiz.answers[q.id])return;quiz.checked[q.id]=true;persist();render();document.querySelector(".learning-question-feedback")?.scrollIntoView({block:"nearest"}); });
  document.querySelector("#flag-learning")?.addEventListener("click", () => {const q=currentQuestions()[quiz.index];quiz.uncertain[q.id]=!quiz.uncertain[q.id];persist();render();});
  document.querySelectorAll("[data-answer]").forEach(button => button.addEventListener("click", () => {
    const q = currentQuestions()[quiz.index]; if(quiz.learning && quiz.checked?.[q.id])return; const scrollTop = window.scrollY; quiz.answers[q.id] = Number(button.dataset.answer); persist(); render(); window.scrollTo(0, scrollTop);
  }));
  document.querySelectorAll("[data-goto]").forEach(button => button.addEventListener("click", () => { quiz.index = Number(button.dataset.goto); persist(); render(); scrollToExamQuestion(); }));
  document.querySelector("#previous-question").addEventListener("click", () => moveQuestion(-1));
  document.querySelector("#next-question").addEventListener("click", () => moveQuestion(1));
  document.querySelector("#pause-exam").addEventListener("click", togglePause);
  document.querySelector("#submit-exam").addEventListener("click", () => submitExam("manual"));
  document.querySelector("#mobile-prev").addEventListener("click", () => moveQuestion(-1));
  document.querySelector("#mobile-next").addEventListener("click", () => moveQuestion(1));
  document.querySelector("#mobile-map").addEventListener("click", () => document.querySelector("#question-map").scrollIntoView({ behavior: "smooth", block: "center" }));
  document.querySelector("#mobile-submit").addEventListener("click", () => submitExam("manual"));
  bindCalculator();
  bindQuestionIssueButtons();
}
function calculatorUpdate() {
  const display = document.querySelector("#calculator-display");
  const expression = document.querySelector("#calculator-expression");
  if (display) display.textContent = calculatorState.display;
  if (expression) expression.textContent = calculatorState.expression || "계산 결과";
}
function calculatorNumber(value) {
  if (!Number.isFinite(value)) return "오류";
  if (Object.is(value, -0) || value === 0) return "0";
  return String(Number(value.toPrecision(12)));
}
function calculatorCompute(left, right, operator) {
  if (operator === "+") return left + right;
  if (operator === "−") return left - right;
  if (operator === "×") return left * right;
  if (operator === "÷") return right === 0 ? NaN : left / right;
  return right;
}
function calculatorInput(action, value = "") {
  const state = calculatorState;
  if (action === "clear") {
    calculatorState = { display: "0", expression: "", stored: null, operator: null, waitingForOperand: false };
  } else if (action === "digit") {
    if (state.display === "오류" || state.waitingForOperand) {
      state.display = value;
      state.waitingForOperand = false;
    } else if (state.display.replace(/[.\-]/g, "").length < 14) {
      state.display = state.display === "0" ? value : state.display + value;
    }
    if (state.operator === null) state.expression = "";
  } else if (action === "decimal") {
    if (state.display === "오류" || state.waitingForOperand) {
      state.display = "0.";
      state.waitingForOperand = false;
    } else if (!state.display.includes(".")) state.display += ".";
  } else if (action === "backspace") {
    if (state.display === "오류" || state.waitingForOperand) state.display = "0";
    else state.display = state.display.length <= 1 || (state.display.length === 2 && state.display.startsWith("-")) ? "0" : state.display.slice(0, -1);
    state.waitingForOperand = false;
  } else if (action === "sign") {
    if (state.display !== "0" && state.display !== "오류") state.display = state.display.startsWith("-") ? state.display.slice(1) : `-${state.display}`;
  } else if (action === "percent") {
    if (state.display !== "오류") state.display = calculatorNumber(Number(state.display) / 100);
    state.expression = `${state.display} × 1%`;
  } else if (action === "operator") {
    if (state.display === "오류") return;
    const current = Number(state.display);
    if (state.operator && !state.waitingForOperand) {
      const result = calculatorCompute(state.stored, current, state.operator);
      state.display = calculatorNumber(result);
      state.stored = Number.isFinite(result) ? result : null;
    } else if (state.stored === null) state.stored = current;
    state.operator = value;
    state.expression = `${state.display} ${value}`;
    state.waitingForOperand = true;
  } else if (action === "equals") {
    if (state.operator && state.stored !== null && !state.waitingForOperand && state.display !== "오류") {
      const left = state.stored;
      const right = Number(state.display);
      const operator = state.operator;
      const result = calculatorCompute(left, right, operator);
      state.expression = `${calculatorNumber(left)} ${operator} ${calculatorNumber(right)} =`;
      state.display = calculatorNumber(result);
      state.stored = null;
      state.operator = null;
      state.waitingForOperand = true;
    }
  }
  calculatorUpdate();
}
function bindCalculator() {
  const panel = document.querySelector("#calculator-panel");
  const openButton = document.querySelector("#open-calculator");
  const setOpen = open => {
    if (!panel || !openButton) return;
    panel.hidden = !open;
    openButton.setAttribute("aria-expanded", String(open));
    openButton.querySelector("span").textContent = open ? "계산기 닫기" : "계산기 열기";
    if (open) calculatorUpdate();
    else openButton.focus();
  };
  openButton?.addEventListener("click", () => setOpen(panel?.hidden));
  document.querySelector("#close-calculator")?.addEventListener("click", () => setOpen(false));
  panel?.querySelectorAll("[data-calc]").forEach(button => button.addEventListener("click", () => calculatorInput(button.dataset.calc, button.dataset.value)));
  panel?.addEventListener("keydown", event => {
    if (/^\d$/.test(event.key)) { event.preventDefault(); calculatorInput("digit", event.key); }
    else if (event.key === ".") { event.preventDefault(); calculatorInput("decimal"); }
    else if (["+", "-", "*", "/"].includes(event.key)) { event.preventDefault(); calculatorInput("operator", ({ "+": "+", "-": "−", "*": "×", "/": "÷" })[event.key]); }
    else if (event.key === "Enter" || event.key === "=") { event.preventDefault(); calculatorInput("equals"); }
    else if (event.key === "Backspace") { event.preventDefault(); calculatorInput("backspace"); }
    else if (event.key.toLowerCase() === "c") { event.preventDefault(); calculatorInput("clear"); }
  });
}
function scrollToExamQuestion() { if (matchMedia("(max-width: 720px)").matches) document.querySelector(".exam-topline")?.scrollIntoView({ behavior: "smooth", block: "start" }); }
function moveQuestion(delta) { quiz.index = Math.min(quiz.questions.length - 1, Math.max(0, quiz.index + delta)); persist(); render(); scrollToExamQuestion(); }
function togglePause() {
  if (quiz.paused) { quiz.paused = false; quiz.endsAt = Date.now() + quiz.remaining; }
  else { quiz.remaining = remainingMs(); quiz.paused = true; }
  persist(); render();
}
function startClock() {
  stopClock();
  if (!quiz || quiz.paused) return;
  interval = setInterval(() => {
    const timer = document.querySelector("#timer-value");
    if (!timer) { stopClock(); return; }
    const ms = remainingMs(); timer.textContent = fmtDuration(ms); document.querySelector("#pause-exam")?.classList.toggle("warning", ms < 300000);
    if (ms <= 0) submitExam("timeout");
  }, 300);
}
function stopClock() { if (interval) clearInterval(interval); interval = null; }
function submitExam(reason) {
  if (!quiz) return;
  stopClock();
  const questions = currentQuestions();
  const subjectScores = {};
  let correct = 0;
  questions.forEach(q => {
    const subject = subjectScores[q.subject] ||= { total: 0, correct: 0 };
    subject.total++;
    if (isCorrect(q, quiz.answers[q.id])) { subject.correct++; correct++; }
  });
  const result = { learning: Boolean(quiz.learning), id: quiz.id, year: quiz.year, scope: quiz.scope, subject: quiz.subject, stage: quiz.stage || null, total: questions.length, correct, score: Math.round(correct / questions.length * 100), subjects: subjectScores, completedAt: new Date().toISOString(), duration: Math.max(0, quizDurationMs() - remainingMs()), durationLimit: quizDurationMs(), timedOut: reason === "timeout", results: questions.map(q => ({ questionId: q.id, chosen: Number(quiz.answers[q.id]) || null, answer: q.answer, correct: isCorrect(q, quiz.answers[q.id]), uncertain: Boolean(quiz.uncertain?.[q.id]) })) };
  const mistakes = questions.filter(q => !isCorrect(q, quiz.answers[q.id])).map(q => ({ questionId: q.id, chosen: Number(quiz.answers[q.id]) || null, answer: q.answer, attemptedAt: result.completedAt, attemptId: result.id }));
  store.flashcards = [...new Set([...(store.flashcards || []), ...mistakes.map(m => m.questionId)])];
  const resolvedIds = new Set(questions.filter(q => isCorrect(q, quiz.answers[q.id])).map(q => q.id));
  const missedIds = new Set(mistakes.map(m => m.questionId));
  store.mistakes = store.mistakes.filter(m => !resolvedIds.has(m.questionId) && !missedIds.has(m.questionId));
  store.mistakes.unshift(...mistakes);
  store.uncertainQuestions = [...new Set([...(store.uncertainQuestions || []).filter(id => !questions.some(q => q.id === id)), ...questions.filter(q => quiz.uncertain?.[q.id]).map(q => q.id)])];
  store.resolvedMistakes ||= {}; resolvedIds.forEach(id => { store.resolvedMistakes[id] = result.completedAt; });
  recordDailyActivity("questions", questions.length);
  store.history.unshift(result); store.active = null; quiz = null; persist(); view = "result"; render();
  if (reason === "timeout") toast("시간이 끝나 답안이 자동 제출됐어요.");
}
function renderResult(attempt) {
  const subjects = Object.entries(attempt.subjects || {});
  const label = attempt.learning ? "개념 확인 연습" : attempt.stage && EXAM_STAGES[attempt.stage] ? `${EXAM_STAGES[attempt.stage].label} 실전` : attempt.scope === "all" ? "전과목 혼합" : attempt.subject;
  return `${titleBlock("EXAM RESULT", "수고했어요, 시험을 마쳤어요", `${attempt.learning ? "학습 모드" : `${yearLabel(attempt.year)} 기출`} · ${escapeHTML(label)} · ${fmtDate(attempt.completedAt)}`)}
    <section class="result-hero"><div><div class="eyebrow">YOUR SCORE</div><h2>${attempt.correct}문제를 맞혔어요</h2><p>${attempt.timedOut ? "제한 시간이 끝나 답안이 자동 제출됐습니다." : "틀린 문제는 오답노트에 자동으로 모아두었어요."}</p></div><div class="result-score">${attempt.score}<small> 점</small></div></section>
    <section class="result-grid"><article class="panel"><div class="panel-head"><div><h2>과목별 결과</h2><p>정답 수와 정답률을 확인해 보세요</p></div></div><div class="result-subjects">${subjects.map(([name, s]) => `<div class="result-subject"><span>${escapeHTML(name)}</span><span>${s.correct}/${s.total} · ${Math.round(s.correct / s.total * 100)}%</span><div class="progress-track"><i style="width:${Math.round(s.correct / s.total * 100)}%"></i></div></div>`).join("")}</div></article>
    <article class="panel"><div class="panel-head"><div><h2>다음 학습</h2><p>오늘의 결과를 이어가요</p></div></div><p style="font-size:12px;color:#7f8c82;line-height:1.8;margin:0 0 18px">이번 시험에서 <b style="color:#b15a4b">${attempt.total - attempt.correct}문제</b>를 다시 볼 문제로 분류했어요. 오답노트에서 내가 고른 답과 정답을 비교해 보세요.</p><button class="button button-primary" data-action="mistakes">오답노트 확인 →</button> <button class="button button-outline" data-action="start-exam">다시 풀기</button></article></section>`;
}
function bindResult() { document.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", () => button.dataset.action === "mistakes" ? setView("mistakes") : setView("exam"))); }
function renderMistakes() {
  const options = [...new Set(store.mistakes.map(m => bank.find(q => q.id === m.questionId)?.subject).filter(Boolean))];
  return `${titleBlock("REVIEW & REPEAT", "오답을 다시 만나는 시간", "문제에서 다시 정답을 맞히면 오답노트에서 자동으로 빠집니다.")}
   <div class="mistake-toolbar"><select class="filter-select" id="mistake-subject"><option value="all">모든 과목</option>${options.map(s => `<option>${escapeHTML(s)}</option>`).join("")}</select><select class="filter-select" id="mistake-year"><option value="all">모든 연도</option>${[...new Set(store.mistakes.map(m => bank.find(q => q.id === m.questionId)?.year).filter(Boolean))].sort((a,b)=>b-a).map(y=>`<option>${y}</option>`).join("")}</select><span class="summary-text" style="margin-left:auto">총 <b>${store.mistakes.length}</b>문항</span></div>
   <div class="mistake-list" id="mistake-list">${renderMistakeCards(store.mistakes)}</div>`;
}
function renderMistakeCards(mistakes) {
  if (!mistakes.length) return `<div class="mistake-empty"><div class="empty-mark">✓</div><h2>다시 볼 오답이 없어요</h2><p>오답을 다시 풀어 맞히거나 시험에서 정답을 맞히면<br>이 목록에서 자동으로 제외됩니다.</p><button class="button button-primary" data-action="start-exam">시험 응시하기</button></div>`;
  return mistakes.map(m => {
    const q = bank.find(item => item.id === m.questionId); if (!q) return "";
    const hasDetailedExplanation = q.explanation && !q.explanation.includes("원문에는 별도 해설") && !q.explanation.includes("원본에는 별도 해설");
    const inDeck = (store.flashcards || []).includes(q.id);
    const relatedCards = sourceConceptCards(q);
    const requiresSourceReview = conceptLinkAudit?.questions?.[q.id]?.status === "source-review";
    const retrying = mistakeRetryQuestionId === q.id;
    const retry = retrying
      ? `<section class="mistake-retry"><div class="mistake-retry-heading"><b>다시 풀어보기</b><button class="mistake-retry-close" data-review-start="${escapeHTML(q.id)}">닫기</button></div><p class="mistake-retry-hint">정답과 해설은 답을 확인한 뒤 다시 볼 수 있어요.</p><div class="mistake-retry-choices">${q.choices.map((choice, index) => `<button class="mistake-retry-choice ${mistakeRetrySelected === index + 1 ? "selected" : ""}" data-review-choice="${index + 1}" aria-pressed="${mistakeRetrySelected === index + 1}"><b>${LETTERS[index]}</b><span>${renderChoiceText(choice)}</span></button>`).join("")}</div><button class="button button-primary" data-review-check="${escapeHTML(q.id)}" ${mistakeRetrySelected ? "" : "disabled"}>정답 확인</button>${mistakeRetryFeedback ? `<p class="mistake-retry-feedback" role="status">${escapeHTML(mistakeRetryFeedback)}</p>` : ""}</section>`
      : `<button class="button button-primary mistake-retry-start" data-review-start="${escapeHTML(q.id)}">개념 확인 후 다시 풀기 ↻</button>`;
    const explanation = hasDetailedExplanation
      ? `<p>${escapeHTML(q.explanation)}</p>`
      : `<p>Q-Net 공개 원본에는 정답표만 포함되어 있어, 이 문항의 풀이 해설은 아직 등록되지 않았습니다.</p>`;
    const conceptReview = relatedCards.length
      ? `<section class="mistake-concept-review"><div class="mistake-concept-heading"><span>개념 정리 후 다시 풀기</span><b>${escapeHTML(q.subject)}</b></div>${relatedCards.map((card,index) => `${index ? `<details class="mistake-extra-concept"><summary>${escapeHTML(card.title)}</summary>` : ""}<h3>${escapeHTML(card.title)}</h3>${renderConceptSummary(card)}<button class="related-concept-button" data-open-concept="${escapeHTML(card.id)}">이 개념 카드로 복습 →</button>${index ? "</details>" : ""}`).join("")}</section>`
      : `<section class="mistake-concept-review is-unmapped"><div class="mistake-concept-heading"><span>${requiresSourceReview ? "원문 대조 필요" : "이 문항의 풀이로 복습"}</span><b>${escapeHTML(q.subject)}</b></div>${requiresSourceReview ? `<p class="mistake-concept-answer">원문·정답표와 해설의 대조가 필요한 문항입니다. 이 문항의 결론을 암기하기 전에 원문을 확인해 주세요.</p>` : hasDetailedExplanation ? `<p class="mistake-concept-answer">${escapeHTML(stripAnswerPreamble(q.explanation))}</p>` : `<p>아직 등록된 풀이가 없습니다.</p>`}<button class="related-concept-button" data-open-subject="${escapeHTML(q.subject)}">과목 개념에서 찾아보기 →</button></section>`;
    const explanationBlock = relatedCards.length
      ? `<div class="explanation"><b>풀이 해설</b>${explanation}</div>`
      : "";
    return `<article class="panel mistake-card" data-subject="${escapeHTML(q.subject)}" data-year="${q.year}"><div class="mistake-head"><span class="tag">${q.year}년 기출</span><span class="tag">${escapeHTML(q.subject)}</span><span class="tag tag-wrong">${m.chosen ? "오답" : "미응답"}</span><span class="mistake-date">${fmtDate(m.attemptedAt)}</span></div><div class="mistake-question"><b>${q.number}.</b> ${renderQuestionText(q.text)}</div>${renderQuestionIssueButton(q)}${retrying ? "" : `<div class="answer-compare"><span>내가 고른 답 <b class="wrong-answer">${m.chosen ? `${LETTERS[m.chosen - 1]} ${renderChoiceText(q.choices[m.chosen - 1])}` : "미응답"}</b></span><span>정답 <b>${escapeHTML(answerLabel(q))}</b></span></div>${explanationBlock}`}${retrying ? "" : conceptReview}${retry}${relatedCards.length || inDeck ? `<button class="button button-outline flashcard-toggle" data-flashcard="${escapeHTML(q.id)}">${inDeck ? "저장한 개념에서 빼기" : "관련 개념 저장"}</button>` : ""}</article>`;
  }).join("");
}
function stripAnswerPreamble(text) {
  return String(text || "").replace(/^\s*(?:(?:정답\s*(?:은|:)?\s*)?[①②③④⑤](?:\s*(?:번|이다))?\s*[.。:：]?\s*)/, "");
}
function isAnswerKeyConcept(text) {
  const value = String(text || "").trim();
  return /^(?:정답\s*(?:은|:)?\s*)?(?:[ㄱㄴㄷㄹㅁ](?:\s*[·ㆍ,및]\s*[ㄱㄴㄷㄹㅁ])*(?:만\s*옳다|모두\s*옳다|가\s*옳다)?|[①②③④⑤](?:\s*번)?(?:\s*\([^)]*\))?(?:이|가)?\s*(?:옳다|틀리다|정답이다)?|\d+번\s*(?:이|가)?\s*(?:옳다|틀리다|정답이다))\.?$/.test(value)
    || /^(?:ㄱ|ㄴ|ㄷ|ㄹ|ㅁ)(?:\s*[·ㆍ,및]\s*(?:ㄱ|ㄴ|ㄷ|ㄹ|ㅁ))*(?:은|는|이|가)?\s*(?:(?:모두|만)\s*)?(?:옳다|맞다|틀리다|해당한다|정답이다)\.?$/.test(value)
    || /(?:정답은|정답:|따라서\s*[①②③④⑤]|[①②③④⑤]\s*(?:가|이)\s*(?:옳다|틀리다)|ㄱ[,· ]+ㄴ.*옳다)/.test(value);
}
function studyCardKeyConcept(card) {
  const points = [...(card.concept || []), ...(card.memorize || [])]
    .map(point => normalizeStudyText(point).trim())
    .filter(Boolean);
  const candidate = points.find(point => !isAnswerKeyConcept(point));
  if (candidate) {
    return candidate
      .replace(/^정답(?:은|：|:)\s*[①②③④⑤][.。]?\s*/, "")
      .replace(/[,，]?\s*(?:따라서\s*)?[①②③④⑤](?:\s*번)?(?:이|가)?\s*(?:정답(?:이다)?|옳다|틀리다)\.?\s*$/, "")
      .replace(/[,，]?\s*(?:따라서\s*)?(?:ㄱ|ㄴ|ㄷ|ㄹ|ㅁ)(?:\s*[·ㆍ,및]\s*(?:ㄱ|ㄴ|ㄷ|ㄹ|ㅁ))*(?:은|는|이|가)?\s*(?:(?:모두|만)\s*)?(?:옳다|맞다|틀리다|해당한다|정답이다)\.?\s*$/, "")
      .replace(/^따라서\s*/, "")
      .trim() || candidate;
  }
  const cleaned = (points[0] || "")
    .replace(/^정답(?:은|：|:)\s*[①②③④⑤][.。]?\s*/, "")
    .replace(/[,，]?\s*(?:따라서\s*)?[①②③④⑤](?:\s*번)?(?:이|가)?\s*(?:정답(?:이다)?|옳다|틀리다)\.?\s*$/, "")
    .replace(/[,，]?\s*(?:따라서\s*)?(?:ㄱ|ㄴ|ㄷ|ㄹ|ㅁ)(?:\s*[·ㆍ,및]\s*(?:ㄱ|ㄴ|ㄷ|ㄹ|ㅁ))*(?:은|는|이|가)?\s*(?:(?:모두|만)\s*)?(?:옳다|맞다|틀리다|해당한다|정답이다)\.?\s*$/, "")
    .replace(/^따라서\s*/, "")
    .replace(/\s*(?:고|라고)\s*한\s*$/, "")
    .trim();
  if (cleaned && !isAnswerKeyConcept(cleaned)) return cleaned;
  return `${normalizeStudyText(card.title)}의 핵심 개념과 판단 기준`;
}
function studyCardMemorizePoints(card) {
  if (card.origin === "core") return [];
  return (card.memorize || []).map(point => normalizeStudyText(point)
    .replace(/^정답(?:은|：|:)\s*[①②③④⑤][.。]?\s*/, "")
    .replace(/^[①②③④⑤](?:\s*번)?[.。]\s*/, "")
    .replace(/[,，]?\s*(?:따라서\s*)?[①②③④⑤](?:\s*번)?(?:이|가)?\s*(?:정답(?:이다)?|옳다|틀리다)\.?\s*$/, "")
    .replace(/[,，]?\s*(?:따라서\s*)?(?:ㄱ|ㄴ|ㄷ|ㄹ|ㅁ)(?:\s*[·ㆍ,및]\s*(?:ㄱ|ㄴ|ㄷ|ㄹ|ㅁ))*(?:은|는|이|가)?\s*(?:(?:모두|만)\s*)?(?:옳다|맞다|틀리다|해당한다|정답이다)\.?\s*$/, "")
    .replace(/^따라서\s*/, "")
    .trim())
    .filter(point => point && !isAnswerKeyConcept(point) && point !== normalizeStudyText(studyCardKeyConcept(card)));
}
function studyCardConceptPoints(card) {
  if (card.origin === "core" && card.comparison?.length) return [];
  const points = card.concept || [];
  const summaryIndex = points.findIndex(point => normalizeStudyText(point).trim() && !isAnswerKeyConcept(normalizeStudyText(point).trim()));
  return points.filter((point, index) => index !== summaryIndex && !isAnswerKeyConcept(normalizeStudyText(point).trim()));
}
function renderConceptSummary(card) {
  const keyPoint = studyCardKeyConcept(card);
  const concepts = studyCardConceptPoints(card);
  const memorized = studyCardMemorizePoints(card);
  return `${card.comparison?.length ? "" : `<p class="mistake-concept-answer">${escapeHTML(keyPoint)}</p>`}${card.comparison?.length ? `<div class="mistake-concept-comparison">${card.comparison.map(item => `<div><b>${escapeHTML(item.label)}</b><span>${escapeHTML(item.value).replace(/\n/g,"<br>")}</span></div>`).join("")}</div>` : ""}${concepts.length ? `<div class="mistake-concept-group"><b>개념 이해</b><ul>${concepts.map(item => `<li>${escapeHTML(item).replace(/\n/g,"<br>")}</li>`).join("")}</ul></div>` : ""}${memorized.length ? `<div class="mistake-concept-group"><b>시험에서 외울 것</b><ul>${memorized.map(item => `<li>${escapeHTML(item).replace(/\n/g,"<br>")}</li>`).join("")}</ul></div>` : ""}`;
}
function bindMistakes() {
  const filter = () => {
    const subject = document.querySelector("#mistake-subject").value, year = document.querySelector("#mistake-year").value;
    document.querySelectorAll(".mistake-card").forEach(card => { card.hidden = (subject !== "all" && card.dataset.subject !== subject) || (year !== "all" && card.dataset.year !== year); });
  };
  document.querySelector("#mistake-subject").addEventListener("change", filter); document.querySelector("#mistake-year").addEventListener("change", filter);
  document.querySelectorAll("[data-action=start-exam]").forEach(button => button.addEventListener("click", () => setView("exam")));
  document.querySelectorAll("[data-review-start]").forEach(button => button.addEventListener("click", () => { mistakeRetryQuestionId = mistakeRetryQuestionId === button.dataset.reviewStart ? null : button.dataset.reviewStart; mistakeRetrySelected = null; mistakeRetryFeedback = ""; render(); }));
  document.querySelectorAll("[data-review-choice]").forEach(button => button.addEventListener("click", () => {
    mistakeRetrySelected = Number(button.dataset.reviewChoice);
    mistakeRetryFeedback = "";
    document.querySelectorAll("[data-review-choice]").forEach(choice => { const selected = Number(choice.dataset.reviewChoice) === mistakeRetrySelected; choice.classList.toggle("selected", selected); choice.setAttribute("aria-pressed", String(selected)); });
    document.querySelector("[data-review-check]").disabled = false;
  }));
  document.querySelectorAll("[data-review-check]").forEach(button => button.addEventListener("click", () => {
    const questionId = button.dataset.reviewCheck;
    const q = bank.find(item => item.id === questionId);
    if (!q || !mistakeRetrySelected) return;
    if (isCorrect(q, mistakeRetrySelected)) {
      store.mistakes = store.mistakes.filter(item => item.questionId !== questionId);
      store.resolvedMistakes ||= {}; store.resolvedMistakes[questionId] = new Date().toISOString();
      store.uncertainQuestions = (store.uncertainQuestions || []).filter(id => id !== questionId);
      recordDailyActivity("questions", 1);
      mistakeRetryQuestionId = null; mistakeRetrySelected = null; mistakeRetryFeedback = "";
      persist(); render(); toast("정답이에요. 오답노트에서 제외했어요.");
      return;
    }
    const oldRecord = store.mistakes.find(item => item.questionId === questionId) || {};
    const attemptedAt = new Date().toISOString();
    store.mistakes = store.mistakes.filter(item => item.questionId !== questionId);
    store.mistakes.unshift({ ...oldRecord, questionId, chosen: mistakeRetrySelected, answer: q.answer, attemptedAt, attemptId: `review-${Date.now()}` });
    mistakeRetryFeedback = "아직 틀렸어요. 다른 보기를 골라 다시 시도해 보세요.";
    persist(); render();
  }));
  document.querySelectorAll("[data-flashcard]").forEach(button => button.addEventListener("click", () => toggleFlashcard(button.dataset.flashcard)));
  document.querySelectorAll("[data-open-concept]").forEach(button => button.addEventListener("click", () => openConceptCard(button.dataset.openConcept)));
  document.querySelectorAll("[data-open-subject]").forEach(button => button.addEventListener("click", () => openSubjectConcepts(button.dataset.openSubject)));
  bindQuestionIssueButtons();
}
function toggleFlashcard(questionId) {
  store.flashcards ||= [];
  store.flashcards = store.flashcards.includes(questionId) ? store.flashcards.filter(id => id !== questionId) : [...store.flashcards, questionId];
  persist();
  if (view === "flashcards" || (view === "study-types" && studyTypeMode === "saved")) render(); else setView("mistakes");
}
function savedConceptCards() {
  return [...new Map((store.flashcards || []).flatMap(id => {
    const q = bank.find(item => item.id === id);
    return q ? sourceConceptCards(q) : [];
  }).map(card => [card.id, card])).values()];
}
function renderFlashcards(includeHeading = true) {
  const questions = (store.flashcards || []).map(id => bank.find(q => q.id === id)).filter(Boolean);
  const cards = savedConceptCards();
  const missing = questions.filter(q => !sourceConceptCards(q).length).length;
  const heading = includeHeading ? titleBlock("개념을 떠올리고 확인하기", "저장한 개념", "오답에서 저장한 개념의 정의·기준·예외를 복습하세요.") : "";
  const notice = missing ? `<p class="flashcard-source">저장한 문제 ${missing}개는 정확히 연결된 개념이 아직 없습니다. 오답노트에서 해당 문제의 해설을 확인할 수 있습니다.</p>` : "";
  if (!cards.length) return `${heading}${notice}<div class="flashcard-empty"><h2>저장한 개념이 없습니다</h2><p>오답노트에서 관련 개념을 저장해 주세요.</p><button class="button button-primary" data-action="mistakes">오답노트 열기</button></div>`;
  flashcardIndex = Math.min(flashcardIndex, cards.length - 1);
  const card = cards[flashcardIndex];
  return `${heading}${notice}<div class="flashcard-toolbar"><span>${flashcardIndex + 1} / ${cards.length}장</span><button class="button button-outline" data-remove-concept="${escapeHTML(card.id)}">저장 해제</button></div><div class="flashcard ${flashcardFlipped ? "is-flipped" : ""}" id="flashcard" role="button" tabindex="0" aria-label="개념 카드 뒤집기"><div class="flashcard-face flashcard-front"><span class="eyebrow">${escapeHTML(card.subject)}</span><strong>${escapeHTML(card.title)}</strong><small>눌러서 개념·암기 내용 확인 ↻</small></div><div class="flashcard-face flashcard-back"><span class="eyebrow">${escapeHTML(card.title)}</span>${renderConceptSummary(card)}<small>눌러서 앞면으로 돌아가기 ↻</small></div></div><div class="flashcard-controls"><button class="button button-outline" id="card-prev" ${flashcardIndex===0?"disabled":""}>← 이전</button><button class="button button-primary" id="card-next" ${flashcardIndex===cards.length-1?"disabled":""}>다음 →</button></div>`;
}
function bindFlashcards() {
  document.querySelector("[data-remove-concept]")?.addEventListener("click", event => {
    const id = event.currentTarget.dataset.removeConcept;
    store.flashcards = (store.flashcards || []).filter(questionId => {
      const question = bank.find(q => q.id === questionId);
      return !question || !sourceConceptCards(question).some(card => card.id === id);
    });
    flashcardFlipped = false; persist(); render();
  });

  const card = document.querySelector("#flashcard");
  const flipCard = () => { flashcardFlipped = !flashcardFlipped; render(); };
  card?.addEventListener("click", flipCard);
  card?.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); flipCard(); } });
  document.querySelector("#card-prev")?.addEventListener("click", () => { flashcardIndex = Math.max(0, flashcardIndex - 1); flashcardFlipped = false; render(); });
  document.querySelector("#card-next")?.addEventListener("click", () => { flashcardIndex = Math.min(savedConceptCards().length - 1, flashcardIndex + 1); flashcardFlipped = false; render(); });
  document.querySelector("[data-remove-card]")?.addEventListener("click", event => toggleFlashcard(event.currentTarget.dataset.removeCard));
  document.querySelector("[data-action=mistakes]")?.addEventListener("click", () => setView("mistakes"));
}
function quickMemoryUnits() {
  return QuickMemory.buildUnits(coreSummary ? studyTypes.filter(card => card.origin === "core") : studyTypes, SUBJECTS, normalizeStudyText);
}
function quickMemorySession(units) {
  const session = store.quickMemorySession;
  if (!session || !Array.isArray(session.ids) || !session.ids.length || !Number.isInteger(session.index) || session.index < 0 || session.index > session.ids.length) return null;
  const validIds = new Set(units.map(unit => unit.id));
  if (!session.ids.every(id => validIds.has(id))) return null;
  return session;
}
function quickWrongAnchors() {
  const ids = [...new Set([...store.mistakes.map(item => item.questionId), ...(store.uncertainQuestions || [])])];
  return [...ids, ...ids.flatMap(id => { const question=bank.find(q=>q.id===id); return question ? sourceConceptCards(question).map(card=>card.id) : []; })];
}
function startQuickMemory(againOnly = false, options = {}) {
  const units = quickMemoryUnits();
  const previous = quickMemorySession(units);
  const subject = options.subject || document.querySelector("#quick-subject")?.value || previous?.subject || "first";
  const size = options.size || Number(document.querySelector("#quick-size")?.value) || previous?.size || 10;
  const query = options.query ?? document.querySelector("#quick-query")?.value.trim() ?? previous?.query ?? "";
  const pool = units.filter(unit => !query || `${unit.title} ${unit.label} ${unit.text}`.includes(query));
  const ids = againOnly && previous
    ? previous.ids.filter(id => previous.ratings?.[id] === "again")
    : QuickMemory.select(pool, subject, size, store.quickMemoryProgress || {}, quickWrongAnchors());
  if (!ids.length) { toast("선택한 과목에서 복습할 카드가 없습니다."); return; }
  store.quickMemorySession = { ids, index: 0, revealed: false, ratings: {}, subject, size, query };
  persist(); render();
}
function revealQuickMemory() {
  const session = quickMemorySession(quickMemoryUnits());
  if (!session || session.index >= session.ids.length) return;
  session.revealed = !session.revealed;
  persist(); render();
}
function rateQuickMemory(known) {
  const current = quickMemorySession(quickMemoryUnits());
  const next = QuickMemory.rate(current, known);
  if (!next) return;
  const id = current.ids[current.index];
  store.quickMemoryProgress ||= {};
  const old = store.quickMemoryProgress[id];
  store.quickMemoryProgress[id] = LearningEngine.reviewSchedule(old, known);
  recordDailyActivity("cards", 1);
  store.quickMemorySession = next;
  persist(); render();
}
function renderQuickMemory() {
  const units = quickMemoryUnits();
  const session = quickMemorySession(units);
  const groups = [...new Set(units.map(unit => unit.subject))];
  const subject = session?.subject || "first";
  const size = session?.size || 10;
  const settings = `<div class="quick-settings"><label>학습 과목<select id="quick-subject" class="filter-select"><option value="first" ${subject === "first" ? "selected" : ""}>1차 집중 · 학개론 + 민법</option><option value="second" ${subject === "second" ? "selected" : ""}>2차 집중</option><option value="all" ${subject === "all" ? "selected" : ""}>전체 과목</option>${groups.map(group => `<option value="${escapeHTML(group)}" ${subject === group ? "selected" : ""}>${escapeHTML(group)}</option>`).join("")}</select></label><label class="quick-query-label">개념 찾기<input type="search" id="quick-query" class="filter-select" value="${escapeHTML(session?.query || "")}" placeholder="예: 취득세, 가등기, 개발행위"></label><label>한 번에<select id="quick-size" class="filter-select">${[10,20,30].map(n => `<option value="${n}" ${size === n ? "selected" : ""}>${n}장</option>`).join("")}</select></label><button class="button button-outline" id="quick-start">${session ? "새 묶음 시작" : "암기 시작"}</button></div>`;
  const intro = `<div class="quick-heading"><span class="eyebrow">FINAL REVIEW</span><h2>짧게 보고, 가리고, 기억하기</h2><p>필수 암기와 같은 내용을 카드로 확인해요. 기억한 카드는 1일·3일·7일 뒤 다시 만납니다.</p></div>`;
  if (!units.length) return `<section class="quick-memory">${intro}<p>암기 자료를 불러오지 못했습니다. 새로고침 후 다시 확인해 주세요.</p></section>`;
  if (!session) return `<section class="quick-memory">${intro}${settings}<div class="quick-empty"><b>한 장에 한 가지 암기 포인트</b><p>10장부터 시작하세요. 답을 보기 전에 뜻이나 기준을 소리 내어 떠올려 보세요.</p><span>${units.length}개 암기 포인트 · 과목별 선택 가능</span></div></section>`;
  const again = session.ids.filter(id => session.ratings?.[id] === "again").length;
  if (session.index === session.ids.length) return `<section class="quick-memory">${intro}${settings}<div class="quick-complete" role="status"><span class="eyebrow">묶음 완료</span><h3>${session.ids.length}장 확인했어요</h3><p>기억났어요 ${session.ids.length - again}장 · 다시 보기 ${again}장</p><p>스스로 표시한 결과입니다. 헷갈린 개념을 한 번 더 떠올려 보세요.</p><button class="button button-primary" id="quick-again" ${again ? "" : "disabled"}>헷갈린 ${again}장만 반복</button><button class="button button-outline" id="quick-practice">이 카드로 관련 문제 풀기</button></div></section>`;
  const unit = units.find(item => item.id === session.ids[session.index]);
  return `<section class="quick-memory">${intro}${settings}<div class="quick-status"><span>${session.index + 1} / ${session.ids.length}장</span><span>확인 ${session.index}장 · 다시 보기 ${again}장</span></div><progress class="quick-progress" max="${session.ids.length}" value="${session.index}" aria-label="이번 묶음 진행"></progress><article class="quick-memory-card ${session.revealed ? "is-revealed" : ""}" aria-label="빠른 암기 카드"><span class="quick-subject">${escapeHTML(unit.subject)}</span><h3>${escapeHTML(unit.title)}</h3><p class="quick-term">${escapeHTML(unit.label)}</p>${session.revealed ? `<div class="quick-answer"><span>외울 개념</span><p>${escapeHTML(unit.text)}</p></div>` : `<p class="quick-hint">뜻·기준·차이를 떠올린 뒤 확인하세요.</p>`}<button class="button button-primary" id="quick-reveal" aria-expanded="${session.revealed}">${session.revealed ? "개념 다시 가리기" : "개념 확인"}</button></article><div class="quick-ratings"><button class="button button-outline" data-quick-rate="again" ${session.revealed ? "" : "disabled"}>↺ 다시 보기</button><button class="button button-primary" data-quick-rate="known" ${session.revealed ? "" : "disabled"}>✓ 기억났어요</button></div><p class="quick-shortcuts">개념을 확인하면 다음 카드로 넘길 수 있어요. 진행은 이 기기에 저장됩니다.<span>키보드: Space 확인 · ← 다시 보기 · → 기억났어요</span></p></section>`;
}
function bindQuickMemory() {
  document.querySelector("#quick-practice")?.addEventListener("click", () => practiceReviewedConcepts());
  document.querySelector("#quick-start")?.addEventListener("click", () => startQuickMemory());
  document.querySelector("#quick-again")?.addEventListener("click", () => startQuickMemory(true));
  document.querySelector("#quick-reveal")?.addEventListener("click", revealQuickMemory);
  document.querySelectorAll("[data-quick-rate]").forEach(button => button.addEventListener("click", () => rateQuickMemory(button.dataset.quickRate === "known")));
}
document.addEventListener("keydown", event => {
  if (view !== "study-types" || studyTypeMode !== "quick" || event.repeat || event.altKey || event.ctrlKey || event.metaKey || event.target.closest("input, textarea, select, button, a, [contenteditable]")) return;
  if (![" ", "ArrowLeft", "ArrowRight"].includes(event.key)) return;
  event.preventDefault();
  if (event.key === " ") revealQuickMemory();
  else rateQuickMemory(event.key === "ArrowRight");
});

function visibleStudyCards() {
  return studyTypes.filter(card => (studyTypeSubject === "all" || card.subject === studyTypeSubject) && (!studyTypeSearch || `${card.title} ${(card.concept || []).join(" ")} ${(card.relatedTerms || []).join(" ")}`.includes(studyTypeSearch)));
}
function startStudyRecallSession(againOnly = false) {
  const pool = visibleStudyCards().filter(card => !againOnly || studyRecallAgainIds.has(card.id));
  studyRecallOrder = pool.map(card => ({ card, rank: store.recallProgress?.[card.id]?.rating === "again" ? 0 : store.recallProgress?.[card.id]?.rating === "known" ? 2 : 1, sort: Math.random() }))
    .sort((a, b) => a.rank - b.rank || a.sort - b.sort).map(item => item.card);
  studyRecallAgainIds = new Set(againOnly ? pool.map(card => card.id) : []);
  studyTypeIndex = 0; studyRecallInput = ""; studyTypeFlipped = false; studyTypeSelected = null; studyTypeRevealed = false; studyTypeQuestionOpen = false;
}
function rateStudyRecallCard(remembered) {
  const card = studyRecallOrder[studyTypeIndex];
  if (!card) return;
  const progress = store.recallProgress || (store.recallProgress = {});
  const previous = progress[card.id] || {};
  progress[card.id] = { rating: remembered ? "known" : "again", reviews: (previous.reviews || 0) + 1, updatedAt: new Date().toISOString() };
  if (remembered) studyRecallAgainIds.delete(card.id); else studyRecallAgainIds.add(card.id);
  persist(); studyTypeIndex += 1; studyRecallInput = ""; studyTypeFlipped = false; studyTypeQuestionOpen = false; render();
}
function studyRecallPrompt(card) {
  if (/(세율|세액|세금|분납|분할납부|가산세|납부기한|신고기한|과세기준일|날짜)/.test(card.title)) return `${normalizeStudyText(card.title)}의 기준 금액·세율·기간과 예외를 떠올려 적어보세요.`;
  const terms = (card.relatedTerms || []).filter(term => !/[0-9０-９]|만원|억원|개월|퍼센트|%/.test(term)).slice(0, 5);
  if (terms.length) return `다음 항목의 뜻과 서로 다른 점을 설명해 보세요: ${terms.map(normalizeStudyText).join(" · ")}.`;
  return `${normalizeStudyText(card.title)}의 핵심 정의·구분·기준을 떠올려 적어보세요.`;
}
function clozeItems() { return ClozePractice.build(essentialCloze, QuickMemory.buildUnits(studyTypes, SUBJECTS, LearningEngine.plain)); }
function clozeSession() { return ClozePractice.session(store.clozeSession, clozeItems()); }
function startCloze(againOnly = false) {
  const items = clozeItems(), previous = clozeSession();
  const subject = document.querySelector("#cloze-subject")?.value || previous?.subject || "all";
  const size = Number(document.querySelector("#cloze-size")?.value || previous?.size || 10);
  const ids = againOnly && previous ? previous.ids.filter(id => previous.results[id]?.correct === false || previous.results[id]?.uncertain) : ClozePractice.select(items, subject, size, store.clozeProgress || {});
  if (!ids.length) { toast("다시 풀 항목이 없습니다."); return; }
  store.clozeSession = { ids, subject, size, index:0, results:{}, feedback:null, createdAt:new Date().toISOString() };
  persist(); render();
}
function renderCloze() {
  const items = clozeItems(), session = clozeSession();
  const groups = [...new Set(items.map(x => x.subject))];
  const subject = session?.subject || "all";
  const settings = `<div class="cloze-settings"><label>학습 과목<select id="cloze-subject" class="filter-select"><option value="all">전체 과목 · ${items.length}개</option>${groups.map(g=>`<option value="${escapeHTML(g)}" ${subject===g?"selected":""}>${escapeHTML(g)} · ${items.filter(x=>x.subject===g).length}개</option>`).join("")}</select></label><label>한 번에<select id="cloze-size" class="filter-select">${[10,20,30].map(n=>`<option value="${n}" ${session?.size===n?"selected":""}>${n}개</option>`).join("")}</select></label><button class="button button-outline" id="cloze-start">${session?"새 묶음 시작":"빈칸 학습 시작"}</button></div>`;
  const intro = `<div class="quick-heading"><span class="eyebrow">ACTIVE RECALL</span><h2>빈칸으로 꺼내 쓰는 필수 개념</h2><p>답을 가리고 직접 적어 보세요. 틀리거나 헷갈린 개념부터 반복하고, 맞힌 개념은 1일·3일·7일 뒤 복습합니다.</p></div>`;
  const head = `<section class="cloze-view">${intro}${settings}`;
  if (!items.length) return `${head}<p>빈칸 자료를 불러오지 못했습니다. 새로고침 후 다시 확인해 주세요.</p></section>`;
  if (!session) return `${head}<div class="quick-empty"><b>읽기 → 가리기 → 직접 떠올리기</b><p>필수 개념 ${items.length}개에서 10개씩 시작해 보세요. 빈칸 여러 개는 모두 같은 답입니다. 오답과 헷갈림은 묶음이 끝난 뒤 다시 풀 수 있어요.</p><p>빈칸 결과는 시험 점수와 별도로 기록됩니다.</p></div></section>`;
  if (session.index>=session.ids.length) {
    const results=Object.values(session.results), correct=results.filter(r=>r.correct).length, again=results.filter(r=>!r.correct || r.uncertain).length;
    return `${head}<div class="quick-complete" role="status"><span class="eyebrow">묶음 완료</span><h3>처음 떠올려 맞힌 개념 ${correct} / ${results.length}개</h3><p>오답·헷갈림 ${again}개를 답을 가린 채 다시 풀어보세요.</p><button class="button button-primary" id="cloze-again" ${again?"":"disabled"}>오답·헷갈림 ${again}개 반복</button></div></section>`;
  }
  const item=items.find(x=>x.id===session.ids[session.index]), feedback=session.feedback;
  const mask = text => ClozePractice.parts(String(text),item.answer).map(part=>part.gap?'<span class="cloze-gap" aria-label="빈칸">____</span>':escapeHTML(part.text)).join("");
  return `${head}<div class="quick-status"><span>${escapeHTML(item.subject)}</span><b>${session.index+1} / ${session.ids.length}</b></div><progress class="quick-progress" value="${session.index}" max="${session.ids.length}" aria-label="빈칸 학습 진행"></progress><article class="quick-memory-card cloze-card"><h3>${mask(item.title)}</h3><p class="cloze-sentence">${mask(item.text)}</p><form id="cloze-form"><label for="cloze-input">빈칸에 들어갈 말 <small>숫자에는 단위도 함께 적어주세요 · 예: 3개월</small></label><input class="filter-select" id="cloze-input" autocomplete="off" autocapitalize="off" spellcheck="false" value="${escapeHTML(feedback?.input || '')}" ${feedback?"disabled":""}><div class="cloze-actions"><button class="button button-primary" type="submit" ${feedback?"disabled":""}>정답 확인</button><button class="button button-outline" id="cloze-skip" type="button" ${feedback?"disabled":""}>모르겠어요</button></div></form>${feedback?`<section class="cloze-feedback ${feedback.correct?"is-correct":"is-wrong"}" role="status"><b>${feedback.correct?"맞혔어요":"개념을 확인하고 다시 떠올려 보세요"}</b><p>빈칸 답: <strong>${escapeHTML(item.answer)}</strong></p><p>${escapeHTML(item.text)}</p><button class="button button-quiet" data-open-concept="${escapeHTML(item.cardId)}">전체 개념 정리 보기 →</button><label class="cloze-unsure"><input type="checkbox" id="cloze-unsure" ${feedback.uncertain?"checked":""}> 맞혔지만 헷갈렸어요</label></section><button class="button button-primary cloze-next" id="cloze-next">${session.index+1===session.ids.length?"묶음 결과 보기":"다음 개념 →"}</button>`:""}</article></section>`;
}
function bindCloze() {
  document.querySelectorAll(".cloze-view [data-open-concept]").forEach(button=>button.addEventListener("click",()=>{ openConceptCard(button.dataset.openConcept);studyTypeFlipped=true;render(); }));
  document.querySelector("#cloze-start")?.addEventListener("click",()=>startCloze());
  document.querySelector("#cloze-again")?.addEventListener("click",()=>startCloze(true));
  const answer = skip => {
    const session=clozeSession(); if(!session || session.feedback || session.index>=session.ids.length) return;
    const item=clozeItems().find(x=>x.id===session.ids[session.index]);
    const input=document.querySelector("#cloze-input")?.value || "";
    if(!skip && !input.trim()) { document.querySelector("#cloze-input")?.focus(); toast("답을 적거나 모르겠어요를 눌러 주세요."); return; }
    session.feedback={input,correct:!skip && ClozePractice.check(item,input),uncertain:false};
    persist();render();document.querySelector("#cloze-next")?.focus();
  };
  document.querySelector("#cloze-form")?.addEventListener("submit",e=>{e.preventDefault();answer(false);});
  document.querySelector("#cloze-skip")?.addEventListener("click",()=>answer(true));
  document.querySelector("#cloze-unsure")?.addEventListener("change",e=>{const session=clozeSession();if(session?.feedback){session.feedback.uncertain=e.target.checked;persist();}});
  document.querySelector("#cloze-next")?.addEventListener("click",()=>{
    const session=clozeSession();if(!session?.feedback)return;
    const id=session.ids[session.index], result=session.feedback;
    session.results[id]=result;store.clozeProgress ||= {};
    store.clozeProgress[id]={...LearningEngine.reviewSchedule(store.clozeProgress[id],result.correct && !result.uncertain),correct:result.correct,uncertain:result.uncertain};
    session.index++;session.feedback=null;recordDailyActivity("cards",1);persist();render();document.querySelector("#cloze-input")?.focus();
  });
}
function renderStudyTypes() {
  const available = visibleStudyCards();
  const subjects = [...new Set(studyTypes.map(card => card.subject))];
  const isRecall = studyTypeMode === "recall";
  const heading = titleBlock("개념을 떠올리고, 확인하고, 다시 복습하세요", "암기카드", "용어를 떠올리고 개념을 확인하세요. 헷갈린 카드는 다시 반복합니다.");
  const knownCount = available.filter(card => store.recallProgress?.[card.id]?.rating === "known").length;
  const modeSwitch = `<div class="memory-mode-switch has-cloze" role="tablist" aria-label="암기 학습 방식"><button role="tab" aria-selected="${studyTypeMode === "quick"}" class="${studyTypeMode === "quick" ? "selected" : ""}" data-study-mode="quick"><span>빠른 암기</span><small>10장씩 반복</small></button><button role="tab" aria-selected="${studyTypeMode === "cloze"}" class="${studyTypeMode === "cloze" ? "selected" : ""}" data-study-mode="cloze"><span>빈칸 채우기</span><small>직접 쓰며 반복</small></button><button role="tab" aria-selected="${studyTypeMode === "concept"}" class="${studyTypeMode === "concept" ? "selected" : ""}" data-study-mode="concept"><span>개념 카드</span><small>${studyTypes.length}장</small></button><button role="tab" aria-selected="${isRecall}" class="${isRecall ? "selected" : ""}" data-study-mode="recall"><span>개념 퀴즈</span><small>${knownCount}장 기억</small></button><button role="tab" aria-selected="${studyTypeMode === "saved"}" class="${studyTypeMode === "saved" ? "selected" : ""}" data-study-mode="saved"><span>저장한 개념</span><small>${savedConceptCards().length}장</small></button></div>`;
  if (studyTypeMode === "cloze") return `<div class="quick-memory-view">${modeSwitch}${renderCloze()}</div>`;
  if (studyTypeMode === "quick") return `<div class="quick-memory-view">${modeSwitch}${renderQuickMemory()}</div>`;
  if (studyTypeMode === "saved") return `${heading}${modeSwitch}${renderFlashcards(false)}`;
  const search = `<label class="concept-search">개념 검색<input type="search" id="study-search" value="${escapeHTML(studyTypeSearch)}" placeholder="개념·숫자·용어를 검색하세요"></label>`;
  if (!available.length) return `${heading}${modeSwitch}${search}<div class="flashcard-empty"><h2>검색한 개념이 없습니다</h2><p>다른 용어로 찾아보거나 검색어를 지워 주세요.</p></div>`;
  if (isRecall && !studyRecallOrder.length) startStudyRecallSession();
  const queue = isRecall ? studyRecallOrder : available;
  if (isRecall && studyTypeIndex >= queue.length) {
    const againCount = studyRecallAgainIds.size;
    return `${heading}${modeSwitch}<section class="recall-complete"><span class="memory-recall-label">오늘의 기억 확인</span><h2>${againCount ? `${againCount}장을 한 번 더 복습해요` : "오늘 복습을 마쳤어요"}</h2><p>${queue.length}장의 개념을 직접 떠올려 확인했습니다. 선택 결과는 이 기기에 저장됩니다.</p><div><button class="button button-outline" id="recall-retry-again" ${againCount ? "" : "disabled"}>다시 보기로 표시한 카드만</button><button class="button button-primary" id="recall-retry-all">전체 카드 다시 확인</button></div></section>`;
  }
  studyTypeIndex = Math.min(studyTypeIndex, queue.length - 1);
  const card = queue[studyTypeIndex];
  const q = bank.find(item => item.id === card.sourceId);
  const cardConcepts = studyCardConceptPoints(card);
  const cardMemorize = studyCardMemorizePoints(card);
  const accepted = q ? (Array.isArray(q.answer) ? q.answer : [q.answer]) : [];
  const feedback = studyTypeRevealed && q ? `<div class="type-answer-feedback ${isCorrect(q, studyTypeSelected) ? "is-correct" : "is-wrong"}"><b>${isCorrect(q, studyTypeSelected) ? "정답이에요" : "다시 확인해 보세요"}</b><span>정답 ${escapeHTML(answerLabel(q))}</span><p>${escapeHTML(q.explanation || "등록된 정답을 확인하세요.")}</p></div>` : "";
  const countLabel = `${studyTypeIndex + 1} / ${queue.length}`;
  const frontPrompt = isRecall
    ? `<span class="memory-recall-label">답을 먼저 떠올려 보세요</span><p class="recall-question">${escapeHTML(studyRecallPrompt(card))}</p><label class="recall-input-label" for="recall-answer">기억나는 내용을 적어보기 <small>선택</small></label><textarea id="recall-answer" class="recall-answer-input" placeholder="정답을 보기 전에 직접 적어보세요.">${escapeHTML(studyRecallInput)}</textarea><button class="type-flip-action" data-recall-reveal>개념 답안 확인</button>`
    : `<span class="memory-recall-label">먼저 개념을 떠올려 보세요</span><div class="type-card-prompt concept-term-list">${(card.relatedTerms?.length ? card.relatedTerms : [card.title]).slice(0, 8).map(term => `<span>${escapeHTML(normalizeStudyText(term))}</span>`).join("")}${(card.relatedTerms || []).length > 8 ? `<span class="concept-term-more">+${(card.relatedTerms || []).length - 8}</span>` : ""}</div><button class="type-flip-action" data-concept-flip>개념·암기 내용 확인</button>`;
  const examDetails = q ? `<details class="type-source memory-exam" ${studyTypeQuestionOpen ? "open" : ""}><summary><b>${q.year}년 ${escapeHTML(q.subject)} ${q.number}번 · 관련 기출</b><span>문제와 보기 펼치기＋</span></summary><div class="memory-exam-content"><div class="type-source-question">${renderQuestionText(q.text)}</div><div class="type-answer-options">${q.choices.map((choice, index) => `<button class="type-answer-option ${studyTypeSelected === index + 1 ? "is-selected" : ""} ${studyTypeRevealed && accepted.includes(index + 1) ? "is-answer" : ""} ${studyTypeRevealed && studyTypeSelected === index + 1 && !accepted.includes(index + 1) ? "is-incorrect" : ""}" data-concept-answer="${index + 1}"><b>${LETTERS[index]}</b><span>${renderChoiceText(choice)}</span></button>`).join("")}</div><button class="button button-primary type-check-answer" data-concept-check ${studyTypeRevealed || !studyTypeSelected ? "disabled" : ""}>정답 확인</button>${feedback}<p class="type-source-explanation">${escapeHTML(q.explanation || "정답표 기준 정답입니다.")}</p></div></details>` : "";
  const backControl = isRecall
    ? `<div class="recall-rating"><p>답을 떠올릴 수 있었나요?</p><button class="button button-outline" data-recall-rate="again">다시 볼래요</button><button class="button button-primary" data-recall-rate="known">기억났어요</button></div><button class="type-flip-action back-flip-action" data-concept-flip>앞면으로 돌아가기</button>`
    : `<button class="type-flip-action back-flip-action" data-concept-flip>앞면으로 돌아가기</button>`;
  return `${heading}${modeSwitch}${search}
    <div class="study-type-toolbar"><label class="eyebrow" for="study-type-subject">과목</label><select class="filter-select" id="study-type-subject"><option value="all" ${studyTypeSubject === "all" ? "selected" : ""}>전체 과목 · ${studyTypes.length}장</option>${subjects.map(subject => `<option value="${escapeHTML(subject)}" ${studyTypeSubject === subject ? "selected" : ""}>${escapeHTML(subject)} · ${studyTypes.filter(item => item.subject === subject).length}장</option>`).join("")}</select><span>${countLabel}${isRecall ? ` · 기억한 카드 ${knownCount}장` : ""}</span></div>
    <div class="type-flashcard ${studyTypeFlipped ? "is-flipped" : ""}" id="study-type-card" role="group" aria-label="${escapeHTML(normalizeStudyText(card.title))} ${isRecall ? "기억 확인" : "개념 카드"}">
      <div class="type-card-face type-card-front"><span class="memory-card-kicker"><span>${escapeHTML(card.subject)}</span><b>${countLabel}</b></span><strong class="memory-card-title">${escapeHTML(normalizeStudyText(card.title))}</strong>${frontPrompt}<small>${isRecall ? "기출 문제와 관계없이 카드에 적힌 개념만으로 연습합니다." : "카드를 눌러 개념과 암기 내용을 확인하세요."}</small></div>
      <div class="type-card-face type-card-back"><span class="memory-card-kicker"><span>${isRecall ? "기억 확인 · 개념 답안" : "개념 설명 · 시험 암기"}</span><b>${escapeHTML(card.subject)}</b></span>${isRecall && studyRecallInput.trim() ? `<section class="recall-my-answer"><b>내가 적은 답</b><p>${escapeHTML(studyRecallInput)}</p></section>` : ""}${card.comparison?.length ? "" : `<strong class="memory-answer"><span class="memory-answer-label">핵심 개념</span>${escapeHTML(studyCardKeyConcept(card))}</strong>`}${card.comparison?.length ? `<section class="memory-comparison" aria-label="비교 정리">${card.comparison.map(item => `<div class="memory-comparison-row"><b>${escapeHTML(normalizeStudyText(item.label))}</b><span>${escapeHTML(normalizeStudyText(item.value)).replace(/\n/g,"<br>")}</span></div>`).join("")}</section>` : ""}${cardConcepts.length || cardMemorize.length ? `<section class="memory-facts">${cardConcepts?.length ? `<div class="memory-fact-group"><b>개념 이해</b><ul class="concept-points">${cardConcepts.map(point => `<li>${escapeHTML(normalizeStudyText(point)).replace(/\n/g,"<br>")}</li>`).join("")}</ul></div>` : ""}${cardMemorize.length ? `<div class="memory-fact-group"><b>시험에서 외울 것</b><ul class="concept-points">${cardMemorize.map(point => `<li>${escapeHTML(point).replace(/\n/g,"<br>")}</li>`).join("")}</ul></div>` : ""}</section>` : ""}${examDetails}${backControl}</div>
    </div>
    <div class="flashcard-controls study-type-controls">${isRecall ? `<button class="button button-outline" id="type-prev" ${studyTypeIndex === 0 ? "disabled" : ""}>← 이전 카드</button><button class="button button-quiet" id="type-shuffle">순서 다시 섞기</button><button class="button button-primary" id="type-next" ${studyTypeIndex === queue.length - 1 ? "disabled" : ""}>건너뛰기 →</button>` : `<button class="button button-outline" id="type-prev" ${studyTypeIndex === 0 ? "disabled" : ""}>← 이전 유형</button><button class="button button-quiet" id="type-shuffle">순서 섞기 ↻</button><button class="button button-primary" id="type-next" ${studyTypeIndex === available.length - 1 ? "disabled" : ""}>다음 유형 →</button>`}</div>`;
}
function bindStudyTypes() {
  bindQuickMemory();
  bindCloze();
  document.querySelector("#study-search")?.addEventListener("input", event => {
    const position = event.target.selectionStart;
    studyTypeSearch = event.target.value; studyTypeIndex = 0; studyTypeFlipped = false;
    if (studyTypeMode === "recall") startStudyRecallSession();
    render(); const input = document.querySelector("#study-search"); input?.focus(); input?.setSelectionRange(position, position);
  });
  document.querySelectorAll("[data-study-mode]").forEach(button => button.addEventListener("click", () => {
    studyTypeMode = button.dataset.studyMode;
    if (studyTypeMode === "recall") startStudyRecallSession();
    else { studyTypeIndex = 0; studyTypeFlipped = false; studyTypeSelected = null; studyTypeRevealed = false; studyTypeQuestionOpen = false; }
    render();
  }));
  document.querySelector("#study-type-subject")?.addEventListener("change", event => { studyTypeSubject = event.target.value; if (studyTypeMode === "recall") startStudyRecallSession(); else { studyTypeIndex = 0; studyTypeFlipped = false; studyTypeSelected = null; studyTypeRevealed = false; studyTypeQuestionOpen = false; } render(); });
  document.querySelector("#recall-retry-again")?.addEventListener("click", () => { startStudyRecallSession(true); render(); });
  document.querySelector("#recall-retry-all")?.addEventListener("click", () => { startStudyRecallSession(); render(); });
  const cardElement = document.querySelector("#study-type-card");
  cardElement?.querySelector(".memory-exam")?.addEventListener("toggle", event => { studyTypeQuestionOpen = event.currentTarget.open; });
  cardElement?.querySelector("#recall-answer")?.addEventListener("input", event => { studyRecallInput = event.target.value; });
  cardElement?.addEventListener("click", event => {
    const recallReveal = event.target.closest("[data-recall-reveal]");
    const recallRating = event.target.closest("[data-recall-rate]");
    const answerButton = event.target.closest("[data-concept-answer]");
    const checkButton = event.target.closest("[data-concept-check]");
    const flipButton = event.target.closest("[data-concept-flip]");
    if (recallReveal) { studyTypeFlipped = true; render(); return; }
    if (recallRating) { rateStudyRecallCard(recallRating.dataset.recallRate === "known"); return; }
    if (studyTypeMode === "recall" && event.target.closest("textarea")) return;
    if (answerButton) { event.stopPropagation(); studyTypeQuestionOpen = true; studyTypeSelected = Number(answerButton.dataset.conceptAnswer); studyTypeRevealed = false; render(); return; }
    if (checkButton) { event.stopPropagation(); studyTypeQuestionOpen = true; studyTypeRevealed = true; render(); return; }
    if (event.target.closest("details, summary")) { event.stopPropagation(); return; }
    if (studyTypeMode === "recall" && !flipButton) return;
    studyTypeFlipped = !studyTypeFlipped;
    studyTypeSelected = null; studyTypeRevealed = false; studyTypeQuestionOpen = false;
    render();
  });
  document.querySelector("#type-prev")?.addEventListener("click", () => { studyTypeIndex = Math.max(0, studyTypeIndex - 1); studyRecallInput = ""; studyTypeFlipped = false; studyTypeSelected = null; studyTypeRevealed = false; studyTypeQuestionOpen = false; render(); });
  document.querySelector("#type-next")?.addEventListener("click", () => { const length = studyTypeMode === "recall" ? studyRecallOrder.length : visibleStudyCards().length; studyTypeIndex = Math.min(length - 1, studyTypeIndex + 1); studyRecallInput = ""; studyTypeFlipped = false; studyTypeSelected = null; studyTypeRevealed = false; studyTypeQuestionOpen = false; render(); });
  document.querySelector("#type-shuffle")?.addEventListener("click", () => {
    if (studyTypeMode === "recall") startStudyRecallSession();
    else { const count = visibleStudyCards().length; studyTypeIndex = count > 1 ? (studyTypeIndex + 1 + Math.floor(Math.random() * (count - 1))) % count : 0; studyTypeFlipped = false; studyTypeSelected = null; studyTypeRevealed = false; studyTypeQuestionOpen = false; }
    render();
  });
}
function relatedConceptCards(question) {
  return sourceConceptCards(question);
}
function sourceConceptCards(question) {
  if (!conceptLinkCache.has(question.id)) conceptLinkCache.set(question.id, LearningEngine.related(question, studyTypes, SUBJECTS, conceptLinkAudit));
  return conceptLinkCache.get(question.id);
}

function openConceptCard(id) {
  const index = studyTypes.findIndex(card => card.id === id);
  if (index < 0) return;
  studyTypeSearch = ""; studyTypeMode = "concept"; studyTypeSubject = "all"; studyTypeIndex = index; studyTypeFlipped = false; studyTypeSelected = null; studyTypeRevealed = false; studyTypeQuestionOpen = false;
  setView("study-types");
}
function openSubjectConcepts(subject) {
  studyTypeSearch = ""; studyTypeMode = "concept"; studyTypeSubject = subject; studyTypeIndex = 0; studyTypeFlipped = false; studyTypeSelected = null; studyTypeRevealed = false; studyTypeQuestionOpen = false;
  setView("study-types");
}
function bindDashboard() {
  document.querySelectorAll("[data-today-task]").forEach(button => button.addEventListener("click", () => beginTodayTask(button.dataset.todayTask)));
  document.querySelectorAll("[data-today-stage]").forEach(button => button.addEventListener("click", () => { store.studyStage=button.dataset.todayStage;persist();render(); }));
  document.querySelector("#export-study")?.addEventListener("click", exportStudyBackup);
  document.querySelector("#import-study")?.addEventListener("change", event => importStudyBackup(event.target.files[0]));
  document.querySelectorAll("[data-action=start-exam]").forEach(button => button.addEventListener("click", () => setView("exam")));
  document.querySelectorAll("[data-result]").forEach(button => button.addEventListener("click", () => { view = "result"; renderResultView(Number(button.dataset.result)); }));
  document.querySelectorAll("[data-open-concept]").forEach(button => button.addEventListener("click", () => openConceptCard(button.dataset.openConcept)));
  document.querySelector("[data-action=show-history]")?.addEventListener("click", () => { showAllHistory = !showAllHistory; render(); });
  document.querySelectorAll("[data-issue-done]").forEach(button => button.addEventListener("click", () => {
    const issue = (store.questionIssues || []).find(item => item.id === button.dataset.issueDone);
    if (!issue) return;
    issue.status = "resolved"; issue.resolvedAt = new Date().toISOString(); persist(); render();
    toast("확인 완료로 표시했어요.");
  }));
}
function renderResultView(index) {
  const attempt = store.history[index]; if (!attempt) return;
  document.querySelector("#app-main").innerHTML = renderResult(attempt); document.querySelector("#page-name").textContent = "시험 결과"; bindResult();
}
document.querySelectorAll(".nav-item").forEach(button => button.addEventListener("click", () => {
  if (quiz) { toast("진행 중인 시험을 먼저 마쳐주세요."); return; }
  setView(button.dataset.view);
}));
document.querySelectorAll('[data-action="reset"]').forEach(button => button.addEventListener("click", () => document.querySelector("#reset-dialog").showModal()));
document.querySelector("#reset-cancel").addEventListener("click", () => document.querySelector("#reset-dialog").close());
document.querySelector("#reset-confirm").addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY); store = { history: [], mistakes: [], flashcards: [], questionIssues: [], recallProgress: {}, active: null }; quiz = null; stopClock();
  document.querySelector("#reset-dialog").close(); setView("dashboard"); toast("시험과 오답 기록을 모두 삭제했어요.");
});
document.querySelector("#reset-dialog").addEventListener("click", event => { if (event.target === event.currentTarget) event.currentTarget.close(); });
document.querySelector("#question-issue-form").addEventListener("submit", saveQuestionIssue);
function closeQuestionIssueDialog() { issueQuestionId = null; document.querySelector("#question-issue-dialog").close(); }
document.querySelectorAll("#issue-cancel, #issue-cancel-secondary").forEach(button => button.addEventListener("click", closeQuestionIssueDialog));
document.querySelector("#question-issue-dialog").addEventListener("click", event => { if (event.target === event.currentTarget) event.currentTarget.close(); });

async function loadBank() {
  try {
    const response = await fetch("./data/questions.json");
    if (!response.ok) throw new Error("문제 데이터를 찾을 수 없습니다.");
    const payload = await response.json(); bank = payload.questions || payload;
    bank = bank.filter(q => q && q.id && q.year && q.subject && q.text && q.answer && Array.isArray(q.choices));
  } catch (error) {
    bank = [];
    console.warn(error);
  }
  try {
    const response = await fetch("./data/study-types.json");
    if (!response.ok) throw new Error("핵심 유형 카드를 찾을 수 없습니다.");
    studyTypes = (await response.json()).cards || [];
    studyTypes = studyTypes.filter(card => card.id && card.subject && card.title && (Array.isArray(card.concept) && card.concept.length || Array.isArray(card.memorize) && card.memorize.length) && Array.isArray(card.relatedTerms) && (!card.sourceId || bank.some(q => q.id === card.sourceId)));
  } catch (error) { studyTypes = []; console.warn(error); }
  try {
    const response = await fetch("./data/answer-keys.json");
    if (!response.ok) throw new Error("정답표 데이터를 찾을 수 없습니다.");
    answerKeys = (await response.json()).answerKeys || {};
  } catch (error) { answerKeys = {}; console.warn(error); }
  try {
    const response = await fetch("./data/summary-audio.json");
    if (!response.ok) throw new Error("필수 암기 음성 목록을 찾을 수 없습니다.");
    summaryAudio = await response.json();
  } catch (error) { summaryAudio = null; console.warn(error); }
  try {
    const response = await fetch("./data/core-summary.json");
    if (!response.ok) throw new Error("필수 암기 요약을 찾을 수 없습니다.");
    coreSummary = await response.json();
  } catch (error) { coreSummary = null; console.warn(error); }
  studyTypes = LearningEngine.conceptCatalog(coreSummary, studyTypes);
  try {
    const response = await fetch("./data/concept-links.json");
    if (!response.ok) throw new Error("문항별 개념 연결표를 찾을 수 없습니다.");
    const payload = await response.json();
    if (payload.schema !== "realtor-concept-links" || payload.version !== 1 || !payload.questions) throw new Error("개념 연결표 형식이 올바르지 않습니다.");
    conceptLinkAudit = payload;
  } catch (error) { conceptLinkAudit = null; console.warn(error); }
  try {
    const response = await fetch("./data/essential-cloze.json");
    if (!response.ok) throw new Error("빈칸 학습 자료를 찾을 수 없습니다.");
    essentialCloze = (await response.json()).items || [];
  } catch (error) { essentialCloze = []; console.warn(error); }
  conceptLinkCache.clear();
  if (quiz && !quiz.questions.every(id => bank.some(q => q.id === id))) { quiz = null; store.active = null; persist(); }
  render();
}
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("./sw.js").catch(error => console.warn("오프라인 저장을 설정하지 못했습니다.", error));
}
loadBank();
