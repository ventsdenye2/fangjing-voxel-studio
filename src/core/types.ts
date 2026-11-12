import type {ResourceLimits} from './resource-limits';
export type Vec3 = [number, number, number];
export interface VoxelAsset { id: string; name: string; dimensions: Vec3; voxelSize: number; origin: Vec3; cells: Record<string,string>; instanceOnly?: boolean; sourceId?: string; resolution?: number; }
export interface SceneNode { id: string; name: string; assetId?: string; prefabAssetId?: string; parentId?: string; kind: 'mesh'|'group'|'spawn'|'trigger'; position: Vec3; rotation: Vec3; scale: Vec3; visible: boolean; locked: boolean; tags: string[]; }
export interface SourceFile {name:string; data:string; encoding?:'gzip-base64';}
export interface ModelSource {id:string; name:string; files:SourceFile[];}
export interface Project {schemaVersion:1; id:string; name:string; assets:VoxelAsset[]; nodes:SceneNode[]; sources:ModelSource[]; updatedAt:string;}
export interface TriangleData { positions: number[]; colors?: number[]; }
export interface ConversionRequest {obj:string; resolution:32|64|128|256|512;}
export interface DesktopAPI {onHelp?(listener:()=>void):()=>void;checkBinvox():Promise<{available:boolean;binvoxPath:string;source:"bundled"|"custom"|"missing";architecture:string;message:string}>; getSettings():Promise<{binvoxPath:string;resourceLimits:ResourceLimits}>; setResourceLimits(limits:Partial<ResourceLimits>):Promise<ResourceLimits>; chooseBinvox():Promise<string|null>; convert(request:ConversionRequest):Promise<{data:Uint8Array;log:string}>; cancelConversion():Promise<void>; saveFile(name:string,data:Uint8Array):Promise<boolean>; openProject():Promise<{name:string;data:Uint8Array}|null>;}
declare global { interface Window {desktop?:DesktopAPI;} }
