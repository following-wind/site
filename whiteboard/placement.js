// Translate viewport pixels to the fixed canvas coordinate system.
export function visibleCenterPosition(canvasRect,viewportRect,windowSize,canvas,part) {
  const left=Math.max(canvasRect.left,viewportRect.left,0);
  const right=Math.min(canvasRect.right,viewportRect.right,windowSize.width);
  const top=Math.max(canvasRect.top,viewportRect.top,0);
  const bottom=Math.min(canvasRect.bottom,viewportRect.bottom,windowSize.height);
  if(right<=left||bottom<=top)return {x:Math.round((canvas.width-part.width)/2),y:Math.round((canvas.height-part.height)/2)};
  return {x:Math.round(((left+right)/2-canvasRect.left)*canvas.width/canvasRect.width-part.width/2),y:Math.round(((top+bottom)/2-canvasRect.top)*canvas.height/canvasRect.height-part.height/2)};
}
