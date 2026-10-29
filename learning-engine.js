/* Shared, DOM-free sources and review rules. Legal text stays in core-summary.json. */
(function (root) {
  const plain = value => String(value || '').replace(/\*\*|`/g, '').trim();
  const compact = value => plain(value).replace(/\s/g, '');
  function hash(text) { let value = 2166136261; for (const char of text) value = Math.imul(value ^ char.charCodeAt(0), 16777619); return (value >>> 0).toString(36); }
  function canonicalCards(summary) {
    const cards = [];
    for (const subject of summary?.subjects || []) {
      (subject.sections || []).forEach((section, sectionIndex) => {
        (section.blocks || []).forEach(block => {
          const add = (label, points, comparison = []) => {
            const facts = points.map(plain).filter(Boolean);
            if (!facts.length) return;
            const title = plain(label) || plain(section.title);
            cards.push({ id: `core-${subject.id}-${hash(section.title + title + facts.join('|'))}`, subject: subject.appSubject, title,
              concept: facts, memorize: comparison.length ? [] : facts, comparison, relatedTerms: [title, plain(section.title)],
              searchTerms: /기준·신고/.test(title) ? ['과세기준일','신고기한'] : /납기/.test(title) ? ['납부기한'] : /분납/.test(title) ? ['분할납부'] : [],
              origin: 'core', summarySubject: subject.id, summarySection: sectionIndex, sectionTitle: plain(section.title) });
          };
          if (block.type === 'table') {
            (block.rows || []).forEach(row => {
              const cells = row.slice(1).map((value, i) => ({ label: plain(block.head?.[i + 1]) || '기준', value: plain(value) }));
              add(`${section.title} · ${row[0]}`, cells.map(cell => `${cell.label}: ${cell.value}`), cells);
            });
          } else {
            (block.items || []).forEach(item => {
              const text = plain(item);
              const prefix = text.match(/^([^:：=]{1,55})\s*[:：=]/)?.[1]?.trim();
              add(prefix && !['세율', '신고', '함정', '비교', '성립', '확정'].includes(prefix) ? prefix : `${section.title} · ${prefix || text.slice(0, 24)}`, [text]);
            });
          }
        });
      });
    }
    return cards;
  }
  // Legacy question fields never enter the concept deck. Keep factual prose only.
  function conceptText(value) {
    return plain(value).split(/\n|(?<=[다함됨음])\.\s+/).map(line => {
      const text = line.trim();
      if (!text || /[?？①②③④⑤]|정답|선택지|이 보기|나머지 보기|해당 기출|이 기출|같은 문제|정답표|원문을 확인|사용자 노트|연도별 법령|법령 숫자는 개정|문제에서|시험에서는|기출.{0,15}(?:기준|함정|확인)|숫자는 제공|甲|乙|丙|丁|설명이 틀렸/.test(text)) return '';
      if (/(?:구분한다|살핀다|확인한다|정리한다|복습한다|기억한다|외우지 않는다)\.?$/.test(text) && !/[:：=]|은 |는 |이란 |이므로|때문|해야|없다|있다/.test(text)) return '';
      return text.replace(/^\d{4}년 기출(?: 포인트)?\s*[:：]\s*/, '').replace(/\(\d{4}년 기출\)/g, '').replace(/^제공된 교재 요약표 기준(?: 숫자)?\s*[:：]\s*/, '');
    }).filter(Boolean).join('\n');
  }
  function conceptCatalog(summary, legacy = []) {
    const core = canonicalCards(summary);
    const safe = legacy.filter(c => c.id && c.subject && c.title && !c.id.startsWith('gap-')).map(c => {
      const clean = points => [...new Set((points || []).map(conceptText).filter(Boolean))];
      const concept = clean(c.concept), memorize = clean(c.memorize);
      // Do not carry prompt/answer/sourceId: they were exam content, not concept content.
      return {id:c.id, subject:c.subject, title:plain(c.title).replace(/^사진 암기노트:\s*/, ''), concept, memorize,
        relatedTerms:(c.relatedTerms || []).map(plain).filter(t=>t && !/[?？①②③④⑤]/.test(t)),
        comparison:(c.comparison || []).filter(r=>conceptText(r.value)).map(r=>({label:plain(r.label),value:conceptText(r.value)})), origin:'concept'};
    }).filter(c => c.concept.length || c.memorize.length || c.comparison.length);
    const catalog = [...core, ...safe];
    // The same lease/building rules are examined in brokerage practice. Reuse
    // their actual definitions, with the exam subject recorded explicitly.
    const brokerSubject = summary?.subjects?.find(s=>s.id==='broker')?.appSubject;
    const referenceIds = new Set(['civil-11','civil-28','civil-33','civil-27','civil-17']);
    const references = brokerSubject ? catalog.filter(c=>referenceIds.has(c.id) || (c.origin==='core' && c.summarySubject==='civil' && /주택임대차|집합건물/.test(c.sectionTitle))).map(c=>({...c,id:`broker-review-${c.id}`,subject:brokerSubject,origin:'reference',sourceCardId:c.id})) : [];
    return [...catalog, ...references];
  }
  function questionFingerprint(q) {
    return hash(JSON.stringify([q.id,q.year,q.number,q.subject,q.text,q.choices,q.answer,q.explanation]));
  }
  function cardFingerprint(c) {
    return hash(JSON.stringify([c.id,c.subject,c.title,c.concept,c.memorize,c.comparison,c.relatedTerms]));
  }
  // Only the checked per-question table is allowed in learning flows.
  // Missing/stale entries fail closed, instead of falling back to word overlap.
  function related(question, cards, subjects, audit) {
    const entry = audit?.questions?.[question.id];
    if (!entry || !Array.isArray(entry.cards) || !entry.cards.every(link=>link && typeof link.id==='string' && typeof link.fingerprint==='string') || entry.status !== 'linked' || entry.questionFingerprint !== questionFingerprint(question)) return [];
    const matches = entry.cards.map(link => cards.find(c => c.id === link.id));
    if (matches.some((c,i) => !c || c.subject !== question.subject || cardFingerprint(c) !== entry.cards[i].fingerprint)) return [];
    return matches;
  }
  function stageReadiness(history, subjects) {
    const specs = [{ id:'first', label:'1차', subjects:subjects.slice(0,2) }, { id:'secondFirst', label:'2차 1교시', subjects:subjects.slice(2,4) }, { id:'secondSecond', label:'2차 2교시', subjects:subjects.slice(4) }];
    const sorted = [...history].sort((a,b)=>String(b.completedAt || '').localeCompare(String(a.completedAt || '')));
    const stages = specs.map(spec => {
      const attempt = sorted.find(a => a.stage === spec.id && spec.subjects.every(s => Number(a.subjects?.[s]?.total) === 40 && Number.isFinite(Number(a.subjects[s].correct)) && Number(a.subjects[s].correct) >= 0 && Number(a.subjects[s].correct) <= 40));
      const rows = spec.subjects.map(name=>({name,score: attempt ? Number(attempt.subjects[name].correct)/40*100 : null}));
      return {...spec, attempt, rows};
    });
    function assess(rows) { const scores=rows.map(row=>row.score); if(scores.some(x=>!Number.isFinite(x))) return null; const mean=scores.reduce((a,b)=>a+b,0)/scores.length; return {mean,lowest:Math.min(...scores),pass:mean>=60&&Math.min(...scores)>=40,goal:mean>=65&&Math.min(...scores)>=45}; }
    const first = {...stages[0], result:stages[0].attempt ? assess(stages[0].rows):null};
    const a=stages[1], b=stages[2];
    const compatible = a.attempt && b.attempt && a.attempt.year === b.attempt.year;
    const second={id:'second',label:'2차',rows:[...a.rows,...b.rows], result:compatible ? assess([...a.rows,...b.rows]):null, complete:Boolean(compatible)};
    return {first,second};
  }
  function firstAttemptAccuracy(history) {
    const seen=new Set();let correct=0;
    [...history].sort((a,b)=>String(a.completedAt||'').localeCompare(String(b.completedAt||''))).forEach(a=>(a.results||[]).forEach(r=>{if(!r.questionId||seen.has(r.questionId)||typeof r.correct!=='boolean')return;seen.add(r.questionId);if(r.correct)correct++;}));
    return {total:seen.size,correct,rate:seen.size?Math.round(correct/seen.size*100):null};
  }
  function reviewSchedule(previous, known, now = Date.now()) {
    const streak=known ? (Number(previous?.streak)||0)+1:0;
    const days=known ? [1,3,7][Math.min(2,streak-1)]:0;
    return {rating:known?'known':'again',reviews:(Number(previous?.reviews)||0)+1,streak,updatedAt:new Date(now).toISOString(),dueAt:new Date(now+days*86400000).toISOString()};
  }
  function readBackup(payload) {
    if (payload?.schema!=='realtor-study-backup'||payload.version!==1||!payload.data||typeof payload.data!=='object') throw new Error('이 앱에서 내보낸 학습 기록 파일을 선택해 주세요.');
    const d=payload.data;
    for(const field of ['history','mistakes','flashcards']) if(!Array.isArray(d[field]))throw new Error('학습 기록 파일의 형식이 올바르지 않습니다.');
    for (const field of ['recallProgress','quickMemoryProgress','clozeProgress','resolvedMistakes']) if(d[field] !== undefined && (!d[field] || typeof d[field] !== 'object' || Array.isArray(d[field]))) throw new Error('학습 기록 파일의 복습 정보 형식이 올바르지 않습니다.');
    if(d.questionIssues !== undefined && !Array.isArray(d.questionIssues)) throw new Error('신고 기록 형식이 올바르지 않습니다.');
    return d;
  }
  function mergeBackup(current, incoming) {
    const mergeList=(a,b,key)=>{ const rows=new Map(); const at=x=>String(x.updatedAt||x.resolvedAt||x.attemptedAt||x.completedAt||x.createdAt||''); for(const x of [...b,...a])if(x&&key(x)&&(!rows.has(key(x))||at(x)>=at(rows.get(key(x)))))rows.set(key(x),x); return [...rows.values()]; };
    const histories=mergeList(current.history||[],incoming.history||[],x=>x.id || `${x.completedAt}:${x.year}:${x.total}`).sort((a,b)=>String(b.completedAt||'').localeCompare(String(a.completedAt||'')));
    const mistakes=mergeList(current.mistakes||[],incoming.mistakes||[],x=>x.questionId);
    const resolved=Object.fromEntries([...new Set([...Object.keys(incoming.resolvedMistakes||{}),...Object.keys(current.resolvedMistakes||{})])].filter(k=>!['__proto__','constructor','prototype'].includes(k)).map(k=>[k,[incoming.resolvedMistakes?.[k]||'',current.resolvedMistakes?.[k]||''].sort().at(-1)]));
    const latestResult=new Map();
    for(const a of [...histories].reverse()) for(const r of a.results||[]) latestResult.set(r.questionId,{correct:r.correct,uncertain:r.uncertain,at:a.completedAt||''});
    const recordMerge=(a,b)=>Object.fromEntries([...new Set([...Object.keys(a||{}),...Object.keys(b||{})])].filter(k=>!['__proto__','constructor','prototype'].includes(k)).map(k=>[k,String(a?.[k]?.updatedAt||'')>=String(b?.[k]?.updatedAt||'')?a?.[k]:b?.[k]]));
    return {...current, history:histories, mistakes:mistakes.filter(m=>!(resolved[m.questionId] && resolved[m.questionId]>=String(m.attemptedAt||'')) && !(latestResult.get(m.questionId)?.correct && latestResult.get(m.questionId).at>=String(m.attemptedAt||''))),
      flashcards:[...new Set([...(current.flashcards||[]),...(incoming.flashcards||[])])], questionIssues:mergeList(current.questionIssues||[],incoming.questionIssues||[],x=>x.id),
      uncertainQuestions:[...new Set([...(current.uncertainQuestions||[]),...(Array.isArray(incoming.uncertainQuestions)?incoming.uncertainQuestions:[])])].filter(id=>typeof id==='string' && !(latestResult.get(id)?.correct && !latestResult.get(id)?.uncertain)),
      recallProgress:recordMerge(current.recallProgress,incoming.recallProgress),quickMemoryProgress:recordMerge(current.quickMemoryProgress,incoming.quickMemoryProgress),clozeProgress:recordMerge(current.clozeProgress,incoming.clozeProgress),resolvedMistakes:resolved};
  }
  const api={plain,canonicalCards,conceptText,conceptCatalog,questionFingerprint,cardFingerprint,related,stageReadiness,firstAttemptAccuracy,reviewSchedule,readBackup,mergeBackup};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LearningEngine=api;
})(typeof globalThis==='undefined'?this:globalThis);
