// Add approved font families here; Properties and JSON validation share this list.
export const FONT_FAMILIES=['system-ui','sans-serif','serif','monospace'];
export const FONT_WEIGHTS=[100,200,300,400,500,600,700,800,900];
export const BORDER_STYLES=['solid','dashed','dotted'];
export const ARROW_HEADS=['end','start','both','none'];
export const NUMBER_RULES={
  x:[0,1440],y:[0,900],width:[1,1440],height:[1,900],fontSize:[1,300],
  fontWeight:[100,900],lineHeight:[0.5,5],letterSpacing:[-20,100],
  borderRadius:[0,9999],borderWidth:[0,100],opacity:[0,1],zIndex:[-100000,100000],
  rotation:[0,359],strokeWidth:[1,100],arrowHeadSize:[4,100]
};

export function normalizeColor(value) {
  if(typeof value!=='string')throw new Error('色は#rgb、#rrggbb、またはtransparentで指定してください。');
  const color=value.trim().toLowerCase();
  if(color==='transparent' || /^#[0-9a-f]{6}$/.test(color))return color;
  if(/^#[0-9a-f]{3}$/.test(color))return '#'+[...color.slice(1)].map(c=>c+c).join('');
  throw new Error(`色 ${JSON.stringify(value)} は#rgb、#rrggbb、またはtransparentで指定してください。`);
}
