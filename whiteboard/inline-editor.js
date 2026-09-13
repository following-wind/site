import {elementStyles} from './exporter.js';

// A temporary textarea is an input surface, never the source of design state.
export function createInlineEditor({frame,getState,getScale,commit,onChange,onError}) {
  let active=null;
  function reposition() {
    if(!active)return;
    const scale=getScale(), e=active.element;
    active.input.style.left=`${e.x*scale}px`;
    active.input.style.top=`${e.y*scale}px`;
    active.input.style.transform=`scale(${scale})`;
  }
  function finish(cancel=false) {
    if(!active)return;
    const {element,input}=active;
    const text=input.value;
    active=null;
    input.remove();
    if(!cancel && text!==element.text) {
      try{commit(element.id,text);}catch(error){onError(error.message);}
    }
    onChange();
  }
  function start(id) {
    finish();
    const element=getState().elements.find(e=>e.id===id);
    if(!element || !['heading','paragraph','label'].includes(element.type))return;
    const input=document.createElement('textarea');
    input.id='inline-text';input.setAttribute('aria-label','ボード上の文字編集');
    input.setAttribute('aria-describedby','inline-help');
    input.maxLength=20000;input.spellcheck=false;input.value=element.text;
    input.style.cssText=Object.entries(elementStyles(element)).map(([k,v])=>`${k}:${v}`).join(';');
    Object.assign(input.style,{zIndex:'3',transformOrigin:'top left',resize:'none',border:'none',outline:'2px solid #328169',background:element.background==='transparent'?'#ffffff':element.background,opacity:'1',overflow:'auto',cursor:'text',userSelect:'text'});
    active={element,input};frame.append(input);reposition();onChange();
    input.addEventListener('pointerdown',event=>event.stopPropagation());
    input.addEventListener('dblclick',event=>event.stopPropagation());
    input.addEventListener('blur',()=>finish());
    input.addEventListener('keydown',event=>{
      event.stopPropagation();
      if(event.isComposing || event.keyCode===229)return;
      if(event.key==='Escape'){event.preventDefault();finish(true);}
      else if(event.key==='Enter'&&(event.ctrlKey||event.metaKey)){event.preventDefault();finish();}
    });
    input.focus({preventScroll:true});input.select();
  }
  return {start,finish,reposition,isActive:()=>!!active,hasDraft:()=>!!active&&active.input.value!==active.element.text};
}
