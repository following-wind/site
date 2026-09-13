import {jsonErrorOffset} from './json-location.js';
import {components,defaults} from './components/components.js';
import {NUMBER_RULES,FONT_FAMILIES,FONT_WEIGHTS,BORDER_STYLES,ARROW_HEADS,normalizeColor} from './style-options.js';
const object=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const describe=value=>value===undefined?'（未指定）':JSON.stringify(value);

export function parseDesignJSON(text) {
  try{return JSON.parse(text);}catch(error){
    const message=error.message;
    const lineColumn=message.match(/line (\d+) column (\d+)/i);
    const position=message.match(/position (\d+)/i);
    let location='';
    if(lineColumn)location=`${lineColumn[1]}行目・${lineColumn[2]}列目`;
    else if(position || /end of JSON/i.test(message)){
      const offset=position?Number(position[1]):text.length;
      const before=text.slice(0,offset), lines=before.split('\n');
      location=`${lines.length}行目・${lines.at(-1).length+1}列目`;
    }
    if(!location){
      const offset=jsonErrorOffset(text);
      if(offset!==null){const lines=text.slice(0,offset).split('\n');location=lines.length+'行目・'+(lines.at(-1).length+1)+'列目';}
    }
    throw new SyntaxError(`JSON構文エラー${location?'（'+location+'）':''}: ${message}`);
  }
}

// Pure validation / normalization. No state or DOM mutations happen here.
export function validateDesignState(input) {
  if(!object(input))throw new Error('ルートはcanvasとelementsを持つオブジェクトにしてください。');
  if(input.version!==undefined&&input.version!==1)throw new Error(`version=${describe(input.version)} は未対応です。対応バージョンは1です。`);
  if(!object(input.canvas)||input.canvas.width!==1440||input.canvas.height!==900)throw new Error('canvas.widthは1440、canvas.heightは900にしてください。');
  let background;
  try{background=normalizeColor(input.canvas.background);}catch(error){throw new Error(`canvas.background: ${error.message}`);}
  if(!Array.isArray(input.elements)||input.elements.length>1000)throw new Error('elementsは最大1000パーツの配列にしてください。');
  const ids=new Map();
  const elements=input.elements.map((raw,index)=>{
    const where=`elements[${index}]（${index+1}番目）`;
    if(!object(raw))throw new Error(`${where}: パーツはオブジェクトにしてください。指定値=${describe(raw)}`);
    const context=`${where} / id=${describe(raw.id)} / type=${describe(raw.type)}`;
    if(typeof raw.type!=='string'||!Object.hasOwn(components,raw.type))throw new Error(`${context}: 未対応type ${describe(raw.type)}。対応type: ${Object.keys(components).join(', ')}`);
    if(typeof raw.id!=='string'||!/^[a-z][a-z0-9-]{0,79}$/.test(raw.id))throw new Error(`${context}: ID ${describe(raw.id)} が不正です。英小文字で始まる英小文字・数字・ハイフンの80文字以内にしてください。`);
    if(ids.has(raw.id))throw new Error(`${context}: ID重複 ${describe(raw.id)}。elements[${ids.get(raw.id)}] と elements[${index}] が同じIDです。`);
    ids.set(raw.id,index);
    const e={...defaults(raw.type),id:raw.id};
    const valueFor=key=>raw[key]===undefined?e[key]:raw[key];
    for(const [key,[min,max]] of Object.entries(NUMBER_RULES)){
      const value=valueFor(key);
      if(typeof value!=='number'||!Number.isFinite(value)||value<min||value>max||(key==='zIndex'&&!Number.isInteger(value)))throw new Error(`${context}: ${key}=${describe(value)} は${min}〜${max}${key==='zIndex'?'の整数':''}にしてください。`);
      e[key]=value;
    }
    if(e.x+e.width>1440||e.y+e.height>900)throw new Error(`${context}: x+width=${e.x+e.width}、y+height=${e.y+e.height} がキャンバス1440 × 900からはみ出します。`);
    for(const key of ['background','color','borderColor','strokeColor']){
      try{e[key]=normalizeColor(valueFor(key));}catch(error){throw new Error(`${context}: ${key}: ${error.message}`);}
    }
    e.text=valueFor('text');
    if(typeof e.text!=='string'||e.text.length>20000)throw new Error(`${context}: textは20000文字以内の文字列にしてください。`);
    for(const [key,choices] of Object.entries({textAlign:['left','center','right'],fontFamily:FONT_FAMILIES,fontWeight:FONT_WEIGHTS,borderStyle:BORDER_STYLES,strokeStyle:BORDER_STYLES,arrowHead:ARROW_HEADS})){
      e[key]=valueFor(key);
      if(!choices.includes(e[key]))throw new Error(`${context}: ${key}=${describe(e[key])} は未対応です。候補: ${choices.join(', ')}`);
    }
    return e;
  });
  return {version:1,canvas:{width:1440,height:900,background},elements};
}
