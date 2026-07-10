export function createLeaderboard(){
  const LB_KEY="plox_lb", NAME_KEY="plox_name", LB_MAX=10, GLB_MAX=30, GLB_SHOW=20;
  const IS_TEST = location.pathname.includes("/test/");
  const GLB_URL = IS_TEST
    ? "https://api.restful-api.dev/objects/ff8081819d82fab6019ef5393cd7504a"   // 测试榜
    : "https://api.restful-api.dev/objects/ff8081819d82fab6019ef0c35c6b4ad5";  // 正式榜
  const DIFF_KEYS=["easy","normal","hard"];

  function getLB(){ try{ return JSON.parse(localStorage.getItem(LB_KEY))||[]; }catch(e){ return []; } }
  function saveLB(a){ try{ localStorage.setItem(LB_KEY, JSON.stringify(a.slice(0,LB_MAX))); }catch(e){} }
  function qualifies(s){ if(s<=0) return false; const lb=getLB(); return lb.length<LB_MAX || s>lb[lb.length-1].score; }
  function escapeHtml(s){ return String(s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c])); }
  // entry:{name, score, level, combo, diff}
  function addToLB(name, entryData){
    const lb=getLB();
    const entry={name:(name||"YOU").slice(0,8).toUpperCase(), score:entryData.score, level:entryData.level, combo:entryData.combo, diff:entryData.diff};
    lb.push(entry); lb.sort((a,b)=>b.score-a.score);
    const trimmed=lb.slice(0,LB_MAX); saveLB(trimmed);
    return trimmed.indexOf(entry);
  }
  // 开放写入的后端 → 清洗脏/伪造数据
  function sanitize(arr){
    if(!Array.isArray(arr)) return [];
    const clean=arr.filter(e=>e && typeof e.name==="string" && Number.isFinite(e.score) && e.score>=0 && e.score<1e7)
      .map(e=>{ let d=(typeof e.diff==="string")?e.diff:""; if(!DIFF_KEYS.includes(d)) d="normal";
        return {name:String(e.name).slice(0,10), score:Math.floor(e.score), diff:d}; });
    // 每个(难度,名字)只保留最高分 → 一人一难度一条
    const best=new Map();
    for(const e of clean){ const k=e.diff+" "+e.name; const p=best.get(k); if(!p || e.score>p.score) best.set(k,e); }
    // 每个难度各保留前 30
    const byDiff={easy:[],normal:[],hard:[]};
    for(const e of best.values()) byDiff[e.diff].push(e);
    let out=[];
    for(const d of DIFF_KEYS) out=out.concat(byDiff[d].sort((a,b)=>b.score-a.score).slice(0,GLB_MAX));
    return out;
  }
  function withTimeout(ms){ try{ const c=new AbortController(); setTimeout(()=>c.abort(),ms); return c.signal; }catch(e){ return undefined; } }
  async function fetchGlobal(){
    try{ const r=await fetch(GLB_URL,{cache:"no-store", signal:withTimeout(8000)}); if(!r.ok) throw 0;
      const j=await r.json(); return sanitize(j && j.data && j.data.scores); }
    catch(e){ return null; }
  }
  async function submitGlobal(entry){
    let last=null;
    for(let attempt=0; attempt<3; attempt++){   // 开放后端可能被并发覆盖 → 校验+重试自愈
      try{
        const cur=await fetchGlobal();
        if(cur===null) continue;   // 读取失败:重试,绝不用空列表 PUT 覆盖掉整个全球榜
        const list=sanitize(cur.concat([entry]));
        const hit=e=>e.name===entry.name && e.score===entry.score && e.diff===entry.diff;
        const made=list.some(hit);
        const r=await fetch(GLB_URL,{method:"PUT",headers:{"Content-Type":"application/json"},
          body:JSON.stringify({name:"PLOX_GLOBAL_LEADERBOARD",data:{scores:list}}), signal:withTimeout(8000)});
        if(!r.ok) throw 0;
        last=list;
        if(!made) return list;                  // 没进该难度前30,无需校验
        const after=await fetchGlobal();
        if(after && after.some(hit)) return after;
      }catch(e){ /* 重试 */ }
    }
    return last;
  }
  function lbTable(list, hiName, hiScore){
    if(!list || !list.length) return '<p>还没有记录,快来抢第一名!</p>';
    let hit=false;
    let h='<table class="lb">';
    list.slice(0,GLB_SHOW).forEach((e,i)=>{
      const me=!hit && hiName && e.name===hiName && (hiScore==null || e.score===hiScore);
      if(me) hit=true;
      const rk = i<3 ? '<span class="medal m'+(i+1)+'">'+(i+1)+'</span>' : (i+1);
      h+='<tr class="'+(me?'me':'')+'"><td class="rk">'+rk+
        '</td><td class="nm">'+escapeHtml(e.name)+'</td><td class="sc">'+e.score+'</td></tr>'; });
    return h+'</table>';
  }

  return { NAME_KEY, DIFF_KEYS, IS_TEST, getLB, saveLB, qualifies, escapeHtml, addToLB, sanitize, fetchGlobal, submitGlobal, lbTable };
}
