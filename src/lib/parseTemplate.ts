// lib/parseTemplate.ts
import type {RawRow} from "./parseMessy";
const KELAS=/^\d[A-Z]{2,3}\d{2}$/i;
const WAKTU=/^\d{1,2}(\s*\/\s*\d{1,2})*$/;
const RUANG=/^[ACDEGH]\d{3}$/i;
const HARI=/^(sen(in)?|sel(asa)?|rab(u)?|kam(is)?|jum'?at|sab(tu)?|min(ggu)?)$/i;
const HEADER=/^(kelas|hari|mata\s*kuliah|waktu\s*ruang|waktu|ruang|dosen)$/i;
const HARI_MAP:Record<string,string>={sen:"Senin",sel:"Selasa",rab:"Rabu",kam:"Kamis",jum:"Jumat",sab:"Sabtu",min:"Minggu"};
export function parseTemplate(text:string):RawRow[]{
 const tokens=text.replace(/[’‘`´]/g,"'").split(/[\t\r\n]+/).map(t=>t.trim()).filter(t=>t&&!HEADER.test(t));
 const chunks:string[][]=[];
 for(const tok of tokens){if(KELAS.test(tok))chunks.push([tok]);else if(chunks.length)chunks[chunks.length-1].push(tok);}
 return chunks.map(c=>{
  const hariIdx=c.findIndex((t,i)=>i>0&&HARI.test(t));
  const ruangIdx=c.findIndex((t,i)=>i>hariIdx&&RUANG.test(t));
  const waktuIdx=ruangIdx>0&&WAKTU.test(c[ruangIdx-1])?ruangIdx-1:-1;
  const ms=hariIdx>=0?hariIdx+1:1;
  const me=waktuIdx>=0?waktuIdx:ruangIdx>=0?ruangIdx:c.length;
  const row:RawRow={kelas:c[0].toUpperCase(),
   hari:hariIdx>=0?HARI_MAP[c[hariIdx].toLowerCase().slice(0,3)]:undefined,
   matkul:c.slice(ms,me).join(" ")||undefined,
   waktu:waktuIdx>=0?c[waktuIdx].replace(/\s+/g,""):undefined,
   ruang:ruangIdx>=0?c[ruangIdx].toUpperCase():undefined,
   dosen:ruangIdx>=0?c.slice(ruangIdx+1).join(" ")||undefined:undefined,
   raw:c.join(" | "),complete:false};
  row.complete=!!(row.hari&&row.matkul&&row.waktu&&row.ruang);return row;});}
