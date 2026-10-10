const STORAGE_KEY = "gyeol-study-v1";
const SUBJECTS = ["부동산학개론", "민법 및 민사특별법", "공인중개사법령 및 중개실무", "부동산공법", "부동산공시에 관한 법령 및 부동산 관련 세법"];
const LETTERS = ["①", "②", "③", "④", "⑤"];
let bank = [];
let studyTypes = [];
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
let studyTypeMode = "concept";
let studyTypeSelected = null;
let studyTypeRevealed = false;
let studyTypeQuestionOpen = false;
let showAllHistory = false;

function readStore() {
  try { return { history: [], mistakes: [], flashcards: [], active: null, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")) }; }
  catch { return { history: [], mistakes: [], flashcards: [], active: null }; }
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
function splitLabeledStatements(text) {
  const pattern = /(^|\s)([ㄱㄴㄷㄹㅁㅂ])\s*[.．:：)]\s*/g;
  const matches = [...text.matchAll(pattern)];
  if (matches.length < 2) return null;
  const first = matches[0];
  const intro = text.slice(0, first.index + first[1].length).trim();
  const items = matches.map((match, index) => {
    const start = match.index + match[0].length;
    const end = matches[index + 1]?.index ?? text.length;
    return { label: match[2], text: text.slice(start, end).trim() };
  }).filter(item => item.text);
  return items.length >= 2 ? { intro, items } : null;
}
function renderQuestionText(text) {
  const groups = splitLabeledStatements(text);
  if (!groups) return escapeHTML(text);
  return `${groups.intro ? `<div class="statement-intro">${escapeHTML(groups.intro)}</div>` : ""}<div class="statement-grid">${groups.items.map(item => `<div class="statement-item"><b>${item.label}</b><span>${escapeHTML(item.text)}</span></div>`).join("")}</div>`;
}
function renderChoiceText(text) {
  const groups = splitLabeledStatements(text);
  if (groups) return `<span class="compound-choice">${groups.items.map(item => `<span class="compound-entry"><b>${item.label}</b>${escapeHTML(item.text)}</span>`).join("")}</span>`;
  const combo = text.match(/^([ㄱㄴㄷㄹㅁㅂ](?:\s*[,·ㆍ]\s*[ㄱㄴㄷㄹㅁㅂ])*)$/);
  if (combo) return `<span class="choice-combination">${combo[1].split(/\s*[,·ㆍ]\s*/).map(label => `<b>${label}</b>`).join("")}</span>`;
  return escapeHTML(text);
}
function yearLabel(year) { return year ? `${year}년` : "2020~2025년 전체"; }
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
  document.querySelector("#page-name").textContent = ({ dashboard: "대시보드", exam: "시험 응시", mistakes: "오답노트", flashcards: "암기카드", "study-types": "암기카드", result: "시험 결과" })[next] || "학습실";
  render();
}
function render() {
  const root = document.querySelector("#app-main");
  if (quiz) { view = "taking"; root.innerHTML = renderQuiz(); bindQuiz(); startClock(); return; }
  stopClock();
  if (view === "exam") { root.innerHTML = renderSetup(); bindSetup(); }
  else if (view === "mistakes") { root.innerHTML = renderMistakes(); bindMistakes(); }
  else if (view === "flashcards") { root.innerHTML = renderFlashcards(); bindFlashcards(); }
  else if (view === "study-types") { root.innerHTML = renderStudyTypes(); bindStudyTypes(); if (studyTypeMode === "saved") bindFlashcards(); }
  else if (view === "result" && store.history[0]) { root.innerHTML = renderResult(store.history[0]); bindResult(); }
  else { view = "dashboard"; root.innerHTML = renderDashboard(); bindDashboard(); }
  document.querySelector("#page-name").textContent = ({ dashboard: "대시보드", exam: "시험 응시", mistakes: "오답노트", flashcards: "암기카드", "study-types": "암기카드", result: "시험 결과" })[view] || "시험 응시";
  document.querySelectorAll(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.view === (view === "taking" ? "exam" : view)));
  updateCounts();
}
function titleBlock(kicker, title, sub, action = "") {
  return `<div class="page-heading"><div><div class="eyebrow">${kicker}</div><h1>${title}</h1><p>${sub}</p></div>${action}</div>`;
}
function renderDashboard() {
  const attempts = store.history;
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
    <section class="section-row">
      <article class="panel recent-panel"><div class="panel-head"><div><h2>${showAllHistory ? "전체 시험 기록" : "최근 시험"}</h2><p>${showAllHistory ? `총 ${attempts.length}회 응시` : "가장 최근에 제출한 기록"}</p></div>${attempts.length ? `<button class="panel-link" data-action="show-history">${showAllHistory ? "최근 5회만 보기" : `전체 기록 ${attempts.length}회`}</button>` : ""}</div>
       ${recent.length ? `<div class="recent-list">${recent.map((item, index) => `<button class="recent-item" data-result="${index}"><span><span class="recent-name">${yearLabel(item.year)} 기출 · ${item.scope === "all" ? "전과목 혼합" : escapeHTML(item.subject)}</span><span class="recent-meta">${fmtDate(item.completedAt)} · ${item.correct}/${item.total} 정답</span></span><span class="recent-score ${item.score >= 60 ? "score-good" : "score-low"}">${item.score}<small>점</small></span><span class="result-date">›</span></button>`).join("")}</div>` : `<div class="no-records">아직 시험 기록이 없어요. 첫 시험을 시작해 보세요.</div>`}</article>
      <article class="panel quick-card"><div><div class="eyebrow">${years.length ? `기출 ${Math.min(...years)} — ${Math.max(...years)}` : "기출 데이터"}</div><h3>오늘의 공부를 시작할까요?</h3><p>40분 집중해서 실전 감각을 쌓아보세요.<br>과목을 골라 가볍게 풀어도 좋아요.</p></div><button class="button" data-action="start-exam">시험 설정하기 <span>→</span></button></article>
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

  const byConcept = new Map();
  (store.mistakes || []).forEach(mistake => {
    const question = bank.find(item => item.id === mistake.questionId);
    if (!question) return;
    const card = relatedConceptCards(question)[0];
    if (!card) return;
    const item = byConcept.get(card.id) || { card, wrong: 0, sessions: new Set() };
    item.wrong++;
    item.sessions.add(mistake.attemptId || mistake.attemptedAt || mistake.questionId);
    byConcept.set(card.id, item);
  });
  const concepts = [...byConcept.values()].sort((a, b) => b.sessions.size - a.sessions.size || b.wrong - a.wrong).slice(0, 3);
  const questionSessions = new Map();
  (store.mistakes || []).forEach(item => {
    if (!item.questionId) return;
    const sessions = questionSessions.get(item.questionId) || new Set();
    sessions.add(item.attemptId || item.attemptedAt || item.questionId);
    questionSessions.set(item.questionId, sessions);
  });
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
    ? `<div class="insight-concepts">${concepts.map(item => `<button class="insight-concept" data-open-concept="${escapeHTML(item.card.id)}"><span><b>${escapeHTML(item.card.title)}</b><small>${escapeHTML(item.card.subject)}</small></span><strong>${item.sessions.size}회 시험 · ${item.wrong}회 오답</strong><i>›</i></button>`).join("")}</div><p class="insight-note">같은 개념으로 연결된 오답을 묶었습니다. 문제 표현이 다르면 연결이 완벽하지 않을 수 있어요.</p>`
    : `<div class="insight-empty">${attempts.length ? "현재 기록에서는 반복 오답 유형이 보이지 않아요. 잘하고 있어요!" : "시험 기록이 쌓이면 자주 틀리는 개념을 찾아드려요."}</div>`;
  return `<section class="insight-grid" aria-label="학습 진단">
    <article class="panel insight-panel"><div class="panel-head"><div><h2>학습 흐름</h2><p>최근 정답률과 과목별 보완 지점</p></div>${trendBadge}</div><p class="insight-summary">${trendText}</p>${subjectContent}</article>
    <article class="panel insight-panel"><div class="panel-head"><div><h2>반복 오답 유형</h2><p>틀린 문제를 개념 카드 기준으로 묶었어요</p></div><span class="eyebrow">${repeatedQuestionCount ? `같은 문항 ${repeatedQuestionCount}개 반복` : "LOCAL ANALYSIS"}</span></div>${conceptContent}</article>
  </section>`;
}
function renderChart(attempts) {
  if (!attempts.length) return `<div class="empty-chart">아직 성적 기록이 없어요.<br>첫 시험을 마치면 점수 흐름이 여기에 보여요.</div>`;
  const shown = attempts.slice(0, 8).reverse();
  const w = 600, h = 205, left = 31, right = 12, top = 13, bottom = 27;
  const points = shown.map((a, i) => ({ x: shown.length === 1 ? w / 2 : left + i * (w - left - right) / (shown.length - 1), y: top + (100 - a.score) * (h - top - bottom) / 100, score: a.score }));
  const line = points.map((p, i) => `${i ? "L" : "M"}${p.x},${p.y}`).join(" ");
  const area = `${line} L${points.at(-1).x},${h - bottom} L${points[0].x},${h - bottom} Z`;
  return `<div class="chart-wrap"><svg viewBox="0 0 ${w} ${h}" role="img" aria-label="회차별 점수 그래프"><defs><linearGradient id="chartFill" x1="0" x2="0" y1="0" y2="1"><stop offset="0" stop-color="#8eae8d" stop-opacity=".23"/><stop offset="1" stop-color="#8eae8d" stop-opacity=".015"/></linearGradient></defs>${[0, 50, 100].map(n => { const y = top + (100 - n) * (h - top - bottom) / 100; return `<line class="chart-grid" x1="${left}" x2="${w - right}" y1="${y}" y2="${y}"/><text class="chart-label" x="0" y="${y + 3}">${n}</text>`; }).join("")}<path class="chart-area" d="${area}"/><path class="chart-line" d="${line}"/>${points.map((p, i) => `<circle class="chart-point" cx="${p.x}" cy="${p.y}" r="4"/><text class="chart-label" text-anchor="middle" x="${p.x}" y="${h - 4}">${escapeHTML(shown[i].year)}.${String(new Date(shown[i].completedAt).getMonth() + 1).padStart(2, "0")}</text>`).join("")}</svg></div>`;
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
function renderSetup() {
  const years = [...new Set(bank.map(q => q.year))].sort((a, b) => b - a);
  return `${titleBlock("PRACTICE MODE", "오늘 풀 기출을 골라요", "실제 시험처럼 전과목을 풀거나, 한 과목에 집중할 수 있어요.")}
    <div class="exam-layout"><section class="panel setup-card"><h2>시험 구성</h2><p>설정을 마치면 40분 타이머가 시작됩니다.</p>
      <label class="form-label" for="exam-year">기출 연도</label><select class="year-select" id="exam-year"><option value="all" selected>2020~2025년 전체</option>${years.map(y => `<option value="${y}">${y}년 제${y - 1989}회</option>`).join("")}</select>
      <span class="form-label">풀이 범위</span><div class="segmented" id="scope-switch"><button class="segment selected" data-scope="all">전과목 혼합</button><button class="segment" data-scope="subject">단일 과목</button></div>
      <div id="subject-picker" hidden><span class="form-label">과목 선택</span><div class="subject-options">${SUBJECTS.map((s, i) => `<label class="subject-option ${i === 0 ? "selected" : ""}"><input type="radio" name="subject" value="${escapeHTML(s)}" ${i === 0 ? "checked" : ""}><span>${escapeHTML(s)}</span></label>`).join("")}</div></div>
      <label class="form-label" for="question-count">출제 문항 수</label><select class="year-select" id="question-count"><option value="10">10문제</option><option value="20">20문제</option><option value="30">30문제</option><option value="40" selected>40문제</option></select>
      <div class="setup-summary"><div class="summary-text">문제은행 <b id="question-total">—</b></div><div class="summary-text">이번 시험 <b id="question-benchmark">—</b></div><div class="summary-text">제한 시간 <b>40</b> 분</div></div>
      <p class="coverage-note" id="coverage-note" role="status"></p>
      <button class="button button-primary setup-submit" id="begin-exam">문제 셔플 후 시험 시작 <span>↗</span></button>
    </section><aside class="exam-side"><article class="exam-tip"><div class="eyebrow">A LITTLE GUIDE</div><h3>아는 만큼, 차근차근</h3><p>문제는 무작위 순서로 나옵니다. 답을 고르면 자동 저장되고, 이전 문제로 돌아가 답을 바꿀 수 있어요.</p><div class="tip-stat"><div><b>${bank.length.toLocaleString()}</b><span>등록 문항</span></div><div><b>40분</b><span>시험 시간</span></div><div><b>2020—25</b><span>기출 연도</span></div></div></article><p class="source-note">응시 중에는 언제든 일시정지하거나 제출할 수 있어요. 시간이 끝나면 답안이 자동으로 제출됩니다.</p></aside></div>`;
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
  document.querySelector("#question-count").addEventListener("change", updateQuestionTotal);
  document.querySelector("#begin-exam").addEventListener("click", beginExam);
  updateQuestionTotal();
}
function selectedQuestions() {
  const yearValue = document.querySelector("#exam-year")?.value || "all";
  const year = yearValue === "all" ? null : Number(yearValue);
  const scope = document.querySelector("[data-scope].selected")?.dataset.scope || "all";
  const subject = document.querySelector("input[name=subject]:checked")?.value || SUBJECTS[0];
  const list = bank.filter(q => (year === null || q.year === year) && (scope === "all" || q.subject === subject));
  return { year, scope, subject, list };
}
function updateQuestionTotal() {
  const total = document.querySelector("#question-total"); if (!total) return;
  const { year, scope, list } = selectedQuestions();
  const count = list.length;
  total.textContent = `${count}문항`;
  const requestedCount = Number(document.querySelector("#question-count")?.value || 40);
  const examCount = Math.min(count, requestedCount);
  document.querySelector("#question-benchmark").textContent = `${examCount}문항`;
  const note = document.querySelector("#coverage-note");
  note.textContent = count ? `선택한 범위에서 무작위로 ${examCount}문항을 출제합니다.${examCount < requestedCount ? ` 선택한 범위의 문항이 ${count}개라 ${count}문항으로 조정했습니다.` : ""}` : "선택한 범위에 문제가 없습니다.";
  note.classList.remove("coverage-incomplete");
}
function beginExam() {
  const { year, scope, subject, list } = selectedQuestions();
  const requestedCount = Number(document.querySelector("#question-count")?.value || 40);
  if (!list.length) { toast("선택한 조건에 등록된 문제가 없어요."); return; }
  const shuffled = [...list];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  quiz = { id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`, year, scope, subject, questions: shuffled.slice(0, Math.min(list.length, requestedCount)).map(q => q.id), answers: {}, index: 0, paused: false, remaining: 40 * 60 * 1000, endsAt: Date.now() + 40 * 60 * 1000, startedAt: new Date().toISOString() };
  persist(); setView("exam");
}
function currentQuestions() { return quiz.questions.map(id => bank.find(q => q.id === id)).filter(Boolean); }
function remainingMs() { return quiz.paused ? quiz.remaining : Math.max(0, quiz.endsAt - Date.now()); }
function renderQuiz() {
  const questions = currentQuestions();
  const q = questions[quiz.index];
  if (!q) return `<p>문제를 불러올 수 없습니다.</p>`;
  const elapsed = remainingMs();
  const answered = Object.keys(quiz.answers).length;
  return `<div class="exam-topline"><div><div class="exam-kicker">${yearLabel(quiz.year)} 기출 · ${quiz.scope === "all" ? "전과목 혼합" : escapeHTML(quiz.subject)}</div><div class="exam-kicker" style="margin-top:6px">문제 ${quiz.index + 1} / ${questions.length}</div></div><div class="timer ${quiz.paused ? "paused" : elapsed < 300000 ? "warning" : ""}" id="timer">${quiz.paused ? "일시정지" : fmtDuration(elapsed)}</div></div>
   <div class="question-layout"><article class="panel question-card"><div class="question-meta"><span class="question-number">Q ${String(quiz.index + 1).padStart(2, "0")}</span><span>${escapeHTML(q.subject)}</span><span>·</span><span>${q.number}번</span></div><div class="question-text">${renderQuestionText(q.text)}</div><div class="option-list">${q.choices.map((choice, i) => `<button class="answer-option ${Number(quiz.answers[q.id]) === i + 1 ? "chosen" : ""}" data-answer="${i + 1}"><span class="option-mark">${LETTERS[i]}</span><span>${renderChoiceText(choice)}</span></button>`).join("")}</div><div class="question-controls"><button class="button button-outline" id="previous-question" ${quiz.index === 0 ? "disabled" : ""}>← 이전</button><button class="button button-outline" id="next-question" ${quiz.index === questions.length - 1 ? "disabled" : ""}>다음 →</button></div></article>
   <aside class="exam-rail"><section class="rail-card"><div class="rail-head"><span>답안 현황</span><small>${answered} / ${questions.length}</small></div><div class="question-grid">${questions.map((item, i) => `<button class="question-dot ${i === quiz.index ? "current" : ""} ${quiz.answers[item.id] ? "answered" : ""}" data-goto="${i}" aria-label="${i + 1}번 문제${quiz.answers[item.id] ? " 답변 완료" : " 미응답"}">${i + 1}</button>`).join("")}</div><div class="rail-legend"><span><i class="legend-dot current"></i>현재</span><span><i class="legend-dot"></i>답변 완료</span></div><div class="progress-info"><span>진행률</span><span>${Math.round((quiz.index + 1) / questions.length * 100)}%</span></div></section>
   <section class="rail-card rail-actions"><button class="button button-quiet" id="pause-exam">${quiz.paused ? "시험 재개" : "일시정지"} ${quiz.paused ? "▶" : "Ⅱ"}</button><button class="button button-primary" id="submit-exam">답안 제출하기</button></section></aside></div>`;
}
function bindQuiz() {
  document.querySelectorAll("[data-answer]").forEach(button => button.addEventListener("click", () => {
    const q = currentQuestions()[quiz.index]; quiz.answers[q.id] = Number(button.dataset.answer); persist(); render();
  }));
  document.querySelectorAll("[data-goto]").forEach(button => button.addEventListener("click", () => { quiz.index = Number(button.dataset.goto); persist(); render(); }));
  document.querySelector("#previous-question").addEventListener("click", () => moveQuestion(-1));
  document.querySelector("#next-question").addEventListener("click", () => moveQuestion(1));
  document.querySelector("#pause-exam").addEventListener("click", togglePause);
  document.querySelector("#submit-exam").addEventListener("click", () => submitExam("manual"));
}
function moveQuestion(delta) { quiz.index = Math.min(quiz.questions.length - 1, Math.max(0, quiz.index + delta)); persist(); render(); }
function togglePause() {
  if (quiz.paused) { quiz.paused = false; quiz.endsAt = Date.now() + quiz.remaining; }
  else { quiz.remaining = remainingMs(); quiz.paused = true; }
  persist(); render();
}
function startClock() {
  stopClock();
  if (!quiz || quiz.paused) return;
  interval = setInterval(() => {
    const timer = document.querySelector("#timer");
    if (!timer) { stopClock(); return; }
    const ms = remainingMs(); timer.textContent = fmtDuration(ms); timer.classList.toggle("warning", ms < 300000);
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
  const result = { id: quiz.id, year: quiz.year, scope: quiz.scope, subject: quiz.subject, total: questions.length, correct, score: Math.round(correct / questions.length * 100), subjects: subjectScores, completedAt: new Date().toISOString(), duration: Math.max(0, 40 * 60 * 1000 - remainingMs()), timedOut: reason === "timeout", results: questions.map(q => ({ questionId: q.id, chosen: Number(quiz.answers[q.id]) || null, answer: q.answer, correct: isCorrect(q, quiz.answers[q.id]) })) };
  const mistakes = questions.filter(q => !isCorrect(q, quiz.answers[q.id])).map(q => ({ questionId: q.id, chosen: Number(quiz.answers[q.id]) || null, answer: q.answer, attemptedAt: result.completedAt, attemptId: result.id }));
  store.flashcards = [...new Set([...(store.flashcards || []), ...mistakes.map(m => m.questionId)])];
  const existing = new Set(store.mistakes.map(m => `${m.questionId}:${m.attemptId}`));
  store.mistakes.unshift(...mistakes.filter(m => !existing.has(`${m.questionId}:${m.attemptId}`)));
  store.history.unshift(result); store.active = null; quiz = null; persist(); view = "result"; render();
  if (reason === "timeout") toast("시간이 끝나 답안이 자동 제출됐어요.");
}
function renderResult(attempt) {
  const subjects = Object.entries(attempt.subjects || {});
  const label = attempt.scope === "all" ? "전과목 혼합" : attempt.subject;
  return `${titleBlock("EXAM RESULT", "수고했어요, 시험을 마쳤어요", `${yearLabel(attempt.year)} 기출 · ${escapeHTML(label)} · ${fmtDate(attempt.completedAt)}`)}
    <section class="result-hero"><div><div class="eyebrow">YOUR SCORE</div><h2>${attempt.correct}문제를 맞혔어요</h2><p>${attempt.timedOut ? "제한 시간이 끝나 답안이 자동 제출됐습니다." : "틀린 문제는 오답노트에 자동으로 모아두었어요."}</p></div><div class="result-score">${attempt.score}<small> 점</small></div></section>
    <section class="result-grid"><article class="panel"><div class="panel-head"><div><h2>과목별 결과</h2><p>정답 수와 정답률을 확인해 보세요</p></div></div><div class="result-subjects">${subjects.map(([name, s]) => `<div class="result-subject"><span>${escapeHTML(name)}</span><span>${s.correct}/${s.total} · ${Math.round(s.correct / s.total * 100)}%</span><div class="progress-track"><i style="width:${Math.round(s.correct / s.total * 100)}%"></i></div></div>`).join("")}</div></article>
    <article class="panel"><div class="panel-head"><div><h2>다음 학습</h2><p>오늘의 결과를 이어가요</p></div></div><p style="font-size:12px;color:#7f8c82;line-height:1.8;margin:0 0 18px">이번 시험에서 <b style="color:#b15a4b">${attempt.total - attempt.correct}문제</b>를 다시 볼 문제로 분류했어요. 오답노트에서 내가 고른 답과 정답을 비교해 보세요.</p><button class="button button-primary" data-action="mistakes">오답노트 확인 →</button> <button class="button button-outline" data-action="start-exam">다시 풀기</button></article></section>`;
}
function bindResult() { document.querySelectorAll("[data-action]").forEach(button => button.addEventListener("click", () => button.dataset.action === "mistakes" ? setView("mistakes") : setView("exam"))); }
function renderMistakes() {
  const options = [...new Set(store.mistakes.map(m => bank.find(q => q.id === m.questionId)?.subject).filter(Boolean))];
  return `${titleBlock("REVIEW & REPEAT", "오답을 다시 만나는 시간", "틀린 문제를 모아두었어요. 한 번 더 풀어보고 기억을 다져보세요.")}
   <div class="mistake-toolbar"><select class="filter-select" id="mistake-subject"><option value="all">모든 과목</option>${options.map(s => `<option>${escapeHTML(s)}</option>`).join("")}</select><select class="filter-select" id="mistake-year"><option value="all">모든 연도</option>${[...new Set(store.mistakes.map(m => bank.find(q => q.id === m.questionId)?.year).filter(Boolean))].sort((a,b)=>b-a).map(y=>`<option>${y}</option>`).join("")}</select><span class="summary-text" style="margin-left:auto">총 <b>${store.mistakes.length}</b>문항</span></div>
   <div class="mistake-list" id="mistake-list">${renderMistakeCards(store.mistakes)}</div>`;
}
function renderMistakeCards(mistakes) {
  if (!mistakes.length) return `<div class="mistake-empty"><div class="empty-mark">✓</div><h2>아직 모인 오답이 없어요</h2><p>틀린 문제를 다시 풀어 확인하면<br>오답노트에 풀이 기록이 남습니다.</p><button class="button button-primary" data-action="start-exam">시험 응시하기</button></div>`;
  return mistakes.map(m => {
    const q = bank.find(item => item.id === m.questionId); if (!q) return "";
    const accepted = Array.isArray(q.answer) ? q.answer : [q.answer];
    const hasDetailedExplanation = q.explanation && !q.explanation.includes("원문에는 별도 해설") && !q.explanation.includes("원본에는 별도 해설");
    const inDeck = (store.flashcards || []).includes(q.id);
    const relatedCards = relatedConceptCards(q);
    const explanation = hasDetailedExplanation
      ? `<p>${escapeHTML(q.explanation)}</p>`
      : `<p>Q-Net 공개 원본에는 정답표만 포함되어 있어, 이 문항의 풀이 해설은 아직 등록되지 않았습니다.</p>`;
    return `<article class="panel mistake-card" data-subject="${escapeHTML(q.subject)}" data-year="${q.year}"><div class="mistake-head"><span class="tag">${q.year}년 기출</span><span class="tag">${escapeHTML(q.subject)}</span><span class="tag tag-wrong">${m.chosen ? "오답" : "미응답"}</span><span class="mistake-date">${fmtDate(m.attemptedAt)}</span></div><div class="mistake-question"><b>${q.number}.</b> ${renderQuestionText(q.text)}</div><div class="answer-compare"><span>내가 고른 답 <b class="wrong-answer">${m.chosen ? `${LETTERS[m.chosen - 1]} ${renderChoiceText(q.choices[m.chosen - 1])}` : "미응답"}</b></span><span>정답 <b>${escapeHTML(answerLabel(q))}</b></span></div><div class="explanation"><b>풀이 해설</b>${explanation}</div>${relatedCards.length ? `<div class="related-concepts"><b>관련 개념 정리</b><div>${relatedCards.map(card => `<button class="related-concept-button" data-open-concept="${escapeHTML(card.id)}">${escapeHTML(card.title)} <span>개념 + 기출 →</span></button>`).join("")}</div></div>` : `<div class="related-concepts"><b>개념 복습</b><div><button class="related-concept-button" data-open-subject="${escapeHTML(q.subject)}">${escapeHTML(q.subject)} 개념 카드 보기 <span>과목별 개념 + 기출 →</span></button></div></div>`}<button class="button button-outline flashcard-toggle" data-flashcard="${escapeHTML(q.id)}">${inDeck ? "암기카드에서 빼기" : "암기카드에 담기"}</button></article>`;
  }).join("");
}
function bindMistakes() {
  const filter = () => {
    const subject = document.querySelector("#mistake-subject").value, year = document.querySelector("#mistake-year").value;
    document.querySelectorAll(".mistake-card").forEach(card => { card.hidden = (subject !== "all" && card.dataset.subject !== subject) || (year !== "all" && card.dataset.year !== year); });
  };
  document.querySelector("#mistake-subject").addEventListener("change", filter); document.querySelector("#mistake-year").addEventListener("change", filter);
  document.querySelectorAll("[data-action=start-exam]").forEach(button => button.addEventListener("click", () => setView("exam")));
  document.querySelectorAll("[data-flashcard]").forEach(button => button.addEventListener("click", () => toggleFlashcard(button.dataset.flashcard)));
  document.querySelectorAll("[data-open-concept]").forEach(button => button.addEventListener("click", () => openConceptCard(button.dataset.openConcept)));
  document.querySelectorAll("[data-open-subject]").forEach(button => button.addEventListener("click", () => openSubjectConcepts(button.dataset.openSubject)));
}
function toggleFlashcard(questionId) {
  store.flashcards ||= [];
  store.flashcards = store.flashcards.includes(questionId) ? store.flashcards.filter(id => id !== questionId) : [...store.flashcards, questionId];
  persist();
  if (view === "flashcards" || (view === "study-types" && studyTypeMode === "saved")) render(); else setView("mistakes");
}
function renderFlashcards(includeHeading = true) {
  const cards = (store.flashcards || []).map(id => bank.find(q => q.id === id)).filter(Boolean);
  const heading = includeHeading ? titleBlock("틀린 문제를 다시 풀어보기", "저장한 오답 카드", "문제에 답한 뒤 카드를 뒤집어 정답과 해설을 확인하세요.") : "";
  if (!cards.length) return `${heading}<div class="flashcard-empty"><div class="empty-mark">✦</div><h2>저장한 오답 카드가 없어요</h2><p>시험에서 틀린 문제는 자동으로 저장됩니다.<br>오답노트에서 원하는 문제를 골라 담을 수도 있어요.</p><button class="button button-primary" data-action="mistakes">오답노트 열기</button></div>`;
  flashcardIndex = Math.min(flashcardIndex, cards.length - 1);
  const q = cards[flashcardIndex];
  const latest = store.mistakes.find(m => m.questionId === q.id);
  const answer = answerLabel(q);
  const detailed = q.explanation && !q.explanation.includes("원문에는 별도 해설") && !q.explanation.includes("원본에는 별도 해설");
  return `${heading}<div class="flashcard-toolbar"><span>${flashcardIndex + 1} / ${cards.length}장</span><button class="button button-outline" data-remove-card="${escapeHTML(q.id)}">이 카드 삭제</button></div><div class="flashcard ${flashcardFlipped ? "is-flipped" : ""}" id="flashcard" role="button" tabindex="0" aria-label="카드를 뒤집어 정답 확인"><span class="flashcard-face flashcard-front"><span class="eyebrow">${q.year}년 · ${escapeHTML(q.subject)} · ${q.number}번</span><strong>${renderQuestionText(q.text)}</strong><span class="flashcard-options">${q.choices.map((choice,i)=>`<span>${LETTERS[i]} ${renderChoiceText(choice)}</span>`).join("")}</span><small>눌러서 정답 확인 ↻</small></span><span class="flashcard-face flashcard-back"><span class="eyebrow">정답</span><strong>${escapeHTML(answer)}</strong><span>${detailed ? escapeHTML(q.explanation) : "아직 풀이 해설은 작성되지 않았습니다. 정답표 기준 정답입니다."}</span>${latest ? `<small>풀이 시점 · ${fmtDate(latest.attemptedAt)}</small>` : ""}<small class="flashcard-more">눌러서 문제로 돌아가기 ↻</small></span></div><div class="flashcard-controls"><button class="button button-outline" id="card-prev" ${flashcardIndex===0?"disabled":""}>← 이전</button><button class="button button-primary" id="card-next" ${flashcardIndex===cards.length-1?"disabled":""}>다음 →</button></div>${!detailed ? `<p class="flashcard-source">이 문제는 현재 정답만 등록되어 있고 풀이 해설은 작성 중입니다.</p>` : ""}`;
}
function bindFlashcards() {
  const card = document.querySelector("#flashcard");
  const flipCard = () => { flashcardFlipped = !flashcardFlipped; render(); };
  card?.addEventListener("click", flipCard);
  card?.addEventListener("keydown", event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); flipCard(); } });
  document.querySelector("#card-prev")?.addEventListener("click", () => { flashcardIndex = Math.max(0, flashcardIndex - 1); flashcardFlipped = false; render(); });
  document.querySelector("#card-next")?.addEventListener("click", () => { flashcardIndex = Math.min(store.flashcards.length - 1, flashcardIndex + 1); flashcardFlipped = false; render(); });
  document.querySelector("[data-remove-card]")?.addEventListener("click", event => toggleFlashcard(event.currentTarget.dataset.removeCard));
  document.querySelector("[data-action=mistakes]")?.addEventListener("click", () => setView("mistakes"));
}
function renderStudyTypes() {
  const available = studyTypes.filter(card => studyTypeSubject === "all" || card.subject === studyTypeSubject);
  const subjects = [...new Set(studyTypes.map(card => card.subject))];
  const heading = titleBlock("기억을 꺼내고 기출로 확인하기", "암기카드", "앞면의 질문에 답을 떠올린 뒤 뒤집어 핵심 기준과 연결 기출을 확인하세요.");
  const modeSwitch = `<div class="memory-mode-switch" role="tablist" aria-label="암기카드 종류"><button role="tab" aria-selected="${studyTypeMode === "concept"}" class="${studyTypeMode === "concept" ? "selected" : ""}" data-study-mode="concept"><span>개념·수치 암기</span><small>${studyTypes.length}장</small></button><button role="tab" aria-selected="${studyTypeMode === "saved"}" class="${studyTypeMode === "saved" ? "selected" : ""}" data-study-mode="saved"><span>틀린 문제 카드</span><small>${store.flashcards.length}장</small></button></div>`;
  if (studyTypeMode === "saved") return `${heading}${modeSwitch}${renderFlashcards(false)}`;
  if (!available.length) return `${heading}${modeSwitch}<div class="flashcard-empty"><h2>개념 카드를 불러오지 못했어요</h2><p>페이지를 새로고침한 뒤 다시 확인해 주세요.</p></div>`;
  studyTypeIndex = Math.min(studyTypeIndex, available.length - 1);
  const card = available[studyTypeIndex];
  const q = bank.find(item => item.id === card.sourceId);
  const accepted = q ? (Array.isArray(q.answer) ? q.answer : [q.answer]) : [];
  const feedback = studyTypeRevealed && q ? `<div class="type-answer-feedback ${isCorrect(q, studyTypeSelected) ? "is-correct" : "is-wrong"}"><b>${isCorrect(q, studyTypeSelected) ? "정답이에요" : "다시 확인해 보세요"}</b><span>정답 ${escapeHTML(answerLabel(q))}</span><p>${escapeHTML(q.explanation || "등록된 정답을 확인하세요.")}</p></div>` : "";
  return `${heading}${modeSwitch}
    <div class="study-type-toolbar"><label class="eyebrow" for="study-type-subject">과목</label><select class="filter-select" id="study-type-subject"><option value="all" ${studyTypeSubject === "all" ? "selected" : ""}>전체 과목 · ${studyTypes.length}장</option>${subjects.map(subject => `<option value="${escapeHTML(subject)}" ${studyTypeSubject === subject ? "selected" : ""}>${escapeHTML(subject)} · ${studyTypes.filter(item => item.subject === subject).length}장</option>`).join("")}</select><span>${studyTypeIndex + 1} / ${available.length}</span></div>
    <div class="type-flashcard ${studyTypeFlipped ? "is-flipped" : ""}" id="study-type-card" role="group" aria-label="${escapeHTML(card.title)} 개념 및 기출 카드">
      <div class="type-card-face type-card-front"><span class="memory-card-kicker"><span>${escapeHTML(card.subject)}</span><b>${studyTypeIndex + 1} / ${available.length}</b></span><strong class="memory-card-title">${escapeHTML(card.title)}</strong><span class="memory-recall-label">먼저 답을 떠올려보세요</span><div class="type-card-prompt">${escapeHTML(card.prompt || q?.text || card.title)}</div><button class="type-flip-action" data-concept-flip>정답과 암기 포인트 보기 <span>↻</span></button></div>
      <div class="type-card-face type-card-back"><span class="memory-card-kicker"><span>정답 · 핵심 암기</span><b>${escapeHTML(card.subject)}</b></span><strong class="memory-answer">${escapeHTML(card.answer || (q ? answerLabel(q) : card.title))}</strong><section class="memory-facts"><b>외울 기준</b><ul class="concept-points">${(card.memorize || card.concept).map(point => `<li>${escapeHTML(point)}</li>`).join("")}</ul></section>${q ? `<details class="type-source memory-exam" ${studyTypeQuestionOpen ? "open" : ""}><summary><b>${q.year}년 ${escapeHTML(q.subject)} ${q.number}번 · 기출로 확인</b><span>문제와 보기 펼치기＋</span></summary><div class="memory-exam-content"><div class="type-source-question">${renderQuestionText(q.text)}</div><div class="type-answer-options">${q.choices.map((choice, index) => `<button class="type-answer-option ${studyTypeSelected === index + 1 ? "is-selected" : ""} ${studyTypeRevealed && accepted.includes(index + 1) ? "is-answer" : ""} ${studyTypeRevealed && studyTypeSelected === index + 1 && !accepted.includes(index + 1) ? "is-incorrect" : ""}" data-concept-answer="${index + 1}"><b>${LETTERS[index]}</b><span>${renderChoiceText(choice)}</span></button>`).join("")}</div><button class="button button-primary type-check-answer" data-concept-check ${studyTypeRevealed || !studyTypeSelected ? "disabled" : ""}>정답 확인</button>${feedback}<p class="type-source-explanation">${escapeHTML(q.explanation || "정답표 기준 정답입니다.")}</p></div></details>` : `<span class="type-card-note">연결된 기출문제를 찾을 수 없습니다.</span>`}<button class="type-flip-action back-flip-action" data-concept-flip>질문으로 돌아가기 ↻</button></div>
    </div>
    <div class="flashcard-controls study-type-controls"><button class="button button-outline" id="type-prev" ${studyTypeIndex === 0 ? "disabled" : ""}>← 이전 유형</button><button class="button button-quiet" id="type-shuffle">순서 섞기 ↻</button><button class="button button-primary" id="type-next" ${studyTypeIndex === available.length - 1 ? "disabled" : ""}>다음 유형 →</button></div>
    <p class="study-type-footnote">부동산학개론 1~40번은 제공해 주신 개념 요약 사진을 참고했습니다. 다른 과목은 기출문제와 해설에서 개념을 정리했습니다. 법령 숫자는 연결된 기출 회차 기준입니다.</p>`;
}
function bindStudyTypes() {
  document.querySelectorAll("[data-study-mode]").forEach(button => button.addEventListener("click", () => { studyTypeMode = button.dataset.studyMode; studyTypeFlipped = false; studyTypeSelected = null; studyTypeRevealed = false; studyTypeQuestionOpen = false; render(); }));
  document.querySelector("#study-type-subject")?.addEventListener("change", event => { studyTypeSubject = event.target.value; studyTypeIndex = 0; studyTypeFlipped = false; studyTypeSelected = null; studyTypeRevealed = false; studyTypeQuestionOpen = false; render(); });
  const cardElement = document.querySelector("#study-type-card");
  cardElement?.querySelector(".memory-exam")?.addEventListener("toggle", event => { studyTypeQuestionOpen = event.currentTarget.open; });
  cardElement?.addEventListener("click", event => {
    const answerButton = event.target.closest("[data-concept-answer]");
    const checkButton = event.target.closest("[data-concept-check]");
    if (answerButton) { event.stopPropagation(); studyTypeQuestionOpen = true; studyTypeSelected = Number(answerButton.dataset.conceptAnswer); studyTypeRevealed = false; render(); return; }
    if (checkButton) { event.stopPropagation(); studyTypeQuestionOpen = true; studyTypeRevealed = true; render(); return; }
    if (event.target.closest("details, summary")) { event.stopPropagation(); return; }
    studyTypeFlipped = !studyTypeFlipped;
    studyTypeSelected = null; studyTypeRevealed = false; studyTypeQuestionOpen = false;
    render();
  });
  document.querySelector("#type-prev")?.addEventListener("click", () => { studyTypeIndex = Math.max(0, studyTypeIndex - 1); studyTypeFlipped = false; studyTypeSelected = null; studyTypeRevealed = false; studyTypeQuestionOpen = false; render(); });
  document.querySelector("#type-next")?.addEventListener("click", () => { studyTypeIndex = Math.min(studyTypes.filter(card => studyTypeSubject === "all" || card.subject === studyTypeSubject).length - 1, studyTypeIndex + 1); studyTypeFlipped = false; studyTypeSelected = null; studyTypeRevealed = false; studyTypeQuestionOpen = false; render(); });
  document.querySelector("#type-shuffle")?.addEventListener("click", () => {
    const count = studyTypes.filter(card => studyTypeSubject === "all" || card.subject === studyTypeSubject).length;
    studyTypeIndex = count > 1 ? (studyTypeIndex + 1 + Math.floor(Math.random() * (count - 1))) % count : 0;
    studyTypeFlipped = false; studyTypeSelected = null; studyTypeRevealed = false; studyTypeQuestionOpen = false; render();
  });
}
function relatedConceptCards(question) {
  const searchable = `${question.text} ${question.explanation || ""} ${question.choices.join(" ")}`.replace(/\s+/g, " ");
  const ranked = studyTypes.filter(card => card.subject === question.subject).map(card => ({
    card,
    score: (card.sourceId === question.id ? 100 : 0) + card.relatedTerms.filter(term => searchable.includes(term)).length,
  })).filter(item => item.score > 0).sort((a, b) => b.score - a.score);
  return ranked.slice(0, 2).map(item => item.card);
}
function openConceptCard(id) {
  const index = studyTypes.findIndex(card => card.id === id);
  if (index < 0) return;
  studyTypeMode = "concept"; studyTypeSubject = "all"; studyTypeIndex = index; studyTypeFlipped = false; studyTypeSelected = null; studyTypeRevealed = false; studyTypeQuestionOpen = false;
  setView("study-types");
}
function openSubjectConcepts(subject) {
  studyTypeMode = "concept"; studyTypeSubject = subject; studyTypeIndex = 0; studyTypeFlipped = false; studyTypeSelected = null; studyTypeRevealed = false; studyTypeQuestionOpen = false;
  setView("study-types");
}
function bindDashboard() {
  document.querySelectorAll("[data-action=start-exam]").forEach(button => button.addEventListener("click", () => setView("exam")));
  document.querySelectorAll("[data-result]").forEach(button => button.addEventListener("click", () => { view = "result"; renderResultView(Number(button.dataset.result)); }));
  document.querySelectorAll("[data-open-concept]").forEach(button => button.addEventListener("click", () => openConceptCard(button.dataset.openConcept)));
  document.querySelector("[data-action=show-history]")?.addEventListener("click", () => { showAllHistory = !showAllHistory; render(); });
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
  localStorage.removeItem(STORAGE_KEY); store = { history: [], mistakes: [], flashcards: [], active: null }; quiz = null; stopClock();
  document.querySelector("#reset-dialog").close(); setView("dashboard"); toast("시험과 오답 기록을 모두 삭제했어요.");
});
document.querySelector("#reset-dialog").addEventListener("click", event => { if (event.target === event.currentTarget) event.currentTarget.close(); });

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
    studyTypes = studyTypes.filter(card => card.id && card.subject && card.title && (Array.isArray(card.concept) && card.concept.length || Array.isArray(card.memorize) && card.memorize.length) && Array.isArray(card.relatedTerms) && bank.some(q => q.id === card.sourceId));
  } catch (error) { studyTypes = []; console.warn(error); }
  if (quiz && !quiz.questions.every(id => bank.some(q => q.id === id))) { quiz = null; store.active = null; persist(); }
  render();
}
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("./sw.js").catch(error => console.warn("오프라인 저장을 설정하지 못했습니다.", error));
}
loadBank();
