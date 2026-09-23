// lib/cascade.ts
import {parseTemplate} from "./parseTemplate";
import {parseMessy} from "./parseMessy";
import type {RawRow as SchedRow} from "./schedule";

type ParsedRow = ReturnType<typeof parseMessy>[number];

const KELAS=/^\d[A-Z]{2,3}\d{2}$/i;
const HARI=/^(senin|selasa|rabu|kamis|jumat|sabtu|minggu)$/i;
const WAKTU=/^\d{1,2}(\s*\/\s*\d{1,2})*$/;
const RUANG=/^[ACDEGH]\d{3}$/i;

function incompleteRatio(rows:ParsedRow[]):number{
  if(!rows.length) return 1;
  return rows.filter(r=>!r.complete).length/rows.length;
}
function acceptable(rows:ParsedRow[]):boolean{
  return rows.length>0 && incompleteRatio(rows)<=0.30;
}
function isValidField(v:string|undefined,re:RegExp):boolean{ return !!v && re.test(v.trim()); }
function toSchedRows(rows:ParsedRow[]):{row:SchedRow;raw:string}[]{
  return rows.map(p=>{
    const issues:string[]=[];
    const kelas=p.kelas||"";
    const hari=p.hari||"";
    const mataKuliah=p.matkul||"";
    const waktu=p.waktu||"";
    const ruang=p.ruang||"";
    const dosen=p.dosen||"";
    if(!kelas)issues.push("KELAS");
    if(!isValidField(hari,HARI)){issues.push("HARI");}
    if(!isValidField(waktu,WAKTU)){issues.push("WAKTU");}
    if(!isValidField(ruang,RUANG)){issues.push("RUANG");}
    if(!mataKuliah)issues.push("MATA KULIAH");
    if(!dosen)issues.push("DOSEN");
    return {row:{kelas,hari,mataKuliah,waktu,ruang,dosen,issues},raw:p.raw||""};
  });
}
async function aiRows(text:string,apiUrl:string):Promise<{row:SchedRow;raw:string}[]>{
  const res=await fetch(`${apiUrl.replace(/\/$/,"")}/parse`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({text})});
  if(!res.ok) throw new Error("AI parse failed.");
  const data=await res.json();
  const list=Array.isArray(data.rows)?data.rows as {kelas?:string;hari?:string;mataKuliah?:string;waktu?:string;ruang?:string;dosen?:string}[]:[];
  return list.map(item=>{
    const issues:string[]=Array.isArray((item as any).issues)?((item as any).issues as unknown[]).map(String).filter(Boolean):[];
    const kelas=item.kelas||""; const hari=item.hari||""; const mataKuliah=item.mataKuliah||"";
    const waktu=item.waktu||""; const ruang=item.ruang||""; const dosen=item.dosen||"";
    if(!kelas)issues.push("KELAS");
    if(!isValidField(hari,HARI))issues.push("HARI");
    if(!isValidField(waktu,WAKTU))issues.push("WAKTU");
    if(!isValidField(ruang,RUANG))issues.push("RUANG");
    if(!mataKuliah)issues.push("MATA KULIAH");
    if(!dosen)issues.push("DOSEN");
    return {row:{kelas,hari,mataKuliah,waktu,ruang,dosen,issues},raw:kelas+" | "+hari+" | "+mataKuliah+" | "+waktu+" | "+ruang+" | "+dosen};
  });
}
// Main cascade: try free parsers, then ONE AI text call.
export async function parsePastedCascade(text:string,apiUrl:string):Promise<{row:SchedRow;raw:string}[]>{
  const clean=text.replace(/[’‘`´]/g,"'");
  const t1=parseTemplate(clean);
  if(acceptable(t1)) return toSchedRows(t1);
  const t2=parseMessy(clean);
  if(acceptable(t2)) return toSchedRows(t2);
  // AI fallback: send incomplete rows' raw (or whole text) for one strict-JSON call.
  if(!apiUrl){ // no backend: return whatever the looser parser found so user can fix manually
    const best=t2.length?t2:t1;
    return toSchedRows(best);
  }
  const incomplete=t2.filter(r=>!r.complete);
  const send = incomplete.length? incomplete.map(r=>r.raw).join("\n---\n") : clean;
  const ai=await aiRows(send,apiUrl);
  if(!ai.length) return toSchedRows(t2.length?t2:t1);
  return ai;
}
