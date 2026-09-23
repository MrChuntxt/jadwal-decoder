interface Env { AI: Ai; ALLOWED_ORIGIN: string; }
type Staff={front_title?:string;name?:string;back_title?:string;username?:string;slug?:string};
const STAFF_API="https://staffsite.gunadarma.ac.id/api/lecturers?page=1&limit=5000";
const STAFF_BASE="https://staffsite.gunadarma.ac.id";
const SYSTEM=`You extract tabular class schedules from images. Return JSON only, no markdown. Expected Indonesian columns: KELAS, HARI, MATA KULIAH, WAKTU, RUANG, DOSEN. Extract every visible class row in reading order. Do not transform, expand, correct, infer, or translate values. Preserve spelling, capitalization, asterisks, slash-separated period numbers, and room codes exactly as visible. If a cell is unreadable, use an empty string and add its uppercase field name to that row's issues array. Return exactly: {"rows":[{"kelas":"","hari":"","mataKuliah":"","waktu":"","ruang":"","dosen":"","issues":[]}],"notes":[]}. Never invent a row or missing value.`;
const TEXT_SYSTEM=`You convert messy pasted Gunadarma class-schedule text into structured rows. Return JSON only, no markdown. Expected Indonesian columns: KELAS, HARI, MATA KULIAH, WAKTU, RUANG, DOSEN. Normalize curly apostrophes to straight ones (Jum'at -> Jumat). Preserve course markers (*, **), slash-separated period numbers, and room codes exactly. If a value is missing, use an empty string and add its uppercase field name to that row's issues array. Return exactly: {"rows":[{"kelas":"","hari":"","mataKuliah":"","waktu":"","ruang":"","dosen":"","issues":[]}],"notes":[]}. Never invent a row or missing value.`;
function cors(req:Request,env:Env){const origin=req.headers.get("Origin")||"";const allowed=env.ALLOWED_ORIGIN?.split(",").map(x=>x.trim()).filter(Boolean)||[];const ok=allowed.includes(origin)||allowed.includes("*");return {ok,headers:{"Access-Control-Allow-Origin":ok?origin:"null","Vary":"Origin","Access-Control-Allow-Headers":"Content-Type","Access-Control-Allow-Methods":"POST,OPTIONS","Cache-Control":"no-store"}}}
const json=(data:unknown,status:number,headers:Record<string,string>)=>new Response(JSON.stringify(data),{status,headers:{...headers,"Content-Type":"application/json; charset=utf-8"}});
const val=(x:unknown)=>typeof x==="string"?x.trim():x==null?"":String(x).trim();
function parseJson(text:unknown){const str=typeof text==="string"?text:text==null?"":JSON.stringify(text);const clean=str.trim().replace(/^```(?:json)?\s*/i,"").replace(/\s*```$/,"");try{return JSON.parse(clean)}catch{}const a=clean.indexOf("{"),b=clean.lastIndexOf("}");if(a>=0&&b>a)return JSON.parse(clean.slice(a,b+1));throw new Error("AI did not return valid JSON")}
function normalize(v:string){return v.toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g,"").replace(/\b(dr|dra|ir|prof|apt|s\.?kom|m\.?kom|s\.?t|m\.?t|m\.?sc|msc|ph\.?d|sp\.?si|se|mm|mba|mt\.?scol)\b/gi," ").replace(/[^a-z0-9]+/g," ").trim().replace(/\s+/g," ")}
function lev(a:string,b:string){if(!a.length)return b.length;if(!b.length)return a.length;const p=Array.from({length:b.length+1},(_,i)=>i);for(let i=1;i<=a.length;i++){let last=p[0];p[0]=i;for(let j=1;j<=b.length;j++){const old=p[j];p[j]=Math.min(p[j]+1,p[j-1]+1,last+(a[i-1]===b[j-1]?0:1));last=old}}return p[b.length]}
function scoreName(query:string,candidate:string){const q=normalize(query),c=normalize(candidate);if(!q||!c)return 0;if(q===c)return 1;const qt=new Set(q.split(" ")),ct=new Set(c.split(" "));const overlap=[...qt].filter(x=>ct.has(x)).length/Math.max(qt.size,ct.size);const distance=1-lev(q,c)/Math.max(q.length,c.length);return Math.max(0,Math.min(1,overlap*.48+distance*.42+(c.includes(q)||q.includes(c)?0.1:0)))}
function manual(query:string){return{query,name:query,title:"",displayName:query,url:`${STAFF_BASE}/cari?q=${encodeURIComponent(query)}`,status:"manual",score:0,note:"No confident directory match — title left blank."}}
function matchOne(query:string,rows:Staff[]){const ranked=rows.map(staff=>({staff,score:scoreName(query,staff.name??"")})).sort((a,b)=>b.score-a.score).slice(0,2),best=ranked[0],second=ranked[1];if(!best||best.score<.54)return manual(query);const ambiguous=best.score<.76||!!(second&&best.score-second.score<.075),s=best.staff;const title=[s.front_title?.trim(),s.back_title?.trim()].filter(Boolean).join(" · ");return{query,name:s.name?.trim()||query,title,displayName:`${s.front_title?.trim()??""}${s.name?.trim()??""}${s.back_title?.trim()?`, ${s.back_title.trim()}`:""}`.trim(),url:s.username?`https://${encodeURIComponent(s.username)}.staffsite.gunadarma.ac.id`:`${STAFF_BASE}/staff/${encodeURIComponent(s.slug??"")}`,status:ambiguous?"possible":"matched",score:Number(best.score.toFixed(3)),note:ambiguous?"Possible match — please verify.":undefined}}
async function ocr(req:Request,env:Env,h:Record<string,string>){
  const body=await req.json() as {imageBase64?:string;mimeType?:string};
  const mime=body.mimeType?.toLowerCase()||"";
  if(!body.imageBase64||!["image/jpeg","image/png","image/webp"].includes(mime))return json({error:"Upload a JPEG, PNG, or WebP schedule image."},400,h);
  if(body.imageBase64.length>8_000_000)return json({error:"The resized image is too large."},413,h);
  const image=body.imageBase64;
  let raw:unknown;
  try{
    raw=await env.AI.run("@cf/google/gemma-4-26b-a4b-it",{messages:[
      {role:"system",content:SYSTEM},
      {role:"user",content:[{type:"text",text:"Extract the complete schedule table now."},{type:"image_url",image_url:{url:`data:${mime};base64,${image}`}}]}
    ],max_tokens:5000,temperature:0});
  }catch(e){
    return json({error:`OCR model failed: ${e instanceof Error?e.message:"unknown"}`},502,h);
  }
  let outText:unknown=raw;
  if(raw&&typeof raw==="object"){
    const r=raw as any;
    outText=r.response??r.result?.response??(Array.isArray(r.choices)?r.choices[0]?.message?.content:undefined)??r;
  }
  let parsed:any;
  try{parsed=parseJson(outText);}catch(e){
    return json({error:`The reader returned unexpected output (${e instanceof Error?e.message:"?"}).`},502,h);
  }
  const fields=[["kelas","KELAS"],["hari","HARI"],["mataKuliah","MATA KULIAH"],["waktu","WAKTU"],["ruang","RUANG"],["dosen","DOSEN"]] as const;
  const rows=Array.isArray(parsed.rows)?parsed.rows.slice(0,100).map((x:any)=>{const out:any={kelas:val(x?.kelas),hari:val(x?.hari),mataKuliah:val(x?.mataKuliah),waktu:val(x?.waktu),ruang:val(x?.ruang),dosen:val(x?.dosen),issues:Array.isArray(x?.issues)?x.issues.map(val).filter(Boolean):[]};for(const [k,l] of fields)if(!out[k]&&!out.issues.includes(l))out.issues.push(l);return out;}):[];
  if(!rows.length)return json({error:"No schedule rows were readable. Try a sharper image or paste the table text."},422,h);
  return json({rows,notes:Array.isArray(parsed.notes)?parsed.notes.map(val).filter(Boolean):[]},200,h);
}

const HARI_RE=/^(sen(in)?|sel(asa)?|rab(u)?|kam(is)?|jum'?at|jumat|sab(tu)?|min(ggu)?)$/i;
const WAKTU_RE=/^\d{1,2}(\s*\/\s*\d{1,2})*$/;
const RUANG_RE=/^[ACDEGH]\d{3}$/i;
const KELAS_RE=/^\d[A-Z]{2,3}\d{2}$/i;
async function prs(req:Request,env:Env,h:Record<string,string>){
  const body=await req.json() as {text?:string};
  const text=(body.text||"").trim();
  if(!text)return json({error:"No schedule text provided."},400,h);
  let raw:unknown;
  try{
    raw=await env.AI.run("@cf/google/gemma-4-26b-a4b-it",{messages:[
      {role:"system",content:TEXT_SYSTEM},
      {role:"user",content:text}
    ],max_tokens:5000,temperature:0});
  }catch(e){return json({error:`Text parse model failed: ${e instanceof Error?e.message:"unknown"}`},502,h);}
  let outText:unknown=raw;
  if(raw&&typeof raw==="object"){
    const r=raw as any;
    outText=r.response??r.result?.response??(Array.isArray(r.choices)?r.choices[0]?.message?.content:undefined)??r;
  }
  let parsed:any;
  try{parsed=parseJson(outText);}catch(e){return json({error:`The parser returned unexpected output (${e instanceof Error?e.message:"?"}).`},502,h);}
  const fields=[["kelas","KELAS"],["hari","HARI"],["mataKuliah","MATA KULIAH"],["waktu","WAKTU"],["ruang","RUANG"],["dosen","DOSEN"]] as const;
  const rows=Array.isArray(parsed.rows)?parsed.rows.slice(0,100).map((x:any)=>{const out:any={kelas:val(x?.kelas),hari:val(x?.hari),mataKuliah:val(x?.mataKuliah),waktu:val(x?.waktu),ruang:val(x?.ruang),dosen:val(x?.dosen),issues:Array.isArray(x?.issues)?x.issues.map(val).filter(Boolean):[]};return out;}):[];
  for(const r of rows){
    if(!r.kelas||!KELAS_RE.test(r.kelas)){r.kelas=val(r.kelas);r.issues.push("KELAS");}
    if(!r.hari||!HARI_RE.test(r.hari)){r.hari="";if(!r.issues.includes("HARI"))r.issues.push("HARI");}
    if(!r.waktu||!WAKTU_RE.test(r.waktu)){r.waktu="";if(!r.issues.includes("WAKTU"))r.issues.push("WAKTU");}
    if(!r.ruang||!RUANG_RE.test(r.ruang)){r.ruang="";if(!r.issues.includes("RUANG"))r.issues.push("RUANG");}
    if(!r.mataKuliah)r.issues.push("MATA KULIAH");
    if(!r.dosen)r.issues.push("DOSEN");
  }
  if(!rows.length)return json({error:"No schedule rows were readable from that text."},422,h);
  return json({rows,notes:Array.isArray(parsed.notes)?parsed.notes.map(val).filter(Boolean):[]},200,h);
}
async function lecturers(req:Request,h:Record<string,string>){const body=await req.json() as {names?:unknown[]};const names=[...new Set((Array.isArray(body.names)?body.names:[]).map(x=>String(x??"").trim()).filter(Boolean))].slice(0,100);if(!names.length)return json({results:[]},200,h);const r=await fetch(STAFF_API,{headers:{Accept:"application/json"},cf:{cacheEverything:true,cacheTtl:1800}});if(!r.ok)return json({results:names.map(manual),warning:"Staffsite was unavailable; manual links are shown."},200,h);const p=await r.json() as {data?:Staff[]};const rows=Array.isArray(p.data)?p.data:[];return json({results:names.map(n=>matchOne(n,rows))},200,h)}
export default {async fetch(req:Request,env:Env){const c=cors(req,env);if(req.method==="OPTIONS")return new Response(null,{status:c.ok?204:403,headers:c.headers});if(!c.ok)return json({error:"Origin not allowed."},403,c.headers);try{const path=new URL(req.url).pathname;if(req.method!=="POST")return json({error:"Method not allowed."},405,c.headers);if(path.endsWith("/ocr"))return await ocr(req,env,c.headers);if(path.endsWith("/parse"))return await prs(req,env,c.headers);if(path.endsWith("/lecturers"))return await lecturers(req,c.headers);return json({error:"Not found."},404,c.headers)}catch(e){return json({error:e instanceof Error?e.message:"Request failed"},500,c.headers)}}} satisfies ExportedHandler<Env>;
