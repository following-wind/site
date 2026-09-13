import {defaults} from './components/components.js';
import {validateDesignState} from './validation.js';
export const validateDesign=validateDesignState;
export const orderedElements=elements=>elements.map((e,index)=>({e,index})).sort((a,b)=>a.e.zIndex-b.e.zIndex||a.e.id.localeCompare(b.e.id)||a.index-b.index).map(x=>x.e);
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);

export function createStore(initial,{historyLimit=100}={}){
  let state=validateDesignState(initial),undoStack=[],redoStack=[],transaction=null;
  const listeners=new Set(),emit=()=>listeners.forEach(fn=>fn());
  const idFor=type=>{let i=1;while(state.elements.some(e=>e.id===`${type}-${String(i).padStart(3,'0')}`))i++;return `${type}-${String(i).padStart(3,'0')}`;};
  const clamp=e=>{e.width=Math.max(1,Math.min(1440,e.width));e.height=Math.max(1,Math.min(900,e.height));e.x=Math.max(0,Math.min(1440-e.width,e.x));e.y=Math.max(0,Math.min(900-e.height,e.y));return e;};
  const remember=before=>{undoStack.push(structuredClone(before));if(undoStack.length>historyLimit)undoStack.shift();redoStack=[];};
  const commit=(next,record=true)=>{next=validateDesignState(next);if(same(next,state))return false;const before=state;if(record&&!transaction)remember(before);state=next;emit();return true;};
  const normalized=()=>orderedElements(state.elements).map((e,i)=>({...e,zIndex:i+1}));
  return {
    get:()=>structuredClone(state),
    subscribe(fn){listeners.add(fn);return()=>listeners.delete(fn);},
    canUndo:()=>undoStack.length>0,canRedo:()=>redoStack.length>0,
    beginTransaction(){if(!transaction)transaction=structuredClone(state);},
    endTransaction(){if(!transaction)return;const before=transaction;transaction=null;if(!same(before,state)){undoStack.push(before);if(undoStack.length>historyLimit)undoStack.shift();redoStack=[];emit();}},
    undo(){this.endTransaction();if(!undoStack.length)return false;redoStack.push(structuredClone(state));state=undoStack.pop();emit();return true;},
    redo(){this.endTransaction();if(!redoStack.length)return false;undoStack.push(structuredClone(state));state=redoStack.pop();emit();return true;},
    load(input){return commit(input);},
    add(type,position={}){if(state.elements.length>=1000)throw new Error('パーツは最大1000個です。');const base=normalized();const e=clamp({...defaults(type),...position,id:idFor(type),zIndex:base.length+1});commit({...state,elements:[...base,e]});return e.id;},
    update(id,patch){return commit({...state,elements:state.elements.map(e=>e.id===id?clamp({...e,...patch,id:e.id,type:e.type}):e)});},
    updateMany(patches){const map=patches instanceof Map?patches:new Map(Object.entries(patches));return commit({...state,elements:state.elements.map(e=>map.has(e.id)?clamp({...e,...map.get(e.id),id:e.id,type:e.type}):e)});},
    remove(id){return this.removeMany([id]);},
    removeMany(ids){const set=new Set(ids);return commit({...state,elements:state.elements.filter(e=>!set.has(e.id))});},
    duplicate(id){const e=state.elements.find(x=>x.id===id);return e?this.add(e.type,{...e,x:e.x+24,y:e.y+24,id:undefined}):null;},
    reorder(id,action){if(typeof action==='boolean')action=action?'front':'back';let items=normalized(),index=items.findIndex(e=>e.id===id);if(index<0)return false;const [item]=items.splice(index,1);if(action==='front')items.push(item);else if(action==='back')items.unshift(item);else if(action==='forward')items.splice(Math.min(index+1,items.length),0,item);else if(action==='backward')items.splice(Math.max(index-1,0),0,item);else throw new Error('未対応の重なり順操作です。');return commit({...state,elements:items.map((e,i)=>({...e,zIndex:i+1}))});},
    setLayerOrder(frontToBack){const ids=new Set(frontToBack);if(ids.size!==state.elements.length||state.elements.some(e=>!ids.has(e.id)))throw new Error('Layersの項目が一致しません。');const byId=new Map(state.elements.map(e=>[e.id,e]));const backToFront=[...frontToBack].reverse();return commit({...state,elements:backToFront.map((id,i)=>({...byId.get(id),zIndex:i+1}))});}
  };
}
