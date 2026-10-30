import {locationProblem,locationFailure} from './location.mjs';
import {KEY,today,project,inverse,center,cell,vertices,prepareLand,landContains,candidate,fresh,empty,validate,merge,counts,read,update,commit} from './core.mjs';
const $=id=>document.getElementById(id);let data=empty(),land,pending=null,selected=null,busy=false,locating=false,request=0,storageOK=true;
const map=L.map('map',{preferCanvas:true,minZoom:3,maxZoom:13,zoomControl:true}).fitBounds([[20,122],[46,154]]);
const layer=L.layerGroup().addTo(map);map.attributionControl.addAttribution('<a href="https://www.naturalearthdata.com/">Natural Earth</a>');
const colors=n=>n>=10?'#482472':n>=5?'#7546aa':n>=2?'#9b70cd':n?'#c4a6e5':'#ede5f7';
function message(s){$('message').textContent=s;}
function refresh(){
 if(pending&&!fresh(pending)){pending=null;message('確認の期限が切れたか日付が変わりました。現在地を再取得してください。');}
 const used=data.history.find(h=>h.date===today());if(used)pending=null;
 $('today').textContent=`${today()} 日本時間 · ${used?'本日は使用済み':'今日の1回は未使用'}`;
 $('locate').disabled=!land||busy||locating||!storageOK||!!used;
 $('locate').textContent=locating?'現在地を取得中…':pending?'現在地を再取得':'現在地を確認';
 $('pending').hidden=!pending&&!locating;$('confirm').disabled=!pending||busy||locating||!storageOK;
 $('cancel').disabled=busy;$('export').disabled=busy||!storageOK;$('import').disabled=busy||!storageOK;
 const id=selected||used?.hex;const total=counts(data);
 $('selected').textContent=id?`区画 ${id} · 累計 ${total.get(id)||0} 回${pending?' · 未確定':''}`:`記録 ${data.history.length} 日 / ${total.size} 区画`;
}
function draw(){layer.clearLayers();if(!land)return;const total=counts(data),ids=new Set(),bounds=map.getBounds();
 if(map.getZoom()>=8){const ps=[bounds.getSouthWest(),bounds.getSouthEast(),bounds.getNorthWest(),bounds.getNorthEast()].map(p=>project(p.lng,p.lat));const ymin=Math.min(...ps.map(p=>p[1]))-7000,ymax=Math.max(...ps.map(p=>p[1]))+7000,xmin=Math.min(...ps.map(p=>p[0]))-7000,xmax=Math.max(...ps.map(p=>p[0]))+7000;let attempts=0;
 for(let r=Math.floor(ymin/(3000*Math.sqrt(3)));r<=Math.ceil(ymax/(3000*Math.sqrt(3)));r++)for(let q=Math.floor(xmin/6000-r/2);q<=Math.ceil(xmax/6000-r/2);q++){if(++attempts>4000)break;const id=`${q}:${r}`,p=center(q,r);if(landContains(p,land)||vertices(id).some(v=>landContains(v,land)))ids.add(id);}}
 for(const id of total.keys())ids.add(id);if(pending)ids.add(pending.id);
 for(const id of ids){const points=vertices(id).map(p=>inverse(...p)).map(([lng,lat])=>[lat,lng]);if(!bounds.intersects(L.latLngBounds(points)))continue;const isPending=pending?.id===id;
 L.polygon(points,{color:isPending?'#d37800':'#7b4fbf',weight:isPending?4:map.getZoom()>=8?1:0,fillColor:colors(total.get(id)||0),fillOpacity:.8,interactive:false,dashArray:isPending?'7 4':null}).addTo(layer);}
}
function sync(){try{data=read(localStorage,land);storageOK=true;}catch{storageOK=false;message('保存データを読めません。既存データは変更していません。ブラウザの保存設定・日付を確認してください。');}refresh();draw();}
$('locate').onclick=()=>{pending=null;selected=null;const token=++request;locating=true;refresh();draw();message('現在地を確認しています。この操作だけでは回数を使いません。');
 const fail=e=>{if(token!==request)return;locating=false;message(locationFailure(e));refresh();};
 const problem=locationProblem(window);if(problem){locating=false;message(problem);refresh();return;}try{navigator.geolocation.getCurrentPosition(pos=>{if(token!==request)return;locating=false;try{pending=candidate(pos.coords,pos.timestamp,land);selected=pending.id;const [lon,lat]=inverse(...center(...pending.id.split(':').map(Number)));map.setView([lat,lon],10);message('枠で示した区画は未確定です。確認して今日の1回を使ってください。');}catch(e){message(e.message);}refresh();draw();},fail,{enableHighAccuracy:true,maximumAge:0,timeout:15000});}catch(e){fail(e);}};
$('cancel').onclick=()=>{request++;locating=false;pending=null;selected=null;message('中止しました。回数は使っていません。');refresh();draw();};
async function save(change,success){if(busy)return;busy=true;refresh();try{data=await update(localStorage,navigator.locks,land,change);pending=null;message(success);}catch(e){message(`保存できませんでした。完了していません。${e.message} 再試行できます。`);}finally{busy=false;refresh();draw();}}
$('confirm').onclick=()=>{const c=pending;save(current=>commit(current,c),'保存しました。本日は使用済みです。');};
$('overview').onclick=()=>map.fitBounds([[20,122],[46,154]]);
$('export').onclick=()=>{try{const saved=read(localStorage,land),blob=new Blob([JSON.stringify(saved,null,2)],{type:'application/json'}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=`following-wind-hex-${today()}.json`;document.body.append(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(url),60000);message('セーブを書き出しました。ダウンロード先を確認してください。');}catch{message('書き出せませんでした。保存データとブラウザの設定を確認してください。');}};
$('import').onchange=async e=>{const file=e.target.files[0];e.target.value='';if(!file||busy)return;try{if(file.size>8*1024*1024)throw Error('ファイルが大きすぎます（上限8MB）。');const incoming=validate(JSON.parse(await file.text()),land);await save(current=>merge(current,incoming),'セーブを統合しました。同じ日の既存記録を優先しています。');}catch(e){message(`読み込めませんでした。既存データは変更していません。${e.message}`);}};
map.on('moveend',draw);window.addEventListener('storage',e=>{if((e.key===KEY||e.key===null)&&land)sync();});window.addEventListener('pageshow',()=>{if(land)sync();});document.addEventListener('visibilitychange',()=>{if(!document.hidden&&land)sync();});window.addEventListener('focus',()=>{if(land)sync();});
setInterval(()=>{const had=!!pending;refresh();if(had&&!pending)draw();},1000);
try{const response=await fetch('./japan.json');if(!response.ok)throw Error();const geo=await response.json();land=prepareLand(geo.geometry);L.geoJSON(geo,{style:{color:'#9ca8a5',weight:1,fillColor:'#f8faf7',fillOpacity:1},interactive:false}).addTo(map);layer.bringToFront?.();sync();message('現在地を確認して始めましょう。取得だけでは回数を使いません。');if(!storageOK)sync();if(!navigator.locks){storageOK=false;message('このブラウザは安全な同時保存に未対応です。最新のSafari / Chromeをご利用ください。');}const problem=locationProblem(window);if(problem)message(problem);refresh();draw();}catch{message('地図を読み込めませんでした。通信を確認して再読み込みしてください。');}
