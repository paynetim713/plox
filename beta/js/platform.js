// ---------- 平台适配层 ----------
// 网页版用占位实现;移植到抖音小程序时「只替换这个文件」(激励视频广告 / 云存储 / 支付都收口在这里)。
// 约定:showRewardedAd(onReward, onFail) —— 看完广告 → onReward();失败/取消 → onFail()。
export const PLATFORM = "web";

// 广告是否就绪(抖音版改为检测激励视频实例是否 load 完成)
export function hasRewardedAd(){ return true; }

// 充值:购买钻石礼包。pack = {id, rmb, diamonds}。
// 网页版无真实支付,模拟"支付成功"直接发钻石,方便测试。抖音版替换为平台支付(tt 虚拟支付 / requestGamePayment)。
export function purchase(pack, onSuccess, onFail){
  try{
    // ===== 抖音小程序示例(移植时启用)=====
    // tt.requestGamePayment({ mode:'game', currencyType:'CNY', platform:'android', buyQuantity: pack.rmb*10, ...,
    //   success(){ onSuccess && onSuccess(pack); }, fail(){ onFail && onFail(); } });
    // return;
    // ===== 网页占位:模拟支付成功 =====
    setTimeout(() => { onSuccess && onSuccess(pack); }, 450);
  }catch(e){ onFail && onFail(); }
}

// 看激励视频换奖励。网页版无真实广告,给个极短"播放"占位后直接发放,方便测试整条复活链路。
export function showRewardedAd(onReward, onFail){
  try{
    // ===== 抖音小程序示例(移植时启用,删掉下面的网页占位)=====
    // const ad = tt.createRewardedVideoAd({ adUnitId: 'YOUR_AD_UNIT_ID' });
    // ad.onClose(res => { if(res && res.isEnded) onReward(); else onFail && onFail(); });
    // ad.onError(() => onFail && onFail());
    // ad.show().catch(() => ad.load().then(() => ad.show()).catch(() => onFail && onFail()));
    // return;
    // ===== 网页占位:可见的模拟激励视频(3s 倒计时 + 领取),便于测试整条复活链路 =====
    _playMockAd(onReward, onFail);
  }catch(e){ onFail && onFail(); }
}

// 网页版模拟广告:全屏"广告"+倒计时,看完可领奖;✕ 关闭=未看完=不发奖。抖音版删除本函数,用真实激励视频。
function _playMockAd(onReward, onFail){
  if(typeof document==="undefined"){ onReward && onReward(); return; }
  if(document.getElementById("mockAd")) return;
  const wrap=document.createElement("div"); wrap.id="mockAd";
  wrap.style.cssText="position:fixed;inset:0;z-index:99999;background:rgba(4,2,12,.94);display:flex;flex-direction:column;align-items:center;justify-content:center;color:#fff;font-family:system-ui,-apple-system,sans-serif";
  let secs=3, done=false;
  wrap.innerHTML=
    '<div id="mockAdClose" style="position:absolute;top:14px;right:18px;font-size:24px;line-height:1;color:#8a86a0;cursor:pointer">✕</div>'+
    '<div style="font-size:12px;letter-spacing:3px;color:#9b86c9;margin-bottom:16px">模拟激励视频广告</div>'+
    '<div style="width:min(78vw,320px);height:184px;border-radius:18px;background:linear-gradient(135deg,#5a86d8,#9b73d0);display:flex;align-items:center;justify-content:center;font-size:44px;font-weight:900;letter-spacing:2px;box-shadow:0 12px 44px rgba(120,90,255,.45)">AD</div>'+
    '<div id="mockAdTip" style="margin-top:20px;font-size:14px;color:#d9c8ff">广告播放中… <b id="mockAdSec">'+secs+'</b>s</div>'+
    '<button id="mockAdClaim" style="margin-top:16px;padding:12px 36px;border:0;border-radius:999px;background:#2c2c38;color:#7a7788;font-size:15px;font-weight:800;pointer-events:none">领取奖励</button>';
  document.body.appendChild(wrap);
  const finish=(reward)=>{ if(done) return; done=true; try{ wrap.remove(); }catch(e){} reward ? (onReward&&onReward()) : (onFail&&onFail()); };
  document.getElementById("mockAdClose").addEventListener("click", ()=>finish(false));
  const timer=setInterval(()=>{
    secs--; const s=document.getElementById("mockAdSec"); if(s) s.textContent=Math.max(0,secs);
    if(secs<=0){ clearInterval(timer);
      const tip=document.getElementById("mockAdTip"); if(tip) tip.textContent="观看完成 ✓";
      const btn=document.getElementById("mockAdClaim");
      if(btn){ btn.style.background="linear-gradient(180deg,#ffd86a,#f0a92e)"; btn.style.color="#3a2600"; btn.style.pointerEvents="auto"; btn.style.cursor="pointer"; btn.addEventListener("click",()=>finish(true)); }
    }
  }, 1000);
}
