// ---------- 音频服务 ----------
// 从 main.js 抽出:程序合成音效(tone/beep)+ 生成式背景音乐(TRACKS/musicTick)。
// 逻辑与原实现完全一致;仅包进工厂函数,通过 getState() 读取游戏状态决定音乐是否继续。
export function createAudio(getState){
  let actx=null, musicBus=null;
  let musicTimer=null, musicStep=0;
  const nf=s=>220*Math.pow(2,s/12);
  const TRACKS=[
    { name:"霓虹", scale:[0,3,5,7,10,12,15],   pat:[0,2,1,3,2,4,3,5,4,2,1,3], tempo:230, lead:"triangle", lv:0.030, bassEvery:4, bass2Every:8 },
    { name:"律动", scale:[0,2,3,5,7,8,10,12],  pat:[0,4,2,5,3,6,4,7,5,3,1,4], tempo:200, lead:"triangle", lv:0.026, bassEvery:2, bass2Every:6 },
    { name:"梦境", scale:[0,2,4,7,9,11,12,14], pat:[0,2,4,3,5,4,6,5,2,4,1,3], tempo:280, lead:"sine",     lv:0.034, bassEvery:4, bass2Every:8 },
    { name:"脉冲", scale:[0,3,5,6,7,10,12,15], pat:[0,1,2,3,4,5,4,3,2,5,3,1], tempo:185, lead:"sine",     lv:0.024, bassEvery:2, bass2Every:4 },
  ];
  let musicTrack=(()=>{ try{ const v=parseInt(localStorage.getItem("plox_music")||"0",10); return (v>=0&&v<TRACKS.length)?v:0; }catch(e){ return 0; } })();

  const api={ soundOn:true, musicOn:true, TRACKS, get musicTrack(){ return musicTrack; } };

  function ensureAudio(){
    if(!actx){ try{ actx=new (window.AudioContext||window.webkitAudioContext)(); }catch(e){} }
    if(actx && !musicBus){   // 音乐独立母线:低通 + 限幅音量,让背景乐柔和不刺耳
      try{ const g=actx.createGain(); g.gain.value=0.5;
        const lp=actx.createBiquadFilter(); lp.type="lowpass"; lp.frequency.value=1500; lp.Q.value=0.6;
        g.connect(lp); lp.connect(actx.destination); musicBus=g;
      }catch(e){} }
    if(actx&&actx.state==="suspended") actx.resume();
  }
  function tone(freq,dur,type,vol,atk,dest){
    if(!actx) return;
    try{ const o=actx.createOscillator(), g=actx.createGain();
      o.type=type||"sine"; o.frequency.value=freq;
      const n=actx.currentTime, a=atk||0.005;
      g.gain.setValueAtTime(0.0001,n); g.gain.exponentialRampToValueAtTime(vol,n+a);
      g.gain.exponentialRampToValueAtTime(0.0001,n+dur);
      o.connect(g); g.connect(dest||actx.destination); o.start(n); o.stop(n+dur+0.02);
    }catch(e){} }
  function beep(f,d,t,v){ if(api.soundOn){ ensureAudio(); tone(f,d,t,v); } }

  function setMusicTrack(i){ musicTrack=((i%TRACKS.length)+TRACKS.length)%TRACKS.length;
    try{ localStorage.setItem("plox_music",String(musicTrack)); }catch(e){} }
  function musicTick(){
    if(!api.musicOn||getState()!=="playing"||!actx||actx.state!=="running"){ musicTimer=null; return; }
    const tk=TRACKS[musicTrack]||TRACKS[0], sc=tk.scale;
    const idx=tk.pat[musicStep%tk.pat.length] % sc.length;
    tone(nf(sc[idx]),0.3,tk.lead,tk.lv,0.03,musicBus);
    if(musicStep%tk.bassEvery===0) tone(nf(sc[0])/2,0.4,"sine",0.034,0.03,musicBus);
    if(musicStep%tk.bass2Every===(tk.bass2Every>>1)) tone(nf(sc[Math.min(2,sc.length-1)]),0.26,"sine",0.018,0.03,musicBus);
    musicStep++; musicTimer=setTimeout(musicTick,tk.tempo);
  }
  function startMusic(){ if(!musicTimer&&api.musicOn&&getState()==="playing"){ ensureAudio(); musicTick(); } }
  function stopMusic(){ if(musicTimer){ clearTimeout(musicTimer); musicTimer=null; } }

  api.ensureAudio=ensureAudio; api.beep=beep;
  api.setMusicTrack=setMusicTrack; api.startMusic=startMusic; api.stopMusic=stopMusic;
  api.resetMusicStep=()=>{ musicStep=0; };
  return api;
}
