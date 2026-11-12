import {describe,it,expect} from 'vitest';
import {hexToHsv,hsvToHex,rememberColor,readColorHistory} from '../src/core/color';
describe('artist colors',()=>{
 it('matches RGB primaries and grayscale',()=>{expect(hsvToHex({h:120,s:100,v:100})).toBe('#00ff00');expect(hsvToHex({h:360,s:100,v:100})).toBe('#ff0000');expect(hsvToHex({h:240,s:100,v:50})).toBe('#000080');expect(hexToHsv('#808080').s).toBe(0);expect(hexToHsv('#000000')).toEqual({h:0,s:0,v:0});});
 it('round trips sampled RGB colors without losing channels',()=>{for(let r=0;r<=255;r+=17)for(let g=0;g<=255;g+=17)for(let b=0;b<=255;b+=17){const c='#'+[r,g,b].map(n=>n.toString(16).padStart(2,'0')).join('');expect(hsvToHex(hexToHsv(c))).toBe(c);}});
 it('deduplicates recent colors and limits history',()=>{expect(rememberColor(['#aabbcc','#112233'],'#AABBCC')).toEqual(['#aabbcc','#112233']);let colors:string[]=[];for(let i=0;i<20;i++)colors=rememberColor(colors,'#'+i.toString(16).padStart(6,'0'));expect(colors).toHaveLength(16);expect(colors[0]).toBe('#000013');});
 it('ignores invalid persisted settings',()=>{expect(readColorHistory('{broken')).toEqual([]);expect(readColorHistory('{}')).toEqual([]);expect(readColorHistory('[1,null,"bad","#AABBCC","#aabbcc","#112233"]')).toEqual(['#aabbcc','#112233']);});
});
