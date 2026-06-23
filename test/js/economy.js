// ---------- 金币经济 ----------
// 为「抖音小程序变现」铺路:本地存取金币。平台相关的真实充值/存储后续抽到 platform.js,
// 这里只依赖 localStorage,接口保持稳定(getCoins/addCoins/spendCoins),换平台只改实现不改调用方。
const COINS_KEY = "plox_coins";
const GRANT_KEY = "plox_granted";       // 新用户赠币只发一次的标记
export const NEW_USER_GRANT = 10;       // 新用户免费 10 金币

export function getCoins(){
  try{
    if(!localStorage.getItem(GRANT_KEY)){            // 新用户:首次进入白送 10 金币
      localStorage.setItem(GRANT_KEY, "1");
      localStorage.setItem(COINS_KEY, String(NEW_USER_GRANT));
      return NEW_USER_GRANT;
    }
    const v = parseInt(localStorage.getItem(COINS_KEY) || "0", 10);
    return Number.isFinite(v) ? Math.max(0, v) : 0;
  }catch(e){ return NEW_USER_GRANT; }
}
export function setCoins(n){
  try{ localStorage.setItem(COINS_KEY, String(Math.max(0, Math.floor(n)))); }catch(e){}
}
export function addCoins(n){ const v = getCoins() + Math.floor(n); setCoins(v); return v; }
export function spendCoins(n){                        // 够则扣款返回 true,不够返回 false
  const v = getCoins();
  if(v < n) return false;
  setCoins(v - n);
  return true;
}
