// ---------- 配置常量 ----------
export const COLS = 7, ROWS = 14;
export const COLORS = [   // 实色 + 实线边框(glow=边框色)。前 5 个为实际使用;粉=品红、红=橙红,刻意拉开区分
  {fill:"#e25fb2", glow:"#f3acd8"}, // 粉(品红/桃红,更亮)
  {fill:"#d8ad55", glow:"#ecd6a4"}, // 黄
  {fill:"#5cb35a", glow:"#a8dba6"}, // 绿
  {fill:"#5a86d8", glow:"#aec2f0"}, // 蓝
  {fill:"#d9513a", glow:"#ec9a8a"}, // 红(橙红,更深)
  {fill:"#9b73d0", glow:"#c9b4ec"}, // 紫(备用第6色)
];
// 由本色推导明暗,做立体光泽(不用发光光晕,久看不累)
function shade(hex, amt){
  const n=parseInt(hex.slice(1),16), R=(n>>16)&255, G=(n>>8)&255, B=n&255;
  const f=t=> amt>=0 ? Math.round(t+(255-t)*amt) : Math.round(t*(1+amt));
  return "rgb("+f(R)+","+f(G)+","+f(B)+")";
}
// 护眼:本色「降饱和 ds + 压暗 dl」——高饱和又高亮的颜色久看最累(手机满亮度尤甚)
function mute(hex, ds, dl){
  const n=parseInt(hex.slice(1),16); let R=(n>>16)&255, G=(n>>8)&255, B=n&255;
  const L=0.299*R+0.587*G+0.114*B;            // 向自身灰度靠拢 = 降饱和
  R=R+(L-R)*ds; G=G+(L-G)*ds; B=B+(L-B)*ds;
  R*=(1-dl); G*=(1-dl); B*=(1-dl);             // 整体压暗
  const h=x=>Math.max(0,Math.min(255,Math.round(x))).toString(16).padStart(2,"0");
  return "#"+h(R)+h(G)+h(B);
}
COLORS.forEach(c=>{ c.fill=mute(c.fill, 0.12, 0.03); c.glow=mute(c.glow, 0.15, 0.05); });   // 只轻降饱和:保持鲜亮、和落点预览拉开;伤眼的是炫光不是本色
COLORS.forEach(c=>{ c.top=shade(c.fill,.10); c.dark=shade(c.fill,-.22); c.edge=shade(c.fill,-.36);
  c.gfill=shade(c.fill,-.52); c.gedge=shade(c.fill,-.66); });   // 顶部提亮 .10(适度立体、不炫光)

// 每组固定 3 个随机色块;难度 = 系统「随机乱入」方块组的频率(junkMin/junkMax = 每隔多少个方块乱入一波)
export const FIXED_COLORS = 5;
export const PIECE_LEN = 3;            // 每组固定 3 个色块
export const PLAYER_INTERVAL = 850;    // 玩家方块下落速度(各难度一致)
export const JUNK_FALL = 0.006;        // 乱入方块「匀速缓降」速度(格/毫秒,约6格/秒)
export const ROT_MS = 120;             // 旋转动画时长(ms)
export const PRAISE = ["不错","漂亮","超棒","惊艳","神级"];           // 连击梯度夸奖词
export const PRAISE_COL = ["#eae0ff","#9be3ff","#ffd86a","#ff9ad2","#ff6a6a"];
// baseInterval=玩家方块下落基础间隔(越小越快);floorMin/Max=随关卡加密后乱入频率下限(各难度终局不同)
export const DIFFS = {
  easy:   {label:"简单", sub:"干扰少 · 慢",   junkMin:9, junkMax:13, baseInterval:900, floorMin:5, floorMax:7},
  normal: {label:"普通", sub:"干扰中 · 快",   junkMin:6, junkMax:8,  baseInterval:780, floorMin:3, floorMax:5},
  hard:   {label:"困难", sub:"干扰多 · 更快", junkMin:4, junkMax:5,  baseInterval:660, floorMin:2, floorMax:3},
};
export const CLEAR_MS = 240;

// ---------- 关卡(闯关有目标)----------
export const STAGE_BASE = 12;   // 第 1 关需要消除的方块数(前置上手节奏)
export const STAGE_INC  = 9;    // 每过一关递增多少
export function stageGoal(stage){ return STAGE_BASE + (stage-1)*STAGE_INC; }
// 玩家下落速度随关卡加速(各难度从各自 baseInterval 起步)
export function dropIntervalFor(baseInterval, stage){ return Math.max(260, baseInterval - (stage-1)*45); }

