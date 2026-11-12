export type HSV={h:number;s:number;v:number};
export const normalizeHex=(value:string):string|null=>/^#[0-9a-f]{6}$/i.test(value)?value.toLowerCase():null;
export function hsvToHex({h,s,v}:HSV):string{
 const hue=((h%360)+360)%360/60,sat=Math.max(0,Math.min(100,s))/100,val=Math.max(0,Math.min(100,v))/100;
 const c=val*sat,x=c*(1-Math.abs(hue%2-1)),m=val-c;
 const rgb=hue<1?[c,x,0]:hue<2?[x,c,0]:hue<3?[0,c,x]:hue<4?[0,x,c]:hue<5?[x,0,c]:[c,0,x];
 return '#'+rgb.map(n=>Math.round((n+m)*255).toString(16).padStart(2,'0')).join('');
}
export function hexToHsv(hex:string):HSV{
 const [r,g,b]=[1,3,5].map(i=>parseInt(hex.slice(i,i+2),16)/255);
 const max=Math.max(r,g,b),min=Math.min(r,g,b),d=max-min;
 const h=d===0?0:max===r?60*((g-b)/d%6):max===g?60*((b-r)/d+2):60*((r-g)/d+4);
 return {h:(h+360)%360,s:max===0?0:d/max*100,v:max*100};
}
export function rememberColor(history:string[],color:string):string[]{
 const valid=normalizeHex(color);if(!valid)return history;
 return [valid,...history.filter(c=>normalizeHex(c)&&c.toLowerCase()!==valid).map(c=>c.toLowerCase())].slice(0,16);
}
export function readColorHistory(raw:string|null):string[]{
 try{const data:unknown=JSON.parse(raw??'[]');if(!Array.isArray(data))return [];return [...new Set(data.filter((c):c is string=>typeof c==='string'&&!!normalizeHex(c)).map(c=>c.toLowerCase()))].slice(0,16);}catch{return [];}
}
