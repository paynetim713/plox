// ---------- 控制器(Controller)----------
// 装配各层(音频/排行榜服务 → 视图 → 模型 → 界面),处理输入(键盘/触摸)、主循环与游戏流程(开始/复活/暂停)。
// 不含游戏规则(在 model.js)也不含渲染/DOM 细节(在 view.js / ui.js);此处只做协调。
import { COLS, ROWS, stageGoal } from "./config.js";
import { getCoins, addCoins, getDiamonds, addDiamonds } from "./economy.js";
import { getItem, addItem, ownedItems } from "./items.js";
import { createAudio } from "./audio.js";
import { createLeaderboard } from "./leaderboard.js";
import { createModel } from "./model.js";
import { createView } from "./view.js";
import { createUI } from "./ui.js";

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
  const elCoinNum=$("coinNum"), elItembar=$("itembar");

  // ---------- 服务层 ----------
  const audio=createAudio(()=>model.state);
  const { ensureAudio, startMusic, stopMusic, beep }=audio;
  const lb=createLeaderboard();
  const { IS_TEST }=lb;

  // ---------- 视图 ----------
  const view=createView({ cv, ctx, nextCv, nctx, isMobile, audio,
    dom:{ elScore, elHigh, elLevel, elCleared, elMaxCombo, elCoinNum, elItembar } });

  // ---------- 模型(注入 音频 / 特效 / HUD / 流程回调)----------
  const on={ gameOver:()=>ui.showReviveOffer(), levelFail:()=>ui.showLevelFail(), spawn:()=>{ if(!isMobile) view.drawNext(); } };
  const model=createModel({ audio, fx:view.fx, ui:view.hud, on });
  view.bind(model);

  // ---------- 界面(注入 流程回调)----------
  const ctrl={ start, doRevive, doRetry };
  const ui=createUI({ overlay, $, model, view, audio, lb, ctrl, isMobile });

  // ---------- 流程 ----------
  let last=0, _lastState="";
  function start(){
    model.reset(); model.setState("playing"); overlay.classList.add("hidden"); last=performance.now();
    view.hud.syncCoins(); view.hud.renderItemBar();
    ensureAudio(); startMusic(); beep(660,.08,"sine",.1);
  }
  function doRevive(rows){
    model.revive(rows);   // 普通复活 6 行;看广告复活传 12
    overlay.classList.add("hidden");
    model.spawn();
    if(model.state==="playing"){ last=performance.now(); startMusic(); }
  }
  function doRetry(){   // 闯关:重试本关
    model.retryLevel();
    overlay.classList.add("hidden");
    model.spawn();
    if(model.state==="playing"){ last=performance.now(); startMusic(); }
  }
  function togglePause(){
    if(model.state==="playing"){ model.setState("paused"); model.setSoftDrop(false); stopMusic();
      overlay.innerHTML='<h1>暂停</h1><button class="play" id="playBtn">继续</button>';
      overlay.classList.remove("hidden");
      $("playBtn").addEventListener("click",()=>{ model.setState("playing"); overlay.classList.add("hidden"); last=performance.now(); startMusic(); });
    } else if(model.state==="paused"){ model.setState("playing"); overlay.classList.add("hidden"); last=performance.now(); startMusic(); }
  }

  // ---------- 主循环 ----------
  function loop(t){
    const dt=Math.min(60,t-(last||t)); last=t;
    if(model.state!==_lastState){ _lastState=model.state; document.body.classList.toggle("ingame", model.state==="playing"); view.resize(); }
    if(view.freezeT>0){ view.freezeT=Math.max(0,view.freezeT-dt); view.render(); requestAnimationFrame(loop); return; }
    if(model.state==="playing"){
      if(model.sub==="control") model.dropTick(dt);
      else if(model.sub==="resolving") model.resolveTick(dt);
    }
    if(view.shakeT>0) view.shakeT=Math.max(0,view.shakeT-dt);
    model.updateAnim(dt); view.fxUpdate(dt); view.render();
    requestAnimationFrame(loop);
  }

  // ---------- 窗口尺寸 ----------
  window.addEventListener("resize", ()=>view.resize());
  window.addEventListener("orientationchange", ()=>setTimeout(()=>view.resize(),150));
  window.addEventListener("load", ()=>{ view.resize(); setTimeout(()=>view.resize(),300); });

  // ---------- 后台切换 ----------
  document.addEventListener("visibilitychange",()=>{
    if(document.hidden){ stopMusic(); model.setSoftDrop(false); }
    else if(model.state==="playing"){ ensureAudio(); startMusic(); }
  });
  window.addEventListener("blur",()=>{ model.setSoftDrop(false); });

  // ---------- 键盘 ----------
  document.addEventListener("keydown",e=>{
    if(e.target && (e.target.tagName==="INPUT"||e.target.isContentEditable)) return;
    if(["ArrowLeft","ArrowRight","ArrowUp","ArrowDown"," "].includes(e.key)) e.preventDefault();
    if(model.state!=="playing"){ if((e.key===" "||e.key==="Enter")&&(model.state==="gameover"||model.state==="start")) start(); return; }
    switch(e.key){
      case "ArrowLeft": model.move(-1); break;
      case "ArrowRight": model.move(1); break;
      case "ArrowUp": case "x": case "X": model.rotate(); break;
      case "ArrowDown": model.setSoftDrop(true); break;
      case " ": model.hardDrop(); break;
      case "p": case "P": togglePause(); break;
    }
  });
  document.addEventListener("keyup",e=>{ if(e.key==="ArrowDown") model.setSoftDrop(false); });

  // ---------- 防止移动端缩放 ----------
  document.addEventListener("gesturestart", e=>e.preventDefault());
  document.addEventListener("gesturechange", e=>e.preventDefault());
  document.addEventListener("touchstart", e=>{ if(e.touches.length>1) e.preventDefault(); }, {passive:false});
  let lastTouchEnd=0;
  document.addEventListener("touchend", e=>{
    const t=e.target;
    if(t===cv || (t.closest && t.closest("button,a,input,.link,[data-track],[data-k],[data-id],[data-act],[data-tog]"))){
      lastTouchEnd=performance.now(); return; }
    const now=performance.now();
    if(now-lastTouchEnd<=350) e.preventDefault();
    lastTouchEnd=now; }, {passive:false});
  document.addEventListener("dblclick", e=>e.preventDefault());

  // ---------- 触摸操作 ----------
  let tS=null, lastHardT=0;
  cv.addEventListener("touchstart",e=>{ e.preventDefault(); if(e.touches.length>1){ tS=null; return; } ensureAudio();
    const t=e.touches[0]; tS={x:t.clientX,y:t.clientY,t:performance.now(),steps:0,axis:null,moved:false}; },{passive:false});
  cv.addEventListener("touchmove",e=>{ e.preventDefault();
    if(!tS||!(model.state==="playing"&&model.sub==="control")||e.touches.length>1){ return; }
    const t=e.touches[0], dx=t.clientX-tS.x, dy=t.clientY-tS.y, adx=Math.abs(dx), ady=Math.abs(dy), CELL=view.CELL;
    if(!tS.axis && (adx>CELL*0.4 || ady>CELL*0.4))
      tS.axis = (ady > adx*1.5) ? "v" : "h";
    if(tS.axis==="h"){
      const want=Math.round(dx/CELL);
      while(tS.steps<want){ model.move(1); tS.steps++; tS.moved=true; }
      while(tS.steps>want){ model.move(-1); tS.steps--; tS.moved=true; }
    } },{passive:false});
  cv.addEventListener("touchend",e=>{ e.preventDefault(); if(e.touches.length>0){ tS=null; return; } if(!tS)return;
    const t=e.changedTouches[0], dx=t.clientX-tS.x, dy=t.clientY-tS.y, now=performance.now(), CELL=view.CELL;
    if(tS.axis==="v" || (tS.axis!=="h" && dy>CELL*0.5 && dy>Math.abs(dx)*1.2)){
      if(now-lastHardT>220){ lastHardT=now; model.hardDrop(); }
    } else if(!tS.moved) model.rotate();
    tS=null; },{passive:false});
  cv.addEventListener("touchcancel",()=>{ tS=null; },{passive:false});

  // ---------- 设置 / 暂停按钮 ----------
  $("gearBtn").addEventListener("click", ui.openSettings);
  $("pauseBtn").addEventListener("click", togglePause);

  // ---------- 启动 ----------
  $("foot").textContent = isMobile
    ? "轻点=旋转 · 左右拖=移动 · 向下滑=落地"
    : "← → 移动 · ↑ 旋转 · ↓ 加速 · 空格 速降 · P 暂停";
  view.hud.syncCoins();
  try{ if(!localStorage.getItem("plox_started")){ localStorage.setItem("plox_started","1");
    getCoins(); if(getItem("bomb")===0 && getItem("bombBig")===0) addItem("bomb",1); } }catch(e){}
  if(ui.isIOS && !ui.isStandalone && !localStorage.getItem("plox_a2hs")){
    setTimeout(()=>{ ui.showA2HS(); try{ localStorage.setItem("plox_a2hs","1"); }catch(e){} }, 1000);
  }
  if(/[?&]a2hs=1/.test(location.search)) setTimeout(ui.showA2HS, 300);
  const seenRules=(()=>{ try{ return !!localStorage.getItem("plox_seen_rules"); }catch(e){ return true; } })();
  view.resize(); if(seenRules) ui.showMenu(); else ui.showRules(true); requestAnimationFrame(loop);

  // ---------- 调试钩子(仅 ?debug=1)----------
  if(/[?&]debug=1/.test(location.search)){
    window.__plox={
      stats:()=>({ filled: model.board.reduce((a,row)=>a+row.filter(x=>x!=null).length,0),
        perCol: Array.from({length:COLS},(_,c)=>{let n=0;for(let r=0;r<ROWS;r++)if(model.board[r][c]!=null)n++;return n;}),
        pieceUntilJunk:model.pieceUntilJunk, junkMin:model.junkMin, junkMax:model.junkMax, sub:model.sub, state:model.state, diffKey:model.diffKey, mode:model.mode,
        stage:model.level, goal:stageGoal(model.level), prog:model.cleared-model.stageStart, cleared:model.cleared }),
      forceJunk:()=>model.dropJunk(),
      junk:()=>model.fallingJunk.map(g=>({c:g.c,y:Math.round(g.y*100)/100,off:g.cells.map(cl=>cl.dc+","+cl.dr)})),
      falling:()=>model.fallingJunk.map(j=>({c:j.c,y:Math.round(j.y*100)/100})),
      tick:(ms)=>model.updateAnim(ms||16),
      frame:(ms)=>{ const dt=ms||16; if(model.state==="playing"){ if(model.sub==="control") model.dropTick(dt); else if(model.sub==="resolving") model.resolveTick(dt); } model.updateAnim(dt); },
      coins:()=>getCoins(), give:(n)=>{ addCoins(n||5); view.hud.syncCoins(); return getCoins(); },
      diamonds:()=>getDiamonds(), giveDia:(n)=>{ addDiamonds(n||50); return getDiamonds(); },
      grant:(id,n)=>{ addItem(id||"bomb",n||1); view.hud.renderItemBar(); return getItem(id||"bomb"); },
      bomb:(id)=>model.useBomb(id||"bomb"), inv:()=>ownedItems().map(id=>({id,n:getItem(id)}))
    };
  }

  // ---------- PWA ----------
  if("serviceWorker" in navigator && !/[?&]nosw=1/.test(location.search) && !IS_TEST){
    window.addEventListener("load",()=>{ navigator.serviceWorker.register("./sw.js").catch(()=>{}); });
  }
})();
