// lib/ics.ts
import type {Session} from "./schedule";
const esc=(s:string)=>s.replace(/\\/g,"\\\\").replace(/;/g,"\\;").replace(/,/g,"\\,").replace(/\r?\n/g,"\\n");
const fold=(l:string)=>{const o:string[]=[];while(l.length>74){o.push(l.slice(0,74));l=" "+l.slice(74);}o.push(l);return o.join("\r\n");};
const stamp=(d:string,t:string)=>d.replace(/-/g,"")+"T"+t.replace(":","")+"00";
export function buildICS(sessions:Session[],opts={weeks:1,alarmMin:30}){
 const L=["BEGIN:VCALENDAR","VERSION:2.0","PRODID:-//Gunadarma Deformat//ID","CALSCALE:GREGORIAN","METHOD:PUBLISH",
 "BEGIN:VTIMEZONE","TZID:Asia/Jakarta","BEGIN:STANDARD","DTSTART:19700101T000000","TZOFFSETFROM:+0700","TZOFFSETTO:+0700","TZNAME:WIB","END:STANDARD","END:VTIMEZONE"];
 for(const s of sessions){L.push("BEGIN:VEVENT",
 `UID:${s.kelas}-${s.dateISO}-${s.start}@gunadarma-deformat`,
 `DTSTAMP:${new Date().toISOString().replace(/[-:]/g,"").slice(0,15)}Z`,
 `DTSTART;TZID=Asia/Jakarta:${stamp(s.dateISO,s.start)}`,
 `DTEND;TZID=Asia/Jakarta:${stamp(s.dateISO,s.end)}`,
 ...(opts.weeks>1?[`RRULE:FREQ=WEEKLY;COUNT=${opts.weeks}`]:[]),
 `SUMMARY:${esc(`${s.course} (${s.kelas})`)}`,`LOCATION:${esc(s.room)}`,`DESCRIPTION:${esc("Dosen: "+s.dosen)}`,
 "BEGIN:VALARM",`TRIGGER:-PT${opts.alarmMin}M`,"ACTION:DISPLAY","DESCRIPTION:Kelas dimulai","END:VALARM","END:VEVENT");}
 L.push("END:VCALENDAR");return L.map(fold).join("\r\n");}
export function downloadICS(ics:string){const f=new File([ics],"jadwal.ics",{type:"text/calendar"});const a=document.createElement("a");a.href=URL.createObjectURL(f);a.download="jadwal.ics";a.click();setTimeout(()=>URL.revokeObjectURL(a.href),4000);}
export async function shareOrDownloadICS(ics:string):Promise<boolean>{
 const f=new File([ics],"jadwal.ics",{type:"text/calendar"});
 if(navigator.canShare?.({files:[f]})){try{await navigator.share({files:[f],title:"Jadwal Kuliah"});return true;}catch{/* share canceled or unsupported — fall through to download */}}
 downloadICS(ics);return false;}
export const googleCalLink=(s:Session)=>"https://calendar.google.com/calendar/render?action=TEMPLATE"+
 `&text=${encodeURIComponent(`${s.course} (${s.kelas})`)}&dates=${stamp(s.dateISO,s.start)}/${stamp(s.dateISO,s.end)}`+
 `&ctz=Asia/Jakarta&location=${encodeURIComponent(s.room)}&details=${encodeURIComponent("Dosen: "+s.dosen)}`;
