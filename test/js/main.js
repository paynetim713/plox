import { COLS, ROWS, COLORS, FIXED_COLORS, PIECE_LEN, PLAYER_INTERVAL, JUNK_FALL,
         ROT_MS, PRAISE, PRAISE_COL, DIFFS, CLEAR_MS, stageGoal } from "./config.js";
import { getCoins, addCoins, spendCoins } from "./economy.js";
import { ITEMS, ITEM_LIST, getItem, addItem, useItem, ownedItems } from "./items.js";

(() => {
  "use strict";

  const _ui = (location.search.match(/[?&]ui=(mobile|desktop)/)||[])[1];
  const isMobile = _ui ? _ui==="mobile"
    : (matchMedia("(pointer: coarse)").matches ||
       ("ontouchstart" in window && Math.min(screen.width,screen.height) < 820));
  document.body.classList.add(isMobile ? "mobile" : "desktop");

  // ---------- DOM ----------
  const cv=document.getElementById("board"), ctx=cv.getContext("2d");
  const nextCv=document.getElementById("nextCv"), nctx=nextCv.getContext("2d");
  const $=id=>document.getElementById(id);
  const elScore=$("score"), elHigh=$("high"), elLevel=$("level"),
        elCleared=$("cleared"), elMaxCombo=$("maxcombo"), overlay=$("overlay");
  const elCoins=$("coins"), elItembar=$("itembar");

  // ---------- 金币 + 道具 UI ----------
  const elCoinNum=$("coinNum");
  function syncCoins(){ if(elCoinNum) elCoinNum.textContent=getCoins(); }
  syncCoins();
  // 炸弹图标(纯图形):深色弹体 + 火芯导线 + 下方 N 条「被炸的行」,行数即可视化威力
  function bombSvg(rows){
    let bars=""; const n=rows, bw=16, x=(24-bw)/2, gap=2.35, h=1.7, y0=23-n*gap;
    for(let i=0;i<n;i++){ const y=(y0+i*gap).toFixed(2);
      bars+='<rect x="'+x+'" y="'+y+'" width="'+bw+'" height="'+h+'" rx="0.85" fill="currentColor" opacity="'+(0.5+0.12*i).toFixed(2)+'"/>'; }
    return '<svg class="bicon" viewBox="0 0 24 24" aria-hidden="true">'+bars+
      '<circle cx="12" cy="6.8" r="4.6" fill="#23232f"/>'+
      '<circle cx="10.3" cy="5.1" r="1.5" fill="rgba(255,255,255,.22)"/>'+
      '<path d="M14.6 3 q1.7 -1.1 2.9 .5" stroke="#ff9a3c" stroke-width="1.3" fill="none" stroke-linecap="round"/>'+
      '<circle cx="17.5" cy="3" r="1.2" fill="#ffd86a"/></svg>';
  }
  const bombIcon=it=>'<span class="bw bw'+it.rows+'">'+bombSvg(it.rows)+'</span>';
  // 局内道具栏:只列出已拥有的道具,点一下用一个(纯图形炸弹 + 数量)
  function renderItemBar(){
    if(!elItembar) return;
    const owned=ownedItems();
    elItembar.innerHTML = owned.map(id=>{
      const it=ITEMS[id];
      return '<button class="itembtn" data-id="'+id+'" title="'+it.desc+'">'+bombIcon(it)+'<span class="n">×'+getItem(id)+'</span></button>';
    }).join("");
    [...elItembar.querySelectorAll(".itembtn")].forEach(b=>
      b.addEventListener("click", ()=>useBomb(b.dataset.id)));
  }

  // ---------- 状态 ----------
  let board, voff, vscale, vmode, current, next, state="start", sub="control";
  let score=0, cleared=0, level=1, combo=0, maxCombo=0, stageStart=0;   // level=当前关卡;stageStart=本关开始时的累计消除数
  let dropAccum=0, dropInterval=800, baseInterval=720, colorCount=5, pieceLen=3, softDrop=false;
  let junkMin=3, junkMax=4, pieceUntilJunk=4, justJunked=false;   // 难度:随机乱入方块组
  let fallingJunk=[];   // 乱入方块作为独立下落实体(落地才算进棋盘 → 逻辑与画面同步)
  let clearing=null, clearTimer=0, flashPulse=0;
  let visRow=0, visCol=3, shakeT=0, rotT=0, freezeT=0;
  let high=0;   // 当前难度的个人最高分(各难度分开记)
  let ghostOn=true, soundOn=true, musicOn=true;
  let diffKey="normal";
  let CELL=44, dpr=1;
  const particles=[], popups=[];

  // 个人最高分:按难度分别保存
  function getBest(d){ try{ return +((JSON.parse(localStorage.getItem("plox_best"))||{})[d]||0); }catch(e){ return 0; } }
  function setBest(d,s){ try{ const b=JSON.parse(localStorage.getItem("plox_best"))||{}; b[d]=s; localStorage.setItem("plox_best",JSON.stringify(b)); }catch(e){} }
  function refreshHigh(){ high=getBest(diffKey); elHigh.textContent=high; }
  refreshHigh();

  // ---------- 尺寸自适应 ----------
  function resize(){
    let availW, availH;
    if(isMobile){
      // 直接量真实布局:棋盘上沿到底部安全区之间的剩余空间,全屏 App 也不会被裁切
      const stage=document.querySelector(".stage");
      const stageTop=stage.getBoundingClientRect().top;                       // 上方所有 UI(含刘海安全区)的真实高度
      const padBottom=parseFloat(getComputedStyle(document.body).paddingBottom)||8; // 底部指示条安全区(浏览器已算好)
      const footEl=document.getElementById("foot");
      const footH=footEl?footEl.getBoundingClientRect().height:16;
      availW = Math.min(window.innerWidth - 12, 560);
      availH = window.innerHeight - stageTop - padBottom - footH - 12;        // 12:余量
    }else{
      const sideW = window.innerWidth<430 ? 78 : 96;
      availW = Math.min(520, window.innerWidth-20) - sideW - 10;
      availH = window.innerHeight*0.62;
    }
    CELL = Math.max(20, Math.floor(Math.min(availW/COLS, availH/ROWS)));
    dpr = Math.min(window.devicePixelRatio||1, 2);
    cv.width=COLS*CELL*dpr; cv.height=ROWS*CELL*dpr;
    cv.style.width=COLS*CELL+"px"; cv.style.height=ROWS*CELL+"px";
    ctx.setTransform(dpr,0,0,dpr,0,0);
    rebuildGradients();   // CELL 变了才重建缓存渐变(避免每帧每块新建)
    if(next && !isMobile) drawNext();   // 「下一个」预览按当前块数自适应(移动端用画布内预览)
    render();
  }
  window.addEventListener("resize", resize);
  // 缓存:每色一个方块渐变(本地居中坐标)+ 背景渐变;仅 resize 时重建
  let gradCache=[], bgGrad=null;
  function rebuildGradients(){
    const p0=Math.max(2,CELL*0.06), H0=(CELL-p0*2)/2;
    gradCache=COLORS.map(col=>{ const gr=ctx.createLinearGradient(0,-H0,0,H0);
      gr.addColorStop(0,col.top); gr.addColorStop(.52,col.fill); gr.addColorStop(1,col.dark); return gr; });
    bgGrad=ctx.createLinearGradient(0,0,0,ROWS*CELL);
    bgGrad.addColorStop(0,"#120428"); bgGrad.addColorStop(1,"#070114");
  }
  window.addEventListener("orientationchange", ()=>setTimeout(resize,150));
  // 全屏 App 启动时布局/安全区可能晚一拍到位,补量几次
  window.addEventListener("load", ()=>{ resize(); setTimeout(resize,300); });

  // ---------- 工具 ----------
  const rc=()=>(Math.random()*colorCount)|0;
  const randInt=(a,b)=>a+((Math.random()*(b-a+1))|0);
  const inB=(r,c)=>r>=0&&r<ROWS&&c>=0&&c<COLS;
  const newPiece=()=>({colors:Array.from({length:pieceLen},rc), row:0, col:(COLS/2)|0});
  function valid(row,col,colors){
    for(let i=0;i<colors.length;i++){ const r=row+i;
      if(col<0||col>=COLS||r>=ROWS) return false;
      if(r>=0 && board[r][col]!=null) return false; }
    return true;
  }

  // ---------- 流程 ----------
  function reset(){
    board=Array.from({length:ROWS},()=>Array(COLS).fill(null));
    voff=Array.from({length:ROWS},()=>new Float32Array(COLS));
    vscale=Array.from({length:ROWS},()=>{const a=new Float32Array(COLS); a.fill(1); return a;});
    vmode=Array.from({length:ROWS},()=>new Uint8Array(COLS));
    score=0; cleared=0; level=1; combo=0; maxCombo=0; stageStart=0;
    baseInterval=PLAYER_INTERVAL; colorCount=FIXED_COLORS; pieceLen=PIECE_LEN;
    junkMin=DIFFS[diffKey].junkMin; junkMax=DIFFS[diffKey].junkMax;
    pieceUntilJunk=randInt(junkMin,junkMax); justJunked=false;
    dropInterval=baseInterval; dropAccum=0; softDrop=false; clearing=null; sub="control";
    shakeT=0; particles.length=0; popups.length=0; fallingJunk.length=0;
    refreshHigh();   // HUD「最高」显示当前难度的个人最高
    next=newPiece(); spawn(); syncHUD();
  }
  function spawn(){
    current=next; next=newPiece();
    current.row=0; current.col=(COLS/2)|0;
    visRow=0; visCol=current.col; dropAccum=0;   // 复位累计,避免新方块"半格弹出"/首步过早
    if(!valid(current.row,current.col,current.colors)){ gameOver(); return; }
    if(!isMobile) drawNext();
  }
  // ---------- 图标(纯图形,无 emoji)----------
  const ICON = {
    play:'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5 L20 12 L8 19 Z" fill="currentColor"/></svg>',
    cart:'<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3 h3 l2.4 12 h11 l2.2 -8.5 H6.4"/><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/></svg>',
    trophy:'<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3 h10 v5 a5 5 0 0 1 -10 0 z"/><path d="M7 4 H4 a2.5 2.5 0 0 0 3 4.2"/><path d="M17 4 h3 a2.5 2.5 0 0 1 -3 4.2"/><path d="M12 13 v3 M8.5 20 h7 M9.5 20 l.7 -4 M14.5 20 l-.7 -4"/></svg>',
    star:'<svg class="starIc" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 l2.6 5.3 5.8 .85 -4.2 4.1 1 5.75 -5.2 -2.73 -5.2 2.73 1 -5.75 -4.2 -4.1 5.8 -.85 z" fill="currentColor"/></svg>',
    gem:'<div class="gemMark"><i class="g gMag"></i><i class="g gCya"></i><i class="g gGrn"></i><i class="g gPur"></i></div>',
  };
  const DIFF_INT = {easy:1, normal:2, hard:3};
  const nfmt = n => (+n||0).toLocaleString();
  function diffCardHTML(k){
    const bars=[0,1,2].map(i=>'<i class="'+(i<DIFF_INT[k]?'on':'')+'"></i>').join('');
    return '<button class="diffCard'+(k===diffKey?' on':'')+'" data-k="'+k+'">'+
      '<div class="dcLabel">'+DIFFS[k].label+'</div>'+
      '<div class="dcBars">'+bars+'</div>'+
      '<div class="dcBest">最高 '+nfmt(getBest(k))+'</div></button>';
  }
  function showMenu(){
    state="start"; refreshHigh();
    overlay.innerHTML =
      '<div class="menu">'+
        '<div class="menuAmb"><i></i><i></i><i></i><i></i></div>'+
        '<div class="menuHero">'+ICON.gem+
          '<div class="logo">PLOX</div><div class="logoSub">霓 虹 消 除</div></div>'+
        '<div class="bestRibbon">'+ICON.star+'<span>本难度最高</span><b id="bestVal">'+nfmt(getBest(diffKey))+'</b></div>'+
        '<div class="diffCards">'+diffCardHTML("easy")+diffCardHTML("normal")+diffCardHTML("hard")+'</div>'+
        '<button class="playBtn" id="playBtn">'+ICON.play+'<span>开始</span></button>'+
        '<div class="menuActions">'+
          '<button class="actBtn shop" id="shopLink">'+ICON.cart+'<span>商店</span></button>'+
          '<button class="actBtn lb" id="lbLink">'+ICON.trophy+'<span>排行榜</span></button>'+
        '</div>'+
        '<div class="menuFoot">全球排行榜 · 离线可玩 · 闯关攒金币</div>'+
      '</div>';
    overlay.classList.remove("hidden");
    syncCoins();
    [...overlay.querySelectorAll(".diffCard")].forEach(b=>b.addEventListener("click",()=>{
      diffKey=b.dataset.k;
      [...overlay.querySelectorAll(".diffCard")].forEach(x=>x.classList.toggle("on",x.dataset.k===diffKey));
      refreshHigh(); const bv=$("bestVal"); if(bv) bv.textContent=nfmt(getBest(diffKey));
    }));
    $("playBtn").addEventListener("click", start);
    $("shopLink").addEventListener("click", ()=>showShop());
    $("lbLink").addEventListener("click", ()=>showLeaderboard());
  }
  // ---------- 商店:金币购买道具 ----------
  function showShop(){
    state="start";
    const rows = ITEM_LIST.map(id=>{
      const it=ITEMS[id], own=getItem(id);
      return '<div class="shopRow"><div class="ic">'+bombIcon(it)+'</div>'+
        '<div class="meta"><div class="nm">'+it.name+'</div><div class="ds">'+it.desc+'</div>'+
        '<div class="own">已拥有 '+own+'</div></div>'+
        '<button class="buyBtn" data-id="'+id+'"><i class="coin"></i>'+it.cost+'</button></div>';
    }).join("");
    overlay.innerHTML =
      '<h1 style="font-size:26px">商店</h1>'+
      '<div class="coins" style="font-size:15px"><i class="coin"></i>'+getCoins()+'</div>'+
      '<div class="shopList">'+rows+'</div>'+
      '<p style="margin-top:4px">过关可赚金币 · 新玩家已赠 10 金币</p>'+
      '<div class="link" id="shopBack">返回</div>';
    overlay.classList.remove("hidden");
    const refresh=()=>{ showShop(); };   // 买完重画(刷新金币/拥有数/按钮可用)
    [...overlay.querySelectorAll(".buyBtn")].forEach(b=>{
      const it=ITEMS[b.dataset.id];
      if(getCoins() < it.cost) b.disabled=true;
      b.addEventListener("click", ()=>{
        if(spendCoins(it.cost)){ addItem(it.id,1); beep(880,.08,"triangle",.08); beep(1320,.07,"sine",.05);
          syncCoins(); renderItemBar(); refresh(); }
      });
    });
    $("shopBack").addEventListener("click", ()=>showMenu());
  }

  // ---------- 排行榜:本机持久化 + 全球共享 ----------
  const LB_KEY="plox_lb", NAME_KEY="plox_name", LB_MAX=10, GLB_MAX=30, GLB_SHOW=20;
  // 测试版(/test/ 路径)用独立后端,不污染正式榜;正式版用真实榜。同一份代码两边都对。
  const IS_TEST = location.pathname.includes("/test/");
  const GLB_URL = IS_TEST
    ? "https://api.restful-api.dev/objects/ff8081819d82fab6019ef5393cd7504a"   // 测试榜
    : "https://api.restful-api.dev/objects/ff8081819d82fab6019ef0c35c6b4ad5";  // 正式榜
  function getLB(){ try{ return JSON.parse(localStorage.getItem(LB_KEY))||[]; }catch(e){ return []; } }
  function saveLB(a){ try{ localStorage.setItem(LB_KEY, JSON.stringify(a.slice(0,LB_MAX))); }catch(e){} }
  function qualifies(s){ if(s<=0) return false; const lb=getLB(); return lb.length<LB_MAX || s>lb[lb.length-1].score; }
  function escapeHtml(s){ return String(s).replace(/[<>&"]/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;'}[c])); }
  function addToLB(name){
    const lb=getLB();
    const entry={name:(name||"YOU").slice(0,8).toUpperCase(), score:score, level:level, combo:maxCombo, diff:diffKey};
    lb.push(entry); lb.sort((a,b)=>b.score-a.score);
    const trimmed=lb.slice(0,LB_MAX); saveLB(trimmed);
    return trimmed.indexOf(entry);
  }
  // 开放写入的后端 → 清洗脏/伪造数据
  const DIFF_KEYS=["easy","normal","hard"];
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
  let lbCache=null;   // 缓存抓取结果,切换难度标签不必重新请求
  function showLeaderboard(diff, hiName, hiScore){
    state="menu"; stopMusic();
    const d=DIFF_KEYS.includes(diff)?diff:diffKey;
    const hi=hiName || (localStorage.getItem(NAME_KEY)||"");
    overlay.innerHTML='<h1>排行榜</h1><p style="font-size:12px;color:var(--dim)">加载全球榜…</p>';
    overlay.classList.remove("hidden");
    fetchGlobal().then(g=>{ if(state!=="menu") return; lbCache=g; renderLb(d,hi,hiScore); });
  }
  function renderLb(d, hiName, hiScore){
    const online=lbCache!==null;
    const src=online?lbCache:getLB();
    const list=src.filter(e=>(e.diff||"normal")===d).sort((a,b)=>b.score-a.score);
    const tabs=DIFF_KEYS.map(k=>'<b class="'+(k===d?'on':'')+'" data-d="'+k+'">'+DIFFS[k].label+'</b>').join('');
    overlay.innerHTML='<h1>排行榜</h1>'+
      '<div class="lbtabs">'+tabs+'</div>'+
      lbTable(list,hiName,hiScore)+
      '<p style="font-size:11px">'+(online?'全球':'离线·本机')+' · '+DIFFS[d].label+'难度</p>'+
      '<button class="play" id="lbBack">返回</button>';
    overlay.classList.remove("hidden");
    [...overlay.querySelectorAll('.lbtabs b')].forEach(b=>b.addEventListener('click',()=>renderLb(b.dataset.d,hiName,hiScore)));
    $("lbBack").addEventListener("click", showMenu);
  }
  function showNameEntry(){
    state="menu"; stopMusic();
    const snapScore=score, snapDiff=diffKey;   // 快照,避免异步提交期间被改动
    const last=localStorage.getItem(NAME_KEY)||"YOU";
    overlay.innerHTML='<h1>新纪录!</h1>'+
      '<p class="big">得分 <b style="color:#fff">'+score+'</b> · 登上排行榜</p>'+
      '<input class="nameIn" id="nameIn" maxlength="8" value="'+escapeHtml(last)+'" autocomplete="off" />'+
      '<button class="play" id="nameOk">保存并上传</button>';
    overlay.classList.remove("hidden");
    const inp=$("nameIn"); setTimeout(()=>{ inp.focus(); inp.select(); },40);
    let submitting=false;
    const submit=async()=>{
      if(submitting) return; submitting=true;
      const raw=(inp.value.trim()||"YOU"); const nm=raw.toUpperCase().slice(0,10);
      try{ localStorage.setItem(NAME_KEY,nm); }catch(e){}   // Safari 隐私模式/配额满也不卡住上传
      addToLB(raw);
      overlay.innerHTML='<h1>上传中…</h1><p style="font-size:12px;color:var(--dim)">正在提交到全球排行榜</p>';
      await submitGlobal({name:nm, score:snapScore, diff:snapDiff});
      showLeaderboard(snapDiff, nm, snapScore);
    };
    $("nameOk").addEventListener("click", submit);
    inp.addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); submit(); } });
  }

  function start(){
    reset(); state="playing"; overlay.classList.add("hidden"); last=performance.now();
    syncCoins(); renderItemBar();   // 进入游戏:显示金币 + 已拥有道具按钮
    ensureAudio(); startMusic(); beep(660,.08,"sine",.1);
  }
  function gameOver(){
    state="gameover"; stopMusic();
    const isRecord = score>0 && score>high;   // 刷新「当前难度」个人最高?才上传
    if(isRecord){ high=score; setBest(diffKey,score); elHigh.textContent=high; }
    beep(140,.25,"sawtooth",.15);
    if(isRecord){ showNameEntry(); return; }
    overlay.innerHTML='<h1>结束</h1>'+
      '<p class="big">本局得分 <b style="color:#fff">'+score+'</b></p>'+
      '<p>消除 '+cleared+' 个 · 最高连击 ×'+maxCombo+' · 关卡 '+level+'<br>历史最高 '+high+'</p>'+
      '<button class="play" id="playBtn">再来一局</button>'+
      '<div class="link" id="lbLink2">排行榜</div>'+
      '<div class="foot" id="backMenu" style="cursor:pointer;text-decoration:underline">选择难度</div>';
    overlay.classList.remove("hidden");
    $("playBtn").addEventListener("click", start);
    $("lbLink2").addEventListener("click", ()=>showLeaderboard());
    $("backMenu").addEventListener("click", showMenu);
  }

  function stepDown(){ if(valid(current.row+1,current.col,current.colors)) current.row++; else lockPiece(); }
  function lockPiece(){
    for(let i=0;i<current.colors.length;i++){ const r=current.row+i;
      if(r>=0&&r<ROWS){ board[r][current.col]=current.colors[i]; vscale[r][current.col]=1.45; voff[r][current.col]=0; } }
    beep(180,.05,"square",.08);
    combo=0; sub="resolving"; beginResolve();
  }

  const DIRS=[[0,1],[1,0],[1,1],[1,-1]];
  function findMatches(){
    const hit=new Set();
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
      const col=board[r][c]; if(col==null) continue;
      for(const [dr,dc] of DIRS){
        if(inB(r-dr,c-dc)&&board[r-dr][c-dc]===col) continue;
        let len=0,rr=r,cc=c;
        while(inB(rr,cc)&&board[rr][cc]===col){len++;rr+=dr;cc+=dc;}
        if(len>=3){ rr=r;cc=c; for(let k=0;k<len;k++){ hit.add(rr+","+cc); rr+=dr; cc+=dc; } }
      }
    }
    return hit;
  }
  function gravity(){
    for(let c=0;c<COLS;c++){
      let w=ROWS-1;
      for(let r=ROWS-1;r>=0;r--){
        if(board[r][c]!=null){
          if(w!==r){ board[w][c]=board[r][c]; board[r][c]=null;
            voff[w][c]=(r-w)+voff[r][c]; vmode[w][c]=vmode[r][c]; vscale[w][c]=vscale[r][c]; voff[r][c]=0; vmode[r][c]=0; vscale[r][c]=1; }
          w--;
        }
      }
      for(let r=w;r>=0;r--){ board[r][c]=null; voff[r][c]=0; vmode[r][c]=0; vscale[r][c]=1; }
    }
  }
  function beginResolve(){
    const m=findMatches();
    if(m.size===0){ settle(); return; }     // 板面静止 → 决定是否乱入 / 生成下一个
    combo++;
    if(combo>maxCombo) maxCombo=combo;
    const bonus = m.size>3 ? (m.size-3)*15 : 0;
    const gained = m.size*10*combo + bonus*combo;
    score+=gained; cleared+=m.size;
    // 关卡:本关消除够目标 → 过关,乱入更频繁、越来越难,并奖励金币
    if(cleared-stageStart >= stageGoal(level)){
      stageStart=cleared; level++;
      junkMin=Math.max(1, junkMin-1); junkMax=Math.max(2, junkMax-1);   // 每关乱入更勤
      const reward=1+Math.floor(level/4);   // 过关奖励金币(随关卡略增)
      addCoins(reward); syncCoins();
      spawnStageBanner(level, reward);
    }
    clearing=m; clearTimer=CLEAR_MS; flashPulse=0;
    shakeT=Math.min(220, 60+m.size*14+combo*20);   // 震动减弱
    if(m.size>=5 || combo>=3) freezeT=Math.min(80, 30+m.size*6);   // 大消除/连击:顿帧增重
    spawnPopup(gained, combo);
    const f=440*Math.pow(2,Math.min(combo,8)/12);   // 连击越高音越高
    beep(f,.12,"triangle",.10+Math.min(combo,6)*0.01);
    if(combo>1) beep(f*1.5,.1,"sine",.07);
    syncHUD();
  }
  function applyClear(){
    for(const key of clearing){ const [r,c]=key.split(",").map(Number);
      spawnParticles(c,r,board[r][c]); board[r][c]=null; voff[r][c]=0; vmode[r][c]=0; vscale[r][c]=1; }
    clearing=null; gravity(); beginResolve();
  }

  // 板面静止后:按难度频率「乱入」独立下落的方块,再立刻生成下一个玩家方块(两者并行下落)
  function settle(){
    if(state!=="playing") return;
    if(--pieceUntilJunk<=0){ pieceUntilJunk=randInt(junkMin,junkMax); dropJunk(); }
    sub="control"; spawn();
  }

  // 乱入:在 1~2 个随机列顶部上方生成独立下落实体(不立刻占棋盘;落地逻辑见 updateFx)
  function dropJunk(){
    const n=Math.random()<0.6?1:2;   // 多数只乱入 1 个,偶尔 2 个
    const avail=[]; for(let c=0;c<COLS;c++) avail.push(c);
    let added=0;
    for(let i=0;i<n && avail.length;i++){
      const c=avail.splice((Math.random()*avail.length)|0,1)[0];
      fallingJunk.push({c, y:-1.6, idx:rc()});   // 从顶部上方开始匀速缓降
      added++;
    }
    if(added) beep(150,.07,"square",.05);
    return {added};
  }

  // 乱入方块落地后,清掉它造成的消除(不打断玩家正在操作的方块;即时清除 + 粒子反馈)
  function resolveJunk(){
    let total=0;
    while(true){ const m=findMatches(); if(m.size===0) break;
      total+=m.size;
      for(const key of m){ const [r,c]=key.split(",").map(Number);
        spawnParticles(c,r,board[r][c]); board[r][c]=null; voff[r][c]=0; vmode[r][c]=0; vscale[r][c]=1; }
      gravity();
    }
    if(total){ score+=total*10; cleared+=total; syncHUD();
      shakeT=Math.min(180,60+total*16); beep(520,.1,"triangle",.1); }
  }

  // ---------- 道具:炸弹(炸掉最下方 N 行)----------
  function useBomb(id){
    const it=ITEMS[id]; if(!it) return;
    if(state!=="playing" || sub!=="control") return;   // 只在可操作时使用,避免与消除动画/暂停冲突
    if(!useItem(id)) return;                            // 扣库存(无则不触发)
    let n=0;
    for(let r=ROWS-1; r>=Math.max(0,ROWS-it.rows); r--){
      for(let c=0;c<COLS;c++){ if(board[r][c]!=null){
        spawnParticles(c,r,board[r][c]); board[r][c]=null; voff[r][c]=0; vmode[r][c]=0; vscale[r][c]=1; n++; } }
    }
    gravity();
    score+=n*5; syncHUD();
    shakeT=Math.min(260,160+n*6); freezeT=Math.min(90,50);
    beep(70,.22,"sawtooth",.13); beep(150,.16,"square",.1); beep(40,.3,"triangle",.1);
    resolveJunk();        // 炸后塌落可能形成的新消除一并结算
    renderItemBar();      // 刷新数量(可能归零 → 按钮消失)
  }

  // ---------- 操作 ----------
  const playing=()=>state==="playing"&&sub==="control";
  function move(d){ if(playing()&&valid(current.row,current.col+d,current.colors)){ current.col+=d; beep(330,.03,"sine",.05);} }
  function rotate(){ if(playing()){ const c=current.colors; current.colors=[c[c.length-1],...c.slice(0,c.length-1)];
    rotT=ROT_MS; beep(600,.045,"triangle",.07); beep(900,.03,"sine",.04); } }   // 专属双音"咔哒" + 滚动动画
  function hardDrop(){ if(!playing())return; let n=0; while(valid(current.row+1,current.col,current.colors)){current.row++;n++;} visRow=current.row; score+=n*2; syncHUD(); lockPiece(); }
  function ghostRow(){ let r=current.row; while(valid(r+1,current.col,current.colors)) r++; return r; }
  function syncHUD(){ elScore.textContent=score; elLevel.textContent=level; elCleared.textContent=cleared; elMaxCombo.textContent="×"+maxCombo; }

  // ---------- 特效 ----------
  function spawnParticles(c,r,idx){
    const col=COLORS[idx]||COLORS[0];
    const cx=(c+0.5)*CELL, cy=(r+0.5)*CELL;
    for(let i=0;i<7;i++){
      const a=Math.random()*Math.PI*2, sp=CELL*(0.04+Math.random()*0.09);
      particles.push({x:cx,y:cy,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-CELL*0.02,
        life:1, size:CELL*(0.12+Math.random()*0.16), color:col.glow});
    }
  }
  function spawnPopup(gained, cb){
    popups.length=0;   // 连击链中只显示最新(最高)那个词,避免叠字糊成一团
    const tier=Math.min(cb-1, PRAISE.length-1);
    popups.push({x:COLS*CELL/2, y:ROWS*CELL*0.34, life:1, age:0, tier:tier,
      word:PRAISE[tier], col:PRAISE_COL[tier], sub:"+"+gained});
  }
  // 过关横幅:醒目、停留久一点
  function spawnStageBanner(stage, reward){
    popups.length=0;
    popups.push({x:COLS*CELL/2, y:ROWS*CELL*0.32, life:1.6, age:0, tier:4, banner:true,
      word:"第 "+stage+" 关", col:"#ffd86a", sub: reward?("+"+reward):"加油!", coin: !!reward});
    beep(660,.14,"triangle",.12); beep(990,.13,"sine",.09); beep(1320,.12,"sine",.06);
    shakeT=Math.min(200,150); freezeT=Math.min(90,70);
    syncHUD();
  }
  function updateFx(dt){
    const k=dt/16.7;
    for(let i=particles.length-1;i>=0;i--){ const p=particles[i];
      p.x+=p.vx*k; p.y+=p.vy*k; p.vy+=CELL*0.018*k; p.life-=0.035*k;
      if(p.life<=0) particles.splice(i,1); }
    for(let i=popups.length-1;i>=0;i--){ const q=popups[i];
      q.age+=dt; q.y-=CELL*0.03*k; q.life-=0.02*k; if(q.life<=0) popups.splice(i,1); }
    if(rotT>0) rotT=Math.max(0,rotT-dt);   // 旋转动画计时
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
      if(voff[r][c]!==0){
        if(vmode[r][c]===1){ voff[r][c]+=JUNK_FALL*dt; if(voff[r][c]>=0){ voff[r][c]=0; vmode[r][c]=0; } } // 乱入:匀速缓降
        else { voff[r][c]*=Math.pow(0.80,k); if(Math.abs(voff[r][c])<0.02) voff[r][c]=0; }                // 其它:快速回落
      }
      if(vscale[r][c]!==1){ vscale[r][c]+=(1-vscale[r][c])*Math.min(1,0.22*k); if(Math.abs(vscale[r][c]-1)<0.01) vscale[r][c]=1; }
    }
    // 乱入实体:匀速缓降,落到该列堆顶即"落地"(并入棋盘 + 处理消除);只在控制阶段推进
    if(state==="playing" && sub==="control"){
      for(let i=fallingJunk.length-1;i>=0;i--){
        const j=fallingJunk[i];
        j.y += JUNK_FALL*dt;
        let top=0; while(top<ROWS && board[top][j.c]==null) top++;   // 该列最高已填行
        const R=top-1;                                              // 落点
        if(R<0){ fallingJunk.length=0; gameOver(); return; }        // 该列已满 → 顶出,结束
        if(j.y>=R){
          board[R][j.c]=j.idx; vscale[R][j.c]=1.3;   // 落地小弹
          fallingJunk.splice(i,1);
          beep(150,.06,"square",.06);
          resolveJunk();
        }
      }
    }
    // 玩家方块:连续平滑下落(消除"跳一格/掉帧"的卡顿感)
    if(state==="playing" && current && sub==="control"){
      const iv = softDrop ? Math.min(55,dropInterval) : dropInterval;
      const canFall = valid(current.row+1,current.col,current.colors);
      visRow = current.row + (canFall ? Math.max(0,Math.min(1, dropAccum/iv)) : 0);
      visCol += (current.col - visCol) * Math.min(1, dt*0.022);   // 横移平滑(时间相关,低帧不卡)
      if(Math.abs(visCol-current.col) < 0.01) visCol = current.col;
    }
  }

  // ---------- 渲染 ----------
  function easeOutBack(t){ const c1=1.70158, c3=c1+1; return 1+c3*Math.pow(t-1,3)+c1*Math.pow(t-1,2); }
  function rr(g,x,y,w,h,rad){ g.beginPath(); g.moveTo(x+rad,y);
    g.arcTo(x+w,y,x+w,y+h,rad); g.arcTo(x+w,y+h,x,y+h,rad);
    g.arcTo(x,y+h,x,y,rad); g.arcTo(x,y,x+w,y,rad); g.closePath(); }

  function drawBlock(g, colF, rowF, idx, opt, cell){
    cell=cell||CELL; opt=opt||{};
    const sc=opt.scale||1, p=Math.max(2,cell*0.06), s0=cell-p*2, h=s0/2;
    const cx=(colF+0.5)*cell, cy=(rowF+0.5)*cell;
    const col=COLORS[idx]||COLORS[0];
    const rad=cell*0.2;
    g.save();
    g.translate(cx,cy); if(sc!==1) g.scale(sc,sc);   // 居中绘制 → 可复用缓存渐变、缩放也对
    if(opt.ghost){ // 落点:实心,只是比真方块暗一些(好分辨)
      g.fillStyle=col.gfill; rr(g,-h,-h,s0,s0,rad); g.fill();
      g.strokeStyle=col.gedge; g.lineWidth=Math.max(1.5,cell*0.045);
      rr(g,-h,-h,s0,s0,rad); g.stroke(); g.restore(); return; }
    const a=(opt.alpha!=null)?opt.alpha:1;
    let grad;   // 棋盘热路径用缓存渐变;预览等少量块即时生成
    if(g===ctx && cell===CELL){ grad=gradCache[idx]; }
    else { grad=g.createLinearGradient(0,-h,0,h);
      grad.addColorStop(0,col.top); grad.addColorStop(.52,col.fill); grad.addColorStop(1,col.dark); }
    g.globalAlpha=a; g.fillStyle=grad; rr(g,-h,-h,s0,s0,rad); g.fill();
    g.globalAlpha=a*0.5; g.fillStyle=col.glow;                       // 顶部柔和光泽条
    rr(g, -h+s0*0.13, -h+s0*0.09, s0*0.74, s0*0.2, rad*0.6); g.fill();
    g.globalAlpha=a; g.strokeStyle=col.edge; g.lineWidth=Math.max(1,cell*0.035);
    rr(g,-h,-h,s0,s0,rad); g.stroke();
    g.restore();
  }

  function render(){
    let ox=0,oy=0;
    if(shakeT>0){ const m=shakeT/460*1.5; ox=(Math.random()*2-1)*m; oy=(Math.random()*2-1)*m; }
    ctx.save(); ctx.clearRect(0,0,cv.width,cv.height); ctx.translate(ox,oy);
    ctx.fillStyle=bgGrad||"#0a0118"; ctx.fillRect(-4,-4,COLS*CELL+8,ROWS*CELL+8);
    ctx.strokeStyle="rgba(150,90,255,.10)"; ctx.lineWidth=1;
    for(let c=0;c<=COLS;c++){ ctx.beginPath(); ctx.moveTo(c*CELL,0); ctx.lineTo(c*CELL,ROWS*CELL); ctx.stroke(); }
    for(let r=0;r<=ROWS;r++){ ctx.beginPath(); ctx.moveTo(0,r*CELL); ctx.lineTo(COLS*CELL,r*CELL); ctx.stroke(); }

    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) if(board[r][c]!=null){
      const key=r+","+c, ry=r+voff[r][c];
      if(clearing&&clearing.has(key)){
        const pulse=0.5+0.5*Math.sin(flashPulse*0.03);
        drawBlock(ctx,c,ry,board[r][c],{glow:1.9, alpha:0.3+0.7*pulse, scale:1+pulse*0.12});
        ctx.save(); ctx.globalAlpha=pulse*0.9; ctx.fillStyle="#fff";
        const p=Math.max(2,CELL*0.07); rr(ctx,c*CELL+p,ry*CELL+p,CELL-p*2,CELL-p*2,CELL*0.18); ctx.fill(); ctx.restore();
      } else drawBlock(ctx,c,ry,board[r][c],{scale:vscale[r][c]});
    }

    // 乱入下落实体(独立于棋盘)
    for(const j of fallingJunk){ if(j.y>-1) drawBlock(ctx, j.c, j.y, j.idx, {}); }

    if(state==="playing"&&current&&sub==="control"){
      // visRow/visCol 由 updateFx 连续插值,这里只负责画
      const n=current.colors.length;
      // 落点只画在活动方块下方,避免最后一格与活动块重叠露出暗边
      if(ghostOn){ const gr=ghostRow(); for(let i=0;i<n;i++){ const r=gr+i; if(r>=0 && r>visRow+n-1) drawBlock(ctx,current.col,r,current.colors[i],{ghost:true}); } }
      if(rotT>0){   // 旋转:整组干净"弹一下"(放大回弹),不滑动、不重影
        const t=1-rotT/ROT_MS, pop=1+0.15*Math.sin(t*Math.PI);
        const cx=(visCol+0.5)*CELL, cyc=(visRow+n/2)*CELL;
        ctx.save(); ctx.translate(cx,cyc); ctx.scale(pop,pop); ctx.translate(-cx,-cyc);
        for(let i=0;i<n;i++) drawBlock(ctx,visCol,visRow+i,current.colors[i],{});
        ctx.restore();
      } else {
        for(let i=0;i<n;i++) drawBlock(ctx,visCol,visRow+i,current.colors[i],{});
      }
    }

    for(const p of particles){ ctx.save(); ctx.globalAlpha=Math.max(0,p.life)*0.9;
      ctx.fillStyle=p.color;
      ctx.beginPath(); ctx.arc(p.x,p.y,p.size*Math.max(0,p.life),0,7); ctx.fill(); ctx.restore(); }

    for(const q of popups){
      const a=Math.min(1,q.age/180), sc=0.35+0.65*easeOutBack(a);   // 弹一下:0.35→过冲→1
      ctx.save(); ctx.globalAlpha=Math.max(0,q.life);
      ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.translate(q.x,q.y); ctx.scale(sc,sc);
      const fs=Math.round(CELL*(0.62+q.tier*0.08));                 // 连击越高字越大
      ctx.font="900 "+fs+"px system-ui,sans-serif";                 // 夸奖词:描边+实色(无辉光)
      ctx.lineWidth=Math.max(3,CELL*0.1); ctx.strokeStyle="rgba(8,2,20,.92)"; ctx.strokeText(q.word,0,0);
      ctx.fillStyle=q.col; ctx.fillText(q.word,0,0);
      const subY=fs*0.8, subFs=Math.round(CELL*0.4);
      ctx.font="800 "+subFs+"px system-ui,sans-serif";
      if(q.coin){   // 过关奖励:画一枚金币图形 + 「+N」
        const tw=ctx.measureText(q.sub).width, r=subFs*0.46, gap=subFs*0.26, cx=-(r*2+gap+tw)/2+r;
        const grd=ctx.createRadialGradient(cx-r*0.3,subY-r*0.3,r*0.2,cx,subY,r);
        grd.addColorStop(0,"#fff0bf"); grd.addColorStop(.62,"#f3bd3c"); grd.addColorStop(1,"#d79420");
        ctx.beginPath(); ctx.arc(cx,subY,r,0,7); ctx.fillStyle=grd; ctx.fill();
        ctx.lineWidth=Math.max(1,r*0.16); ctx.strokeStyle="rgba(140,92,12,.75)"; ctx.stroke();
        ctx.textAlign="left"; const tx=cx+r+gap;
        ctx.lineWidth=Math.max(2,CELL*0.07); ctx.strokeStyle="rgba(8,2,20,.92)"; ctx.strokeText(q.sub,tx,subY);
        ctx.fillStyle="#ffe9a8"; ctx.fillText(q.sub,tx,subY); ctx.textAlign="center";
      } else {
        ctx.lineWidth=Math.max(2,CELL*0.07); ctx.strokeStyle="rgba(8,2,20,.92)"; ctx.strokeText(q.sub,0,subY);
        ctx.fillStyle="#fff"; ctx.fillText(q.sub,0,subY);
      }
      ctx.restore(); }

    // 移动端:画布内显示「下一个」(侧栏已隐藏)
    if(isMobile && next && (state==="playing"||state==="paused")){
      const n=next.colors.length, pc=Math.max(10,CELL*0.40), pad=5, pw=pc+pad*2, ph=pc*n+pad+16, px=COLS*CELL-pw-6, py=6;
      ctx.save();
      ctx.fillStyle="rgba(8,2,20,.74)"; rr(ctx,px,py,pw,ph,9); ctx.fill();
      ctx.fillStyle="#9b86c9"; ctx.textAlign="center"; ctx.font="700 9px system-ui,sans-serif";
      ctx.fillText("NEXT", px+pw/2, py+11);
      for(let i=0;i<n;i++){ const col=COLORS[next.colors[i]]||COLORS[0];
        const bx=px+pad, by=py+15+i*pc, s=pc-3;
        ctx.fillStyle=col.fill; rr(ctx,bx,by,s,s,s*0.2); ctx.fill();
        ctx.strokeStyle=col.glow; ctx.lineWidth=1.4; rr(ctx,bx,by,s,s,s*0.2); ctx.stroke(); }
      ctx.restore();
    }

    // 关卡进度条:顶部细条(本关已消除 / 过关目标)
    if(state==="playing"||state==="paused"){
      const need=stageGoal(level), prog=Math.max(0,Math.min(1,(cleared-stageStart)/need));
      const bw=COLS*CELL, bh=Math.max(3,CELL*0.07);
      ctx.fillStyle="rgba(255,255,255,.10)"; ctx.fillRect(0,0,bw,bh);
      ctx.fillStyle="#ffd86a"; ctx.fillRect(0,0,bw*prog,bh);
    }

    ctx.restore();
  }

  function drawNext(){
    const n=next.colors.length, cs=Math.round(CELL*0.62);
    nextCv.style.width=cs+"px"; nextCv.style.height=(cs*n)+"px";
    nextCv.width=cs*dpr; nextCv.height=cs*n*dpr;
    nctx.setTransform(dpr,0,0,dpr,0,0);
    nctx.clearRect(0,0,cs,cs*n);
    for(let i=0;i<n;i++) drawBlock(nctx,0,i,next.colors[i],{glow:1},cs);
  }

  // ---------- 主循环 ----------
  let last=0, _lastState="";
  function loop(t){
    const dt=Math.min(60,t-(last||t)); last=t;
    if(state!==_lastState){ _lastState=state; document.body.classList.toggle("ingame", state==="playing"); }  // 暂停键只在进行中显示
    if(freezeT>0){ freezeT=Math.max(0,freezeT-dt); render(); requestAnimationFrame(loop); return; }  // 顿帧:全局短暂定格
    if(state==="playing"){
      if(sub==="control"){
        dropAccum+=dt; const iv=softDrop?Math.min(55,dropInterval):dropInterval;
        while(dropAccum>=iv){ dropAccum-=iv; stepDown(); if(sub!=="control")break; }
      } else if(sub==="resolving"){ clearTimer-=dt; flashPulse+=dt; if(clearTimer<=0) applyClear(); }
    }
    if(shakeT>0) shakeT=Math.max(0,shakeT-dt);
    updateFx(dt); render();
    requestAnimationFrame(loop);
  }

  // ---------- 音频 ----------
  let actx=null;
  function ensureAudio(){ if(!actx){ try{ actx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} }
    if(actx&&actx.state==="suspended") actx.resume(); }
  function tone(freq,dur,type,vol,atk){
    if(!actx) return;
    try{ const o=actx.createOscillator(), g=actx.createGain();
      o.type=type||"sine"; o.frequency.value=freq;
      const n=actx.currentTime, a=atk||0.005;
      g.gain.setValueAtTime(0.0001,n); g.gain.exponentialRampToValueAtTime(vol,n+a);
      g.gain.exponentialRampToValueAtTime(0.0001,n+dur);
      o.connect(g); g.connect(actx.destination); o.start(n); o.stop(n+dur+0.02);
    }catch(e){} }
  function beep(f,d,t,v){ if(soundOn){ ensureAudio(); tone(f,d,t,v); } }

  // 背景音乐:多首生成式电子乐,玩家可在设置里切换
  let musicTimer=null, musicStep=0;
  const nf=s=>220*Math.pow(2,s/12);
  const TRACKS=[
    { name:"霓虹", scale:[0,3,5,7,10,12,15],   pat:[0,2,1,3,2,4,3,5,4,2,1,3], tempo:195, lead:"triangle", lv:0.045, bassEvery:4, bass2Every:8 },
    { name:"律动", scale:[0,2,3,5,7,8,10,12],  pat:[0,4,2,5,3,6,4,7,5,3,1,4], tempo:165, lead:"square",   lv:0.030, bassEvery:2, bass2Every:6 },
    { name:"梦境", scale:[0,2,4,7,9,11,12,14], pat:[0,2,4,3,5,4,6,5,2,4,1,3], tempo:240, lead:"sine",     lv:0.052, bassEvery:4, bass2Every:8 },
    { name:"脉冲", scale:[0,3,5,6,7,10,12,15], pat:[0,1,2,3,4,5,4,3,2,5,3,1], tempo:150, lead:"sawtooth", lv:0.024, bassEvery:2, bass2Every:4 },
  ];
  let musicTrack=(()=>{ try{ const v=parseInt(localStorage.getItem("plox_music")||"0",10); return (v>=0&&v<TRACKS.length)?v:0; }catch(e){ return 0; } })();
  function setMusicTrack(i){ musicTrack=((i%TRACKS.length)+TRACKS.length)%TRACKS.length;
    try{ localStorage.setItem("plox_music",String(musicTrack)); }catch(e){} }
  function musicTick(){
    if(!musicOn||state!=="playing"||!actx||actx.state!=="running"){ musicTimer=null; return; }
    const tk=TRACKS[musicTrack]||TRACKS[0], sc=tk.scale;
    const idx=tk.pat[musicStep%tk.pat.length] % sc.length;
    tone(nf(sc[idx]),0.26,tk.lead,tk.lv,0.02);
    if(musicStep%tk.bassEvery===0) tone(nf(sc[0])/2,0.34,"sine",0.05,0.02);
    if(musicStep%tk.bass2Every===(tk.bass2Every>>1)) tone(nf(sc[Math.min(2,sc.length-1)]),0.22,"sine",0.03,0.02);
    musicStep++; musicTimer=setTimeout(musicTick,tk.tempo);
  }
  function startMusic(){ if(!musicTimer&&musicOn&&state==="playing"){ ensureAudio(); musicTick(); } }
  function stopMusic(){ if(musicTimer){ clearTimeout(musicTimer); musicTimer=null; } }
  // 切后台/锁屏:停音乐;回到前台再恢复(否则 iOS 上 AudioContext 被挂起,音乐会哑/糊)
  document.addEventListener("visibilitychange",()=>{
    if(document.hidden){ stopMusic(); softDrop=false; }
    else if(state==="playing"){ ensureAudio(); startMusic(); }
  });
  window.addEventListener("blur",()=>{ softDrop=false; });

  // ---------- 键盘 ----------
  document.addEventListener("keydown",e=>{
    if(e.target && (e.target.tagName==="INPUT"||e.target.isContentEditable)) return; // 不拦截输入框打字
    if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," "].includes(e.key)) e.preventDefault();
    if(state!=="playing"){ if((e.key===" "||e.key==="Enter")&&(state==="gameover"||state==="start")) start(); return; }
    switch(e.key){
      case "ArrowLeft": move(-1); break;
      case "ArrowRight": move(1); break;
      case "ArrowUp": case "x": case "X": rotate(); break;
      case "ArrowDown": softDrop=true; break;
      case " ": hardDrop(); break;
      case "p": case "P": togglePause(); break;
    }
  });
  document.addEventListener("keyup",e=>{ if(e.key==="ArrowDown") softDrop=false; });

  // ---------- 防止移动端缩放(双击放大 / 双指捏合)----------
  document.addEventListener("gesturestart", e=>e.preventDefault());
  document.addEventListener("gesturechange", e=>e.preventDefault());
  document.addEventListener("touchstart", e=>{ if(e.touches.length>1) e.preventDefault(); }, {passive:false});
  let lastTouchEnd=0;
  document.addEventListener("touchend", e=>{ const now=performance.now();
    if(now-lastTouchEnd<=350) e.preventDefault(); lastTouchEnd=now; }, {passive:false});
  document.addEventListener("dblclick", e=>e.preventDefault());

  // ---------- 触摸操作:点=旋转,左右滑=移动,下滑=速降 ----------
  let tS=null;
  cv.addEventListener("touchstart",e=>{ e.preventDefault(); if(e.touches.length>1) return; ensureAudio(); const t=e.touches[0];
    tS={x:t.clientX,y:t.clientY,t:performance.now(),moved:0,lastX:t.clientX}; },{passive:false});
  cv.addEventListener("touchmove",e=>{ e.preventDefault(); if(!tS||e.touches.length>1||!playing())return;
    const t=e.touches[0]; const dx=t.clientX-tS.lastX;
    if(Math.abs(dx)>=CELL*0.75){ move(dx>0?1:-1); tS.lastX=t.clientX; tS.moved+=Math.abs(dx); } },{passive:false});
  cv.addEventListener("touchend",e=>{ e.preventDefault(); if(!tS)return; const t=e.changedTouches[0];
    const dx=t.clientX-tS.x, dy=t.clientY-tS.y, dt=performance.now()-tS.t;
    if(dy>CELL*1.8 && dy>Math.abs(dx)*1.6 && dt<320) hardDrop();   // 需明确"向下甩"才速降,避免误触
    else if(tS.moved<CELL*0.5&&Math.abs(dx)<16&&Math.abs(dy)<16&&dt<280) rotate();
    tS=null; },{passive:false});

  // ---------- 全屏 / iPhone 添加到主屏幕 ----------
  const isIOS = /iP(hone|od|ad)/.test(navigator.userAgent) ||
                (navigator.platform==="MacIntel" && navigator.maxTouchPoints>1);
  const isStandalone = (navigator.standalone===true) || matchMedia("(display-mode: standalone)").matches;
  const fsSupported = !!(document.documentElement.requestFullscreen || document.documentElement.webkitRequestFullscreen);

  function toggleFullscreen(){
    const el=document.documentElement;
    try{
      if(!document.fullscreenElement && !document.webkitFullscreenElement){
        (el.requestFullscreen||el.webkitRequestFullscreen||(()=>{})).call(el);
      }else{
        (document.exitFullscreen||document.webkitExitFullscreen||(()=>{})).call(document);
      }
    }catch(e){}
  }

  // iPhone Safari 网页无法直接全屏 → 引导「添加到主屏幕」(打开即无边框全屏)
  const shareSvg='<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="#29c5ff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" style="vertical-align:-3px"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M6 12v7a1 1 0 001 1h10a1 1 0 001-1v-7"/></svg>';
  function showA2HS(){
    let g=document.getElementById("a2hs");
    if(!g){
      g=document.createElement("div"); g.id="a2hs"; g.className="guide";
      g.innerHTML=
        '<div class="gcard">'+
          '<h2>全屏玩法</h2>'+
          '<p class="ghint">iPhone 把 PLOX 加到主屏幕,从桌面图标打开就是<b>无边框全屏</b>(还能离线玩)</p>'+
          '<ol>'+
            '<li>点屏幕底部的「分享」'+shareSvg+'</li>'+
            '<li>菜单里选「<b>添加到主屏幕</b>」</li>'+
            '<li>从桌面新出现的 <b>PLOX</b> 图标打开</li>'+
          '</ol>'+
          '<button class="play gclose">知道了</button>'+
        '</div>'+
        '<div class="garrow">↓</div>';
      document.body.appendChild(g);
      g.addEventListener("click",e=>{ if(e.target===g||e.target.classList.contains("gclose")) g.classList.add("hidden"); });
    }
    g.classList.remove("hidden");
  }

  // iPhone Safari 首次自动提示一次「添加到主屏幕」
  if(isIOS && !isStandalone && !localStorage.getItem("plox_a2hs")){
    setTimeout(()=>{ showA2HS(); try{ localStorage.setItem("plox_a2hs","1"); }catch(e){} }, 1000);
  }
  if(/[?&]a2hs=1/.test(location.search)) setTimeout(showA2HS, 300);  // 预览引导用

  // ---------- 暂停(键盘 P / 设置内继续)----------
  function togglePause(){
    if(state==="playing"){ state="paused"; softDrop=false; stopMusic();
      overlay.innerHTML='<h1>暂停</h1><button class="play" id="playBtn">继续</button>';
      overlay.classList.remove("hidden");
      $("playBtn").addEventListener("click",()=>{ state="playing"; overlay.classList.add("hidden"); last=performance.now(); startMusic(); });
    } else if(state==="paused"){ state="playing"; overlay.classList.add("hidden"); last=performance.now(); startMusic(); }
  }

  // ---------- 设置抽屉(收纳全部开关)----------
  let settingsResume=false;
  function fsRowHTML(){
    if(isStandalone) return '';
    if(isIOS || !fsSupported) return '<button class="srow" data-act="a2hs"><span>全屏 · 添加到主屏幕</span><span class="sw arrow">›</span></button>';
    return '<button class="srow" data-act="fs"><span>全屏</span><span class="sw arrow">›</span></button>';
  }
  function sheetHTML(){
    const sw=(on,label,k)=>'<button class="srow" data-tog="'+k+'"><span>'+label+'</span><span class="sw'+(on?' on':'')+'">'+(on?'开':'关')+'</span></button>';
    const tracks = musicOn
      ? '<div class="trackSel">'+TRACKS.map((t,i)=>'<b class="'+(i===musicTrack?'on':'')+'" data-track="'+i+'">'+t.name+'</b>').join('')+'</div>'
      : '';
    return '<div class="scard"><h3>设置</h3>'+
      sw(ghostOn,'落点预览','ghost')+
      sw(musicOn,'背景音乐','music')+
      tracks+
      sw(soundOn,'音效','sound')+
      fsRowHTML()+
      '<div class="ssplit"></div>'+
      (settingsResume?'<button class="sbtn" data-act="resume">继续游戏</button>':'')+
      '<button class="sbtn ghost" data-act="menu">回主菜单</button>'+
      '<button class="sbtn ghost" data-act="close">关闭</button>'+
    '</div>';
  }
  function renderSheet(){ const s=$("sheet"); if(s) s.innerHTML=sheetHTML(); }
  function openSettings(){
    settingsResume=(state==="playing");
    if(settingsResume){ state="paused"; softDrop=false; stopMusic(); }
    let s=$("sheet");
    if(!s){ s=document.createElement("div"); s.id="sheet"; s.className="sheet";
      document.body.appendChild(s); s.addEventListener("click", onSheetClick); }
    renderSheet(); s.classList.remove("hidden");
  }
  function closeSettings(resume){
    const s=$("sheet"); if(s) s.classList.add("hidden");
    if(resume && settingsResume){ state="playing"; last=performance.now(); startMusic(); }
    settingsResume=false;
  }
  function onSheetClick(e){
    if(e.target===$("sheet")){ closeSettings(true); return; }
    const row=e.target.closest("[data-tog],[data-act],[data-track]"); if(!row) return;
    const tog=row.dataset.tog, act=row.dataset.act;
    if(row.dataset.track!=null){ setMusicTrack(+row.dataset.track);   // 切歌:立刻换上,正在玩则重启播放
      if(state==="playing"||settingsResume){ stopMusic(); musicStep=0; if(settingsResume){/*暂停中,继续时会自动播*/} else startMusic(); }
      beep(700,.05,"triangle",.06); renderSheet(); return; }
    if(tog==="ghost"){ ghostOn=!ghostOn; renderSheet(); }
    else if(tog==="music"){ musicOn=!musicOn; renderSheet(); }
    else if(tog==="sound"){ soundOn=!soundOn; if(soundOn) beep(660,.08,"sine",.1); renderSheet(); }
    else if(act==="fs"){ toggleFullscreen(); }
    else if(act==="a2hs"){ closeSettings(false); showA2HS(); }
    else if(act==="resume"||act==="close"){ closeSettings(true); }
    else if(act==="menu"){ closeSettings(false); stopMusic(); showMenu(); }
  }
  $("gearBtn").addEventListener("click", openSettings);
  $("pauseBtn").addEventListener("click", togglePause);   // 顶部独立暂停键

  // ---------- 启动 ----------
  board=Array.from({length:ROWS},()=>Array(COLS).fill(null));
  voff=Array.from({length:ROWS},()=>new Float32Array(COLS));
  vscale=Array.from({length:ROWS},()=>{const a=new Float32Array(COLS); a.fill(1); return a;});
  vmode=Array.from({length:ROWS},()=>new Uint8Array(COLS));
  $("foot").textContent = isMobile
    ? "点击=旋转 · 左右滑=移动 · 下滑=速降"
    : "← → 移动 · ↑ 旋转 · ↓ 加速 · 空格 速降 · P 暂停";
  next=newPiece(); current=newPiece();
  resize(); showMenu(); requestAnimationFrame(loop);

  // ---------- 调试钩子(仅 ?debug=1)----------
  if(/[?&]debug=1/.test(location.search)){
    window.__plox={
      stats:()=>({ filled: board.reduce((a,row)=>a+row.filter(x=>x!=null).length,0),
        perCol: Array.from({length:COLS},(_,c)=>{let n=0;for(let r=0;r<ROWS;r++)if(board[r][c]!=null)n++;return n;}),
        pieceUntilJunk, justJunked, junkMin, junkMax, sub, state, diffKey,
        stage:level, goal:stageGoal(level), prog:cleared-stageStart, cleared }),
      forceJunk:()=>dropJunk(),
      falling:()=>fallingJunk.map(j=>({c:j.c,y:Math.round(j.y*100)/100})),
      tick:(ms)=>updateFx(ms||16),
      clearN:(n)=>{ cleared+=(n||stageGoal(level)); if(cleared-stageStart>=stageGoal(level)){ stageStart=cleared; level++; junkMin=Math.max(1,junkMin-1); junkMax=Math.max(2,junkMax-1); const rw=1+Math.floor(level/4); addCoins(rw); syncCoins(); spawnStageBanner(level,rw); } syncHUD(); },
      coins:()=>getCoins(), give:(n)=>{ addCoins(n||5); syncCoins(); return getCoins(); },
      grant:(id,n)=>{ addItem(id||"bomb3",n||1); renderItemBar(); return getItem(id||"bomb3"); },
      bomb:(id)=>useBomb(id||"bomb3"), inv:()=>ownedItems().map(id=>({id,n:getItem(id)}))
    };
  }

  // ---------- PWA ----------
  if("serviceWorker" in navigator && !/[?&]nosw=1/.test(location.search) && !IS_TEST){   // 测试版不装 SW,永远拿最新
    window.addEventListener("load",()=>{ navigator.serviceWorker.register("./sw.js").catch(()=>{}); });
  }
})();
