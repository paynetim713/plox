// ---------- 游戏模型(M)----------
// 纯游戏逻辑 + 状态:棋盘/方块/消除/关卡/乱入/复活/最高分。
// 不碰 DOM/Canvas/音频;反馈(音效/粒子/HUD/流程)通过注入的 audio/fx/ui/on 触发。
// 函数体与原 main.js 一字不改,仅把跨层调用改成走注入接口。
import { COLS, ROWS, FIXED_COLORS, PIECE_LEN, PLAYER_INTERVAL, JUNK_FALL,
         ROT_MS, DIFFS, CLEAR_MS, stageGoal, dropIntervalFor } from "./config.js";
import { addCoins } from "./economy.js";
import { ITEMS, useItem } from "./items.js";

export function createModel(deps){
  const { audio, fx, ui, on } = deps;
  const beep=(f,d,t,v)=>audio.beep(f,d,t,v);

  // ---------- 状态 ----------
  let board, voff, vscale, vmode, current, next, state="start", sub="control";
  let score=0, cleared=0, level=1, combo=0, maxCombo=0, stageStart=0;
  let dropAccum=0, dropInterval=800, baseInterval=720, colorCount=5, pieceLen=3, softDrop=false;
  let junkMin=3, junkMax=4, pieceUntilJunk=4, justJunked=false;
  let fallingJunk=[], junkWarn=[];
  let clearing=null, clearTimer=0, flashPulse=0;
  let revives=0, mode="endless", pendingLevelClear=false;   // mode: "endless" 无尽 / "campaign" 闯关
  let visRow=0, visCol=3, rotT=0;
  let high=0, diffKey="normal";

  // ---------- 个人最高分(按难度)----------
  function getBest(d){ try{ return +((JSON.parse(localStorage.getItem("plox_best"))||{})[d]||0); }catch(e){ return 0; } }
  function setBest(d,s){ try{ const b=JSON.parse(localStorage.getItem("plox_best"))||{}; b[d]=s; localStorage.setItem("plox_best",JSON.stringify(b)); }catch(e){} }
  function refreshHigh(){ high=getBest(diffKey); ui.setHigh(high); }
  function getBestStage(d){ try{ return +((JSON.parse(localStorage.getItem("plox_beststage"))||{})[d]||0); }catch(e){ return 0; } }
  function recordBestStage(s){ try{ const b=JSON.parse(localStorage.getItem("plox_beststage"))||{}; if(s>(b[diffKey]||0)){ b[diffKey]=s; localStorage.setItem("plox_beststage",JSON.stringify(b)); } }catch(e){} }
  // 闯关解锁进度:独立键、按难度分、仅闯关写入(避免刷无尽把闯关关卡一起解锁)
  function getCampaignMax(d){ try{ return +((JSON.parse(localStorage.getItem("plox_campaign"))||{})[d]||0); }catch(e){ return 0; } }
  function recordCampaignMax(s){ try{ const b=JSON.parse(localStorage.getItem("plox_campaign"))||{}; if(s>(b[diffKey]||0)){ b[diffKey]=s; localStorage.setItem("plox_campaign",JSON.stringify(b)); } }catch(e){} }

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
  const playing=()=>state==="playing"&&sub==="control";

  // ---------- 流程 ----------
  // 按关数推导下落速度与乱入频率(确定性:闯关重试可直接跳到某关)
  function applyLevelTuning(lvl){
    const D=DIFFS[diffKey];
    dropInterval=dropIntervalFor(baseInterval, lvl);
    const red=Math.floor(lvl/2);   // 每 2 关乱入更频一档
    junkMin=Math.max(D.floorMin, D.junkMin-red);
    junkMax=Math.max(D.floorMax, D.junkMax-red);
  }
  function reset(startLevel){
    startLevel = startLevel || 1;
    board=Array.from({length:ROWS},()=>Array(COLS).fill(null));
    voff=Array.from({length:ROWS},()=>new Float32Array(COLS));
    vscale=Array.from({length:ROWS},()=>{const a=new Float32Array(COLS); a.fill(1); return a;});
    vmode=Array.from({length:ROWS},()=>new Uint8Array(COLS));
    score=0; cleared=0; level=startLevel; combo=0; maxCombo=0; stageStart=0;
    const D=DIFFS[diffKey];
    baseInterval=D.baseInterval||PLAYER_INTERVAL; colorCount=FIXED_COLORS; pieceLen=PIECE_LEN;
    junkMin=D.junkMin; junkMax=D.junkMax; applyLevelTuning(startLevel);
    pieceUntilJunk=Math.min(junkMax, randInt(4,7)); justJunked=false;
    dropAccum=0; softDrop=false; clearing=null; sub="control"; revives=0; pendingLevelClear=false;
    fallingJunk.length=0; junkWarn.length=0; clearTimer=0; flashPulse=0; rotT=0;
    fx.resetFx();     // 清 particles/popups/banner/shakeT/freezeT
    refreshHigh();
    next=newPiece(); spawn(); ui.syncHUD();
  }
  function spawn(){
    current=next; next=newPiece();
    current.row=0; current.col=(COLS/2)|0;
    visRow=0; visCol=current.col; dropAccum=0;
    if(!valid(current.row,current.col,current.colors)){ gameOver(); return; }
    on.spawn();   // 桌面端画「下一个」预览
  }
  function stepDown(){ if(valid(current.row+1,current.col,current.colors)) current.row++; else lockPiece(); }
  function lockPiece(){
    let lowR=0;
    for(let i=0;i<current.colors.length;i++){ const r=current.row+i;
      if(r>=0&&r<ROWS){ board[r][current.col]=current.colors[i]; vscale[r][current.col]=1.45; voff[r][current.col]=0; lowR=Math.max(lowR,r); } }
    fx.spawnParticles(current.col, lowR, current.colors[current.colors.length-1], 5);
    fx.shakeMax(38);
    beep(150,.05,"square",.07); beep(95,.08,"sine",.05);
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
  // 关卡判定:本关消除够目标 → 过关、提速、乱入更频繁;每 5 关奖励 1 金币。普通消除 / 炸弹 / 乱入消除共用。
  function checkStageUp(){
    if(cleared-stageStart >= stageGoal(level)){
      stageStart=cleared; level++;
      applyLevelTuning(level);
      const reward = (level%5===0) ? 1 : 0;
      if(reward){ addCoins(reward); ui.syncCoins(); }
      recordBestStage(level);
      if(mode==="campaign"){ recordCampaignMax(level); pendingLevelClear=true; }   // 闯关:解锁新关 + 过关后清空棋盘
      fx.spawnStageBanner(level, reward);
    }
  }
  function beginResolve(){
    const m=findMatches();
    if(m.size===0){ settle(); return; }
    combo++;
    if(combo>maxCombo) maxCombo=combo;
    const bonus = m.size>3 ? (m.size-3)*15 : 0;
    const gained = m.size*10*combo + bonus*combo;
    score+=gained; cleared+=m.size;
    checkStageUp();
    clearing=m; clearTimer=CLEAR_MS; flashPulse=0;
    fx.shake(Math.min(220, 60+m.size*14+combo*20));
    if(m.size>=5 || combo>=3) fx.freeze(Math.min(80, 30+m.size*6));
    fx.spawnPopup(gained, combo);
    const f=440*Math.pow(2,Math.min(combo,8)/12);
    beep(f,.12,"triangle",.10+Math.min(combo,6)*0.01);
    if(combo>1) beep(f*1.5,.1,"sine",.07);
    ui.syncHUD();
  }
  function applyClear(){
    let pn=5+Math.min(combo,4)*2;                                  // 基础喷发下调(原 9+min(combo,6)*2)
    pn=Math.max(3, Math.round(pn*Math.min(1, 24/clearing.size)));  // 大消除按规模反比封顶,总量不再线性膨胀
    for(const key of clearing){ const [r,c]=key.split(",").map(Number);
      fx.spawnParticles(c,r,board[r][c],pn); board[r][c]=null; voff[r][c]=0; vmode[r][c]=0; vscale[r][c]=1; }
    clearing=null; gravity(); beginResolve();
  }
  function settle(){
    if(state!=="playing") return;
    if(pendingLevelClear){ pendingLevelClear=false; clearBoardForNextLevel(); sub="control"; spawn(); return; }
    if(--pieceUntilJunk<=0){ pieceUntilJunk=randInt(junkMin,junkMax); dropJunk(); }
    sub="control"; spawn();
  }
  // 闯关过关:清空棋盘迎接新一关(不含 spawn,由 settle 接着 spawn)
  function clearBoardForNextLevel(){
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
      if(board[r][c]!=null){ fx.spawnParticles(c,r,board[r][c],4); board[r][c]=null; voff[r][c]=0; vmode[r][c]=0; vscale[r][c]=1; } }
    fallingJunk.length=0; junkWarn.length=0; clearing=null;
    pieceUntilJunk=Math.min(junkMax, randInt(4,7)); fx.shake(120);
  }
  function colFill(c){ let top=0; while(top<ROWS && board[top][c]==null) top++; return ROWS-top; }
  // 乱入块随机形状:横1 / 横2 / 竖1 / 竖2(横1≡竖1=单格)。整体缓降、逐格落地、不可操作
  function dropJunk(){
    const orient = Math.random()<0.5 ? "h" : "v";
    const len = Math.random()<0.5 ? 1 : 2;
    const cells=[];
    for(let i=0;i<len;i++) cells.push({ dc: orient==="h"?i:0, dr: orient==="h"?0:i, idx: rc() });
    const wide = orient==="h" ? len : 1;          // 占用列数
    const needPerCol = orient==="h" ? 1 : len;    // 每列需要的空行数
    let cands=[];
    for(let c=0; c+wide-1<COLS; c++){
      let ok=true, emptiness=0;
      for(let k=0;k<wide;k++){ const free=ROWS-colFill(c+k); if(free<needPerCol){ ok=false; break; } emptiness+=free; }
      if(ok) cands.push({c, w:emptiness*emptiness});
    }
    if(!cands.length){   // 没有理想落点:退化成单格随便找一列
      const c=(Math.random()*COLS)|0;
      fallingJunk.push({c, y:-1.6, cells:[{dc:0,dr:0,idx:rc()}]}); junkWarn.push({c, t:0});
      beep(115,.09,"sine",.05); return {added:1};
    }
    let tot=cands.reduce((a,b)=>a+b.w,0), r=Math.random()*tot, pick=0;
    for(let k=0;k<cands.length;k++){ r-=cands[k].w; if(r<=0){ pick=k; break; } }
    const c=cands[pick].c;
    fallingJunk.push({c, y:-1.6, cells});
    for(let k=0;k<wide;k++) junkWarn.push({c:c+k, t:0});
    beep(115,.09,"sine",.05);
    return {added:len};
  }
  function resolveJunk(){
    let total=0;
    while(true){ const m=findMatches(); if(m.size===0) break;
      total+=m.size;
      for(const key of m){ const [r,c]=key.split(",").map(Number);
        fx.spawnParticles(c,r,board[r][c]); board[r][c]=null; voff[r][c]=0; vmode[r][c]=0; vscale[r][c]=1; }
      gravity();
    }
    if(total){ score+=total*10; cleared+=total; checkStageUp(); ui.syncHUD();
      fx.shake(Math.min(180,60+total*16)); beep(520,.1,"triangle",.1); }
  }
  // 道具:炸弹(炸掉最下方 N 行);炸掉的方块计入闯关进度
  function useBomb(id){
    const it=ITEMS[id]; if(!it) return;
    if(state!=="playing" || sub!=="control") return;
    if(!useItem(id)) return;
    let n=0;
    for(let r=ROWS-1; r>=Math.max(0,ROWS-it.rows); r--){
      for(let c=0;c<COLS;c++){ if(board[r][c]!=null){
        fx.spawnParticles(c,r,board[r][c]); board[r][c]=null; voff[r][c]=0; vmode[r][c]=0; vscale[r][c]=1; n++; } }
    }
    gravity();
    score+=n*5; cleared+=n; checkStageUp(); ui.syncHUD();
    fx.shake(Math.min(260,160+n*6)); fx.freeze(Math.min(90,50));
    beep(70,.22,"sawtooth",.13); beep(150,.16,"square",.1); beep(40,.3,"triangle",.1);
    resolveJunk();
    ui.renderItemBar();
  }

  // ---------- 操作 ----------
  function move(d){ if(playing()&&valid(current.row,current.col+d,current.colors)){ current.col+=d; beep(330,.03,"sine",.05);} }
  function rotate(){ if(playing()){ const c=current.colors; current.colors=[c[c.length-1],...c.slice(0,c.length-1)];
    rotT=ROT_MS; beep(600,.045,"triangle",.07); beep(900,.03,"sine",.04); } }
  function hardDrop(){ if(!playing())return; let n=0; while(valid(current.row+1,current.col,current.colors)){current.row++;n++;} visRow=current.row; score+=n*2; ui.syncHUD();
    fx.shakeMax(Math.min(64, 40+n*4)); fx.freezeMax(18);
    lockPiece(); }
  function ghostRow(){ let r=current.row; while(valid(r+1,current.col,current.colors)) r++; return r; }

  function gameOver(){
    if(state!=="playing" && state!=="paused") return;
    state="gameover"; audio.stopMusic(); softDrop=false; beep(140,.25,"sawtooth",.15);
    if(score>high){ high=score; setBest(diffKey,score); ui.setHigh(high); }
    recordBestStage(level);
    if(mode==="campaign"){ recordCampaignMax(level); on.levelFail(); } else on.gameOver();
  }
  // 闯关失败重试本关:清空棋盘,保留关数与分数,本关目标重新计(不含 spawn,由 Controller 接管)
  function retryLevel(){
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
      if(board[r][c]!=null){ fx.spawnParticles(c,r,board[r][c],4); board[r][c]=null; voff[r][c]=0; vmode[r][c]=0; vscale[r][c]=1; } }
    fallingJunk.length=0; junkWarn.length=0; clearing=null;
    stageStart=cleared; applyLevelTuning(level);
    pieceUntilJunk=Math.min(junkMax, randInt(4,7));
    fx.shake(160); fx.freeze(40);
    sub="control"; state="playing"; dropAccum=0;
  }
  // 复活:炸掉最下方 rows 行(普通=6;看广告=12,2×)。不含 overlay/spawn/音乐,那些由 Controller 接管以保持原顺序
  function revive(rows){
    rows = rows || 6;
    revives++;
    for(let r=ROWS-1;r>=Math.max(0,ROWS-rows);r--) for(let c=0;c<COLS;c++){
      if(board[r][c]!=null){ fx.spawnParticles(c,r,board[r][c],7); board[r][c]=null; voff[r][c]=0; vmode[r][c]=0; vscale[r][c]=1; } }
    fallingJunk.length=0; junkWarn.length=0; clearing=null;
    gravity();
    fx.shake(220); fx.freeze(60); beep(70,.26,"sawtooth",.14); beep(150,.18,"square",.1); beep(40,.32,"triangle",.1);
    sub="control"; state="playing"; dropAccum=0;
  }

  // ---------- 主循环调用的 tick ----------
  function dropTick(dt){
    dropAccum+=dt; const iv=softDrop?Math.min(55,dropInterval):dropInterval;
    while(dropAccum>=iv){ dropAccum-=iv; stepDown(); if(sub!=="control")break; }
  }
  function resolveTick(dt){ clearTimer-=dt; flashPulse+=dt; if(clearTimer<=0) applyClear(); }
  // updateFx 的「模型/动画」部分(粒子/连击词/横幅归 View)
  function updateAnim(dt){
    const k=dt/16.7;
    if(rotT>0) rotT=Math.max(0,rotT-dt);
    for(let i=junkWarn.length-1;i>=0;i--){ junkWarn[i].t+=dt;
      if(junkWarn[i].t>=600 && !fallingJunk.some(g=>g.cells.some(cell=>g.c+cell.dc===junkWarn[i].c))) junkWarn.splice(i,1); }
    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++){
      if(voff[r][c]!==0){
        if(vmode[r][c]===1){ voff[r][c]+=JUNK_FALL*dt; if(voff[r][c]>=0){ voff[r][c]=0; vmode[r][c]=0; } }
        else { voff[r][c]*=Math.pow(0.80,k); if(Math.abs(voff[r][c])<0.02) voff[r][c]=0; }
      }
      if(vscale[r][c]!==1){ vscale[r][c]+=(1-vscale[r][c])*Math.min(1,0.22*k); if(Math.abs(vscale[r][c]-1)<0.01) vscale[r][c]=1; }
    }
    if(state==="playing" && sub==="control"){
      let landedAny=false;
      for(let i=fallingJunk.length-1;i>=0;i--){
        const g=fallingJunk[i];
        g.y += JUNK_FALL*dt;
        // 组内每格独立结算:落到各自列顶就位(横2 遇不平地会分开落、不悬空;竖2 底格先落)
        for(let k=g.cells.length-1;k>=0;k--){
          const cell=g.cells[k], col=g.c+cell.dc;
          let top=0; while(top<ROWS && board[top][col]==null) top++;
          const anchorLand=top-1-cell.dr;      // 该格落地时对应的锚点行
          if(anchorLand<0){ g.cells.splice(k,1); continue; }   // 该列满,这格放不下→丢弃
          if(g.y>=anchorLand){
            const R=anchorLand+cell.dr;
            board[R][col]=cell.idx; vscale[R][col]=1.35; voff[R][col]=0; vmode[R][col]=0;
            fx.spawnParticles(col, R, cell.idx);
            g.cells.splice(k,1); landedAny=true;
          }
        }
        if(!g.cells.length) fallingJunk.splice(i,1);
      }
      if(landedAny){ beep(95,.12,"sine",.08); beep(150,.06,"triangle",.05); fx.shakeMax(70); resolveJunk(); }
    }
    if(state==="playing" && current && sub==="control"){
      const iv = softDrop ? Math.min(55,dropInterval) : dropInterval;
      const canFall = valid(current.row+1,current.col,current.colors);
      visRow = current.row + (canFall ? Math.max(0,Math.min(1, dropAccum/iv)) : 0);
      visCol += (current.col - visCol) * Math.min(1, dt*0.022);
      if(Math.abs(visCol-current.col) < 0.01) visCol = current.col;
    }
  }

  // 构造即初始化棋盘(对应原 startup)
  board=Array.from({length:ROWS},()=>Array(COLS).fill(null));
  voff=Array.from({length:ROWS},()=>new Float32Array(COLS));
  vscale=Array.from({length:ROWS},()=>{const a=new Float32Array(COLS); a.fill(1); return a;});
  vmode=Array.from({length:ROWS},()=>new Uint8Array(COLS));
  next=newPiece(); current=newPiece();
  refreshHigh();

  return {
    // 读:getter(实时值)
    get state(){return state;}, get sub(){return sub;}, get score(){return score;}, get cleared(){return cleared;},
    get level(){return level;}, get combo(){return combo;}, get maxCombo(){return maxCombo;}, get stageStart(){return stageStart;},
    get high(){return high;}, get diffKey(){return diffKey;}, get board(){return board;}, get voff(){return voff;}, get vscale(){return vscale;},
    get current(){return current;}, get next(){return next;}, get clearing(){return clearing;}, get clearTimer(){return clearTimer;},
    get fallingJunk(){return fallingJunk;}, get junkWarn(){return junkWarn;}, get visRow(){return visRow;}, get visCol(){return visCol;},
    get rotT(){return rotT;}, get revives(){return revives;}, get dropInterval(){return dropInterval;}, get colorCount(){return colorCount;},
    get pieceLen(){return pieceLen;}, get softDrop(){return softDrop;}, get pieceUntilJunk(){return pieceUntilJunk;},
    get junkMin(){return junkMin;}, get junkMax(){return junkMax;}, get justJunked(){return justJunked;}, get mode(){return mode;},
    // 写:setter(仅 Controller 需要写的几个)
    setState(s){ state=s; }, setDiffKey(k){ diffKey=k; }, setSoftDrop(b){ softDrop=b; }, setMode(m){ mode=m; },
    // 方法
    reset, spawn, move, rotate, hardDrop, useBomb, dropTick, resolveTick, updateAnim, revive, retryLevel, ghostRow,
    getBest, getBestStage, getCampaignMax, refreshHigh, dropJunk, stageGoal,
  };
}
