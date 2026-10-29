/* Cloze items retain the exact concept fact, including its conditions and exceptions. */
(function(root) {
  function normalize(value) { return String(value ?? '').normalize('NFKC').replace(/\s+/g,'').replace(/,/g,'').toLowerCase(); }
  function build(items, units) {
    const sources = new Map(units.map(u => [u.id,u]));
    return items.filter(item => {
      const source = sources.get(item.unitId);
      return source && source.cardId === item.cardId && source.subject === item.subject && source.text === item.text && typeof item.answer === 'string' && item.answer.length && item.text.includes(item.answer);
    });
  }
  function parts(text, answer) {
    const result = []; let cursor = 0, index = 0;
    while ((index = text.indexOf(answer, cursor)) !== -1) {
      if (/^[0-9]/.test(answer) && /[0-9.]/.test(text[index-1] || '')) {
        result.push({text:text.slice(cursor,index+answer.length),gap:false});cursor=index+answer.length;continue;
      }
      result.push({text:text.slice(cursor,index),gap:false},{text:answer,gap:true});cursor=index+answer.length;
    }
    result.push({text:text.slice(cursor),gap:false});return result;
  }
  function check(item, input) {
    const value = normalize(input);
    return !!value && [item.answer,...(item.aliases || [])].some(a => normalize(a) === value);
  }
  function select(items, subject, size, progress = {}, now = Date.now(), random = Math.random) {
    return items.filter(x => subject === 'all' || x.subject === subject).map(item => {
      const p = progress[item.id];
      return {id:item.id,rank:p?.rating === 'again'?0:p?.dueAt && Date.parse(p.dueAt)<=now?1:!p?2:3,last:p?.updatedAt || '',random:random()};
    }).sort((a,b)=>a.rank-b.rank || a.last.localeCompare(b.last) || a.random-b.random).slice(0,size).map(x=>x.id);
  }
  function session(value, items) {
    const valid = new Set(items.map(x=>x.id));
    if (!value || !Array.isArray(value.ids) || !value.ids.length || !value.ids.every(id=>valid.has(id)) || !Number.isInteger(value.index) || value.index<0 || value.index>value.ids.length || !value.results || typeof value.results!=='object' || Array.isArray(value.results)) return null;
    return value;
  }
  const api={normalize,build,parts,check,select,session};
  if(typeof module!=='undefined' && module.exports) module.exports=api; else root.ClozePractice=api;
})(globalThis);
