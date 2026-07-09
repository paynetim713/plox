// ---------- 视图层(View)----------
// 从 main.js 抽出:Canvas 渲染 + 特效(粒子/连击词/过关横幅/震屏/顿帧)+ HUD(分数/金币/道具栏)。
// 只读 model 状态来画,不写游戏逻辑;逻辑侧的副作用通过 view.fx / view.hud 注入回 model。
// 逻辑与原 main.js 内联实现一致,仅按层拆分:model 通过 bind() 后期注入,shakeT/freezeT/ghostOn 对外暴露供控制器读写。
import { COLS, ROWS, COLORS, PRAISE, PRAISE_COL, CLEAR_MS, ROT_MS, stageGoal } from "./config.js";
import { getCoins } from "./economy.js";
import { ITEMS, getItem, ownedItems } from "./items.js";

export function createView({ cv, ctx, nextCv, nctx, isMobile, audio, dom }){
  const { elScore, elHigh, elLevel, elCleared, elMaxCombo, elCoinNum, elItembar }=dom;
  const beep=(f,d,t,v)=>audio.beep(f,d,t,v);

  let model=null;                       // bind() 后填入
  let CELL=44, dpr=1;
  const particles=[], popups=[];
  let banner=null, shakeT=0, freezeT=0, ghostOn=true;
  let gradCache=[], bgGrad=null;

  // ---------- HUD ----------
  function syncCoins(){ if(elCoinNum) elCoinNum.textContent=getCoins(); }
  function syncHUD(){ elScore.textContent=model.score; elLevel.textContent=model.level; elCleared.textContent=model.cleared; elMaxCombo.textContent="×"+model.maxCombo; }
  function bombSvg(rows, tone){
    const big = tone==="hot";
    let bars=""; const n=rows, bw= big?18:15, x=(24-bw)/2, gap=2.5, h=1.9, y0=23-n*gap;
    for(let i=0;i<n;i++){ const y=(y0+i*gap).toFixed(2);
      bars+='<rect x="'+x.toFixed(1)+'" y="'+y+'" width="'+bw+'" height="'+h+'" rx="0.9" fill="currentColor" opacity="'+(0.55+0.13*i).toFixed(2)+'"/>'; }
    const r= big?5.4:4.1, cy= big?6.3:6.9;
    const spark = big
      ? '<g stroke="#ff9a3c" stroke-width="1.1" stroke-linecap="round"><path d="M17.6 2.4 l1.9 -1.5"/><path d="M18.7 3.6 l2.2 -.2"/><path d="M16.8 1.2 l.5 -2"/></g><circle cx="17.9" cy="2.9" r="1.5" fill="#ffd86a"/>'
      : '<path d="M14.4 3.2 q1.6 -1 2.7 .5" stroke="#ff9a3c" stroke-width="1.2" fill="none" stroke-linecap="round"/><circle cx="17.2" cy="3.1" r="1.1" fill="#ffd86a"/>';
    return '<svg class="bicon'+(big?' big':'')+'" viewBox="0 0 24 24" aria-hidden="true">'+bars+
      '<circle cx="12" cy="'+cy+'" r="'+r+'" fill="#23232f"/>'+
      '<circle cx="'+(12-r*0.36).toFixed(1)+'" cy="'+(cy-r*0.36).toFixed(1)+'" r="'+(r*0.32).toFixed(1)+'" fill="rgba(255,255,255,.24)"/>'+
      spark+'</svg>';
  }
  const bombIcon=it=>'<span class="bw bw-'+(it.tone||"cool")+'">'+bombSvg(it.rows, it.tone)+'</span>';
  function renderItemBar(){
    if(!elItembar) return;
    const owned=ownedItems();
    elItembar.innerHTML = owned.map(id=>{
      const it=ITEMS[id];
      return '<button class="itembtn" data-id="'+id+'" title="'+it.desc+'">'+bombIcon(it)+'<span class="n">×'+getItem(id)+'</span></button>';
    }).join("");
    [...elItembar.querySelectorAll(".itembtn")].forEach(b=>{
      b.addEventListener("click", e=>{ e.stopPropagation(); if(model) model.useBomb(b.dataset.id); });
    });
    resize();
  }

  // ---------- 尺寸自适应 ----------
  function resize(){
    let availW, availH;
    if(isMobile){
      const stage=document.querySelector(".stage");
      const stageTop=stage.getBoundingClientRect().top;
      const padBottom=parseFloat(getComputedStyle(document.body).paddingBottom)||8;
      const footEl=document.getElementById("foot");
      const footH=footEl?footEl.getBoundingClientRect().height:16;
      const ibEl=document.getElementById("itembar");
      const ibH=(ibEl && getComputedStyle(ibEl).display!=="none" && ibEl.children.length) ? ibEl.getBoundingClientRect().height+8 : 0;
      availW = Math.min(window.innerWidth - 12, 560);
      availH = window.innerHeight - stageTop - padBottom - footH - ibH - 12;
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
    rebuildGradients();
    if(model){ if(model.next && !isMobile) drawNext(); render(); }
  }
  function rebuildGradients(){
    const p0=Math.max(2,CELL*0.06), H0=(CELL-p0*2)/2;
    gradCache=COLORS.map(col=>{ const gr=ctx.createLinearGradient(0,-H0,0,H0);
      gr.addColorStop(0,col.top); gr.addColorStop(.52,col.fill); gr.addColorStop(1,col.dark); return gr; });
    bgGrad=ctx.createLinearGradient(0,0,0,ROWS*CELL);
    bgGrad.addColorStop(0,"#120428"); bgGrad.addColorStop(1,"#070114");
  }

  // ---------- 特效 spawn ----------
  function spawnParticles(c,r,idx,n){
    const col=COLORS[idx]||COLORS[0];
    const cx=(c+0.5)*CELL, cy=(r+0.5)*CELL; n=n||11;
    for(let i=0;i<n;i++){
      const a=Math.random()*Math.PI*2, sp=CELL*(0.05+Math.random()*0.17), spark=i%4===0;
      particles.push({x:cx,y:cy,vx:Math.cos(a)*sp,vy:Math.sin(a)*sp-CELL*0.03,
        life:1, decay:0.022+Math.random()*0.012,
        size:CELL*(spark?0.08+Math.random()*0.06:0.13+Math.random()*0.18),
        color: spark?"#ffffff":col.glow});
    }
  }
  function spawnPopup(gained, cb){
    const tier=Math.min(cb-1, PRAISE.length-1);
    let q=popups[0];
    if(!q || cb===1){ q={x:COLS*CELL/2, y:ROWS*CELL*0.34, life:1, age:0, tier:-1, total:0, combo:1}; popups.length=0; popups.push(q); }
    q.total+=gained; q.combo=cb; q.life=1;
    if(tier>q.tier){ q.tier=tier; q.age=0; }
    q.word=PRAISE[q.tier]; q.col=PRAISE_COL[q.tier]; q.sub="+"+q.total;
  }
  function spawnStageBanner(stage, reward){
    banner={ age:0, life:1.9, stage:stage, reward:reward||0 };
    beep(620,.16,"triangle",.1); beep(930,.14,"sine",.07); beep(1240,.12,"sine",.05);
    shakeT=Math.min(220,170); freezeT=Math.min(95,72);
    syncHUD();
  }
  function fxUpdate(dt){
    const k=dt/16.7;
    for(let i=particles.length-1;i>=0;i--){ const p=particles[i];
      p.x+=p.vx*k; p.y+=p.vy*k; p.vy+=CELL*0.016*k; p.life-=(p.decay||0.03)*k;
      if(p.life<=0) particles.splice(i,1); }
    for(let i=popups.length-1;i>=0;i--){ const q=popups[i];
      q.age+=dt; q.life-=0.018*k; if(q.life<0.55) q.y-=CELL*0.04*k;
      if(q.life<=0) popups.splice(i,1); }
    if(banner){ banner.age+=dt; banner.life-=dt/1000; if(banner.life<=0) banner=null; }
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
    g.translate(cx,cy); if(sc!==1) g.scale(sc,sc);
    if(opt.ghost){
      g.fillStyle=col.gfill; rr(g,-h,-h,s0,s0,rad); g.fill();
      g.strokeStyle=col.gedge; g.lineWidth=Math.max(1.5,cell*0.045);
      rr(g,-h,-h,s0,s0,rad); g.stroke(); g.restore(); return; }
    const a=(opt.alpha!=null)?opt.alpha:1;
    let grad;
    if(g===ctx && cell===CELL){ grad=gradCache[idx]; }
    else { grad=g.createLinearGradient(0,-h,0,h);
      grad.addColorStop(0,col.top); grad.addColorStop(.52,col.fill); grad.addColorStop(1,col.dark); }
    g.globalAlpha=a; g.fillStyle=grad; rr(g,-h,-h,s0,s0,rad); g.fill();
    g.globalAlpha=a*0.5; g.fillStyle=col.glow;
    rr(g, -h+s0*0.13, -h+s0*0.09, s0*0.74, s0*0.2, rad*0.6); g.fill();
    g.globalAlpha=a; g.strokeStyle=col.edge; g.lineWidth=Math.max(1,cell*0.035);
    rr(g,-h,-h,s0,s0,rad); g.stroke();
    if(opt.junk){
      g.globalAlpha=a*0.34; g.fillStyle="#2a0606"; rr(g,-h,-h,s0,s0,rad); g.fill();
      g.globalAlpha=a; g.strokeStyle="#ff5a3c"; g.lineWidth=Math.max(1.6,cell*0.07);
      g.setLineDash([cell*0.17,cell*0.1]); rr(g,-h,-h,s0,s0,rad); g.stroke(); g.setLineDash([]);
    }
    if(opt.active){
      const pv=g.globalCompositeOperation; g.globalCompositeOperation="lighter";
      g.globalAlpha=0.55; g.strokeStyle=col.glow; g.lineWidth=Math.max(1.5,cell*0.06);
      rr(g,-h,-h,s0,s0,rad); g.stroke(); g.globalCompositeOperation=pv;
    }
    g.restore();
  }

  function render(){
    if(!model) return;
    const board=model.board, voff=model.voff, vscale=model.vscale, current=model.current, next=model.next,
          clearing=model.clearing, clearTimer=model.clearTimer, fallingJunk=model.fallingJunk, junkWarn=model.junkWarn,
          visRow=model.visRow, visCol=model.visCol, rotT=model.rotT, sub=model.sub, state=model.state,
          level=model.level, cleared=model.cleared, stageStart=model.stageStart;
    let ox=0,oy=0;
    if(shakeT>0){ const m=Math.min(8, shakeT/22); ox=(Math.random()*2-1)*m; oy=(Math.random()*2-1)*m; }
    ctx.save(); ctx.clearRect(0,0,cv.width,cv.height); ctx.translate(ox,oy);
    ctx.fillStyle=bgGrad||"#0a0118"; ctx.fillRect(-9,-9,COLS*CELL+18,ROWS*CELL+18);
    ctx.strokeStyle="rgba(150,90,255,.10)"; ctx.lineWidth=1;
    for(let c=0;c<=COLS;c++){ ctx.beginPath(); ctx.moveTo(c*CELL,0); ctx.lineTo(c*CELL,ROWS*CELL); ctx.stroke(); }
    for(let r=0;r<=ROWS;r++){ ctx.beginPath(); ctx.moveTo(0,r*CELL); ctx.lineTo(COLS*CELL,r*CELL); ctx.stroke(); }

    for(let r=0;r<ROWS;r++) for(let c=0;c<COLS;c++) if(board[r][c]!=null){
      const key=r+","+c, ry=r+voff[r][c];
      if(clearing&&clearing.has(key)){
        const t=Math.max(0,Math.min(1,1-clearTimer/CLEAR_MS));
        drawBlock(ctx,c,ry,board[r][c],{glow:1.6, alpha:1-t*0.7, scale:1+0.16*Math.sin(t*Math.PI)});
        ctx.save(); ctx.globalAlpha=(1-t)*0.5; ctx.fillStyle="#fff";
        const p=Math.max(2,CELL*0.07); rr(ctx,c*CELL+p,ry*CELL+p,CELL-p*2,CELL-p*2,CELL*0.18); ctx.fill(); ctx.restore();
      } else drawBlock(ctx,c,ry,board[r][c],{scale:vscale[r][c]});
    }

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

    for(const w of junkWarn){ const ph=0.5+0.5*Math.sin(w.t*0.02), x=w.c*CELL;
      ctx.save(); ctx.globalAlpha=0.3+0.5*ph; ctx.fillStyle="#ff5a3c";
      ctx.fillRect(x+2, 0, CELL-4, Math.max(3,CELL*0.09));
      ctx.beginPath(); ctx.moveTo(x+CELL*0.36,CELL*0.16); ctx.lineTo(x+CELL*0.64,CELL*0.16); ctx.lineTo(x+CELL*0.5,CELL*0.30); ctx.closePath(); ctx.fill();
      ctx.restore(); }
    for(const j of fallingJunk){ if(j.y>-1) drawBlock(ctx, j.c, j.y, j.idx, {junk:true}); }

    if(state==="playing"&&current&&sub==="control"){
      const n=current.colors.length;
      if(ghostOn){ const gr=model.ghostRow(); for(let i=0;i<n;i++){ const r=gr+i; if(r>=0 && r>visRow+n-1) drawBlock(ctx,current.col,r,current.colors[i],{ghost:true}); } }
      if(rotT>0){
        const t=1-rotT/ROT_MS, pop=1+0.15*Math.sin(t*Math.PI);
        const cx=(visCol+0.5)*CELL, cyc=(visRow+n/2)*CELL;
        ctx.save(); ctx.translate(cx,cyc); ctx.scale(pop,pop); ctx.translate(-cx,-cyc);
        for(let i=0;i<n;i++) drawBlock(ctx,visCol,visRow+i,current.colors[i],{active:true});
        ctx.restore();
      } else {
        for(let i=0;i<n;i++) drawBlock(ctx,visCol,visRow+i,current.colors[i],{active:true});
      }
    }

    ctx.save(); ctx.globalCompositeOperation="lighter";
    for(const p of particles){ ctx.globalAlpha=Math.max(0,p.life)*0.85;
      ctx.fillStyle=p.color; ctx.beginPath(); ctx.arc(p.x,p.y,p.size*Math.max(0,p.life),0,7); ctx.fill(); }
    ctx.restore();

    for(const q of popups){
      const a=Math.min(1,q.age/180), sc=0.35+0.65*easeOutBack(a);
      ctx.save(); ctx.globalAlpha=Math.max(0,q.life);
      ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.translate(q.x,q.y); ctx.scale(sc,sc);
      const fs=Math.round(CELL*(0.62+Math.max(0,q.tier)*0.09));
      if(q.combo>=2){ const cf=Math.round(CELL*0.36); ctx.font="900 "+cf+"px system-ui,sans-serif";
        ctx.lineWidth=Math.max(2,CELL*0.06); ctx.strokeStyle="rgba(8,2,20,.9)"; ctx.strokeText("×"+q.combo,0,-fs*0.74);
        ctx.fillStyle="#9be3ff"; ctx.fillText("×"+q.combo,0,-fs*0.74); }
      ctx.font="900 "+fs+"px system-ui,sans-serif";
      ctx.lineWidth=Math.max(3,CELL*0.1); ctx.strokeStyle="rgba(8,2,20,.92)"; ctx.strokeText(q.word,0,0);
      ctx.fillStyle=q.col; ctx.fillText(q.word,0,0);
      const subFs=Math.round(CELL*(0.36+Math.min(q.combo,6)*0.03)), subY=fs*0.78;
      ctx.font="800 "+subFs+"px system-ui,sans-serif";
      ctx.lineWidth=Math.max(2,CELL*0.07); ctx.strokeStyle="rgba(8,2,20,.92)"; ctx.strokeText(q.sub,0,subY);
      ctx.fillStyle="#fff"; ctx.fillText(q.sub,0,subY);
      ctx.restore(); }

    if(banner){
      const a=Math.min(1,banner.age/200), sc=0.4+0.6*easeOutBack(a), fade=Math.min(1,banner.life/0.45);
      ctx.save(); ctx.globalAlpha=Math.max(0,fade); ctx.textAlign="center"; ctx.textBaseline="middle";
      ctx.translate(COLS*CELL/2, ROWS*CELL*0.20); ctx.scale(sc,sc);
      const fs=Math.round(CELL*1.0);
      ctx.font="900 "+fs+"px system-ui,sans-serif";
      ctx.lineWidth=Math.max(4,CELL*0.13); ctx.strokeStyle="rgba(8,2,20,.95)"; ctx.strokeText("第 "+banner.stage+" 关",0,0);
      ctx.fillStyle="#ffd86a"; ctx.fillText("第 "+banner.stage+" 关",0,0);
      if(banner.reward){ const subFs=Math.round(CELL*0.46), subY=fs*0.76, txt="+"+banner.reward;
        ctx.font="800 "+subFs+"px system-ui,sans-serif";
        const tw=ctx.measureText(txt).width, r=subFs*0.5, gap=subFs*0.26, cx=-(r*2+gap+tw)/2+r;
        const grd=ctx.createRadialGradient(cx-r*0.3,subY-r*0.3,r*0.2,cx,subY,r);
        grd.addColorStop(0,"#fff0bf"); grd.addColorStop(.62,"#f3bd3c"); grd.addColorStop(1,"#d79420");
        ctx.beginPath(); ctx.arc(cx,subY,r,0,7); ctx.fillStyle=grd; ctx.fill();
        ctx.lineWidth=Math.max(1,r*0.16); ctx.strokeStyle="rgba(140,92,12,.75)"; ctx.stroke();
        ctx.textAlign="left"; const tx=cx+r+gap;
        ctx.lineWidth=Math.max(2,CELL*0.08); ctx.strokeStyle="rgba(8,2,20,.92)"; ctx.strokeText(txt,tx,subY);
        ctx.fillStyle="#ffe9a8"; ctx.fillText(txt,tx,subY); }
      ctx.restore();
    }

    if(state==="playing"||state==="paused"){
      const have=cleared-stageStart, need=stageGoal(level), prog=Math.max(0,Math.min(1,have/need));
      const bw=COLS*CELL, bh=Math.max(3,CELL*0.07);
      ctx.fillStyle="rgba(255,255,255,.10)"; ctx.fillRect(0,0,bw,bh);
      ctx.fillStyle="#ffd86a"; ctx.fillRect(0,0,bw*prog,bh);
      ctx.save(); ctx.textAlign="left"; ctx.textBaseline="top"; ctx.font="700 "+Math.max(9,Math.round(CELL*0.26))+"px system-ui,sans-serif";
      ctx.fillStyle="rgba(8,2,20,.55)"; ctx.fillText("关卡 "+level+" · "+have+"/"+need, 5, bh+4);
      ctx.fillStyle="#d9c8ff"; ctx.fillText("关卡 "+level+" · "+have+"/"+need, 4, bh+3); ctx.restore();
    }

    ctx.restore();
  }

  function drawNext(){
    if(!model) return;
    const next=model.next;
    const n=next.colors.length, cs=Math.round(CELL*0.62);
    nextCv.style.width=cs+"px"; nextCv.style.height=(cs*n)+"px";
    nextCv.width=cs*dpr; nextCv.height=cs*n*dpr;
    nctx.setTransform(dpr,0,0,dpr,0,0);
    nctx.clearRect(0,0,cs,cs*n);
    for(let i=0;i<n;i++) drawBlock(nctx,0,i,next.colors[i],{glow:1},cs);
  }

  return {
    bind(m){ model=m; },
    fx:{
      spawnParticles, spawnPopup, spawnStageBanner,
      shake:v=>{ shakeT=v; }, shakeMax:v=>{ shakeT=Math.max(shakeT,v); },
      freeze:v=>{ freezeT=v; }, freezeMax:v=>{ freezeT=Math.max(freezeT,v); },
      resetFx:()=>{ particles.length=0; popups.length=0; banner=null; shakeT=0; freezeT=0; },
    },
    hud:{ syncHUD, syncCoins, renderItemBar, setHigh:h=>{ elHigh.textContent=h; } },
    bombIcon, resize, render, drawNext, fxUpdate,
    get CELL(){ return CELL; },
    get ghostOn(){ return ghostOn; }, set ghostOn(v){ ghostOn=v; },
    get shakeT(){ return shakeT; }, set shakeT(v){ shakeT=v; },
    get freezeT(){ return freezeT; }, set freezeT(v){ freezeT=v; },
  };
}
