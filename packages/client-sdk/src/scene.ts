import type {AvatarAppearance,RoomSnapshot,SceneManifest} from '@virtual-city/contracts';

// Renderer ownership is presentation only. No engine,React,Node or authority
// implementation belongs in this port; the host owns lifetime and DOM actions.
export interface RoomSceneHandle {
 update(snapshot:RoomSnapshot|null):void;
 suspend():void;
 setReducedMotion(value:boolean,override?:boolean):void;
 destroy():void;
}
export interface RoomSceneOptions {
 signal?:AbortSignal;
 outfit?:AvatarAppearance['outfit'];
 theme?:'cafe'|'reading-room'|'dining-room'|'lounge'|'park'|'deadline'|'maid';
 onMove?:(point:{x:number;y:number})=>void;
 quality?:SceneQuality;
 onGraphicsState?:(available:boolean)=>void;
}
export type RoomSceneFactory=(host:HTMLElement,scene:SceneManifest,onSeat:(seatId:string)=>void,options?:RoomSceneOptions)=>Promise<RoomSceneHandle>;
export type SceneQuality='low'|'balanced'|'high';
export interface AnimalStudyHandle extends RoomSceneHandle {
 setPose(pose:'idle'|'walk'|'sit'|'serve'):void;
 setView(view:'front'|'left'|'back'|'right'):void;
 setQuality(quality:SceneQuality):void;
 setOutfit(outfit:AvatarAppearance['outfit']):void;
 zoom(direction:'in'|'out'):void;
 resetMeasurements():void;
 diagnostics():{engine:string;scope:string;frames:number;geometry:number;textures:number;calls:number;triangles:number;frameP95Ms:number|null;frameSamples:number;measuredSeconds:number;timingScope:string;contextLost:boolean;resources:{cachedQualityTiers:number;references:number};serving?:{visible:boolean;triangles:number;supportDistance:number}};
}
