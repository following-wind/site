import {components,contentHTML} from './components/components.js';
import {elementStyles,borderHTML,borderStyles} from './exporter.js';
import {orderedElements} from './state.js';
export function renderCanvas(canvas,state,selectedIds){
  const selected=selectedIds instanceof Set?selectedIds:new Set(selectedIds?[selectedIds]:[]);
  canvas.style.width=`${state.canvas.width}px`;canvas.style.height=`${state.canvas.height}px`;canvas.style.background=state.canvas.background;
  const ids=new Set(state.elements.map(e=>e.id));for(const node of [...canvas.children])if(!ids.has(node.dataset.id))node.remove();
  for(const [index,e] of orderedElements(state.elements).entries()){
    let node=canvas.querySelector(`[data-id="${e.id}"]`);if(node&&node.tagName.toLowerCase()!==components[e.type].tag){node.remove();node=null;}
    if(!node){node=document.createElement(components[e.type].tag);node.className='board-element';node.dataset.id=e.id;canvas.append(node);}
    if(canvas.children[index]!==node)canvas.insertBefore(node,canvas.children[index]??null);
    node.innerHTML=contentHTML(e)+borderHTML(e);const border=node.querySelector('.element-border');if(border)border.style.cssText=Object.entries(borderStyles(e)).map(([k,v])=>k+':'+v).join(';');
    node.style.cssText=Object.entries(elementStyles(e)).map(([k,v])=>`${k}:${v}`).join(';');node.classList.toggle('selected',selected.has(e.id));
  }
}
