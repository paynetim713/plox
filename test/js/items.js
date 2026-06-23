// ---------- 道具 ----------
// 道具用金币购买(见 economy.js),局内使用。库存存本地,接口稳定方便 platform.js 接管。
const INV_KEY = "plox_items";

// 两种炸弹:炸掉棋盘最下方 N 行。后续可在此追加新道具,商店/局内栏会自动列出。
// tone:图标/配色基调(cool=青蓝小炸弹,hot=橙红大炸弹),让两者一眼可辨。
export const ITEMS = {
  bomb:    { id:"bomb",    name:"炸弹",     cost:1, rows:2, tone:"cool", desc:"炸掉最下方 2 行" },
  bombBig: { id:"bombBig", name:"巨型炸弹", cost:3, rows:3, tone:"hot",  desc:"炸掉最下方 3 行" },
};
export const ITEM_LIST = Object.keys(ITEMS);   // 稳定顺序

export function getInv(){
  try{ const o = JSON.parse(localStorage.getItem(INV_KEY)); return (o && typeof o==="object") ? o : {}; }
  catch(e){ return {}; }
}
function setInv(inv){ try{ localStorage.setItem(INV_KEY, JSON.stringify(inv)); }catch(e){} }
export function getItem(id){ return Math.max(0, getInv()[id] | 0); }
export function addItem(id, n){ const inv=getInv(); inv[id]=Math.max(0,(inv[id]|0)+(n||1)); setInv(inv); return inv[id]; }
export function useItem(id){                    // 有库存则消耗 1 个返回 true
  const inv=getInv();
  if((inv[id]|0) <= 0) return false;
  inv[id]--; setInv(inv); return true;
}
export function ownedItems(){ return ITEM_LIST.filter(id => getItem(id) > 0); }
