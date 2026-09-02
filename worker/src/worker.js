const SYSTEM=`Anda mesin desain map Roblox. Balas HANYA JSON valid tanpa markdown.
Schema: {"title":"...","description":"...","parts":[{"name":"...","kind":"part|spawn|checkpoint|finish|kill|podium","position":[x,y,z],"size":[x,y,z],"color":"#RRGGBB"}],"features":{"checkpoints":true|false,"winner":true|false,"leaderboard":true|false}}
Buat map dari prompt pengguna. Maksimal 160 parts. Wajib tepat satu spawn. Jika obby: jalur harus bisa dilompati (jarak horizontal <=14, vertikal <=6), checkpoint berkala. Jika minta juara/winner: tambahkan finish dan podium 1/2/3, features winner+leaderboard true. Koordinat -500..500, ukuran 0.5..200. Gunakan part sederhana, tanpa asset eksternal. Nama singkat aman.`;
const ALLOWED_ORIGINS=['https://azhar0407.github.io','http://localhost:8000','http://127.0.0.1:8000'];
const rate=new Map();
function cors(req){const o=req.headers.get('Origin')||'';return{'Access-Control-Allow-Origin':ALLOWED_ORIGINS.includes(o)?o:ALLOWED_ORIGINS[0],'Access-Control-Allow-Headers':'Content-Type','Access-Control-Allow-Methods':'POST,OPTIONS','Vary':'Origin'};}
function json(data,status,headers){return new Response(JSON.stringify(data),{status,headers:{'Content-Type':'application/json; charset=utf-8',...headers}})}
function limited(ip){const now=Date.now(),a=(rate.get(ip)||[]).filter(t=>now-t<60000);if(a.length>=8)return true;a.push(now);rate.set(ip,a);return false;}
function cleanText(v,n){return String(v||'').replace(/[<>]/g,'').trim().slice(0,n)}
function num(v,min,max,d){v=Number(v);return Number.isFinite(v)?Math.max(min,Math.min(max,v)):d}
function validate(raw){
 const kinds=new Set(['part','spawn','checkpoint','finish','kill','podium']);
 const src=Array.isArray(raw?.parts)?raw.parts.slice(0,160):[];
 const parts=[];let spawn=false;
 for(const p of src){
  if(!p||!Array.isArray(p.position)||!Array.isArray(p.size))continue;
  let kind=kinds.has(p.kind)?p.kind:'part';if(kind==='spawn'){if(spawn)kind='part';else spawn=true;}
  const color=/^#[0-9a-f]{6}$/i.test(p.color||'')?p.color:'#6b8cff';
  parts.push({name:cleanText(p.name,40)||kind,kind,position:[num(p.position[0],-500,500,0),num(p.position[1],-100,500,0),num(p.position[2],-500,500,0)],size:[num(p.size[0],.5,200,4),num(p.size[1],.5,200,1),num(p.size[2],.5,200,4)],color});
 }
 if(!spawn)parts.unshift({name:'Spawn',kind:'spawn',position:[0,3,0],size:[10,1,10],color:'#eeeeee'});
 if(parts.length<2)throw new Error('Model tidak menghasilkan map yang valid');
 return{title:cleanText(raw.title,80)||'Generated Map',description:cleanText(raw.description,240),parts,features:{checkpoints:!!raw.features?.checkpoints,winner:!!raw.features?.winner,leaderboard:!!raw.features?.leaderboard}};
}
function parseContent(s){s=String(s||'').trim().replace(/^```(?:json)?\s*/i,'').replace(/\s*```$/,'');return JSON.parse(s);}
export default{async fetch(req,env){
 const h=cors(req);if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h});
 if(req.method!=='POST'||new URL(req.url).pathname!=='/generate')return json({error:'Not found'},404,h);
 const ip=req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')||'local';if(limited(ip))return json({error:'Terlalu banyak permintaan. Coba lagi satu menit.'},429,h);
 let body;try{body=await req.json()}catch{return json({error:'JSON tidak valid'},400,h)}
 const prompt=cleanText(body.prompt,1200),reference=cleanText(body.reference,500);
 if(prompt.length<8)return json({error:'Prompt minimal 8 karakter'},400,h);
 if(reference&&(!/^https:\/\/(www\.)?roblox\.com\//i.test(reference)&&!/^https:\/\/create\.roblox\.com\//i.test(reference)))return json({error:'Referensi harus link roblox.com'},400,h);
 if(!env.OPENROUTER_API_KEY)return json({error:'Server belum memiliki API key'},500,h);
 try{
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),55000);
  const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',signal:ctrl.signal,headers:{'Authorization':'Bearer '+env.OPENROUTER_API_KEY,'Content-Type':'application/json','HTTP-Referer':'https://azhar0407.github.io/roblox-map-generator/','X-Title':'Roblox Map Generator'},body:JSON.stringify({model:'openrouter/free',messages:[{role:'system',content:SYSTEM},{role:'user',content:prompt+(reference?'\nReferensi gaya (metadata/link saja, jangan menyalin asset): '+reference:'')}],response_format:{type:'json_object'},temperature:.65,max_tokens:8000})});clearTimeout(timer);
  const data=await r.json();if(!r.ok)throw new Error(data?.error?.message||'OpenRouter gagal: '+r.status);
  const map=validate(parseContent(data?.choices?.[0]?.message?.content));return json({map,model:data.model||'openrouter/free'},200,h);
 }catch(e){return json({error:e.name==='AbortError'?'AI timeout. Coba lagi.':cleanText(e.message,200)||'Generate gagal'},502,h)}
}};
export{validate,parseContent};
