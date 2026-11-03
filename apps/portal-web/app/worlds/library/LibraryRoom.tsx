'use client';
import { libraryScene,libraryAreas,libraryWorldVersion } from '@virtual-city/library-world';
import WorldRoomPanel,{ type RoomExperience } from '../../components/WorldRoomPanel';
const experience:RoomExperience={slug:'library',worldVersion:libraryWorldVersion,scene:libraryScene,title:'Eternal Library',eyebrow:'QUIET COMPANY',badge:'LOCAL LIBRARY PREVIEW',noun:'library',theme:'reading-room',sceneLabel:'Original library floor plan. Reading corner and study alcove, eight desks, bookshelves and a shared entrance. Native desk and movement controls follow below.',caption:'READING CORNER · STUDY ALCOVE',destinations:[{label:'Entrance',x:10,y:11},{label:'Reading aisle',x:2,y:5},{label:'Study aisle',x:11,y:5},{label:'South shelves',x:8,y:9}],areas:libraryAreas,focus:true,wardrobe:false,events:true};
export default function LibraryRoom({socketOrigin}:{socketOrigin:string}){return <WorldRoomPanel socketOrigin={socketOrigin} experience={experience}/>;}
