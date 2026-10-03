/**
 * Deterministicky proceduralni ohen, bez externich JS balicku nebo obrazku.
 * Spusteni: node vytvor-plameny.mjs [--ffmpeg=C:/ffmpeg/bin/ffmpeg.exe]
 * Rychly nahled: node vytvor-plameny.mjs --draft
 * Node.js >= 18, FFmpeg s libvpx-vp9 a libx264.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn, spawnSync } from 'node:child_process';
import { once } from 'node:events';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const arg = process.argv.find(a => a.startsWith('--ffmpeg='));
const FFMPEG = arg ? arg.slice(9) : fs.existsSync('C:/ffmpeg/bin/ffmpeg.exe') ? 'C:/ffmpeg/bin/ffmpeg.exe' : 'ffmpeg';
const FFPROBE = FFMPEG.replace(/ffmpeg(\.exe)?$/, 'ffprobe$1');
const W = 720, H = 960, FPS = 30, N = 54;
const DARK = [26, 18, 12];
const clamp = (v, lo=0, hi=1) => Math.max(lo, Math.min(hi, v));
const mix = (a,b,t) => a+(b-a)*t;
const smooth = (a,b,x) => { const t=clamp((x-a)/(b-a)); return t*t*(3-2*t); };
let seed = 0x41e2de;
function rnd() { seed ^= seed<<13; seed ^= seed>>>17; seed ^= seed<<5; return (seed>>>0)/4294967296; }

// Gradientovy sum: souvisly v prostoru i case, zadne nahodne preskoky snimku.
const perm = Array.from({length:256},(_,i)=>i);
for(let i=255;i>0;i--) { const j=Math.floor(rnd()*(i+1)); [perm[i],perm[j]]=[perm[j],perm[i]]; }
const p = new Uint16Array(512); for(let i=0;i<512;i++) p[i]=perm[i&255];
function grad(h,x,y) { switch(h&7) {case 0:return x+y;case 1:return -x+y;case 2:return x-y;case 3:return -x-y;case 4:return x;case 5:return -x;case 6:return y;default:return -y;} }
function noise(x,y) {
  const ix=Math.floor(x), iy=Math.floor(y), X=ix&255,Y=iy&255; x-=ix;y-=iy;
  const u=x*x*x*(x*(x*6-15)+10),v=y*y*y*(y*(y*6-15)+10);
  return mix(mix(grad(p[p[X]+Y],x,y),grad(p[p[X+1]+Y],x-1,y),u),mix(grad(p[p[X]+Y+1],x,y-1),grad(p[p[X+1]+Y+1],x-1,y-1),u),v);
}
const tongues=[];
for(let x=-28;x<W+40;x+=23+rnd()*27) tongues.push({x, h:120+rnd()*94, w:19+rnd()*25, phase:rnd()*6.28, bend:(rnd()-.5)*62, rate:5+rnd()*6});
const sparks=Array.from({length:150},()=>({birth:rnd()*1.46, x:8+rnd()*(W-16), life:.20+rnd()*.45, speed:190+rnd()*230, sway:5+rnd()*13, phase:rnd()*6.28, radius:1+rnd()*1.4}));
function baseline(t) { return t<.15 ? mix(967,949,smooth(0,.15,t)) : t<=1.4 ? mix(949,-7,(t-.15)/1.25) : mix(-7,-34,smooth(1.4,1.8,t)); }
function front(x,t) { return baseline(t)+22*noise(x/68+4,t*2.3)+9*noise(x/20+11,t*3.7)+3*noise(x/6,t*6); }
const palette=[[0,[130,24,9]],[.20,[200,50,26]],[.47,[255,112,22]],[.66,[255,154,46]],[.86,[255,211,99]],[1,[255,243,176]]];
const colors=Array.from({length:1024},(_,i)=>{const h=i/1023;let j=1;while(palette[j][0]<h)j++;const [v0,c0]=palette[j-1],[v1,c1]=palette[j];return c0.map((v,k)=>mix(v,c1[k],(h-v0)/(v1-v0)));});

function render(index) {
  const t=index/FPS, pixels=W*H;
  const rgba=Buffer.alloc(pixels*4);
  if(index===N-1) return rgba; // Presne nulova alfa posledniho snimku.
  const ignition=smooth(0,.15,t+.013), burnout=1-smooth(1.4,1.76,t);
  const finalFade=1-smooth(1.57,53/FPS,t);
  const fline=Float32Array.from({length:W},(_,x)=>front(x,t));
  const density=new Float32Array(pixels), heat=new Float32Array(pixels);
  const alpha=new Float32Array(pixels), red=new Float32Array(pixels), green=new Float32Array(pixels), blue=new Float32Array(pixels);
  function over(i,r,g,b,a) { if(a<=0)return; a=clamp(a);const v=1-a;red[i]=r*a+red[i]*v;green[i]=g*a+green[i]*v;blue[i]=b*a+blue[i]*v;alpha[i]=a+alpha[i]*v; }
  const heightScale=(.18+.82*ignition)*(.52+.48*burnout);
  // Propletene jazyky: zuzuji se, ohybaji a maji ruznou vysku, rychlost i fazi.
  for(const tongue of tongues) {
    const ph=tongue.phase, tm=t*tongue.rate;
    const baseX=tongue.x+5*noise(ph+t*2,9);
    const ht=clamp(tongue.h+20*Math.sin(tm+ph)+15*noise(ph+3,t*3),120,220)*heightScale;
    const by=front(clamp(baseX,0,W-1),t);
    for(let y=Math.max(0,Math.floor(by-ht-8));y<Math.min(H,Math.ceil(by+14));y++) {
      const v=clamp((by-y)/ht);
      const center=baseX + Math.sin(v*(5.5+ph*.65)-tm+ph)*(3+13*v) + Math.sin(v*15+tm*.63+ph)*5*v + tongue.bend*v*v;
      const width=tongue.w*Math.pow(1-v,.72)*(.91+.17*Math.sin(v*13-tm+ph))+1.1;
      const edgeLimit=width*1.36;
      for(let x=Math.max(0,Math.floor(center-edgeLimit));x<Math.min(W,Math.ceil(center+edgeLimit));x++) {
        const q=fline[x]-y;
        if(q < -9 || q>ht+7)continue;
        const turb=noise(x/18+t*.42,y/29+t*8+ph)*.22+noise(x/6,y/11+t*13)*.055;
        const shape=1-Math.pow(Math.abs((x-center)/width),1.6)+turb;
        const strength=smooth(-.10,.40,shape)*smooth(-10,4,q)*(1-smooth(.73,1.025,v));
        const i=y*W+x;
        density[i]=Math.max(density[i],strength);
        heat[i]=Math.max(heat[i],clamp(shape)*(.98-.51*v)+turb*.19);
      }
    }
  }
  const top=Math.max(0,Math.floor(baseline(t)-255));
  const bottom=Math.min(H,Math.ceil(baseline(t)+100));
  // Velmi jemny kour je jedina seda slozka; alfa vzdy pod 0.30.
  for(let y=0;y<Math.min(H,Math.ceil(baseline(t)+25));y++) {
    if(y<Math.max(0,baseline(t)-330))continue;
    for(let x=0;x<W;x++) {
      const q=fline[x]-y;
      if(q<45 || q>320)continue;
      const n=noise((x+19*noise(x/80,y/130+t*2))/75,y/113+t*4);
      const wisps=smooth(.22,.60,n)*smooth(45,140,q)*(1-smooth(180,320,q));
      const a=wisps*.13*ignition*finalFade*(t<1.4?.48:1);
      over(y*W+x,140,132,122,a);
    }
  }
  for(let y=top;y<bottom;y++) for(let x=0;x<W;x++) {
    const i=y*W+x,q=fline[x]-y;
    // Popelavy pas ma delku 40-70 px. Dale za nim nezustava cerna plocha.
    if(q<8 && q>-70) {
      const d=-q, thickness=54+9*noise(x/34+30,t*2.2);
      const tex=noise(x/8,y/7+t*1.5)*.5+noise(x/2.4,y/3.1)*.18;
      const mask=(1-smooth(thickness-16,thickness,d))*smooth(-8,2,d)*ignition*burnout;
      const ember=Math.exp(-Math.max(0,d)/15)*(1+tex*.75);
      const cracks=Math.pow(clamp(.5+noise(x/5,y/11)*.7),7)*Math.exp(-Math.max(0,d)/32);
      over(i,14+236*ember+cracks*130,5+93*ember+cracks*40,3+16*ember,mask*.89);
    }
    const root=Math.exp(-Math.pow((q-3)/7,2))*(.78+.13*noise(x/13,t*8));
    const d=Math.max(density[i],root);
    const h=clamp(Math.max(heat[i],root*.91));
    density[i]=d;
    if(d>.002) {
      const col=colors[Math.round(h*1023)];
      over(i,...col,d*ignition*burnout);
    }
  }
  // Pri dohorivani zustanou na hornim okraji kratke zhavouci trhliny.
  if(t>1.32) {
    const tail=smooth(1.32,1.43,t)*(1-smooth(1.43,1.70,t));
    for(let y=0;y<85;y++)for(let x=0;x<W;x++) {
      const n=noise(x/39+7,t*4.5+y/85);
      const length=12+45*clamp(.5+n);
      const a=(1-smooth(0,length,y))*smooth(-.1,.5,n)*tail*.48;
      over(y*W+x,255,104+Math.max(0,12-y),24,a);
    }
  }
  // Dvouprchodovy box blur premultiplikovaneho svetla pro jemnou zar.
  const blur=new Float32Array(pixels), glow=new Float32Array(pixels), radius=12;
  for(let y=Math.max(0,top-16);y<Math.min(H,bottom+16);y++) {
    let sum=0;for(let x=0;x<=radius;x++)sum+=density[y*W+x];
    for(let x=0;x<W;x++){blur[y*W+x]=sum/(radius*2+1);if(x-radius>=0)sum-=density[y*W+x-radius];if(x+radius+1<W)sum+=density[y*W+x+radius+1];}
  }
  for(let x=0;x<W;x++) {
    let sum=0;for(let y=0;y<=radius;y++)sum+=blur[y*W+x];
    for(let y=0;y<H;y++){glow[y*W+x]=sum/(radius*2+1);if(y-radius>=0)sum-=blur[(y-radius)*W+x];if(y+radius+1<H)sum+=blur[(y+radius+1)*W+x];}
  }
  for(let y=Math.max(0,top-16);y<Math.min(H,bottom+16);y++) for(let x=0;x<W;x++) {
    const i=y*W+x, ga=glow[i]*.26*ignition*burnout*(1-alpha[i]);
    red[i]+=255*ga;green[i]+=99*ga;blue[i]+=14*ga;alpha[i]+=ga;
  }
  // Zhave castice o prumeru 2-5 px s pruhlednou svatozari a kratkou stopou.
  for(const sp of sparks) {
    const age=t-sp.birth;if(age<0 || age>sp.life)continue;
    const a=smooth(0,.035,age)*(1-smooth(sp.life*.4,sp.life,age))*finalFade;
    const cx=sp.x+Math.sin(sp.phase+age*14)*sp.sway;
    const cy=front(sp.x,sp.birth)-age*sp.speed-80*age*age;
    const rr=sp.radius, bound=rr*3.8;
    for(let y=Math.max(0,Math.floor(cy-bound-4));y<Math.min(H,Math.ceil(cy+bound));y++) for(let x=Math.max(0,Math.floor(cx-bound));x<Math.min(W,Math.ceil(cx+bound));x++) {
      const dx=x-cx,dy=y-cy;
      const r2=(dx*dx+dy*dy)/(rr*rr);
      const ga=Math.exp(-r2*.34)*.21*a;
      const core=(1-smooth(.2,1.35,Math.sqrt(r2)))*a;
      over(y*W+x,255,102,20,ga);over(y*W+x,255,225,141,core);
    }
  }
  // Zbytkovy kour na konci je tenky, prusvitny a unasi se za horni hranu.
  if(t>1.30) {
    const tail=smooth(1.30,1.47,t)*(1-smooth(1.47,53/FPS,t));
    for(let y=0;y<130;y++)for(let x=0;x<W;x++) {
      const n=noise((x+23*noise(x/100,y/55+t*3))/57,y/60+t*4);
      const a=smooth(.16,.57,n)*(1-smooth(15,120,y))*tail*.14;
      over(y*W+x,143,137,128,a);
    }
  }
  // Vystup je straight RGBA; pruhledne pixely nemaji cerny matny podklad.
  for(let i=0;i<pixels;i++) {const a=clamp(alpha[i]);if(a<.5/255)continue;const j=i*4;rgba[j]=clamp(red[i]/a,0,255);rgba[j+1]=clamp(green[i]/a,0,255);rgba[j+2]=clamp(blue[i]/a,0,255);rgba[j+3]=Math.round(a*255);}
  return rgba;
}

function run(args,opts={}) {
  const r=spawnSync(FFMPEG,['-hide_banner','-loglevel','error','-y',...args],{cwd:DIR,maxBuffer:256*1024*1024,...opts});
  if(r.status!==0)throw new Error(`FFmpeg: ${r.stderr?.toString() || r.error || r.status}`);
  return r.stdout;
}
function composite(raw,bg) {const rgb=Buffer.alloc(W*H*3);for(let i=0,j=0;i<raw.length;i+=4,j+=3){const a=raw[i+3]/255;for(let k=0;k<3;k++)rgb[j+k]=Math.round(raw[i+k]*a+bg[k]*(1-a));}return rgb;}
function png(raw,filename,w=W,h=H,fmt='rgba') {run(['-f','rawvideo','-pixel_format',fmt,'-video_size',`${w}x${h}`,'-i','pipe:0','-frames:v','1','-update','1',filename],{input:raw});}
function contacts(frames,filename) {
  // 8 rovnomerne rozlozenych snimku vcetne prvniho a posledniho, 4 x 2.
  const thumbW=216,thumbH=288,gap=12,label=26,cw=gap+4*(thumbW+gap),ch=gap+2*(thumbH+label+gap);
  const sheet=Buffer.alloc(cw*ch*3);for(let i=0;i<sheet.length;i+=3){sheet[i]=DARK[0];sheet[i+1]=DARK[1];sheet[i+2]=DARK[2];}
  frames.forEach((frame,k)=>{const tiny=run(['-f','rawvideo','-pixel_format','rgb24','-video_size',`${W}x${H}`,'-i','pipe:0','-vf',`scale=${thumbW}:${thumbH}:flags=lanczos`,'-frames:v','1','-f','rawvideo','-pix_fmt','rgb24','pipe:1'],{input:composite(frame,DARK)});const ox=gap+(k%4)*(thumbW+gap),oy=gap+Math.floor(k/4)*(thumbH+label+gap);for(let y=0;y<thumbH;y++)tiny.copy(sheet,((oy+y)*cw+ox)*3,y*thumbW*3,(y+1)*thumbW*3);});
  const font=process.platform==='win'?'C\\:/Windows/Fonts/consola.ttf': '/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf';
  const filters=frames.map((_,k)=>`drawtext=fontfile='${font}':text='${(Math.round(k*53/7)/30).toFixed(2)} s  /  ${String(Math.round(k*53/7)+1).padStart(2,'0')}':x=${gap+(k%4)*(thumbW+gap)+7}:y=${gap+Math.floor(k/4)*(thumbH+label+gap)+thumbH+6}:fontsize=13:fontcolor=0xd8b788`).join(',');
  run(['-f','rawvideo','-pixel_format','rgb24','-video_size',`${cw}x${ch}`,'-i','pipe:0','-vf',filters,'-frames:v','1','-update','1',filename],{input:sheet});
}

async function main() {
  if(process.argv.includes('--draft')) {const frames=[];for(let k=0;k<8;k++){const i=Math.round(k*53/7);console.log(`Nahled ${i+1}/54`);frames.push(render(i));}contacts(frames,'pracovni-nahled.png');png(composite(render(21),DARK),'pracovni-detail.png',W,H,'rgb24');return;}
  const rawPath=path.join(DIR,'.plameny-render.rgba');
  const fd=fs.openSync(rawPath,'w');
  try {for(let i=0;i<N;i++){fs.writeSync(fd,render(i));if(i%6===0||i===N-1)console.log(`Render ${i+1}/${N}`);}} finally {fs.closeSync(fd);}
  try {
    const input=['-f','rawvideo','-pixel_format','rgba','-video_size',`${W}x${H}`,'-framerate',String(FPS),'-i',rawPath];
    for(const crf of [30,34,38]) {
      console.log(`Kodovani VP9 + alfa, CRF ${crf}`);
      const proc=spawn(FFMPEG,['-hide_banner','-loglevel','error','-y',...input,'-an','-c:v','libvpx-vp9','-pix_fmt','yuva420p','-b:v','0','-crf',String(crf),'-deadline','good','-cpu-used','2','-row-mt','1','-threads','8','-auto-alt-ref','0','-g','54','-metadata:s:v:0','alpha_mode=1','plameny.webm'],{cwd:DIR,stdio:['ignore','inherit','inherit']});
      const [code]=await once(proc,'exit');if(code!==0)throw new Error(`VP9 kodovani selhalo: ${code}`);
      if(fs.statSync(path.join(DIR,'plameny.webm')).size<=1500000)break;
    }
    if(fs.statSync(path.join(DIR,'plameny.webm')).size>3000000)throw new Error('WebM presahuje 3 MB.');
    // Nahledy vznikaji z dekodovaneho finalniho WebM, ne pouze z puvodnich dat.
    console.log('Dekodovani alfy a vytvareni nahledu z finalniho WebM');
    const decoded=run(['-c:v','libvpx-vp9','-i','plameny.webm','-f','rawvideo','-pix_fmt','rgba','pipe:1']);
    const frameBytes=W*H*4;if(decoded.length!==frameBytes*N)throw new Error('Spatny pocet dekodovanych snimku');
    const alphaStats=[];
    for(let i=0;i<N;i++){let nonzero=0,max=0;for(let j=i*frameBytes+3;j<(i+1)*frameBytes;j+=4){const a=decoded[j];if(a)nonzero++;max=Math.max(max,a);}alphaStats.push({frame:i,time:i/FPS,nonzero,max});}
    if(alphaStats.at(-1).max!==0)throw new Error('Posledni snimek neni zcela pruhledny');
    if(alphaStats[21].nonzero===W*H || alphaStats[21].max<100)throw new Error('Alfa neobsahuje ocekavany ohen a pruhlednost');
    const sample=Array.from({length:8},(_,k)=>{const i=Math.round(k*53/7);return decoded.subarray(i*frameBytes,(i+1)*frameBytes);});
    contacts(sample,'nahled.png');
    const mid=decoded.subarray(21*frameBytes,22*frameBytes);
    const dark=composite(mid,DARK),light=composite(mid,[241,235,220]);
    const pair=Buffer.alloc(W*2*H*3);for(let y=0;y<H;y++){dark.copy(pair,y*W*6,y*W*3,(y+1)*W*3);light.copy(pair,y*W*6+W*3,y*W*3,(y+1)*W*3);}
    png(pair,'overeni-alfy.png',W*2,H,'rgb24');
    const rgbPath=path.join(DIR,'.plameny-nahled.rgb');const rgbFd=fs.openSync(rgbPath,'w');
    try{for(let i=0;i<N;i++)fs.writeSync(rgbFd,composite(decoded.subarray(i*frameBytes,(i+1)*frameBytes),DARK));}finally{fs.closeSync(rgbFd);}
    try{run(['-f','rawvideo','-pixel_format','rgb24','-video_size',`${W}x${H}`,'-framerate',String(FPS),'-i',rgbPath,'-an','-c:v','libx264','-crf','18','-preset','slow','-pix_fmt','yuv420p','-movflags','+faststart','plameny-nahled.mp4']);}finally{fs.unlinkSync(rgbPath);}
    const probe=spawnSync(FFPROBE,['-v','error','-count_frames','-show_streams','-show_format','-of','json',path.join(DIR,'plameny.webm')],{encoding:'utf8'});if(probe.status!==0)throw new Error(probe.stderr);
    const report={parameters:{width:W,height:H,fps:FPS,frames:N,duration:N/FPS,encoderPixelFormat:'yuva420p',seed:'0x41e2de'},bytes:fs.statSync(path.join(DIR,'plameny.webm')).size,ffprobe:JSON.parse(probe.stdout),decoder:'libvpx-vp9',alphaStats};
    fs.writeFileSync(path.join(DIR,'overeni.json'),JSON.stringify(report,null,2)+'\n');
    console.log(`Hotovo: ${report.bytes} B, ${N} snimku, posledni alfa = 0.`);
  }finally {fs.unlinkSync(rawPath);}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
