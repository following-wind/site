import { spriteFromRgba } from './sprite-codec.js';

export async function spriteFromImageBlob(blob, identity) {
  if (!blob?.type?.startsWith('image/')) throw new Error('PNGまたは画像を貼り付けてください。');
  const image = await loadImage(blob);
  const canvas = document.createElement('canvas'); canvas.width = image.width; canvas.height = image.height;
  const ctx = canvas.getContext('2d', { willReadFrequently: true }); ctx.imageSmoothingEnabled = false;
  ctx.drawImage(image, 0, 0);
  return spriteFromRgba({ ...identity, width: canvas.width, height: canvas.height, rgba: ctx.getImageData(0, 0, canvas.width, canvas.height).data });
}

function loadImage(blob) {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(blob), image = new Image();
    image.onload = () => { URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { URL.revokeObjectURL(url); reject(new Error('画像を読み取れませんでした。PNGとしてコピーまたはドロップしてください。')); };
    image.src = url;
  });
}
