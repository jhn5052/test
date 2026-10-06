const STORAGE_KEY = "gyeol-study-v1";
const SUBJECTS = ["부동산학개론", "민법 및 민사특별법", "공인중개사법령 및 중개실무", "부동산공법", "부동산공시에 관한 법령 및 부동산 관련 세법"];
const LETTERS = ["①", "②", "③", "④", "⑤"];
let bank = [];
let store = readStore();
let view = "dashboard";
let quiz = store.active || null;
let interval = null;
let toastTimeout = null;

function readStore() {
  try { return { history: [], mistakes: [], active: null, ...(JSON.parse(localStorage.getItem(STORAGE_KEY) || "{}")) }; }
  catch { return { history: [], mistakes: [], active: null }; }
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
function toast(message) {
  const el = document.querySelector("#toast");
  el.textContent = message; el.classList.add("visible");
  clearTimeout(toastTimeout); toastTimeout = setTimeout(() => el.classList.remove("visible"), 2300);
}
function updateCounts() {
  const el = document.querySelector("#mistake-count");
  if (el) el.textContent = store.mistakes.length;
  const days = document.querySelector("#streak-days");
  if (days) days.textContent = store.history.length ? `누적 ${store.history.length}회 응시` : "오늘도 한 걸음";
}
function setView(next) {
  view = next;
  document.querySelectorAll(".nav-item").forEach(button => button.classList.toggle("active", button.dataset.view === next));
  document.querySelector("#page-name").textContent = ({ dashboard: "대시보드", exam: "시험 응시", mistakes: "오답노트", result: "시험 결과" })[next] || "학습실";
  render();
}
function render() {
  const root = document.querySelector("#app-main");
  if (quiz) { view = "taking"; root.innerHTML = renderQuiz(); bindQuiz(); startClock(); return; }
  stopClock();
  if (view === "exam") { root.innerHTML = renderSetup(); bindSetup(); }
  else if (view === "mistakes") { root.innerHTML = renderMistakes(); bindMistakes(); }
  else if (view === "result" && store.history[0]) { root.innerHTML = renderResult(store.history[0]); bindResult(); }
  else { view = "dashboard"; root.innerHTML = renderDashboard(); bindDashboard(); }
  document.querySelector("#page-name").textContent = ({ dashboard: "대시보드", exam: "시험 응시", mistakes: "오답노트", result: "시험 결과" })[view] || "시험 응시";
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
  const recent = attempts.slice(0, 5);
  const subjects = subjectStats(attempts);
  const chart = renderChart(attempts);
  return `${titleBlock("YOUR STUDY JOURNAL", "공부의 결을 쌓아가요", "기출을 풀고, 자주 틀리는 부분을 다시 살펴보세요.", `<button class="button button-primary" data-action="start-exam">새 시험 시작 <span>↗</span></button>`)}
    <section class="stat-grid">
      <article class="stat-card"><span class="stat-label">평균 점수</span><span class="stat-glyph">◉</span><strong>${avg}<em>점</em></strong></article>
      <article class="stat-card"><span class="stat-label">총 풀이 문항</span><span class="stat-glyph">▤</span><strong>${solved.toLocaleString()}<em>문항</em></strong></article>
      <article class="stat-card"><span class="stat-label">누적 정답률</span><span class="stat-glyph">↗</span><strong>${accuracy}<em>%</em></strong></article>
      <article class="stat-card"><span class="stat-label">다시 볼 오답</span><span class="stat-glyph">↺</span><strong>${store.mistakes.length}<em>문항</em></strong></article>
    </section>
    <section class="content-grid">
      <article class="panel"><div class="panel-head"><div><h2>회차별 점수</h2><p>시험을 마칠 때마다 성적이 쌓입니다</p></div><span class="eyebrow">SCORE / 100</span></div>${chart}</article>
      <article class="panel"><div class="panel-head"><div><h2>과목별 정답률</h2><p>지금까지 푼 문제 기준</p></div></div>${renderSubjectStats(subjects)}</article>
    </section>
    <section class="section-row">
      <article class="panel recent-panel"><div class="panel-head"><div><h2>최근 시험</h2><p>가장 최근에 제출한 기록</p></div>${attempts.length ? `<button class="panel-link" data-action="show-history">전체 기록 ${attempts.length}회</button>` : ""}</div>
       ${recent.length ? `<div class="recent-list">${recent.map((item, index) => `<button class="recent-item" data-result="${index}"><span><span class="recent-name">${item.year}년 기출 · ${item.scope === "all" ? "전과목 혼합" : escapeHTML(item.subject)}</span><span class="recent-meta">${fmtDate(item.completedAt)} · ${item.correct}/${item.total} 정답</span></span><span class="recent-score ${item.score >= 60 ? "score-good" : "score-low"}">${item.score}<small>점</small></span><span class="result-date">›</span></button>`).join("")}</div>` : `<div class="no-records">아직 시험 기록이 없어요. 첫 시험을 시작해 보세요.</div>`}</article>
      <article class="panel quick-card"><div><div class="eyebrow">${years.length ? `기출 ${Math.min(...years)} — ${Math.max(...years)}` : "기출 데이터"}</div><h3>오늘의 공부를 시작할까요?</h3><p>40분 집중해서 실전 감각을 쌓아보세요.<br>과목을 골라 가볍게 풀어도 좋아요.</p></div><button class="button" data-action="start-exam">시험 설정하기 <span>→</span></button></article>
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
  const selectedYear = years[0] || new Date().getFullYear();
  return `${titleBlock("PRACTICE MODE", "오늘 풀 기출을 골라요", "실제 시험처럼 전과목을 풀거나, 한 과목에 집중할 수 있어요.")}
    <div class="exam-layout"><section class="panel setup-card"><h2>시험 구성</h2><p>설정을 마치면 40분 타이머가 시작됩니다.</p>
      <label class="form-label" for="exam-year">기출 연도</label><select class="year-select" id="exam-year">${years.map(y => `<option value="${y}" ${y === selectedYear ? "selected" : ""}>${y}년 제${y - 1989}회</option>`).join("")}</select>
      <span class="form-label">풀이 범위</span><div class="segmented" id="scope-switch"><button class="segment selected" data-scope="all">전과목 혼합</button><button class="segment" data-scope="subject">단일 과목</button></div>
      <div id="subject-picker" hidden><span class="form-label">과목 선택</span><div class="subject-options">${SUBJECTS.map((s, i) => `<label class="subject-option ${i === 0 ? "selected" : ""}"><input type="radio" name="subject" value="${escapeHTML(s)}" ${i === 0 ? "checked" : ""}><span>${escapeHTML(s)}</span></label>`).join("")}</div></div>
      <div class="setup-summary"><div class="summary-text">수록 문항 <b id="question-total">—</b></div><div class="summary-text">기준 <b id="question-benchmark">—</b></div><div class="summary-text">제한 시간 <b>40</b> 분</div></div>
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
  document.querySelector("#begin-exam").addEventListener("click", beginExam);
  updateQuestionTotal();
}
function selectedQuestions() {
  const year = Number(document.querySelector("#exam-year")?.value);
  const scope = document.querySelector("[data-scope].selected")?.dataset.scope || "all";
  const subject = document.querySelector("input[name=subject]:checked")?.value || SUBJECTS[0];
  const list = bank.filter(q => q.year === year && (scope === "all" || q.subject === subject));
  return { year, scope, subject, list };
}
function updateQuestionTotal() {
  const total = document.querySelector("#question-total"); if (!total) return;
  const { year, scope, list } = selectedQuestions();
  const benchmark = scope === "all" ? 200 : 40;
  const count = list.length;
  total.textContent = `${count}문항`;
  document.querySelector("#question-benchmark").textContent = `${benchmark}문항`;
  const note = document.querySelector("#coverage-note");
  if (count < benchmark) {
    note.textContent = `${year}년 원문에서 현재 ${count}/${benchmark}문항을 확인했습니다. 누락된 문항은 시험에 포함되지 않으니 수록 수를 확인하고 응시해 주세요.`;
    note.classList.add("coverage-incomplete");
  } else {
    note.textContent = "선택한 범위의 문항이 모두 수록되어 있습니다.";
    note.classList.remove("coverage-incomplete");
  }
}
function beginExam() {
  const { year, scope, subject, list } = selectedQuestions();
  if (!list.length) { toast("선택한 조건에 등록된 문제가 없어요."); return; }
  const shuffled = [...list].sort(() => Math.random() - .5);
  quiz = { id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}`, year, scope, subject, questions: shuffled.map(q => q.id), answers: {}, index: 0, paused: false, remaining: 40 * 60 * 1000, endsAt: Date.now() + 40 * 60 * 1000, startedAt: new Date().toISOString() };
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
  return `<div class="exam-topline"><div><div class="exam-kicker">${quiz.year}년 기출 · ${quiz.scope === "all" ? "전과목 혼합" : escapeHTML(quiz.subject)}</div><div class="exam-kicker" style="margin-top:6px">문제 ${quiz.index + 1} / ${questions.length}</div></div><div class="timer ${quiz.paused ? "paused" : elapsed < 300000 ? "warning" : ""}" id="timer">${quiz.paused ? "일시정지" : fmtDuration(elapsed)}</div></div>
   <div class="question-layout"><article class="panel question-card"><div class="question-meta"><span class="question-number">Q ${String(quiz.index + 1).padStart(2, "0")}</span><span>${escapeHTML(q.subject)}</span><span>·</span><span>${q.number}번</span></div><div class="question-text">${escapeHTML(q.text)}</div><div class="option-list">${q.choices.map((choice, i) => `<button class="answer-option ${Number(quiz.answers[q.id]) === i + 1 ? "chosen" : ""}" data-answer="${i + 1}"><span class="option-mark">${LETTERS[i]}</span><span>${escapeHTML(choice)}</span></button>`).join("")}</div><div class="question-controls"><button class="button button-outline" id="previous-question" ${quiz.index === 0 ? "disabled" : ""}>← 이전</button><button class="button button-outline" id="next-question" ${quiz.index === questions.length - 1 ? "disabled" : ""}>다음 →</button></div></article>
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
  const existing = new Set(store.mistakes.map(m => `${m.questionId}:${m.attemptId}`));
  store.mistakes.unshift(...mistakes.filter(m => !existing.has(`${m.questionId}:${m.attemptId}`)));
  store.history.unshift(result); store.active = null; quiz = null; persist(); view = "result"; render();
  if (reason === "timeout") toast("시간이 끝나 답안이 자동 제출됐어요.");
}
function renderResult(attempt) {
  const subjects = Object.entries(attempt.subjects || {});
  const label = attempt.scope === "all" ? "전과목 혼합" : attempt.subject;
  return `${titleBlock("EXAM RESULT", "수고했어요, 시험을 마쳤어요", `${attempt.year}년 기출 · ${escapeHTML(label)} · ${fmtDate(attempt.completedAt)}`)}
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
    return `<article class="panel mistake-card" data-subject="${escapeHTML(q.subject)}" data-year="${q.year}"><div class="mistake-head"><span class="tag">${q.year}년 기출</span><span class="tag">${escapeHTML(q.subject)}</span><span class="tag tag-wrong">${m.chosen ? "오답" : "미응답"}</span><span class="mistake-date">${fmtDate(m.attemptedAt)}</span></div><p class="mistake-question">${q.number}. ${escapeHTML(q.text)}</p><div class="answer-compare"><span>내가 고른 답 <b class="wrong-answer">${m.chosen ? `${LETTERS[m.chosen - 1]} ${escapeHTML(q.choices[m.chosen - 1])}` : "미응답"}</b></span><span>정답 <b>${escapeHTML(answerLabel(q))}</b></span></div><div class="explanation"><b>정답 해설</b> · ${escapeHTML(q.explanation || `정답은 ${accepted.map(answer => LETTERS[answer - 1]).join("·")}입니다. 원문에는 별도 해설이 포함되어 있지 않아 정답표를 기준으로 채점했습니다.`)}</div></article>`;
  }).join("");
}
function bindMistakes() {
  const filter = () => {
    const subject = document.querySelector("#mistake-subject").value, year = document.querySelector("#mistake-year").value;
    document.querySelectorAll(".mistake-card").forEach(card => { card.hidden = (subject !== "all" && card.dataset.subject !== subject) || (year !== "all" && card.dataset.year !== year); });
  };
  document.querySelector("#mistake-subject").addEventListener("change", filter); document.querySelector("#mistake-year").addEventListener("change", filter);
  document.querySelectorAll("[data-action=start-exam]").forEach(button => button.addEventListener("click", () => setView("exam")));
}
function bindDashboard() {
  document.querySelectorAll("[data-action=start-exam]").forEach(button => button.addEventListener("click", () => setView("exam")));
  document.querySelectorAll("[data-result]").forEach(button => button.addEventListener("click", () => { view = "result"; renderResultView(Number(button.dataset.result)); }));
  document.querySelector("[data-action=show-history]")?.addEventListener("click", () => toast(`총 ${store.history.length}회의 시험 기록이 있어요.`));
}
function renderResultView(index) {
  const attempt = store.history[index]; if (!attempt) return;
  document.querySelector("#app-main").innerHTML = renderResult(attempt); document.querySelector("#page-name").textContent = "시험 결과"; bindResult();
}
document.querySelectorAll(".nav-item").forEach(button => button.addEventListener("click", () => {
  if (quiz) { toast("진행 중인 시험을 먼저 마쳐주세요."); return; }
  setView(button.dataset.view);
}));
document.querySelector("#reset-open").addEventListener("click", () => document.querySelector("#reset-dialog").showModal());
document.querySelector("#reset-cancel").addEventListener("click", () => document.querySelector("#reset-dialog").close());
document.querySelector("#reset-confirm").addEventListener("click", () => {
  localStorage.removeItem(STORAGE_KEY); store = { history: [], mistakes: [], active: null }; quiz = null; stopClock();
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
  if (quiz && !quiz.questions.every(id => bank.some(q => q.id === id))) { quiz = null; store.active = null; persist(); }
  render();
}
if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
  navigator.serviceWorker.register("./sw.js").catch(error => console.warn("오프라인 저장을 설정하지 못했습니다.", error));
}
loadBank();
