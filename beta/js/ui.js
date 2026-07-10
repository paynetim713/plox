// ---------- 界面层(View · DOM 覆盖屏)----------
// 从 main.js 抽出:主菜单/玩法/商店/充值/排行榜/上传成绩/复活/结算 各覆盖屏,以及设置抽屉、全屏与「添加到主屏幕」引导。
// 只负责渲染 DOM 与绑定点击;游戏流程(开始/复活)通过注入的 ctrl 回调交回控制器。逻辑与原 main.js 内联实现一致。
import { DIFFS } from "./config.js";
import { getCoins, addCoins, spendCoins, getDiamonds, addDiamonds, spendDiamonds, DIAMOND_TO_COIN } from "./economy.js";
import { ITEMS, ITEM_LIST, getItem, addItem } from "./items.js";
import { purchase, showRewardedAd } from "./platform.js";

export function createUI({ overlay, $, model, view, audio, lb, ctrl, isMobile }){
  const { beep }=audio;
  const { NAME_KEY, DIFF_KEYS, getLB, escapeHtml, fetchGlobal, submitGlobal, lbTable }=lb;
  const nfmt = n => (+n||0).toLocaleString();

  const ICON = {
    play:'<svg class="ic" viewBox="0 0 24 24" aria-hidden="true"><path d="M8 5 L20 12 L8 19 Z" fill="currentColor"/></svg>',
    cart:'<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2 3 h3 l2.4 12 h11 l2.2 -8.5 H6.4"/><circle cx="9" cy="20" r="1.5"/><circle cx="18" cy="20" r="1.5"/></svg>',
    trophy:'<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M7 3 h10 v5 a5 5 0 0 1 -10 0 z"/><path d="M7 4 H4 a2.5 2.5 0 0 0 3 4.2"/><path d="M17 4 h3 a2.5 2.5 0 0 1 -3 4.2"/><path d="M12 13 v3 M8.5 20 h7 M9.5 20 l.7 -4 M14.5 20 l-.7 -4"/></svg>',
    star:'<svg class="starIc" viewBox="0 0 24 24" aria-hidden="true"><path d="M12 3 l2.6 5.3 5.8 .85 -4.2 4.1 1 5.75 -5.2 -2.73 -5.2 2.73 1 -5.75 -4.2 -4.1 5.8 -.85 z" fill="currentColor"/></svg>',
    gem:'<div class="gemMark"><i class="g gMag"></i><i class="g gCya"></i><i class="g gGrn"></i><i class="g gPur"></i></div>',
  };
  const RULE_ICON = {
    tap:'<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" aria-hidden="true"><circle cx="12" cy="12" r="3.4" fill="currentColor" stroke="none"/><circle cx="12" cy="12" r="7.6" opacity=".45"/></svg>',
    move:'<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M9 8 L5 12 L9 16"/><path d="M15 8 L19 12 L15 16"/><path d="M5.5 12 H18.5"/></svg>',
    down:'<svg class="ic" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 4 V17"/><path d="M7 12.5 L12 17.5 L17 12.5"/></svg>',
  };
  const DIFF_INT = {easy:1, normal:2, hard:3};

  // ---------- 主菜单 ----------
  function diffCardHTML(k){
    const bars=[0,1,2].map(i=>'<i class="'+(i<DIFF_INT[k]?'on':'')+'"></i>').join('');
    return '<button class="diffCard'+(k===model.diffKey?' on':'')+'" data-k="'+k+'">'+
      '<div class="dcLabel">'+DIFFS[k].label+'</div>'+
      '<div class="dcSub">'+DIFFS[k].sub+'</div>'+
      '<div class="dcBars">'+bars+'</div>'+
      '<div class="dcBest">最高 '+nfmt(model.getBest(k))+'</div></button>';
  }
  // 主菜单:只做导航入口(难度/模式下沉到子页)
  function showMenu(){
    model.setState("start"); model.refreshHigh();
    overlay.innerHTML =
      '<div class="menu">'+
        '<div class="menuAmb"><i></i><i></i><i></i><i></i></div>'+
        '<div class="menuHero">'+ICON.gem+
          '<div class="logo">PLOX</div><div class="logoSub">霓 虹 消 除</div></div>'+
        '<div class="bestRibbon">'+ICON.star+'<span>历史最高</span><b id="bestVal">'+nfmt(model.getBest(model.diffKey))+'</b></div>'+
        '<button class="playBtn" id="playBtn">'+ICON.play+'<span>开始</span></button>'+
        '<div class="menuActions">'+
          '<button class="actBtn shop" id="shopLink">'+ICON.cart+'<span>商店</span></button>'+
          '<button class="actBtn lb" id="lbLink">'+ICON.trophy+'<span>排行榜</span></button>'+
        '</div>'+
        '<div class="menuHelp" id="rulesLink">玩法说明</div>'+
      '</div>';
    overlay.classList.remove("hidden");
    view.hud.syncCoins();
    $("playBtn").addEventListener("click", ()=>showModeSelect());
    $("shopLink").addEventListener("click", ()=>showShop());
    $("lbLink").addEventListener("click", ()=>showLeaderboard());
    $("rulesLink").addEventListener("click", ()=>showRules(false));
  }

  // 向导第 1 步:选模式(无尽 / 闯关)。用 state="menu" 防止空格键跳过向导
  function showModeSelect(){
    model.setState("menu");
    const card=(m,label,desc)=>{ const on=model.mode===m;
      return '<button class="modeCard" data-mode="'+m+'" style="display:block;width:100%;max-width:340px;margin:0 auto 12px;padding:16px 18px;border-radius:16px;cursor:pointer;text-align:left;border:1.5px solid '+(on?'#ffd86a':'rgba(255,255,255,.14)')+';background:'+(on?'rgba(255,216,106,.14)':'rgba(255,255,255,.05)')+';color:'+(on?'#ffd86a':'#e7defc')+'">'+
        '<div style="font-size:19px;font-weight:800">'+label+'</div>'+
        '<div style="font-size:12px;font-weight:600;opacity:.7;margin-top:4px">'+desc+'</div></button>'; };
    overlay.innerHTML=
      '<div class="ovr">'+
        '<h1 class="ovTitle">选择模式</h1>'+
        card("endless","无尽","顶到底结束 · 冲高分上榜")+
        card("campaign","闯关","一关一目标 · 逐关解锁 · 可重试")+
        '<div class="link" id="modeBack">返回</div>'+
      '</div>';
    overlay.classList.remove("hidden");
    [...overlay.querySelectorAll(".modeCard")].forEach(b=>b.addEventListener("click",()=>{ model.setMode(b.dataset.mode); showDiffSelect(); }));
    $("modeBack").addEventListener("click", showMenu);
  }

  // 向导第 2 步:选难度(点卡即选即进)。无尽→直接开局;闯关→选关页
  function showDiffSelect(){
    model.setState("menu");
    overlay.innerHTML=
      '<div class="ovr">'+
        '<h1 class="ovTitle">选择难度</h1>'+
        '<div class="ovHint">'+(model.mode==="campaign"?"闯关":"无尽")+' · 点难度直接开始</div>'+
        '<div class="diffCards">'+diffCardHTML("easy")+diffCardHTML("normal")+diffCardHTML("hard")+'</div>'+
        '<div class="link" id="diffBack">返回</div>'+
      '</div>';
    overlay.classList.remove("hidden");
    [...overlay.querySelectorAll(".diffCard")].forEach(b=>b.addEventListener("click",()=>{
      model.setDiffKey(b.dataset.k); model.refreshHigh();
      if(model.mode==="campaign") showLevelSelect(); else ctrl.start();
    }));
    $("diffBack").addEventListener("click", showModeSelect);
  }

  // 向导第 3 步(仅闯关):选关卡。已解锁亮色可点、当前关高亮、未解锁暗灰不可点
  function showLevelSelect(onBack){
    model.setState("menu");
    const diff=model.diffKey, unlocked=Math.max(1, model.getCampaignMax(diff));
    const total=Math.max(10, Math.ceil((unlocked+2)/5)*5);   // 显示到解锁上限 + 前瞻几关(锁着)
    let cells="";
    for(let lv=1; lv<=total; lv++){
      const locked=lv>unlocked, cur=lv===unlocked;
      const border=cur?'#ffd86a':(locked?'rgba(255,255,255,.06)':'rgba(255,255,255,.16)');
      const bg=cur?'rgba(255,216,106,.18)':(locked?'rgba(255,255,255,.03)':'rgba(255,255,255,.06)');
      const col=locked?'#5a5570':(cur?'#ffd86a':'#e7defc');
      cells+='<button class="lvCell'+(locked?' locked':'')+'"'+(locked?' disabled':'')+' data-lv="'+lv+'" '+
        'style="aspect-ratio:1;border-radius:12px;font-weight:800;font-size:16px;cursor:'+(locked?'default':'pointer')+
        ';border:1.5px solid '+border+';background:'+bg+';color:'+col+'">'+lv+'</button>';
    }
    overlay.innerHTML=
      '<div class="ovr">'+
        '<h1 class="ovTitle">选择关卡</h1>'+
        '<div class="ovHint">'+DIFFS[diff].label+' · 已解锁到第 '+unlocked+' 关</div>'+
        '<div class="lvGrid" style="display:grid;grid-template-columns:repeat(5,1fr);gap:8px;max-height:46vh;overflow-y:auto;padding:2px;margin:6px 0 12px">'+cells+'</div>'+
        '<div class="link" id="lsBack">返回</div>'+
      '</div>';
    overlay.classList.remove("hidden");
    [...overlay.querySelectorAll(".lvCell:not(.locked)")].forEach(b=>b.addEventListener("click",()=>ctrl.start(+b.dataset.lv)));
    $("lsBack").addEventListener("click", onBack || showDiffSelect);
  }

  // ---------- 玩法说明 ----------
  const ruleRow=(ic,t,d)=>'<div class="ruleRow"><div class="ri">'+ic+'</div><div class="rt"><b>'+t+'</b><span>'+d+'</span></div></div>';
  function showRules(first){
    model.setState("start");
    try{ localStorage.setItem("plox_seen_rules","1"); }catch(e){}
    overlay.innerHTML=
      '<div class="rules">'+
        '<h1 class="ovTitle">玩法</h1>'+
        '<div class="ruleList">'+
          ruleRow(RULE_ICON.tap,"轻点","切换当前方块的 3 个颜色")+
          ruleRow(RULE_ICON.move,"左右拖","左右移动方块(逐格,贴手)")+
          ruleRow(RULE_ICON.down,"向下滑","直接落到落点预览的位置")+
        '</div>'+
        '<div class="ruleNotes">'+
          '<p>同色连成 <b>3+</b>(横/竖/斜)即消除,连锁得分更高</p>'+
          '<p><span class="warn">橙红闪烁</span>的是<b>干扰块</b>,随机从顶部砸下、不可操作 —— 难度越高砸得越勤</p>'+
          '<p>消够目标 <b>过关</b>:提速、奖励金币;爆顶可<b>金币复活</b>(炸开下方继续)</p>'+
          '<p>金币去<b>商店</b>买<b>炸弹</b>,局内点一下炸掉下方几行</p>'+
        '</div>'+
        '<button class="play" id="rulesOk"><span>'+(first?'开始吧':'知道了')+'</span></button>'+
      '</div>';
    overlay.classList.remove("hidden");
    $("rulesOk").addEventListener("click", showMenu);
  }

  // ---------- 商店 ----------
  function showShop(back){
    model.setState("start");
    const rows = ITEM_LIST.map(id=>{
      const it=ITEMS[id], own=getItem(id);
      return '<div class="shopRow"><div class="ic">'+view.bombIcon(it)+'</div>'+
        '<div class="meta"><div class="nm">'+it.name+'</div><div class="ds">'+it.desc+'</div>'+
        '<div class="own">已拥有 '+own+'</div></div>'+
        '<button class="buyBtn" data-id="'+id+'"><i class="coin"></i>'+it.cost+'</button></div>';
    }).join("");
    overlay.innerHTML =
      '<h1 class="ovTitle">商店</h1>'+
      '<div class="walletRow"><span class="coins"><i class="coin"></i>'+nfmt(getCoins())+'</span>'+
        '<button class="topupBtn" id="topupBtn"><i class="dia"></i>充值</button></div>'+
      '<div class="shopList">'+rows+'</div>'+
      '<p class="shopTip">每 5 关送 1 金币 · 局内点道具炸开下方;不够就充值</p>'+
      '<div class="link" id="shopBack">返回</div>';
    overlay.classList.remove("hidden");
    [...overlay.querySelectorAll(".buyBtn")].forEach(b=>{
      const it=ITEMS[b.dataset.id];
      if(getCoins() < it.cost) b.disabled=true;
      b.addEventListener("click", ()=>{
        if(spendCoins(it.cost)){ addItem(it.id,1); beep(880,.08,"triangle",.08); beep(1320,.07,"sine",.05);
          view.hud.syncCoins(); view.hud.renderItemBar(); showShop(back); }
      });
    });
    $("topupBtn").addEventListener("click", ()=>showRecharge(back));
    $("shopBack").addEventListener("click", ()=> back==="settle" ? showSettle() : showMenu());
  }

  // ---------- 充值 ----------
  const RECHARGE_PACKS=[
    {id:"d10",  rmb:1,   dia:10},
    {id:"d60",  rmb:6,   dia:60,   bonus:6},
    {id:"d300", rmb:30,  dia:300,  bonus:40},
    {id:"d680", rmb:68,  dia:680,  bonus:120},
    {id:"d1280",rmb:128, dia:1280, bonus:300},
  ];
  let purchasing=false;
  function showRecharge(back){
    model.setState("start");
    const packs=RECHARGE_PACKS.map(p=>{
      const total=p.dia+(p.bonus||0);
      return '<button class="diaPack" data-id="'+p.id+'">'+
        '<div class="dpTop"><i class="dia big"></i><b>'+total+'</b>'+(p.bonus?'<span class="dpBonus">含赠 '+p.bonus+'</span>':'')+'</div>'+
        '<div class="dpPrice">¥'+p.rmb+'</div></button>';
    }).join("");
    overlay.innerHTML=
      '<div class="ovr">'+
        '<h1 class="ovTitle">充值</h1>'+
        '<div class="walletRow"><span class="coins"><i class="coin"></i>'+nfmt(getCoins())+'</span>'+
          '<span class="coins dia-chip"><i class="dia"></i>'+nfmt(getDiamonds())+'</span></div>'+
        '<div class="diaPacks">'+packs+'</div>'+
        '<div class="exchangeRow">'+
          '<div class="exLabel"><i class="dia"></i>10 钻石 <span>→</span> <i class="coin"></i>100 金币</div>'+
          '<button class="actBtn2" id="exBtn"'+(getDiamonds()<10?' disabled':'')+'>兑换</button>'+
        '</div>'+
        '<div class="link" id="rcBack">返回</div>';
    overlay.classList.remove("hidden");
    [...overlay.querySelectorAll(".diaPack")].forEach(b=>{
      b.addEventListener("click", ()=>{
        if(purchasing) return; purchasing=true;
        const p=RECHARGE_PACKS.find(x=>x.id===b.dataset.id);
        b.classList.add("buying"); b.querySelector(".dpPrice").textContent="支付中…";
        purchase(p, ()=>{ addDiamonds(p.dia+(p.bonus||0)); purchasing=false; beep(880,.1,"triangle",.09); beep(1320,.08,"sine",.05); if($("rcBack")) showRecharge(back); },
                    ()=>{ purchasing=false; if($("rcBack")) showRecharge(back); });
      });
    });
    $("exBtn").addEventListener("click", ()=>{
      if(spendDiamonds(10)){ addCoins(10*DIAMOND_TO_COIN); view.hud.syncCoins(); beep(700,.07,"triangle",.07); showRecharge(back); }
    });
    $("rcBack").addEventListener("click", ()=> back==="revive" ? showReviveOffer() : showShop(back));
  }

  // ---------- 排行榜 ----------
  let lbCache=null, lbReturn="menu";   // 记住排行榜从哪进来的("menu"|"settle"),返回时回对页
  function showLeaderboard(diff, hiName, hiScore, from){
    lbReturn = from || "menu";
    model.setState("menu"); audio.stopMusic();
    const d=DIFF_KEYS.includes(diff)?diff:model.diffKey;
    const hi=hiName || (localStorage.getItem(NAME_KEY)||"");
    overlay.innerHTML='<h1>排行榜</h1><p style="font-size:12px;color:var(--dim)">加载全球榜…</p>';
    overlay.classList.remove("hidden");
    fetchGlobal().then(g=>{ if(model.state!=="menu") return; lbCache=g; renderLb(d,hi,hiScore); });
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
    $("lbBack").addEventListener("click", ()=> lbReturn==="settle" ? showSettle() : showMenu());
  }
  function showNameEntry(){
    model.setState("menu"); audio.stopMusic();
    const snapScore=model.score, snapDiff=model.diffKey;
    const last=localStorage.getItem(NAME_KEY)||"YOU";
    overlay.innerHTML='<h1>上传成绩</h1>'+
      '<p class="big">得分 <b style="color:#fff">'+model.score+'</b> · 登上全球榜</p>'+
      '<input class="nameIn" id="nameIn" maxlength="8" value="'+escapeHtml(last)+'" autocomplete="off" />'+
      '<button class="play" id="nameOk">保存并上传</button>'+
      '<div class="link" id="nameCancel">取消,返回结算</div>';
    overlay.classList.remove("hidden");
    const inp=$("nameIn"); setTimeout(()=>{ inp.focus(); inp.select(); },40);
    $("nameCancel").addEventListener("click", showSettle);
    let submitting=false;
    const submit=async()=>{
      if(submitting) return; submitting=true;
      const raw=(inp.value.trim()||"YOU"); const nm=raw.toUpperCase().slice(0,10);
      try{ localStorage.setItem(NAME_KEY,nm); }catch(e){}
      lb.addToLB(raw, {score:model.score, level:model.level, combo:model.maxCombo, diff:model.diffKey});
      overlay.innerHTML='<h1>上传中…</h1><p style="font-size:12px;color:var(--dim)">正在提交到全球排行榜</p>';
      await submitGlobal({name:nm, score:snapScore, diff:snapDiff});
      showLeaderboard(snapDiff, nm, snapScore, "settle");
    };
    $("nameOk").addEventListener("click", submit);
    inp.addEventListener("keydown", e=>{ if(e.key==="Enter"){ e.preventDefault(); submit(); } });
  }

  // ---------- 复活 ----------
  const MAX_REVIVES=3;
  const reviveCost=()=>5+model.revives*5;   // 5 / 10 / 15 金币
  function showReviveOffer(){
    if(model.revives>=MAX_REVIVES){ showSettle(); return; }
    const cost=reviveCost(), afford=getCoins()>=cost;
    overlay.innerHTML=
      '<div class="ovr">'+
        '<h1 class="ovTitle warn">差一点!</h1>'+
        '<div class="ovScore">本局 <b>'+nfmt(model.score)+'</b></div>'+
        '<div class="ovHint">看广告清 <b>12 行</b> · 金币清 <b>6 行</b>,继续冲分</div>'+
        '<div class="reviveBtns">'+
          '<button class="play reviveBtn radAd" id="reviveAd"><span>📺 看广告复活 · 清下方 12 行(免费)</span></button>'+
          '<button class="play reviveBtn rcoin'+(afford?'':' off')+'" id="reviveCoin"><i class="coin"></i><span>金币复活 · '+cost+'</span></button>'+
          (afford?'':'<button class="actBtn2 wide" id="reviveRecharge">金币不够,去充值</button>')+
        '</div>'+
        '<div class="link" id="giveUp">放弃,看结算</div>'+
      '</div>';
    overlay.classList.remove("hidden");
    $("reviveAd").addEventListener("click",()=>{ showRewardedAd(()=>ctrl.doRevive(12), ()=>{}); });
    $("reviveCoin").addEventListener("click",()=>{ if(getCoins()>=cost && spendCoins(cost)){ view.hud.syncCoins(); ctrl.doRevive(); } });
    if($("reviveRecharge")) $("reviveRecharge").addEventListener("click", ()=>showRecharge("revive"));
    $("giveUp").addEventListener("click", showSettle);
  }

  // ---------- 闯关失败(重试本关)----------
  function showLevelFail(){
    model.setState("gameover"); overlay.classList.remove("hidden"); view.hud.syncCoins();
    overlay.innerHTML=
      '<div class="ovr">'+
        '<h1 class="ovTitle warn">第 '+model.level+' 关 失败</h1>'+
        '<div class="ovScore">本关目标 <b>'+model.stageGoal(model.level)+'</b> · 就差一点</div>'+
        '<div class="ovHint">重试本关从空棋盘重来;看广告清下方 12 行接着打</div>'+
        '<div class="reviveBtns">'+
          '<button class="play reviveBtn" id="retryBtn"><span>重试本关</span></button>'+
          '<button class="play reviveBtn radAd" id="failAd"><span>📺 看广告复活 · 清 12 行</span></button>'+
        '</div>'+
        '<div class="link" id="failGiveUp">放弃,看结算</div>'+
      '</div>';
    overlay.classList.remove("hidden");
    $("retryBtn").addEventListener("click", ctrl.doRetry);
    $("failAd").addEventListener("click", ()=>{ showRewardedAd(()=>ctrl.doRevive(12), ()=>{}); });
    $("failGiveUp").addEventListener("click", showSettle);
  }

  // ---------- 结算 ----------
  const sc3=(k,v)=>'<div class="sc"><div class="sck">'+k+'</div><div class="scv">'+v+'</div></div>';
  function showSettle(){
    model.setState("gameover"); overlay.classList.remove("hidden");
    view.hud.syncCoins();
    overlay.innerHTML=
      '<div class="ovr">'+
        '<h1 class="ovTitle">结算</h1>'+
        '<div class="settleScore"><span>本局得分</span><b>'+nfmt(model.score)+'</b></div>'+
        '<div class="settleStats">'+sc3(model.mode==="endless"?"速度":"关卡",model.level)+sc3("消除",model.cleared)+sc3("最高连击","×"+model.maxCombo)+'</div>'+
        '<div class="settleMeta">历史最高 '+nfmt(model.high)+' · '+(model.mode==="endless"?"最高速度 ":"最高关卡 ")+model.getBestStage(model.diffKey)+'</div>'+
        '<button class="play" id="againBtn"><span>再来一局</span></button>'+
        '<div class="settleActions">'+
          (model.score>0?'<button class="actBtn2" id="uploadBtn">上传成绩</button>':'')+
          '<button class="actBtn2" id="shopBtn2">商店</button>'+
          '<button class="actBtn2" id="lbBtn2">排行榜</button>'+
        '</div>'+
        '<div class="link" id="toMenu">返回主菜单</div>'+
      '</div>';
    $("againBtn").addEventListener("click", ()=>ctrl.start(model.mode==="campaign"?model.level:undefined));   // 闯关再来一局回当前关
    if($("uploadBtn")) $("uploadBtn").addEventListener("click", ()=>showNameEntry());
    $("shopBtn2").addEventListener("click", ()=>showShop("settle"));
    $("lbBtn2").addEventListener("click", ()=>showLeaderboard(model.diffKey, undefined, undefined, "settle"));
    $("toMenu").addEventListener("click", showMenu);
  }

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

  // ---------- 设置抽屉 ----------
  let settingsResume=false;
  function fsRowHTML(){
    if(isStandalone) return '';
    if(isIOS || !fsSupported) return '<button class="srow" data-act="a2hs"><span>全屏 · 添加到主屏幕</span><span class="sw arrow">›</span></button>';
    return '<button class="srow" data-act="fs"><span>全屏</span><span class="sw arrow">›</span></button>';
  }
  function sheetHTML(){
    const sw=(on,label,k)=>'<button class="srow" data-tog="'+k+'"><span>'+label+'</span><span class="sw'+(on?' on':'')+'">'+(on?'开':'关')+'</span></button>';
    const tracks = audio.musicOn
      ? '<div class="trackSel">'+audio.TRACKS.map((t,i)=>'<b class="'+(i===audio.musicTrack?'on':'')+'" data-track="'+i+'">'+t.name+'</b>').join('')+'</div>'
      : '';
    return '<div class="scard">'+
      '<div class="sgrip"></div>'+
      '<h3>设置</h3>'+
      '<div class="sgroup">'+
        sw(view.ghostOn,'落点预览','ghost')+
        sw(audio.soundOn,'音效','sound')+
        sw(audio.musicOn,'背景音乐','music')+ tracks+
      '</div>'+
      '<div class="sgroup">'+
        '<button class="srow" data-act="rules"><span>玩法说明</span><span class="sw arrow">›</span></button>'+
        fsRowHTML()+
      '</div>'+
      (settingsResume?'<button class="sbtn" data-act="resume">继续游戏</button>':'')+
      '<button class="sbtn ghost" data-act="menu">回主菜单</button>'+
      '<button class="sbtn ghost" data-act="close">关闭</button>'+
    '</div>';
  }
  function renderSheet(){ const s=$("sheet"); if(s) s.innerHTML=sheetHTML(); }
  function openSettings(){
    settingsResume=(model.state==="playing");
    if(settingsResume){ model.setState("paused"); model.setSoftDrop(false); audio.stopMusic(); }
    let s=$("sheet");
    if(!s){ s=document.createElement("div"); s.id="sheet"; s.className="sheet";
      document.body.appendChild(s); s.addEventListener("click", onSheetClick); }
    renderSheet(); s.classList.remove("hidden");
  }
  function closeSettings(resume){
    const s=$("sheet"); if(s) s.classList.add("hidden");
    if(resume && settingsResume){ model.setState("playing"); audio.startMusic(); }
    settingsResume=false;
  }
  function onSheetClick(e){
    if(e.target===$("sheet")){ closeSettings(true); return; }
    const row=e.target.closest("[data-tog],[data-act],[data-track]"); if(!row) return;
    const tog=row.dataset.tog, act=row.dataset.act;
    if(row.dataset.track!=null){ audio.setMusicTrack(+row.dataset.track);
      if(model.state==="playing"||settingsResume){ audio.stopMusic(); audio.resetMusicStep(); if(!settingsResume) audio.startMusic(); }
      beep(700,.05,"triangle",.06); renderSheet(); return; }
    if(act==="rules"){ closeSettings(false); showRules(false); return; }
    if(tog==="ghost"){ view.ghostOn=!view.ghostOn; renderSheet(); }
    else if(tog==="music"){ audio.musicOn=!audio.musicOn; renderSheet(); }
    else if(tog==="sound"){ audio.soundOn=!audio.soundOn; if(audio.soundOn) beep(660,.08,"sine",.1); renderSheet(); }
    else if(act==="fs"){ toggleFullscreen(); }
    else if(act==="a2hs"){ closeSettings(false); showA2HS(); }
    else if(act==="resume"||act==="close"){ closeSettings(true); }
    else if(act==="menu"){ closeSettings(false); audio.stopMusic(); showMenu(); }
  }

  return {
    showMenu, showRules, showShop, showRecharge, showLeaderboard, showNameEntry,
    showReviveOffer, showLevelFail, showSettle, openSettings, showA2HS, isIOS, isStandalone,
  };
}
