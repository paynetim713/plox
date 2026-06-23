// ---------- 平台适配层 ----------
// 网页版用占位实现;移植到抖音小程序时「只替换这个文件」(激励视频广告 / 云存储 / 支付都收口在这里)。
// 约定:showRewardedAd(onReward, onFail) —— 看完广告 → onReward();失败/取消 → onFail()。
export const PLATFORM = "web";

// 广告是否就绪(抖音版改为检测激励视频实例是否 load 完成)
export function hasRewardedAd(){ return true; }

// 看激励视频换奖励。网页版无真实广告,给个极短"播放"占位后直接发放,方便测试整条复活链路。
export function showRewardedAd(onReward, onFail){
  try{
    // ===== 抖音小程序示例(移植时启用,删掉下面的网页占位)=====
    // const ad = tt.createRewardedVideoAd({ adUnitId: 'YOUR_AD_UNIT_ID' });
    // ad.onClose(res => { if(res && res.isEnded) onReward(); else onFail && onFail(); });
    // ad.onError(() => onFail && onFail());
    // ad.show().catch(() => ad.load().then(() => ad.show()).catch(() => onFail && onFail()));
    // return;
    // ===== 网页占位 =====
    setTimeout(() => { onReward && onReward(); }, 400);
  }catch(e){ onFail && onFail(); }
}
