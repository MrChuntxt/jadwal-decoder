export type RawRow = { kelas: string; hari: string; mataKuliah: string; waktu: string; ruang: string; dosen: string; issues?: string[] };
export type EditableRawKey = "kelas" | "hari" | "mataKuliah" | "waktu" | "ruang" | "dosen";
export type MatchStatus = "pending" | "matched" | "possible" | "manual";
export type Session = RawRow & { id: string; dateISO: string; dateLabel: string; course: string; time: string; roomText: string; roomUrl: string; lecturerName: string; lecturerTitle: string; lecturerUrl: string; matchStatus: MatchStatus; matchNote?: string };

export const CAMPUS_ADDRESSES: Record<string,string> = {
  A: "Kampus A Universitas Gunadarma, Jl. Kenari No. 13, Jakarta Pusat 10430",
  C: "Kampus C Universitas Gunadarma, Jl. Salemba Raya No. 53, Jakarta Pusat",
  D: "Kampus D Universitas Gunadarma, Jl. Margonda Raya, Pondok Cina, Depok",
  E: "Kampus E Universitas Gunadarma, Jl. Akses Kelapa Dua, Kelapa Dua, Cimanggis, Depok",
  G: "Kampus G Universitas Gunadarma, Jl. Akses Kelapa Dua, Kelapa Dua, Cimanggis, Depok",
  H: "Kampus H Universitas Gunadarma, Jl. Akses Kelapa Dua, Kelapa Dua, Cimanggis, Depok",
};
const PERIODS: Record<number,[string,string]> = Object.fromEntries(Array.from({length:14},(_,i)=>{ const start=450+i*60, end=start+60; const fmt=(n:number)=>`${String(Math.floor(n/60)).padStart(2,"0")}:${String(n%60).padStart(2,"0")}`; return [i+1,[fmt(start),fmt(end)]]; }));
const DAYS: Record<string,number> = { minggu:0, senin:1, selasa:2, rabu:3, kamis:4, jumat:5, sabtu:6 };
const DAY_LABELS = ["Minggu","Senin","Selasa","Rabu","Kamis","Jumat","Sabtu"];
const MONTHS = ["January","February","March","April","May","June","July","August","September","October","November","December"];

export function uid(){ return crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`; }
export function norm(v:string){ return v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/[^a-z0-9]+/g," ").trim(); }
export function nextDate(dayRaw:string, baseDate:Date=new Date()){
  const wanted=DAYS[norm(dayRaw)]; if(wanted===undefined) return {iso:"",label:dayRaw || "Tanggal belum terbaca"};
  const now=baseDate, date=new Date(now.getFullYear(),now.getMonth(),now.getDate());
  date.setDate(date.getDate()+((wanted-date.getDay()+7)%7));
  const iso=`${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
  return {iso,label:`${DAY_LABELS[wanted]}, ${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`};
}
export function courseName(raw:string){ const m=raw.match(/\s*(\*\*|\*)\s*$/); if(!m)return raw.trim(); const base=raw.slice(0,m.index).trim(); return `${base} (${m[1]==="**"?"Mata Kuliah Praktikum Penunjang (wajib diikuti dengan praktikumnya)":"Mata Kuliah Ujian Utama"})`; }
export function mergeTime(raw:string){ const nums=raw.split("/").map(x=>Number(x.trim())).filter(n=>Number.isInteger(n)); if(!nums.length||nums.some(n=>!PERIODS[n]))return raw.trim(); return `${PERIODS[nums[0]][0]}-${PERIODS[nums[nums.length-1]][1]}`; }
export function room(raw:string){ const code=raw.trim().toUpperCase(), m=code.match(/^([ACDEGH])(\d)(\d)(\d)$/); if(!m)return {text:raw.trim(),url:""}; const campus=`Kampus ${m[1]} Gunadarma`; return {text:`${campus}, Gedung ${m[2]}, Lantai ${m[3]}, Ruang ${m[4]}`,url:`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(CAMPUS_ADDRESSES[m[1]])}`}; }
export function manualStaffUrl(name:string){ return `https://staffsite.gunadarma.ac.id/cari?q=${encodeURIComponent(name)}`; }
export function makeSession(raw:RawRow):Session { const date=nextDate(raw.hari), rm=room(raw.ruang); return {...raw,id:uid(),issues:[...(raw.issues||[])],dateISO:date.iso,dateLabel:date.label,course:courseName(raw.mataKuliah),time:mergeTime(raw.waktu),roomText:rm.text,roomUrl:rm.url,lecturerName:raw.dosen,lecturerTitle:"",lecturerUrl:manualStaffUrl(raw.dosen),matchStatus:"pending"}; }
export function recalc(s:Session,field:EditableRawKey,value:string):Session { const n:Session={...s,[field]:value,issues:(s.issues||[]).filter(x=>norm(x)!==norm(field))}; if(field==="kelas")return n; if(field==="hari"){const d=nextDate(value);return {...n,dateISO:d.iso,dateLabel:d.label};} if(field==="mataKuliah")return {...n,course:courseName(value)}; if(field==="waktu")return {...n,time:mergeTime(value)}; if(field==="ruang"){const r=room(value);return {...n,roomText:r.text,roomUrl:r.url};} if(field==="dosen")return {...n,lecturerName:value,lecturerTitle:"",lecturerUrl:manualStaffUrl(value),matchStatus:"manual",matchNote:"Edited — run lecturer lookup again."}; return n; }

function splitLine(line:string){ if(line.includes("\t"))return line.split("\t"); if(line.includes("|"))return line.split("|"); if(line.includes(";"))return line.split(";"); return line.trim().split(/\s{2,}/); }
export function parseText(text:string):RawRow[]{
 const lines=text.split(/\r?\n/).map(x=>x.trim()).filter(Boolean); if(!lines.length)return [];
 const labelBlocks:RawRow[]=[]; let current:Partial<RawRow>={};
 for(const line of lines){ const m=line.match(/^(KELAS|HARI|MATA\s*KULIAH|WAKTU|RUANG|DOSEN)\s*:\s*(.*)$/i); if(m){ const map:Record<string,EditableRawKey>={kelas:"kelas",hari:"hari","mata kuliah":"mataKuliah",matakuliah:"mataKuliah",waktu:"waktu",ruang:"ruang",dosen:"dosen"}; const key=map[norm(m[1])]; if(key==="kelas"&&current.kelas){labelBlocks.push(current as RawRow);current={};} current[key]=m[2].trim(); }}
 if(Object.keys(current).length)labelBlocks.push(current as RawRow); if(labelBlocks.length)return labelBlocks.map(fill);
 let start=0; const header=splitLine(lines[0]).map(norm); if(header.some(x=>x==="kelas")&&header.some(x=>x==="dosen"))start=1;
 return lines.slice(start).map(splitLine).filter(p=>p.filter(Boolean).length>=2).map(parts=>{ const p=parts.map(x=>x.trim()).filter(Boolean); if(p.length>6){ const dosen=p.pop()!, ruang=p.pop()!, waktu=p.pop()!, kelas=p.shift()!, hari=p.shift()!; return fill({kelas,hari,mataKuliah:p.join(" "),waktu,ruang,dosen}); } return fill({kelas:p[0],hari:p[1],mataKuliah:p[2],waktu:p[3],ruang:p[4],dosen:p[5]}); });
}
function fill(r:Partial<RawRow>):RawRow{ const row={kelas:r.kelas||"",hari:r.hari||"",mataKuliah:r.mataKuliah||"",waktu:r.waktu||"",ruang:r.ruang||"",dosen:r.dosen||"",issues:[] as string[]}; const labels:[keyof RawRow,string][]=[["kelas","KELAS"],["hari","HARI"],["mataKuliah","MATA KULIAH"],["waktu","WAKTU"],["ruang","RUANG"],["dosen","DOSEN"]]; row.issues=labels.filter(([k])=>!row[k]).map(([,l])=>l); return row; }
export function exportText(rows:Session[]){ const sorted=[...rows].sort((a,b)=>(a.dateISO||"9999").localeCompare(b.dateISO||"9999")||a.time.localeCompare(b.time)); let last=""; return sorted.map(s=>{const head=s.dateLabel!==last?`\n=== ${s.dateLabel} ===\n`:"";last=s.dateLabel;return `${head}Kelas: ${s.kelas}\nWaktu: ${s.time} — ${s.dateLabel}\nMata Kuliah: ${s.course}\nRuang: ${s.roomText}${s.roomUrl?` — ${s.roomUrl}`:""}\nDosen: ${s.lecturerName}${s.lecturerTitle?` (${s.lecturerTitle})`:""}${s.lecturerUrl?` — ${s.lecturerUrl}`:""}\n`;}).join("\n").trim(); }
