export const components = {
  heading: {label:'Heading', category:'text', icon:'H₁', tag:'h1', width:580, height:100, text:'Following Wind', fontSize:64},
  paragraph: {label:'Paragraph', category:'text', icon:'¶', tag:'p', width:620, height:130, text:'追い風になる小さな道具と、\nあとで効いてくるノート。', fontSize:28},
  label: {label:'Label', category:'text', icon:'Aa', tag:'span', width:240, height:40, text:'A LITTLE TAILWIND', fontSize:16},
  rectangle: {label:'Rectangle', category:'decoration', icon:'▭', tag:'div', width:320, height:180, background:'#dcebe7'},
  card: {label:'Rounded Card', category:'decoration', icon:'▢', tag:'div', width:340, height:220, background:'#edf3ef', borderRadius:28},
  circle: {label:'Circle', category:'decoration', icon:'○', tag:'div', width:180, height:180, background:'#edc26d', borderRadius:9999},
  line: {label:'Line', category:'decoration', icon:'―', tag:'div', width:420, height:3, background:'#78998d'},
  arrow: {label:'Arrow', category:'decoration', icon:'→', tag:'div', width:420, height:24, strokeColor:'#17303a', strokeWidth:4, arrowHead:'end', arrowHeadSize:12},
  logo: {label:'Logo Placeholder', category:'decoration', icon:'↗', tag:'div', width:300, height:60, text:'↗ Following Wind', fontSize:28},
  wind: {label:'Wind Lines', category:'decoration', icon:'≋', tag:'div', width:320, height:110, color:'#78998d'}
};
export const categories={text:'Text',decoration:'Decoration',images:'Images'};

export function defaults(type) {
  const c=components[type];
  if(!c)throw new Error('未対応のパーツです。');
  return {type,x:80,y:80,width:c.width,height:c.height,rotation:0,text:c.text??'',fontSize:c.fontSize??24,fontFamily:'sans-serif',fontWeight:type==='heading'?700:type==='logo'?600:400,lineHeight:1.35,letterSpacing:0,borderColor:'#17303a',borderWidth:0,borderStyle:'solid',textAlign:'left',background:c.background??'transparent',color:c.color??'#17303a',strokeColor:c.strokeColor??'#17303a',strokeWidth:c.strokeWidth??2,strokeStyle:'solid',arrowHead:c.arrowHead??'end',arrowHeadSize:c.arrowHeadSize??12,borderRadius:c.borderRadius??0,opacity:1,zIndex:1};
}
export const escapeHTML=text=>String(text).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));

export function contentHTML(e){
  if(e.type==='wind')return '<svg viewBox="0 0 320 110" width="100%" height="100%" preserveAspectRatio="none" aria-label="風のライン" role="img"><g fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round"><path d="M4 27 C80 0 140 58 235 25 S305 7 316 16"/><path d="M24 59 C100 32 155 90 270 54"/><path d="M4 88 C75 65 132 113 223 86 S290 70 310 79"/></g></svg>';
  if(e.type==='arrow'){
    const dash=e.strokeStyle==='dashed'?`${e.strokeWidth*3} ${e.strokeWidth*2}`:e.strokeStyle==='dotted'?`1 ${e.strokeWidth*2}`:'none';
    const start=`arrow-${e.id}-start`,end=`arrow-${e.id}-end`,hasStart=['start','both'].includes(e.arrowHead),hasEnd=['end','both'].includes(e.arrowHead);
    const marker=id=>`<marker id="${id}" markerWidth="${e.arrowHeadSize}" markerHeight="${e.arrowHeadSize}" refX="${e.arrowHeadSize*.82}" refY="${e.arrowHeadSize/2}" orient="auto-start-reverse" markerUnits="userSpaceOnUse"><path d="M0,0 L${e.arrowHeadSize},${e.arrowHeadSize/2} L0,${e.arrowHeadSize} Z" fill="${e.strokeColor}"/></marker>`;
    return `<svg class="arrow-svg" viewBox="0 0 ${e.width} ${e.height}" width="100%" height="100%" aria-label="矢印" role="img"><defs>${hasStart?marker(start):''}${hasEnd?marker(end):''}</defs><line x1="${hasStart?e.arrowHeadSize:0}" y1="${e.height/2}" x2="${e.width-(hasEnd?e.arrowHeadSize:0)}" y2="${e.height/2}" fill="none" stroke="${e.strokeColor}" stroke-width="${e.strokeWidth}" stroke-linecap="round" stroke-dasharray="${dash}"${hasStart?` marker-start="url(#${start})"`:''}${hasEnd?` marker-end="url(#${end})"`:''}/></svg>`;
  }
  return escapeHTML(e.text);
}
