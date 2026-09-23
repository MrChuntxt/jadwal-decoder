// lib/parseMessy.ts
const KELAS=/\b\d[A-Z]{2,3}\d{2}\b/gi;
const HARI=/\b(sen(?:in)?|sel(?:asa)?|rab(?:u)?|kam(?:is)?|jum'?at|sab(?:tu)?|min(?:ggu)?)\b/i;
const RUANG=/\b([ACDEGH]\d{3})\b/i;
const WAKTU_AT_END=/(\d{1,2}(?:\s*[\/\-,]\s*\d{1,2})*)\s*$/;
const HARI_MAP:Record<string,string>={sen:"Senin",sel:"Selasa",rab:"Rabu",kam:"Kamis",jum:"Jumat",sab:"Sabtu",min:"Minggu"};
export type RawRow={kelas:string;hari?:string;matkul?:string;waktu?:string;ruang?:string;dosen?:string;raw:string;complete:boolean};
export function parseMessy(text:string):RawRow[]{
 const t=text.replace(/[’‘`´]/g,"'").replace(/[\t\r\n|]+/g," ").replace(/\s{2,}/g," ");
 const hits=[...t.matchAll(KELAS)];
 return hits.map((m,i)=>{
  const chunk=t.slice(m.index!,hits[i+1]?.index??t.length).trim();
  const body=chunk.slice(m[0].length).trim();
  const h=body.match(HARI);
  const afterHari=h?body.slice(h.index!+h[0].length).trim():body;
  const r=afterHari.match(RUANG);
  const beforeRuang=r?afterHari.slice(0,r.index).trim():afterHari;
  const w=beforeRuang.match(WAKTU_AT_END);
  const matkul=w?beforeRuang.slice(0,w.index).trim():beforeRuang;
  const dosen=r?afterHari.slice(r.index!+r[0].length).trim():"";
  const row:RawRow={kelas:m[0].toUpperCase(),hari:h?HARI_MAP[h[1].toLowerCase().slice(0,3)]:undefined,
   matkul:matkul||undefined,waktu:w?.[1].replace(/\s+/g,""),ruang:r?.[1].toUpperCase(),dosen:dosen||undefined,raw:chunk,complete:false};
  row.complete=!!(row.hari&&row.waktu&&row.ruang&&row.matkul);return row;});}
