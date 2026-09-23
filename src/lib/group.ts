// lib/group.ts
import type {Session} from "./schedule";
export type SortMode="day"|"class";
const byDT=(a:Session,b:Session)=>(a.dateISO+a.start).localeCompare(b.dateISO+b.start);
export function groupSessions(list:Session[],mode:SortMode){
 const key=(s:Session)=>mode==="day"?s.dateISO:s.kelas;
 const g=new Map<string,Session[]>();
 for(const s of list)g.set(key(s),[...(g.get(key(s))??[]),s]);
 return [...g.entries()].sort(([a],[b])=>a.localeCompare(b,undefined,{numeric:true})).map(([k,items])=>({key:k,items:items.sort(byDT)}));}
