export const KEY = 'following-wind.hex-walk.v1';
export const GRID = Object.freeze({id:'jp-lcc-6000-v1', projection:'spherical-lcc', radius:6371008.8, parallels:[30,40], origin:[137,35], flatToFlat:6000, orientation:'pointy', land:'natural-earth-5.1.2-japan-10m'});
const rad=Math.PI/180, R=GRID.radius, t=p=>Math.tan(Math.PI/4+p/2);
const n=Math.log(Math.cos(30*rad)/Math.cos(40*rad))/Math.log(t(40*rad)/t(30*rad));
const F=Math.cos(30*rad)*t(30*rad)**n/n, rho0=R*F/t(35*rad)**n;
export function project(lon,lat){const rho=R*F/t(lat*rad)**n,a=n*(lon-137)*rad;return [rho*Math.sin(a),rho0-rho*Math.cos(a)];}
export function inverse(x,y){const rho=Math.hypot(x,rho0-y);return [137+Math.atan2(x,rho0-y)/n/rad,(2*Math.atan((R*F/rho)**(1/n))-Math.PI/2)/rad];}
export function scale(lat){return n*F/(Math.cos(lat*rad)*t(lat*rad)**n);}
export const center=(q,r)=>[6000*(q+r/2),3000*Math.sqrt(3)*r];
export function cell(x,y){const r=y/(3000*Math.sqrt(3)),q=x/6000-r/2,s=-q-r;let a=Math.round(q),b=Math.round(r),c=Math.round(s);const da=Math.abs(a-q),db=Math.abs(b-r),dc=Math.abs(c-s);if(da>db&&da>dc)a=-b-c;else if(db>dc)b=-a-c;return `${a===0?0:a}:${b===0?0:b}`;}
export function vertices(id){const [q,r]=id.split(':').map(Number),[x,y]=center(q,r);return Array.from({length:6},(_,i)=>{const a=(30+60*i)*rad;return [x+6000/Math.sqrt(3)*Math.cos(a),y+6000/Math.sqrt(3)*Math.sin(a)];});}
export function segmentDistance(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],d=dx*dx+dy*dy;const u=d?Math.max(0,Math.min(1,((p[0]-a[0])*dx+(p[1]-a[1])*dy)/d)):0;return Math.hypot(p[0]-a[0]-u*dx,p[1]-a[1]-u*dy);}
function inRing(p,ring){let yes=false;for(let i=0,j=ring.length-1;i<ring.length;j=i++){const a=ring[i],b=ring[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
export function prepareLand(geometry){return geometry.coordinates.map(poly=>{const rings=poly.map(r=>r.map(p=>project(...p))),pts=rings[0];return {rings,box:[Math.min(...pts.map(p=>p[0])),Math.min(...pts.map(p=>p[1])),Math.max(...pts.map(p=>p[0])),Math.max(...pts.map(p=>p[1]))]};});}
export function landContains(p,land,margin=0){return land.some(({rings,box:b})=>{if(p[0]<b[0]||p[0]>b[2]||p[1]<b[1]||p[1]>b[3]||!inRing(p,rings[0])||rings.slice(1).some(r=>inRing(p,r)))return false;return !margin||rings.every(r=>r.every((a,i)=>segmentDistance(p,a,r[(i+1)%r.length])>margin));});}
export function cellTouchesLand(id,land){const p=center(...id.split(':').map(Number)),vs=vertices(id);return landContains(p,land)||vs.some(v=>landContains(v,land))||land.some(({rings,box:b})=>p[0]+3500>=b[0]&&p[0]-3500<=b[2]&&p[1]+3500>=b[1]&&p[1]-3500<=b[3]&&rings[0].some(v=>cell(...v)===id));}
export const today=(now=Date.now())=>new Date(now+9*3600000).toISOString().slice(0,10);
export function candidate(coords,timestamp,land,now=Date.now()){
 const {longitude:lon,latitude:lat,accuracy}=coords;
 if(![lon,lat,accuracy,timestamp].every(Number.isFinite)||accuracy<=0||accuracy>150)throw Error('位置の精度が不足しています。屋外などで再取得してください。');
 if(lon<122||lon>154||lat<20||lat>46)throw Error('日本国外です。今日の回数は使っていません。');
 if(now-timestamp>30000||timestamp>now+1000)throw Error('位置情報が古いため再取得してください。');
 const p=project(lon,lat),id=cell(...p),vs=vertices(id),margin=(accuracy+10)*scale(lat)*1.01;
 if(!landContains(p,land,margin+200))throw Error('日本の陸地を十分な確度で確認できません。海岸・小島では判定できない場合があります。再取得してください。');
 if(vs.some((a,i)=>segmentDistance(p,a,vs[(i+1)%6])<=margin))throw Error('ヘックス境界付近で区画が不確かです。移動して再取得してください。');
 return {id,day:today(now),timestamp};
}
export function fresh(c,now=Date.now()){return !!c&&today(now)===c.day&&now>=c.timestamp&&now-c.timestamp<=60000;}
export const empty=()=>({format:'following-wind-hex-walk',version:1,grid:GRID,history:[]});
export function validate(value,land,now=Date.now()){
 if(!value||value.format!=='following-wind-hex-walk'||value.version!==1||JSON.stringify(value.grid)!==JSON.stringify(GRID)||!Array.isArray(value.history)||value.history.length>100000)throw Error('対応しないセーブ形式・区画定義です。');
 const dates=new Set();
 const history=value.history.map(h=>{
  if(!h||Object.keys(h).sort().join(',')!=='date,hex'||typeof h.date!=='string'||!/^\d{4}-\d{2}-\d{2}$/.test(h.date)||!Number.isFinite(Date.parse(h.date+'T00:00:00Z'))||new Date(h.date+'T00:00:00Z').toISOString().slice(0,10)!==h.date||h.date>today(now)||h.date<'2000-01-01'||dates.has(h.date))throw Error('履歴の日付が不正・重複・未来です。');
  if(typeof h.hex!=='string'||! /^-?(0|[1-9]\d{0,3}):-?(0|[1-9]\d{0,3})$/.test(h.hex))throw Error('ヘックスIDが不正です。');
  const [q,r]=h.hex.split(':').map(Number),p=center(q,r),[lon,lat]=inverse(...p);
  if(cell(...p)!==h.hex||lon<121||lon>155||lat<19||lat>47||!cellTouchesLand(h.hex,land))throw Error('日本の区画ではありません。');
  dates.add(h.date);return {date:h.date,hex:h.hex};
 });return {...empty(),history:history.sort((a,b)=>a.date.localeCompare(b.date))};
}
export function merge(a,b){const dates=new Set(a.history.map(h=>h.date));return {...empty(),history:[...a.history,...b.history.filter(h=>!dates.has(h.date))].sort((a,b)=>a.date.localeCompare(b.date))};}
export const counts=data=>data.history.reduce((m,h)=>m.set(h.hex,(m.get(h.hex)||0)+1),new Map());
export function read(storage,land){const raw=storage.getItem(KEY);return raw===null?empty():validate(JSON.parse(raw),land);}
export async function update(storage,locks,land,change){if(!locks?.request)throw Error('安全な同時保存に未対応のブラウザです。最新のSafari / Chromeをご利用ください。');return locks.request(KEY,()=>{const current=read(storage,land),next=validate(change(current),land);storage.setItem(KEY,JSON.stringify(next));return next;});}
export function commit(current,c,now=Date.now()){if(!fresh(c,now))throw Error('確認から時間が経ったか日付が変わりました。現在地を再取得してください。');if(current.history.some(h=>h.date===today(now)))throw Error('本日は使用済みです。');return {...current,history:[...current.history,{date:today(now),hex:c.id}]};}
