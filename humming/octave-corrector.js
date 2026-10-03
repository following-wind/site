// Validated isolated octave correction. Segmentation must always use the original raw track.
(function(root,factory){if(typeof module==='object'&&module.exports)module.exports=factory();else root.HummingOctave=factory()})(globalThis,function(){
 'use strict';
 const midi=f=>69+12*Math.log2(f/440),hz=m=>440*2**((m-69)/12);
 function candidates(samples,rate,selected){
  if(!selected.freq)return {selected:null,upper:null,lower:null,top:[]};
  const size=Math.floor(samples.length/2),max=Math.min(size-1,Math.ceil(rate/65)),min=Math.max(2,Math.floor(rate/1100));
  const curve=new Float64Array(max+1);let sum=0;curve[0]=1;
  for(let lag=1;lag<=max;lag++){let v=0;for(let i=0;i<size;i++)v+=(samples[i]-samples[i+lag])**2;sum+=v;curve[lag]=sum?v*lag/sum:1}
  const top=[];
  for(let lag=min;lag<max;lag++)if(curve[lag]<=curve[lag-1]&&curve[lag]<curve[lag+1]){
   const a=curve[lag-1],b=curve[lag],c=curve[lag+1],den=a-2*b+c;
   const period=lag+(den?.5*(a-c)/den:0);
   top.push({period,midi:midi(rate/period),difference:b,lag});
  }
  const pitch=midi(selected.freq),near=target=>top.filter(p=>Math.abs(p.midi-target)<=.8).sort((a,b)=>Math.abs(a.midi-target)-Math.abs(b.midi-target))[0]||null;
  return {selected:{period:rate/selected.freq,midi:pitch,difference:1-selected.confidence},upper:near(pitch+12),lower:near(pitch-12),top:top.sort((a,b)=>a.difference-b.difference)};
 }
 function fromSamples(samples,frames,rate=16000){
  const size=Math.round(1024*rate/16000);
  return frames.map(f=>{const offset=Math.round(f.time*rate),length=Math.round(f.duration*rate),begin=offset+Math.floor(length/2)-Math.floor(size/2);
   const window=new Float32Array(size);for(let j=0;j<size;j++)window[j]=samples[begin+j]||0;
   return {...f,yin:candidates(window,rate,f)};
  });
 }
 const CONFIG={id:'D-isolated-one',context:'frames',anchors:1,maxDuration:.24,maxDifference:.35,maxGap:.25};
 const voiced=f=>f&&f.freq&&f.confidence>=.85&&f.rms>=.008;
 const eligible=(f,c)=>voiced(f)&&f.yin?.upper&&Math.abs(f.yin.upper.midi-f.yin.selected.midi-12)<=.8&&
  f.yin.upper.difference<=c.maxDifference&&f.yin.upper.difference-f.yin.selected.difference<=c.maxGap&&
  // A nearly perfect full-period match is evidence for a genuine low note.
  f.yin.upper.difference<=8*f.yin.selected.difference;
 function correct(track){
  const c=CONFIG;
  const changed=new Set(),reasons=[];
  if(c.id!=='A-current')for(let i=0;i<track.length;i++){
   const f=track[i];if(!eligible(f,c))continue;
   let accepted=!c.context;
   if(c.context==='frames'){
    const anchor=direction=>{let count=0,first=null,last=f,j=i+direction;
     for(;j>=0&&j<track.length;j+=direction){const x=track[j];
      if(Math.abs(x.time-f.time)>c.maxDuration+.09||x.rms<.008||Math.abs(x.time-last.time)>.031)return null;
      last=x;
      if(voiced(x)&&Math.abs(midi(x.freq)-f.yin.upper.midi)<=1){first??=x;if(++count>=c.anchors)return first}
      else if(count)return null;
      else if(voiced(x)&&Math.abs(midi(x.freq)-f.yin.selected.midi)>1.5)return null;
     }return null;
    };
    const left=anchor(-1),right=anchor(1);
    accepted=!!(left&&right&&right.time-left.time-left.duration<=c.maxDuration+1e-9&&Math.abs(midi(left.freq)-midi(right.freq))<=1);
   }
   if(accepted){changed.add(i);reasons.push({index:i,time:f.time,from:f.yin.selected.midi,to:f.yin.upper.midi,selectedDifference:f.yin.selected.difference,upperDifference:f.yin.upper.difference,method:c.id})}
  }
  return {track:track.map((f,i)=>changed.has(i)?{...f,freq:hz(f.yin.upper.midi)}:{...f}),corrections:reasons};
 }
 return {candidates,fromSamples,correct};
});
