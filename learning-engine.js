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
  // Topic anchors are applied to the question stem only, never to an incorrect choice.
  const rules = [
    ['public', /광역도시계획|광역계획권/, /테마01/], ['public', /도시[·ㆍ\s]*군기본계획/, /테마02/],
    ['public', /도시[·ㆍ\s]*군관리계획/, /테마03/], ['public', /용도지역/, /테마04/], ['public', /용도지구/, /테마05/], ['public', /용도구역|개발제한구역|시가화조정구역/, /테마06/],
    ['public', /도시[·ㆍ\s]*군계획시설|도시계획시설/, /테마07/], ['public', /지구단위계획/, /테마08/], ['public', /개발행위허가|개발행위의허가/, /테마09/],
    ['public', /개발밀도관리구역|기반시설부담구역/, /테마10/], ['public', /도시개발구역|도시개발조합/, /테마11도시/], ['public', /환지예정지|환지처분|체비지|도시개발채권/, /테마11수용/],
    ['public', /정비사업의종류|주거환경개선사업|공공재개발사업/, /테마12/], ['public', /정비기본계획/, /테마13/], ['public', /정비사업조합|재건축조합|재개발조합/, /테마14/],
    ['public', /관리처분계획|정비사업시행계획/, /테마15/], ['public', /건축법.*용어|건축물의대지|지하층|피난층|건축면적|바닥면적/, /테마17/], ['public', /건축허가|건축신고/, /테마18건축허가/], ['public', /용도변경/, /테마18건축물/],
    ['public', /대지와도로|건축물의구조|건축선/, /테마19/], ['public', /주택법.*용어|도시형생활주택|세대구분형|장수명주택/, /테마21/], ['public', /주택조합|사업주체/, /테마22/],
    ['public', /주택상환사채|사업계획승인/, /테마23주택/], ['public', /주택법.*매도청구|투기과열지구|조정대상지역|리모델링/, /테마23매도/], ['public', /농지법|농지취득자격증명|농지전용/, /농지법/],
    ['tax', /재산세/, /재산세/], ['tax', /종합부동산세|종부세/, /종부세/], ['tax', /양도소득세/, /양도소득세/], ['tax', /취득세/, /취득세/], ['tax', /등록면허세/, /등록면허세/],
    ['tax', /분할납부|분납|물납|납부기한|납기|과세기준일/, /신고·납부/], ['tax', /가산세|납세의무의성립|납세의무의확정|부과제척기간/, /성립·확정/],
    ['registry', /축척/, /지적/, /축척/], ['registry', /지목/, /지적/, /지목/], ['registry', /지적측량/, /지적/, /지적측량/], ['registry', /적부심사/, /지적/, /적부심사/],
    ['registry', /지번/, /지적/, /지번/], ['registry', /지적공부|토지대장|임야대장|대지권등록부|경계점좌표등록부/, /지적/, /등록사항|면적/],
    ['registry', /부기등기/, /등기/, /부기등기/], ['registry', /주등기/, /등기/, /주등기/], ['registry', /단독신청|공동신청/, /등기/, /단독신청/],
    ['registry', /소유권보존등기/, /등기/, /소유권보존/], ['registry', /이의신청/, /등기/, /이의신청/], ['registry', /가등기/, /등기/, /가등기/], ['registry', /근저당권|신탁등기/, /등기/, /근저당은/],
    ['civil', /주택임대차보호법|상가건물임대차보호법/, /주택임대차/], ['civil', /집합건물|가등기담보|명의신탁/, /집합건물/, /집합건물|가등기담보|명의신탁/],
    ['civil', /통정허위표시|비진의표시|착오|제3자의사기|복대리|표현대리|무권대리|취소권|법정추인|기성조건|불능조건|불법조건|공유|취득시효|지역권|지상권|전세권|유치권|계약금|동시이행|담보책임|부속물매수청구권|지상물매수청구권/, /총칙·물권·계약/],
    ['intro', /탄력성/, /공식/, /탄력성/], ['intro', /거미집/, /공식/, /거미집/], ['intro', /레일리|컨버스|허프/, /공식/, /레일리/], ['intro', /입지계수/, /공식/, /입지계수/],
    ['intro', /현금흐름|순영업소득|가능총소득|유효총소득/, /공식/, /현금흐름/], ['intro', /부채감당률|지분배당률|채무불이행률|승수/, /공식/, /비율/],
    ['intro', /저당상수|감채기금|연금현가|연금의현가|화폐의시간가치/, /공식/, /6계수/], ['intro', /순현재가치|내부수익률|수익성지수/, /공식/, /채택기준/], ['intro', /지렛대/, /공식/, /지렛대/],
    ['intro', /원금균등|원리금균등|체증식/, /공식/, /상환방식/], ['intro', /대출가능|최대대출|DTI|LTV/, /공식/, /DTI대출/], ['intro', /원가법|거래사례비교법|수익환원법|환원율/, /공식/, /감정평가/],
    ['intro', /지대이론|리카도|마르크스|튀넨|마셜|알론소|헤이그/, /학자·제도/, /지대/], ['intro', /베버|뢰시|크리스탈러|넬슨/, /학자·제도/, /입지/], ['intro', /버제스|동심원|호이트|선형이론|다핵심/, /학자·제도/, /도시구조/],
    ['intro', /효율적시장|할당효율/, /학자·제도/, /효율적시장/], ['intro', /MBS|MPTS|MBB|MPTB|CMO|주택저당증권|주택저당채권/, /학자·제도/, /MBS/], ['intro', /부동산투자회사|리츠/, /학자·제도/, /리츠/], ['intro', /민간투자|BTO|BTL|BOT/, /학자·제도/, /민간투자/],
    ['broker', /등록취소|자격정지|자격취소|업무정지/, /행정처분/], ['broker', /업무보증|손해배상책임|보증보험|공제.*보장/, /핵심숫자/, /업무보증/], ['broker', /보존기간|보존하여야|보존해야/, /핵심숫자/, /보존기간/],
    ['broker', /전속중개/, /핵심숫자/, /전속중개/], ['broker', /결격사유/, /핵심숫자/, /결격/], ['broker', /거래정보사업자|거래정보망/, /핵심숫자/, /거래정보망/], ['broker', /중개보수/, /중개보수/],
    ['broker', /금지행위/, /금지행위/], ['broker', /부동산거래신고|주택임대차계약.*신고|토지거래허가|외국인.*신고/, /부동산거래신고법/], ['broker', /분묘|경매|명의신탁/, /중개실무단골/]
  ];
  function related(question, cards, subjects) {
    const text = compact(String(question.text).split(/[?？]/)[0]);
    const exact = cards.filter(c => c.id.startsWith('gap-') && c.sourceId === question.id && c.prompt === question.text && c.subject === question.subject);
    if (exact.length) return exact.slice(0, 1);
    const scoped = cards.filter(c => c.origin === 'core' && c.subject === question.subject);
    const taxStem = /취득세|재산세|종합부동산세|양도소득세|등록면허세|지방세|소득세법|가산세/.test(text);
    const specific = ['과세표준','납세의무자','과세기준일','분납','물납','납기','납부기한','가산세','제척기간','신고','양도차익','비과세','공정시장가액비율','체비지','환지예정지','환지처분','조합원','법정지상권','직통계단','승강기','위탁경영','농지개량','허가권자','승인권자','용적률','건폐율'].filter(term => text.includes(term));
    const candidates = new Map();
    for (const [group, pattern, sectionPattern, factPattern] of rules) {
      const match = text.match(pattern);
      if (!match || (taxStem && question.subject === subjects[4] && group !== 'tax')) continue;
      for (const c of scoped) {
        if (c.summarySubject !== group || !sectionPattern.test(compact(c.sectionTitle))) continue;
        const fact = compact([...(c.concept || []), ...(c.searchTerms || [])].join(' '));
        if (factPattern && !factPattern.test(fact)) continue;
        const specificHits = specific.filter(term => fact.includes(term)).length;
        if (specific.length && !specificHits) continue;
        if (group === 'civil' && /집합건물|가등기담보|명의신탁/.test(match[0]) && !fact.includes(match[0])) continue;
        // For broad civil/tax topics, require the specific stem anchor in the fact.
        const anchor = match[0];
        if (!factPattern && !fact.includes(anchor) && !compact(c.sectionTitle).includes(anchor)) continue;
        const labels = [c.title, ...(c.comparison || []).map(row => row.label)];
        const overlap = labels.filter(label => compact(label).length > 1 && text.includes(compact(label))).length;
        const score = match[0].length + overlap * 20 + specificHits * 30;
        if (!candidates.has(c.id) || candidates.get(c.id).score < score) candidates.set(c.id, { card: c, score });
      }
    }
    const topic = [...candidates.values()].sort((a,b) => b.score - a.score).slice(0,3).map(item => item.card);
    return [...exact.slice(0,1), ...topic].slice(0,3);
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
    for (const field of ['recallProgress','quickMemoryProgress','resolvedMistakes']) if(d[field] !== undefined && (!d[field] || typeof d[field] !== 'object' || Array.isArray(d[field]))) throw new Error('학습 기록 파일의 복습 정보 형식이 올바르지 않습니다.');
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
      recallProgress:recordMerge(current.recallProgress,incoming.recallProgress),quickMemoryProgress:recordMerge(current.quickMemoryProgress,incoming.quickMemoryProgress),resolvedMistakes:resolved};
  }
  const api={plain,canonicalCards,related,stageReadiness,firstAttemptAccuracy,reviewSchedule,readBackup,mergeBackup};
  if(typeof module!=='undefined'&&module.exports)module.exports=api;else root.LearningEngine=api;
})(typeof globalThis==='undefined'?this:globalThis);
