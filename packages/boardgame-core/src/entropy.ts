// Host supplies CSPRNG words from encrypted state. This is deterministic
// unbiased sampling,not a random generator or a promise about seed fairness.
export function shuffleWithWords<T>(input:readonly T[],words:readonly number[],cursor=0):{items:T[];nextCursor:number}{
 if(input.length>512||words.length>16384||!Number.isInteger(cursor)||cursor<0||cursor>words.length||words.some(word=>!Number.isInteger(word)||word<0||word>4294967295))throw Error('Game entropy unavailable');
 const items=[...input];for(let index=items.length-1;index>0;index--){const size=index+1,limit=4294967296-4294967296%size;let word:number;do{if(cursor>=words.length)throw Error('Game entropy unavailable');word=words[cursor++];}while(word>=limit);const target=word%size;[items[index],items[target]]=[items[target],items[index]];}
 return {items,nextCursor:cursor};
}
