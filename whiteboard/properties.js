import {components} from './components/components.js';
import {FONT_FAMILIES,FONT_WEIGHTS,BORDER_STYLES,ARROW_HEADS,NUMBER_RULES,normalizeColor} from './style-options.js';
const fields=[
  {key:'x',label:'X'},{key:'y',label:'Y'},{key:'width',label:'Width'},{key:'height',label:'Height'},
  {key:'rotation',label:'Rotation (0–359°)',types:['line','arrow']},
  {key:'text',label:'Text',type:'textarea',textOnly:true},
  {key:'fontFamily',label:'Font Family',options:FONT_FAMILIES,textOnly:true},{key:'fontSize',label:'Font Size',textOnly:true},{key:'fontWeight',label:'Font Weight',options:FONT_WEIGHTS,textOnly:true},
  {key:'lineHeight',label:'Line Height (倍率)',step:.05,textOnly:true},{key:'letterSpacing',label:'Letter Spacing (px)',textOnly:true},{key:'textAlign',label:'Text Align',options:['left','center','right'],textOnly:true},
  {key:'strokeColor',label:'Line Color',type:'color',types:['arrow']},{key:'strokeWidth',label:'Line Width',types:['arrow']},{key:'strokeStyle',label:'Line Style',options:BORDER_STYLES,types:['arrow']},
  {key:'arrowHead',label:'Arrow Head',options:ARROW_HEADS,optionLabels:{end:'End',start:'Start',both:'Both',none:'None'},types:['arrow']},{key:'arrowHeadSize',label:'Head Size',types:['arrow']},
  {key:'background',label:'Background',type:'color',notTypes:['arrow']},{key:'color',label:'Text Color',type:'color',notTypes:['arrow']},{key:'borderColor',label:'Border Color',type:'color',notTypes:['arrow']},
  {key:'borderWidth',label:'Border Width (px / 0で非表示)',notTypes:['arrow']},{key:'borderStyle',label:'Border Style',options:BORDER_STYLES,notTypes:['arrow']},{key:'borderRadius',label:'Border Radius',notTypes:['arrow']},
  {key:'opacity',label:'Opacity',step:.05},{key:'zIndex',label:'Z-index',step:1}
];
export function createProperties(form,{getSelected,update,beginChange=()=>{},endChange=()=>{}}){
  const controls=new Map();let activeKey=null,timer=null;
  const end=()=>{if(!activeKey)return;clearTimeout(timer);activeKey=null;endChange();};
  const begin=key=>{if(activeKey===key)return;clearTimeout(timer);if(activeKey){activeKey=key;endChange();beginChange();return;}activeKey=key;beginChange();};
  const labelFor=(text,id)=>{const label=document.createElement('label');label.textContent=text;label.htmlFor=id;return label;};
  for(const field of fields){
    const {key,label}=field,wrapper=document.createElement('div');wrapper.className='property-field';wrapper.dataset.field=key;
    const input=document.createElement(field.type==='textarea'?'textarea':field.options?'select':'input');input.id=`prop-${key}`;input.name=key;
    const error=document.createElement('span');error.className='field-error';error.id=`error-${key}`;error.setAttribute('aria-live','polite');input.setAttribute('aria-describedby',error.id);wrapper.append(labelFor(label,input.id));
    let picker;
    if(field.type==='color'){
      input.type='text';input.placeholder='#444 / #444444';input.autocomplete='off';input.spellcheck=false;
      picker=document.createElement('input');picker.type='color';picker.id=`prop-${key}-picker`;picker.setAttribute('aria-label',`${label} カラーピッカー`);
      const pair=document.createElement('div');pair.className='color-pair';pair.append(picker,input);wrapper.append(pair);const note=document.createElement('small');note.textContent='透明: transparent';wrapper.append(note);
    }else{
      if(input.tagName==='INPUT'){input.type='number';const [min,max]=NUMBER_RULES[key];input.min=min;input.max=max;input.step=field.step??1;}
      if(field.options)for(const value of field.options){const option=document.createElement('option');option.value=value;option.textContent=field.optionLabels?.[value]??value;input.append(option);}
      if(field.type==='textarea'){wrapper.classList.add('text-field');input.maxLength=20000;}wrapper.append(input);
    }
    wrapper.append(error);form.append(wrapper);controls.set(key,{wrapper,input,picker,error});
    function apply(source){
      const e=getSelected();if(!e)return;begin(key);input.setCustomValidity('');input.removeAttribute('aria-invalid');error.textContent='';
      try{if(input.type==='number'&&(input.value===''||!input.validity.valid))throw new Error(`${input.min}〜${input.max}の数値を入力してください。`);const value=field.type==='color'?normalizeColor(source.value):key in NUMBER_RULES?Number(source.value):source.value;update(e.id,{[key]:value});if(picker){picker.value=value==='transparent'?'#000000':value;picker.classList.toggle('is-transparent',value==='transparent');picker.title=value==='transparent'?'透明（色を選ぶと不透明になります）':value;if(source===picker)input.value=value;}clearTimeout(timer);timer=setTimeout(end,450);}catch(reason){error.textContent=reason.message;input.setAttribute('aria-invalid','true');}}
    input.addEventListener('focus',()=>begin(key));input.addEventListener('input',()=>apply(input));input.addEventListener('change',()=>{apply(input);if(input.tagName==='SELECT')end();});
    input.addEventListener('blur',()=>{end();const e=getSelected();if(e){input.value=e[key];error.textContent='';input.removeAttribute('aria-invalid');}});
    if(picker){picker.addEventListener('focus',()=>begin(key));picker.addEventListener('input',()=>apply(picker));picker.addEventListener('change',end);picker.addEventListener('blur',end);}
  }
  form.addEventListener('submit',event=>event.preventDefault());let previousId=null;
  return {finish:end,render(e){form.hidden=!e;if(!e){previousId=null;end();return;}const changed=previousId!==e.id;previousId=e.id;for(const field of fields){const {wrapper,input,picker,error}=controls.get(field.key);wrapper.hidden=(field.textOnly&&!Object.hasOwn(components[e.type],'text'))||(field.types&&!field.types.includes(e.type))||field.notTypes?.includes(e.type);if(changed||(document.activeElement!==input&&activeKey!==field.key)){input.value=e[field.key];error.textContent='';input.removeAttribute('aria-invalid');}if(picker){const color=e[field.key];picker.value=color==='transparent'?'#000000':color;picker.classList.toggle('is-transparent',color==='transparent');picker.title=color==='transparent'?'透明（色を選ぶと不透明になります）':color;}}}};
}
