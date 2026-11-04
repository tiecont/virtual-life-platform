import type { DatingProfileData } from '@virtual-city/contracts';
export function mutualTopics(a:DatingProfileData,b:DatingProfileData){return a.preferredTopics.some(topic=>b.topics.includes(topic))&&b.preferredTopics.some(topic=>a.topics.includes(topic))&&(a.pace==='either'||b.pace==='either'||a.pace===b.pace);}
