export function createCropper(canvas,onChange){
  const ctx=canvas.getContext('2d');let image=null,crop=null,drag=null;
  function centeredCrop(zoom=1){const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height,size=Math.min(width,height)/zoom;return {x:(width-size)/2,y:(height-size)/2,size};}
  function clamp(next){const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;next.size=Math.min(next.size,width,height);next.x=Math.max(0,Math.min(width-next.size,next.x));next.y=Math.max(0,Math.min(height-next.size,next.y));return next;}
  function transform(){const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height,scale=Math.min(canvas.width/width,canvas.height/height);return {scale,ox:(canvas.width-width*scale)/2,oy:(canvas.height-height*scale)/2};}
  function draw(){
    ctx.clearRect(0,0,canvas.width,canvas.height);if(!image)return;const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height,{scale,ox,oy}=transform();ctx.imageSmoothingEnabled=true;ctx.drawImage(image,ox,oy,width*scale,height*scale);
    const x=ox+crop.x*scale,y=oy+crop.y*scale,size=crop.size*scale;ctx.fillStyle='rgba(15,27,24,.58)';ctx.fillRect(ox,oy,width*scale,y-oy);ctx.fillRect(ox,y+size,width*scale,oy+height*scale-y-size);ctx.fillRect(ox,y,x-ox,size);ctx.fillRect(x+size,y,ox+width*scale-x-size,size);
    ctx.strokeStyle='#fff';ctx.lineWidth=2;ctx.strokeRect(x+1,y+1,size-2,size-2);ctx.strokeStyle='#65d2aa';ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(x+size/3,y);ctx.lineTo(x+size/3,y+size);ctx.moveTo(x+size*2/3,y);ctx.lineTo(x+size*2/3,y+size);ctx.moveTo(x,y+size/3);ctx.lineTo(x+size,y+size/3);ctx.moveTo(x,y+size*2/3);ctx.lineTo(x+size,y+size*2/3);ctx.stroke();
  }
  const getCrop=()=>crop?{...crop}:null;function emit(){draw();onChange?.(getCrop());}
  function setImage(nextImage){image=nextImage;crop=centeredCrop();emit();}
  function reset(){if(!image)return;crop=centeredCrop();emit();}
  function center(){if(!image||!crop)return;const width=image.naturalWidth||image.width,height=image.naturalHeight||image.height;crop.x=(width-crop.size)/2;crop.y=(height-crop.size)/2;emit();}
  function setZoom(nextZoom){if(!image||!crop)return;const centerX=crop.x+crop.size/2,centerY=crop.y+crop.size/2,zoom=Math.max(1,Math.min(8,Number(nextZoom))),base=Math.min(image.naturalWidth||image.width,image.naturalHeight||image.height);crop=clamp({x:centerX-base/zoom/2,y:centerY-base/zoom/2,size:base/zoom});emit();}
  canvas.addEventListener('pointerdown',event=>{if(!image||!crop)return;const rect=canvas.getBoundingClientRect(),{scale,ox,oy}=transform(),px=(event.clientX-rect.left)*canvas.width/rect.width,py=(event.clientY-rect.top)*canvas.height/rect.height,x=(px-ox)/scale,y=(py-oy)/scale;if(x<crop.x||x>crop.x+crop.size||y<crop.y||y>crop.y+crop.size)return;drag={pointerId:event.pointerId,startX:x,startY:y,cropX:crop.x,cropY:crop.y};canvas.setPointerCapture(event.pointerId);canvas.classList.add('dragging');event.preventDefault();});
  canvas.addEventListener('pointermove',event=>{if(!drag||event.pointerId!==drag.pointerId)return;const rect=canvas.getBoundingClientRect(),{scale,ox,oy}=transform(),x=((event.clientX-rect.left)*canvas.width/rect.width-ox)/scale,y=((event.clientY-rect.top)*canvas.height/rect.height-oy)/scale;crop=clamp({...crop,x:drag.cropX+x-drag.startX,y:drag.cropY+y-drag.startY});emit();});
  for(const name of ['pointerup','pointercancel'])canvas.addEventListener(name,event=>{if(!drag||event.pointerId!==drag.pointerId)return;if(canvas.hasPointerCapture(event.pointerId))canvas.releasePointerCapture(event.pointerId);drag=null;canvas.classList.remove('dragging');});
  return {setImage,getCrop,setZoom,reset,center,draw};
}
