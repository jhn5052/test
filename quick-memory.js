/* Pure flashcard selection and review state, shared by the app and tests. */
(function (root) {
  const taxPattern = /재산세|종합부동산세|취득세|양도소득세|등록면허세|부가가치세|사업소득|간주임대료|가산세|과세|납세|분납|세율|세법|비사업용 토지|양도차익|필요경비/;
  function buildUnits(cards, subjects, clean = String) {
    const seen = new Set();
    const units = [];
    cards.filter(card => !card.id.startsWith('gap-')).forEach(card => {
      const subject = card.subject === subjects[4] ? (taxPattern.test(card.title) ? '세법' : '공시법') : card.subject;
      const facts = (card.comparison || []).map((row, index) => ({ key: `compare-${index}`, label: clean(row.label || ''), text: clean(row.value || '') }));
      const points = card.memorize?.length ? card.memorize : card.concept || [];
      points.forEach((point, index) => {
        const text = clean(point).trim();
        const lines = text.split(/\n\s*[•·]\s*/);
        if (lines.length > 1) {
          const context = lines.shift().trim();
          lines.forEach((line, part) => facts.push({ key: `point-${index}-${part}`, text: line.trim(), context }));
        } else facts.push({ key: `point-${index}`, text });
      });
      facts.forEach(fact => {
        const text = fact.text.trim();
        // Never turn multiple-choice answers or instructions into concepts.
        if (text.length < 5 || text.length > 800 || /[①②③④⑤]|이 (?:기출|문제)|정답|옳은 것|틀린 것|기출.*(?:출제|설명|포인트)/.test(text)) return;
        const identity = `${subject}:${text.replace(/\s/g, '')}`;
        if (seen.has(identity)) return;
        seen.add(identity);
        const prefix = text.match(/^([^:：=\n]{1,45})\s*[:：=]/)?.[1]?.trim();
        const terms = (card.relatedTerms || []).filter(term => String(term).length > 1 && text.includes(term)).slice(0, 3).join(' · ');
        const noun = text.match(/^(.{2,35}?)(?:은|는|이란)\s/)?.[1];
        const label = fact.label || prefix || terms || noun || fact.context || '핵심 암기';
        units.push({ id: `${card.id}:${fact.key}`, cardId: card.id, sourceId: card.sourceId, subject, title: clean(card.title), label, text });
      });
    });
    return units;
  }
  function select(units, subject, size, progress = {}, wrongIds = [], random = Math.random) {
    const wrong = new Set(wrongIds);
    return units.filter(unit => subject === 'all' || (subject === 'first' ? ['부동산학개론', '민법 및 민사특별법'].includes(unit.subject) : unit.subject === subject))
      .map(unit => ({ unit, rank: progress[unit.id]?.rating === 'again' ? 0 : wrong.has(unit.sourceId) ? 1 : progress[unit.id]?.rating === 'known' ? 3 : 2, last: progress[unit.id]?.updatedAt || '', random: random() }))
      .sort((a, b) => a.rank - b.rank || a.last.localeCompare(b.last) || a.random - b.random)
      .slice(0, size).map(item => item.unit.id);
  }
  function rate(session, known) {
    if (!session || !session.revealed || session.index >= session.ids.length) return null;
    const id = session.ids[session.index];
    return { ...session, index: session.index + 1, revealed: false, ratings: { ...session.ratings, [id]: known ? 'known' : 'again' } };
  }
  const api = { buildUnits, select, rate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.QuickMemory = api;
})(typeof globalThis === 'undefined' ? this : globalThis);
