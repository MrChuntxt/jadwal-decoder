import { useMemo, useRef, useState } from "preact/hooks";
import logoUrl from "../assets/ug-logo.png";
import { exportText, makeSession, norm, recalc, uid, type RawRow, type EditableRawKey, type Session } from "../lib/schedule";
import { parsePastedCascade } from "../lib/cascade";
import { groupSessions, type SortMode } from "../lib/group";
import { buildICS, downloadICS, googleCalLink } from "../lib/ics";

type ViewMode = "final" | "raw" | "split";
type LecturerMatch = { query:string; name:string; title:string; displayName:string; url:string; status:"matched"|"possible"|"manual"; score:number; note?:string };
const SAMPLE = `KELAS\tHARI\tMATA KULIAH\tWAKTU\tRUANG\tDOSEN\n1SC03\tSenin\tSistem Basis Data*\t1/2\tG237\tABDUL MUCHLIS\n1SC03\tRabu\tAlgoritma Pemrograman**\t5/6\tE314\tBUDI SANTOSO`;

function Icon({name}:{name:"upload"|"spark"|"copy"|"download"|"map"|"staff"|"calendar"}){
 const paths:Record<string,any>= {
  upload:<><path d="M12 16V4m0 0L7.5 8.5M12 4l4.5 4.5"/><path d="M5 15v4h14v-4"/></>,
  spark:<><path d="M12 3l1.6 4.4L18 9l-4.4 1.6L12 15l-1.6-4.4L6 9l4.4-1.6L12 3z"/><path d="M18.5 15l.8 2.2 2.2.8-2.2.8-.8 2.2-.8-2.2-2.2-.8 2.2-.8.8-2.2z"/></>,
  copy:<><rect x="8" y="8" width="11" height="11" rx="2"/><path d="M16 8V6a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v8a2 2 0 0 0 2 2h2"/></>,
  download:<><path d="M12 4v11m0 0l-4-4m4 4l4-4"/><path d="M5 20h14"/></>,
  map:<><path d="M12 21s6-5.2 6-12a6 6 0 1 0-12 0c0 6.8 6 12 6 12z"/><circle cx="12" cy="9" r="2"/></>,
  staff:<><circle cx="9" cy="8" r="3"/><path d="M3 19c.5-4 2.5-6 6-6s5.5 2 6 6"/><path d="M16 7h5m-2.5-2.5v5"/></>,
  calendar:<><rect x="3" y="5" width="18" height="16" rx="2"/><path d="M8 3v4m8-4v4M3 10h18"/></>
 };
 return <svg viewBox="0 0 24 24" aria-hidden="true">{paths[name]}</svg>;
}

function Field({label,value,onInput,warning,wide=false}:{label:string;value:string;onInput:(v:string)=>void;warning?:boolean;wide?:boolean}){
 return <label class={`edit-field ${wide?"wide":""} ${warning?"has-warning":""}`}><span>{label}</span><input value={value} onInput={e=>onInput((e.currentTarget as HTMLInputElement).value)} /></label>;
}
function openExternal(url:string){ if(url) window.open(url,"_blank","noopener,noreferrer"); }
function exportByMode(sessions:Session[],mode:SortMode){ if(mode==="day") return exportText(sessions); const groups:string[]=[]; for(const g of groupSessions(sessions,"class")){const cards=g.items.map(s=>`Kelas: ${s.kelas}\nWaktu: ${s.time} — ${s.dateLabel}\nMata Kuliah: ${s.course}\nRuang: ${s.roomText}${s.roomUrl?` — ${s.roomUrl}`:""}\nDosen: ${s.lecturerName}${s.lecturerTitle?` (${s.lecturerTitle})`:""}${s.lecturerUrl?` — ${s.lecturerUrl}`:""}`).join("\n");groups.push(`\n=== Kelas ${g.key} ===\n${cards}`);} return groups.join("\n").trim(); }

export function App(){
 const [rawText,setRawText]=useState("");
 const [rows,setRows]=useState<Session[]>([]);
 const [view,setView]=useState<ViewMode>("final");
 const [extracting,setExtracting]=useState(false);
 const [lookingUp,setLookingUp]=useState(false);
 const [dragging,setDragging]=useState(false);
 const [error,setError]=useState("");
 const [notice,setNotice]=useState("");
 const [fileName,setFileName]=useState("");
 const [sortMode,setSortMode]=useState<SortMode>("day");
 const [weeks,setWeeks]=useState(1);
 const fileRef=useRef<HTMLInputElement>(null);
 const apiUrl=(import.meta.env.VITE_OCR_API_URL||"").replace(/\/$/,"");
 const logo=logoUrl;
 const sessionId=useMemo(()=>`ug-${uid()}`,[]);
 const sorted=useMemo(()=>[...rows].sort((a,b)=>(a.dateISO||"9999").localeCompare(b.dateISO||"9999")||a.start.localeCompare(b.start)),[rows]);
 const groups=useMemo(()=>groupSessions(sorted,sortMode),[sorted,sortMode]);

 function toast(message:string){setNotice(message);window.setTimeout(()=>setNotice(""),2600);}
 function update(id:string,patch:Partial<Session>){setRows(rs=>rs.map(r=>r.id===id?{...r,...patch}:r));}
 function updateRaw(id:string,key:EditableRawKey,value:string){setRows(rs=>rs.map(r=>r.id===id?recalc(r,key,value):r));}

 async function resizeImage(file:File):Promise<{base64:string;mimeType:string}>{
  const bitmap=await createImageBitmap(file);const max=1500,scale=Math.min(1,max/Math.max(bitmap.width,bitmap.height));const canvas=document.createElement("canvas");canvas.width=Math.max(1,Math.round(bitmap.width*scale));canvas.height=Math.max(1,Math.round(bitmap.height*scale));canvas.getContext("2d")!.drawImage(bitmap,0,0,canvas.width,canvas.height);bitmap.close();const mimeType="image/jpeg";const data=canvas.toDataURL(mimeType,.82);return{base64:data.split(",")[1],mimeType};
 }
 async function handleFile(file?:File){
  if(!file)return;if(!file.type.startsWith("image/")){setError("Use a schedule image: JPEG, PNG, or WebP.");return;}
  if(!apiUrl){setError("OCR is not configured yet. Paste the schedule text below while the free backend is being connected.");return;}
  setError("");setFileName(file.name);setExtracting(true);setRows([]);
  try{const image=await resizeImage(file);const res=await fetch(`${apiUrl}/ocr`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({imageBase64:image.base64,mimeType:image.mimeType})});const data=await res.json();if(!res.ok)throw new Error(data.error||"Extraction failed.");const next=(data.rows as RawRow[]).map(r=>makeSession(r));setRows(next);setRawText(JSON.stringify(data.rows,null,2));setView("final");toast(`${next.length} class session${next.length===1?"":"s"} extracted.`);void lookupLecturers(next);}catch(e){setError(e instanceof Error?e.message:"Could not read that image.");}finally{setExtracting(false);}
 }
 async function parsePasted(){setError("");try{const parsed=await parsePastedCascade(rawText,apiUrl);if(!parsed.length){setError("No schedule rows were found in that text. Paste the table straight from the website (with KELAS, HARI, MATA KULIAH, WAKTU, RUANG, DOSEN columns).");return;}const next=parsed.map(({row,raw})=>makeSession(row,raw));setRows(next);setView("final");toast(`${next.length} pasted row${next.length===1?"":"s"} parsed.`);void lookupLecturers(next);}catch(e){setError(e instanceof Error?e.message:"Could not parse that text.");}}
 async function lookupLecturers(source=rows){
  const names=[...new Set(source.map(r=>r.dosen.trim()).filter(Boolean))];if(!names.length||!apiUrl)return;setLookingUp(true);setRows(rs=>rs.map(r=>names.includes(r.dosen.trim())?{...r,matchStatus:"pending"}:r));
  try{const res=await fetch(`${apiUrl}/lecturers`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({names,sessionId})});const data=await res.json();if(!res.ok)throw new Error(data.error||"Lecturer lookup failed.");const matches=new Map((data.results as LecturerMatch[]).map(m=>[norm(m.query),m]));setRows(rs=>rs.map(r=>{const m=matches.get(norm(r.dosen));return m?{...r,lecturerName:m.name||r.dosen,lecturerTitle:m.title||"",lecturerUrl:m.url,matchStatus:m.status,matchNote:m.note}:r;}));if(data.warning)toast(data.warning);}catch{setRows(rs=>rs.map(r=>r.matchStatus==="pending"?{...r,matchStatus:"manual",matchNote:"Lookup failed — use the manual search link."}:r));toast("Lecturer lookup failed; manual links remain available.");}finally{setLookingUp(false);}
 }
 async function copyAll(){if(!rows.length)return;await navigator.clipboard.writeText(exportByMode(rows,sortMode));toast("Plain text copied.");}
 async function addToCalendar(){if(!rows.length)return;const ics=buildICS(rows,{weeks,alarmMin:30});downloadICS(ics);openExternal("https://calendar.google.com/calendar/u/0/r/settings/export");toast("Schedule file downloaded — click Import on Google Calendar to add it.");}
 function download(){if(!rows.length)return;const blob=new Blob([exportByMode(rows,sortMode)],{type:"text/plain;charset=utf-8"}),url=URL.createObjectURL(blob),a=document.createElement("a");a.href=url;a.download="jadwal-gunadarma.txt";a.click();URL.revokeObjectURL(url);toast("Text file downloaded.");}
 return <main class="shell">
  <header class="masthead">
   <div><p class="eyebrow">SCHEDULE DECODER</p><h1>Jadwal<br/><em>Decoder.</em></h1></div>
   {logo&&<div class="mast-right"><img class="gundar-badge" src={logo} alt="Universitas Gunadarma"/></div>}
  </header>

  <section class="intake v-animate-in">
   <div class={`dropzone ${dragging?"dragging":""} ${extracting?"busy":""}`} onDragOver={e=>{e.preventDefault();setDragging(true)}} onDragLeave={()=>setDragging(false)} onDrop={e=>{e.preventDefault();setDragging(false);void handleFile(e.dataTransfer?.files?.[0])}} onClick={()=>!extracting&&fileRef.current?.click()} role="button" tabIndex={0} onKeyDown={e=>{if(e.key==="Enter"||e.key===" ")fileRef.current?.click()}}>
    <input ref={fileRef} type="file" accept="image/jpeg,image/png,image/webp" onChange={e=>void handleFile((e.currentTarget as HTMLInputElement).files?.[0])}/>
    <div class="drop-icon">{extracting?<span class="spinner"/>:<Icon name="upload"/>}</div>
    <div><strong>{extracting?"AI is reading the table…":apiUrl?"Upload Schedule":"OCR setup pending"}</strong><p>{extracting?"One vision call. No chained transforms.":apiUrl?(fileName||"Drop a photo here, or tap to browse"):""}</p></div>
    <small>Resized to recommendation size before extraction</small>
   </div>
   <div class="pastebox">
    <div class="paste-head"><label for="raw-input">Or paste text based schedule</label><button class="text-button" onClick={()=>setRawText(SAMPLE)}>Use sample</button></div>
    <textarea id="raw-input" value={rawText} onInput={e=>setRawText((e.currentTarget as HTMLTextAreaElement).value)} placeholder={"(copy it straight from the website or use Google lens)"} />
    <button class="parse-button" disabled={!rawText.trim()||extracting} onClick={parsePasted}><Icon name="spark"/> Parse pasted table <span>No AI</span></button>
   </div>
  </section>

  {error&&<div class="error-banner" role="alert"><b>Couldn’t finish.</b><span>{error}</span><button onClick={()=>setError("")}>×</button></div>}

  {rows.length>0&&<section class="workspace v-animate-in">
   <div class="toolbar">
    <div class="actions">
     <button class="cal-button" onClick={addToCalendar}><Icon name="calendar"/>Add to Calendar</button>
    </div>
   </div>
   <div class="sort-toggle" aria-label="Sort mode">
     <small>Sort By</small>
    <button class={sortMode==="day"?"active":""} onClick={()=>setSortMode("day")}>Day</button>
    <button class={sortMode==="class"?"active":""} onClick={()=>setSortMode("class")}>Class</button>
   </div>
   <div class={`content-grid mode-${view}`}>
    {(view==="raw"||view==="split")&&<section class="raw-panel">
     <div class="section-heading"><div><p>RAW / AUDIT LAYER</p><h2>Parsed table</h2></div><span>{rows.length} rows</span></div>
     <div class="raw-table-wrap"><table class="raw-table"><thead><tr><th>Kelas</th><th>Hari</th><th>Mata Kuliah</th><th>Waktu</th><th>Ruang</th><th>Dosen</th><th>Raw</th></tr></thead><tbody>{rows.map(r=><tr class={(r.issues?.length||0)>0?"row-warning":""}><td><input value={r.kelas} aria-label="Kelas" onInput={e=>updateRaw(r.id,"kelas",e.currentTarget.value)}/></td><td><input value={r.hari} aria-label="Hari" onInput={e=>updateRaw(r.id,"hari",e.currentTarget.value)}/></td><td><input value={r.mataKuliah} aria-label="Mata Kuliah" onInput={e=>updateRaw(r.id,"mataKuliah",e.currentTarget.value)}/></td><td><input value={r.waktu} aria-label="Waktu" onInput={e=>updateRaw(r.id,"waktu",e.currentTarget.value)}/></td><td><input value={r.ruang} aria-label="Ruang" onInput={e=>updateRaw(r.id,"ruang",e.currentTarget.value)}/></td><td><input value={r.dosen} aria-label="Dosen" onInput={e=>updateRaw(r.id,"dosen",e.currentTarget.value)}/></td><td class="raw-cell" title={r.raw}>{r.raw}</td></tr>)}</tbody></table></div>
    </section>}
    {(view==="final"||view==="split")&&<section class="final-panel">
     <div class="section-heading"><div><p>DEFORMATTED / EDITABLE</p><h2>Your week</h2></div><div class={`lookup-state ${lookingUp?"active":""}`}>{lookingUp&&<span class="spinner small"/>}{lookingUp?"Checking lecturers":"Ready to export"}</div></div>
     <div class="day-list">{groups.map((grp,groupIndex)=><section class="day-group"><div class="day-rule"><span>{String(groupIndex+1).padStart(2,"0")}</span><h3>{sortMode==="day"?(grp.items[0]?.dateLabel||"Tanggal belum terbaca"):`Kelas ${grp.key}`}</h3><i/></div><div class="cards">{grp.items.map(s=><article class="class-card">
      <div class="card-top"><Field label="KELAS" value={s.kelas} warning={!s.kelas} onInput={v=>updateRaw(s.id,"kelas",v)}/><Field label="WAKTU" value={s.time} warning={!s.time} onInput={v=>update(s.id,{time:v,start:(v.split("-")[0]||"").trim(),end:(v.split("-")[1]||"").trim()})}/><button class="icon-button" title="Add to Google Calendar" onClick={()=>openExternal(googleCalLink(s))}><Icon name="calendar"/></button></div>
      <Field label="HARI / TANGGAL" value={s.dateLabel} warning={!s.dateISO} wide onInput={v=>update(s.id,{dateLabel:v})}/>
      <Field label="MATA KULIAH" value={s.course} warning={!s.course} wide onInput={v=>update(s.id,{course:v})}/>
      <div class="linked-field"><Field label="RUANG" value={s.roomText} warning={!s.roomText} wide onInput={v=>update(s.id,{roomText:v})}/>{s.roomUrl&&<button title="Open campus in Google Maps" onClick={()=>openExternal(s.roomUrl)}><Icon name="map"/></button>}</div>
      <div class="lecturer-block"><div class="lecturer-line"><Field label="DOSEN" value={s.lecturerName} warning={!s.lecturerName} wide onInput={v=>update(s.id,{lecturerName:v,matchStatus:"manual",matchNote:"Edited manually."})}/>{s.matchStatus==="pending"?<span class="spinner small"/>:<button title="Open staff profile or search" onClick={()=>openExternal(s.lecturerUrl)}><Icon name="staff"/></button>}</div><Field label="GELAR / TITLE" value={s.lecturerTitle} wide onInput={v=>update(s.id,{lecturerTitle:v})}/><div class={`match-tag ${s.matchStatus}`}>{s.matchStatus==="matched"?"Directory match":s.matchStatus==="possible"?"Possible match — verify":s.matchStatus==="manual"?"Manual / no confident match":"Looking up…"}</div>{s.matchNote&&<small>{s.matchNote}</small>}</div>
      {(s.issues?.length||0)>0&&<div class="issues"><b>Needs review:</b> {s.issues!.join(", ")}</div>}
     </article>)}</div></section>)}</div>
    </section>}
   </div>
  </section>}

  <footer class="watermark-footer"><span class="wm">Jundi_SamKok_30626093</span></footer>
  {notice&&<div class="toast" role="status">{notice}</div>}
 </main>;
}
