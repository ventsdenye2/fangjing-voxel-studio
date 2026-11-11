// binvox needs positions and faces only; retain source OBJ indexing instead of
// expanding every triangle into three new vertices with long float strings.
export function geometryOnlyObj(text:string):string {
  const chunks:string[]=[];let lines:string[]=[];let size=0;
  const flush=()=>{if(lines.length){chunks.push(lines.join('\n')+'\n');lines=[];}};
  for(const match of text.replace(/\\\r?\n/g,'').matchAll(/^[ \t]*(v|f)[ \t]+([^\r\n]*)/gm)){
    const fields=match[2].split('#',1)[0].trim().split(/\s+/);
    if(match[1]==='v'){
      if(fields.length<3||!fields.slice(0,3).every(v=>Number.isFinite(Number(v))))throw Error('OBJ 包含无效顶点');
      lines.push('v '+fields.slice(0,3).join(' '));
    }else{
      const indices=fields.filter(v=>!v.startsWith('#')).map(v=>v.split('/')[0]);
      if(indices.length<3||!indices.every(v=>/^-?[1-9]\d*$/.test(v)))throw Error('OBJ 包含无效面索引');
      lines.push('f '+indices.join(' '));
    }
    if(++size%8192===0)flush();
  }
  flush();return chunks.join('');
}

export async function trianglesToObj(positions:Float32Array):Promise<string>{
  const chunks:string[]=[];let lines:string[]=[];const vertices=new Map<string,number>();let next=1;
  const flush=()=>{if(lines.length){chunks.push(lines.join('\n')+'\n');lines=[];}};
  for(let i=0;i<positions.length;i+=9){
    const face:number[]=[];
    for(let j=0;j<9;j+=3){
      const key=[positions[i+j],positions[i+j+1],positions[i+j+2]].join(' ');
      let id=vertices.get(key);if(id===undefined){id=next++;vertices.set(key,id);lines.push('v '+key);}face.push(id);
    }
    lines.push('f '+face.join(' '));
    if(i%73728===0){flush();await new Promise(r=>setTimeout(r,0));}
  }
  flush();return chunks.join('');
}
