import {parseDesignJSON} from './validation.js';
// The editable buffer is a draft. Only store.load() can make it canonical.
export function createJSONEditor({editor,apply,reset,message,error,getState,loadState}) {
  let baseline='', pending=false;
  const serialize=()=>JSON.stringify(getState(),null,2);
  function feedback() {
    const conflict=pending && serialize()!==baseline;
    message.textContent=conflict?'GUIも変更されています。Applyすると、この下書きで全体を置き換えます。':pending?'未適用のJSON下書き · Applyで反映':'stateと同期済み';
    apply.disabled=!pending;
    reset.disabled=!pending;
  }
  function sync() {
    if(!pending){baseline=serialize();if(editor.value!==baseline)editor.value=baseline;}
    feedback();
  }
  function discard() {
    pending=false;
    error.textContent='';
    editor.removeAttribute('aria-invalid');
    sync();
  }
  editor.addEventListener('input',()=>{
    pending=editor.value!==baseline;
    error.textContent='';editor.removeAttribute('aria-invalid');
    sync();
  });
  apply.addEventListener('click',()=>{
    try {
      if(new Blob([editor.value]).size>5*1024*1024)throw new Error('JSONは5MB以内にしてください。');
      const input=parseDesignJSON(editor.value);
      // Validation occurs before asking to replace newer GUI changes.
      loadState(input,()=>serialize()===baseline || confirm('JSONの編集中にGUIが変更されました。JSON下書きでデザイン全体を置き換えますか？'));
      discard();
    } catch(reason) {
      if(reason.name==='AbortError')return;
      error.textContent=`適用できませんでした: ${reason.message}`;
      editor.setAttribute('aria-invalid','true');
    }
  });
  reset.addEventListener('click',()=>{if(!pending || confirm('未適用のJSON下書きを破棄し、現在のstateに戻しますか？'))discard();});
  return {sync,discard,hasDraft:()=>pending};
}
