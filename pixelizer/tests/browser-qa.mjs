import assert from 'node:assert/strict';
import {readFile,mkdir} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {chromium} from 'playwright';

const origin='http://127.0.0.1:8768',artifacts=new URL('../artifacts/',import.meta.url);
await mkdir(artifacts,{recursive:true});
const browser=await chromium.launch({headless:true,args:['--no-sandbox']});
try{
  const context=await browser.newContext({viewport:{width:1440,height:1100},permissions:['clipboard-read','clipboard-write']});
  const page=await context.newPage(),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(`${origin}/pixelizer/`);await page.waitForSelector('#drop-zone');
  async function dropGenerated(width,height,type,alpha=false){
    await page.evaluate(async({width,height,type,alpha})=>{
      const canvas=document.createElement('canvas');canvas.width=width;canvas.height=height;const ctx=canvas.getContext('2d');
      const gradient=ctx.createLinearGradient(0,0,width,height);gradient.addColorStop(0,'#191f4f');gradient.addColorStop(.5,'#d84f6f');gradient.addColorStop(1,'#f2c76f');ctx.fillStyle=gradient;ctx.fillRect(0,0,width,height);
      ctx.fillStyle='#73c7a1';ctx.fillRect(width*.22,height*.18,width*.42,height*.55);
      if(alpha)ctx.clearRect(0,0,width*.2,height*.3);
      const blob=await new Promise(resolve=>canvas.toBlob(resolve,type,.9)),file=new File([blob],`qa.${type.split('/')[1]}`,{type}),transfer=new DataTransfer();transfer.items.add(file);document.querySelector('#drop-zone').dispatchEvent(new DragEvent('drop',{bubbles:true,dataTransfer:transfer}));
    },{width,height,type,alpha});
    await page.waitForFunction(([width,height])=>window.pixelizerQA?.state.image?.naturalWidth===width&&window.pixelizerQA?.state.image?.naturalHeight===height,[width,height]);
  }
  await dropGenerated(1920,1080,'image/jpeg');
  let crop=await page.evaluate(()=>window.pixelizerQA.cropper.getCrop());assert.deepEqual(crop,{x:420,y:0,size:1080});
  await page.waitForFunction(()=>window.pixelizerQA.state.pixelData?.width===256);
  let result=await page.evaluate(()=>({width:document.querySelector('#pixel-canvas').width,height:document.querySelector('#pixel-canvas').height,colors:Number(document.querySelector('#result-colors').textContent),match:document.querySelector('#code-match').textContent}));
  assert.deepEqual(result,{width:256,height:256,colors:result.colors,match:'CODE MATCH 100%'});assert.ok(result.colors<=32);
  const downloadPromise=page.waitForEvent('download');await page.locator('#download-png').click();const download=await downloadPromise,downloadPath=fileURLToPath(new URL('pixelized-256-32colors.png',artifacts));await download.saveAs(downloadPath);
  const png=await readFile(downloadPath);assert.equal(png.toString('ascii',1,4),'PNG');assert.equal(png.readUInt32BE(16),256);assert.equal(png.readUInt32BE(20),256);
  await page.locator('#copy-code').click();const code=await page.evaluate(()=>navigator.clipboard.readText());assert.match(code,/width: 256/);assert.match(code,/function buildPixelSpriteCanvas/);
  await page.locator('#copy-image').click();await page.waitForFunction(()=>document.querySelector('#toast').textContent.includes('PNG画像をコピーしました'));const clipboardTypes=await page.evaluate(async()=>[...(await navigator.clipboard.read())[0].types]);assert.ok(clipboardTypes.includes('image/png'));
  for(const size of [32,64,128,256]){await page.locator(`[data-size="${size}"]`).click();await page.waitForFunction(size=>window.pixelizerQA.state.pixelData?.width===size,size);const qa=await page.evaluate(()=>{const data=window.pixelizerQA.state.pixelData,compact=window.pixelizerQA.encodeCompact(data),decoded=window.pixelizerQA.decodeCompact(compact);let same=data.rgba.length===decoded.length;for(let i=0;same&&i<decoded.length;i++)same=data.rgba[i]===decoded[i];return {width:data.width,height:data.height,same};});assert.deepEqual(qa,{width:size,height:size,same:true});}
  await dropGenerated(1080,1920,'image/png',true);crop=await page.evaluate(()=>window.pixelizerQA.cropper.getCrop());assert.deepEqual(crop,{x:0,y:420,size:1080});
  await page.locator('[data-size="128"]').click();await page.waitForFunction(()=>window.pixelizerQA.state.pixelData?.width===128);
  const alpha=await page.evaluate(()=>{const data=window.pixelizerQA.state.pixelData.rgba;let transparent=0;for(let i=3;i<data.length;i+=4)if(data[i]===0)transparent++;return transparent;});assert.ok(alpha>0);
  for(const palette of ['adaptive32','adaptive16','pyxel16']){await page.locator(`[data-palette="${palette}"]`).click();await page.waitForFunction(palette=>window.pixelizerQA.state.mode===palette,palette);assert.equal(await page.locator('#code-match').textContent(),'CODE MATCH 100%');}
  await page.screenshot({path:fileURLToPath(new URL('pixelizer.png',artifacts)),fullPage:true});assert.deepEqual(errors,[]);
  console.log('PASS: landscape JPEG crop, portrait/transparent PNG, 32/64/128/256, three palettes, 256px PNG dimensions, COPY IMAGE image/png, COPY CODE, CODE MATCH 100%.');
}finally{await browser.close();}
