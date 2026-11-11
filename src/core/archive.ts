import {zipSync,unzipSync,strToU8,strFromU8} from 'fflate';
import {GLTFExporter} from 'three/addons/exporters/GLTFExporter.js';
import {buildProjectScene} from './mesh';
import type {Project} from './types';
const MAX_BYTES=100*1024*1024;
function assert(condition:unknown,message:string):asserts condition {if(!condition)throw new Error(message);}
export function validateProject(value:unknown):asserts value is Project {
 assert(value&&typeof value==='object','Invalid project');const p=value as Project;
 assert(p.schemaVersion===1&&typeof p.id==='string'&&typeof p.name==='string'&&typeof p.updatedAt==='string','Invalid project header');
 assert(Array.isArray(p.assets)&&p.assets.length<=256&&Array.isArray(p.nodes)&&p.nodes.length<=10000&&Array.isArray(p.sources)&&p.sources.length<=256,'Invalid project collections');
 const vector=(v:unknown)=>Array.isArray(v)&&v.length===3&&v.every(n=>typeof n==='number'&&Number.isFinite(n));
 const ids=new Set<string>();for(const a of p.assets){assert(a&&typeof a.id==='string'&&!ids.has(a.id),'Duplicate asset');ids.add(a.id);assert(typeof a.name==='string'&&vector(a.dimensions)&&a.dimensions.every(n=>Number.isSafeInteger(n)&&n>0&&n<=512)&&vector(a.origin)&&Number.isFinite(a.voxelSize)&&a.voxelSize>0,'Invalid asset');assert(a.cells&&typeof a.cells==='object'&&!Array.isArray(a.cells),'Invalid cells');let cellCount=0;for(const key in a.cells){assert(++cellCount<=2000000,'Too many cells');const color=a.cells[key];const parts=key.split(',');assert(parts.length===3&&parts.every((n,i)=>/^\d+$/.test(n)&&Number(n)<a.dimensions[i])&&typeof color==='string'&&/^#[0-9a-f]{6}$/i.test(color),'Invalid cell');}}
 const nodes=new Map(p.nodes.map(n=>[n.id,n]));assert(nodes.size===p.nodes.length,'Duplicate node');for(const n of p.nodes){assert(n&&typeof n.id==='string'&&typeof n.name==='string'&&['mesh','group','spawn','trigger'].includes(n.kind)&&vector(n.position)&&vector(n.rotation)&&vector(n.scale)&&typeof n.visible==='boolean'&&typeof n.locked==='boolean'&&Array.isArray(n.tags)&&n.tags.every(t=>typeof t==='string'),'Invalid node');assert(!n.assetId||ids.has(n.assetId),'Missing asset');assert(!n.parentId||nodes.has(n.parentId),'Missing parent');const visited=new Set<string>();let current:typeof n|undefined=n;while(current){assert(!visited.has(current.id),'Cyclic hierarchy');visited.add(current.id);current=current.parentId?nodes.get(current.parentId):undefined;}}
 const sourceIds=new Set<string>();for(const s of p.sources){assert(s&&typeof s.id==='string'&&!sourceIds.has(s.id)&&typeof s.name==='string'&&Array.isArray(s.files),'Invalid source');sourceIds.add(s.id);for(const f of s.files)assert(f&&typeof f.name==='string'&&typeof f.data==='string','Invalid source file');}
}
export function encodeProject(project:Project):Uint8Array {validateProject(project);const data=strToU8(JSON.stringify(project));assert(data.length<=MAX_BYTES,'Project is too large');return zipSync({'project.json':data},{level:6});}
export function decodeProject(bytes:Uint8Array|ArrayBuffer):Project {
 const data=bytes instanceof Uint8Array?bytes:new Uint8Array(bytes);assert(data.length<=MAX_BYTES,'Archive is too large');let expanded=0,count=0;
 const files=unzipSync(data,{filter:file=>{count++;assert(count<=16,'Too many archive entries');assert(file.name==='project.json','Unexpected archive entry');expanded+=file.originalSize;assert(expanded<=MAX_BYTES,'Expanded archive is too large');return true;}});assert(files['project.json'],'Missing project.json');const value:unknown=JSON.parse(strFromU8(files['project.json']));validateProject(value);return value;
}
export async function exportSceneGlb(project:Project):Promise<ArrayBuffer>{validateProject(project);return await new GLTFExporter().parseAsync(buildProjectScene(project),{binary:true,onlyVisible:true}) as ArrayBuffer;}
