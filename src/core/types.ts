export type Vec3 = [number, number, number];
export interface VoxelAsset { id: string; name: string; dimensions: Vec3; voxelSize: number; origin: Vec3; cells: Record<string,string>; sourceId?: string; resolution?: number; }
export interface SceneNode { id: string; name: string; assetId?: string; parentId?: string; kind: 'mesh'|'group'|'spawn'|'trigger'; position: Vec3; rotation: Vec3; scale: Vec3; visible: boolean; locked: boolean; tags: string[]; }
export interface SourceFile {name:string; data:string;}
export interface ModelSource {id:string; name:string; files:SourceFile[];}
export interface Project {schemaVersion:1; id:string; name:string; assets:VoxelAsset[]; nodes:SceneNode[]; sources:ModelSource[]; updatedAt:string;}
export interface TriangleData { positions: number[]; colors?: number[]; }
export interface ConversionRequest {obj:string; resolution:32|64|128|256|512;}
export interface DesktopAPI {checkBinvox():Promise<{available:boolean;binvoxPath:string;source:"bundled"|"custom"|"missing";architecture:string;message:string}>; getSettings():Promise<{binvoxPath:string}>; chooseBinvox():Promise<string|null>; convert(request:ConversionRequest):Promise<{data:number[];log:string}>; cancelConversion():Promise<void>; saveFile(name:string,data:Uint8Array):Promise<boolean>; openProject():Promise<{name:string;data:number[]}|null>;}
declare global { interface Window {desktop?:DesktopAPI;} }
