import {nearestPyxelColor} from './palettes.js';
export const OUTPUT_SIZES=Object.freeze([32,64,128,256]);
const colorKey=(r,g,b,a)=>`${r},${g},${b},${a}`;
function buildHistogram(rgba){
  const colors=new Map();
  for(let i=0;i<rgba.length;i+=4){const a=rgba[i+3];if(a===0)continue;const key=colorKey(rgba[i],rgba[i+1],rgba[i+2],a),entry=colors.get(key);if(entry)entry.count++;else colors.set(key,{rgba:[rgba[i],rgba[i+1],rgba[i+2],a],count:1,key});}
  return [...colors.values()].sort((a,b)=>a.key.localeCompare(b.key));
}
const makeBox=colors=>({colors,total:colors.reduce((sum,item)=>sum+item.count,0)});
function channelRange(box,channel){let min=255,max=0;for(const item of box.colors){min=Math.min(min,item.rgba[channel]);max=Math.max(max,item.rgba[channel]);}return max-min;}
function boxScore(box){return Math.max(...[0,1,2,3].map(channel=>channelRange(box,channel)))*box.total;}
function splitBox(box){
  const ranges=[0,1,2,3].map(channel=>channelRange(box,channel));let channel=0;
  for(let i=1;i<ranges.length;i++)if(ranges[i]>ranges[channel])channel=i;
  const sorted=[...box.colors].sort((a,b)=>a.rgba[channel]-b.rgba[channel]||a.key.localeCompare(b.key));const middle=box.total/2;let running=0,splitAt=1;
  for(let i=0;i<sorted.length-1;i++){running+=sorted[i].count;if(running>=middle){splitAt=i+1;break;}}
  return [makeBox(sorted.slice(0,splitAt)),makeBox(sorted.slice(splitAt))];
}
function representative(box){const sums=[0,0,0,0];for(const item of box.colors)for(let channel=0;channel<4;channel++)sums[channel]+=item.rgba[channel]*item.count;return sums.map(sum=>Math.round(sum/box.total));}
export function adaptivePalette(rgba,limit){
  const histogram=buildHistogram(rgba);if(histogram.length<=limit)return histogram.map(item=>item.rgba);const boxes=[makeBox(histogram)];
  while(boxes.length<limit){let index=-1,score=-1;for(let i=0;i<boxes.length;i++){if(boxes[i].colors.length<2)continue;const candidate=boxScore(boxes[i]);if(candidate>score){score=candidate;index=i;}}if(index<0)break;boxes.splice(index,1,...splitBox(boxes[index]));}
  return boxes.map(representative);
}
function nearestRgba(color,palette){let best=palette[0],bestDistance=Infinity;for(const candidate of palette){const dr=color[0]-candidate[0],dg=color[1]-candidate[1],db=color[2]-candidate[2],da=color[3]-candidate[3],distance=dr*dr*30+dg*dg*59+db*db*11+da*da*20;if(distance<bestDistance){bestDistance=distance;best=candidate;}}return best;}
export function quantizeRgba(source,mode){
  const output=new Uint8ClampedArray(source.length);
  if(mode==='pyxel16'){for(let i=0;i<source.length;i+=4){const alpha=source[i+3];if(alpha===0)continue;const color=nearestPyxelColor(source[i],source[i+1],source[i+2]);output.set([color[0],color[1],color[2],alpha],i);}return output;}
  const limit=mode==='adaptive16'?16:32,palette=adaptivePalette(source,limit);if(!palette.length)return output;const cache=new Map();
  for(let i=0;i<source.length;i+=4){const alpha=source[i+3];if(alpha===0)continue;const key=colorKey(source[i],source[i+1],source[i+2],alpha);let color=cache.get(key);if(!color){color=nearestRgba([source[i],source[i+1],source[i+2],alpha],palette);cache.set(key,color);}output.set(color,i);}
  return output;
}
export function countColors(rgba){const colors=new Set();for(let i=0;i<rgba.length;i+=4)if(rgba[i+3]>0)colors.add(colorKey(rgba[i],rgba[i+1],rgba[i+2],rgba[i+3]));return colors.size;}
export function resizeCropToRgba(image,crop,size){
  if(!OUTPUT_SIZES.includes(size))throw new Error('未対応の出力サイズです。');const canvas=document.createElement('canvas');canvas.width=size;canvas.height=size;const ctx=canvas.getContext('2d',{willReadFrequently:true});ctx.clearRect(0,0,size,size);ctx.imageSmoothingEnabled=true;ctx.imageSmoothingQuality='high';ctx.drawImage(image,crop.x,crop.y,crop.size,crop.size,0,0,size,size);return ctx.getImageData(0,0,size,size).data;
}
export function processImage({image,crop,size,mode}){const resized=resizeCropToRgba(image,crop,size);return {width:size,height:size,rgba:quantizeRgba(resized,mode)};}
