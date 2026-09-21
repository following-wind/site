// Current official Pyxel palette: https://github.com/kitao/pyxel/blob/main/docs/pyxel.gpl
export const PYXEL_16=Object.freeze([
  [0,0,0],[43,51,95],[126,32,114],[25,149,156],
  [139,72,82],[57,92,152],[169,193,255],[238,238,238],
  [212,24,108],[211,132,65],[233,195,91],[112,198,169],
  [118,150,222],[163,163,163],[255,151,152],[237,199,176]
]);
export const PALETTE_MODES=Object.freeze({
  adaptive32:{label:'Adaptive 32 colors',limit:32,type:'adaptive'},
  adaptive16:{label:'Adaptive 16 colors',limit:16,type:'adaptive'},
  pyxel16:{label:'Pyxel 16 colors',limit:16,type:'fixed'}
});
export function nearestPyxelColor(r,g,b){
  let best=PYXEL_16[0],bestDistance=Infinity;
  for(const color of PYXEL_16){const dr=r-color[0],dg=g-color[1],db=b-color[2],distance=dr*dr*30+dg*dg*59+db*db*11;if(distance<bestDistance){bestDistance=distance;best=color;}}
  return best;
}
