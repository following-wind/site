// Used only when native JSON.parse fails without a position. This locates an
// error, never parses a design or bypasses the canonical JSON.parse validation.
export function jsonErrorOffset(text) {
  let i=0;
  const fail=()=>{throw i;};
  const whitespace=()=>{while(i<text.length&&/[\x20\t\r\n]/.test(text[i]))i++;};
  function string(){
    if(text[i]!=='"')fail();i++;
    while(i<text.length){
      const c=text[i];
      if(c==='"'){i++;return;}
      if(c.charCodeAt(0)<32)fail();
      if(c==='\\'){
        i++;
        if(i>=text.length)fail();
        if(text[i]==='u'){
          i++;
          for(let j=0;j<4;j++,i++)if(i>=text.length||!/[0-9a-f]/i.test(text[i]))fail();
          continue;
        }
        if(!'"\\/bfnrt'.includes(text[i]))fail();
      }
      i++;
    }
    fail();
  }
  function value(){
    whitespace();
    const c=text[i];
    if(c==='"'){string();return;}
    if(c==='{'||c==='['){
      const isObject=c==='{',end=isObject?'}':']';i++;whitespace();
      if(text[i]===end){i++;return;}
      while(true){
        if(isObject){string();whitespace();if(text[i]!==':')fail();i++;}
        value();whitespace();
        if(text[i]===end){i++;return;}
        if(text[i]!==',')fail();i++;whitespace();
      }
    }
    for(const literal of ['true','false','null'])if(text.startsWith(literal,i)){i+=literal.length;return;}
    const number=text.slice(i).match(/^-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/);
    if(number){i+=number[0].length;return;}
    fail();
  }
  try{value();whitespace();if(i!==text.length)fail();return null;}
  catch(reason){return typeof reason==='number'?reason:null;}
}
