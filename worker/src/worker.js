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
function extractPlaceId(link){try{const u=new URL(link),m=u.pathname.match(/^\/games\/(\d+)(?:\/|$)/i)||u.pathname.match(/^\/store\/asset\/(\d+)(?:\/|$)/i);return m?Number(m[1]):null}catch{return null}}
function parseRbxlxSummary(xml){
 if(typeof xml==='string'&&xml.length>600000)throw new Error('RBXLX terlalu besar; maksimum 600 KB');
 if(typeof xml!=='string'||!/<roblox\b[^>]*version=/i.test(xml)||!/<Item\b/i.test(xml))throw new Error('File bukan RBXLX XML valid');
 const dec=s=>String(s||'').replace(/&lt;/g,'<').replace(/&gt;/g,'>').replace(/&quot;/g,'"').replace(/&amp;/g,'&');
 const classCounts={},parts=[],scripts=[];for(const m of xml.matchAll(/<Item\s+class="([^"]+)"[^>]*>([\s\S]*?)(?=<Item\s|<\/Item>)/g)){const cls=m[1],b=m[2];classCounts[cls]=(classCounts[cls]||0)+1;const name=dec(b.match(/<string\s+name="Name">([\s\S]*?)<\/string>/)?.[1]||cls);if(/^(Part|MeshPart|WedgePart|SpawnLocation|Model)$/.test(cls)&&parts.length<120){const size=b.match(/<Vector3\s+name="size"><X>([^<]+)<\/X><Y>([^<]+)<\/Y><Z>([^<]+)<\/Z>/),pos=b.match(/<CoordinateFrame\s+name="CFrame"><X>([^<]+)<\/X><Y>([^<]+)<\/Y><Z>([^<]+)<\/Z>/);parts.push(`${cls} ${name} size=${size?size.slice(1).join(','):'?'} pos=${pos?pos.slice(1).join(','):'?'}`)}if(/^(Script|LocalScript|ModuleScript)$/.test(cls)&&scripts.length<20){const src=dec(b.match(/<(?:ProtectedString|string)\s+name="Source">(?:<!\[CDATA\[)?([\s\S]*?)(?:\]\]>)?<\/(?:ProtectedString|string)>/)?.[1]||'').replace(/\s+/g,' ').slice(0,1400);scripts.push(`${cls} ${name}: ${src}`)}}
 return{classCounts,parts,scripts};
}
async function getReferenceContext(link,fetcher=fetch){
 const placeId=extractPlaceId(link);if(!placeId)throw new Error('Link harus menuju halaman game Roblox');
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),10000);
 try{
  const universeRes=await fetcher('https://apis.roblox.com/universes/v1/places/'+placeId+'/universe',{signal:ctrl.signal});if(!universeRes.ok)throw new Error('Game referensi tidak ditemukan');
  const universeId=(await universeRes.json())?.universeId;if(!universeId)throw new Error('Universe referensi tidak ditemukan');
  const metaRes=await fetcher('https://games.roblox.com/v1/games?universeIds='+universeId,{signal:ctrl.signal});if(!metaRes.ok)throw new Error('Metadata referensi tidak tersedia');
  const meta=(await metaRes.json())?.data?.[0];if(!meta)throw new Error('Metadata game kosong');
  const thumbRes=await fetcher('https://thumbnails.roblox.com/v1/games/icons?universeIds='+universeId+'&returnPolicy=PlaceHolder&size=512x512&format=Png&isCircular=false',{signal:ctrl.signal});
  const thumbnail=thumbRes.ok?(await thumbRes.json())?.data?.[0]?.imageUrl||'':'';
  return{placeId,name:cleanText(meta.name,100),description:cleanText(meta.description,1000),builder:cleanText(meta.creator?.name,80),universeId,thumbnail};
 }finally{clearTimeout(timer)}
}
export default{async fetch(req,env){
 const h=cors(req);if(req.method==='OPTIONS')return new Response(null,{status:204,headers:h});
 if(req.method!=='POST'||new URL(req.url).pathname!=='/generate')return json({error:'Not found'},404,h);
 const ip=req.headers.get('cf-connecting-ip')||req.headers.get('x-forwarded-for')||'local';if(limited(ip))return json({error:'Terlalu banyak permintaan. Coba lagi satu menit.'},429,h);
 let body;try{body=await req.json()}catch{return json({error:'JSON tidak valid'},400,h)}
 const prompt=cleanText(body.prompt,1200),reference=cleanText(body.reference,500);let rbxlx=null;
 try{if(body.rbxlx)rbxlx=typeof body.rbxlx==='string'?parseRbxlxSummary(body.rbxlx):body.rbxlx}catch(e){return json({error:cleanText(e.message,200)},400,h)}
 if(prompt.length<8)return json({error:'Prompt minimal 8 karakter'},400,h);
 if(reference&&(!/^https:\/\/(www\.)?roblox\.com\//i.test(reference)&&!/^https:\/\/create\.roblox\.com\//i.test(reference)))return json({error:'Referensi harus link roblox.com'},400,h);
 if(!env.OPENROUTER_API_KEY)return json({error:'Server belum memiliki API key'},500,h);
 try{
  let ref=null;if(reference)ref=await getReferenceContext(reference);
  const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),55000);
  const refText=ref?`REFERENSI LINK ADALAH PRIORITAS TEMA. Pertahankan tipe game, tema, atmosfer, warna, objek khas, dan struktur progres berdasarkan data resmi berikut.\nNama: ${ref.name}\nDeskripsi: ${ref.description}\nPembuat: ${ref.builder}\nURL: ${reference}`:'';
  const fileText=rbxlx?`REFERENSI FILE RBXLX ADALAH PRIORITAS STRUKTUR TERTINGGI. Tiru pola hierarchy, skala, posisi relatif, penamaan, dan mekanik script; buat implementasi baru, jangan salin kode sumber mentah.\nClass counts: ${JSON.stringify(rbxlx.classCounts)}\nParts:\n${rbxlx.parts.join('\n')}\nScript mechanics:\n${rbxlx.scripts.join('\n')}`:'';
  const content=[];if(ref?.thumbnail)content.push({type:'image_url',image_url:{url:ref.thumbnail}});content.push({type:'text',text:[fileText,refText,'INSTRUKSI TAMBAHAN USER:\n'+prompt].filter(Boolean).join('\n\n')});
  const r=await fetch('https://openrouter.ai/api/v1/chat/completions',{method:'POST',signal:ctrl.signal,headers:{'Authorization':'Bearer '+env.OPENROUTER_API_KEY,'Content-Type':'application/json','HTTP-Referer':'https://azhar0407.github.io/roblox-map-generator/','X-Title':'Roblox Map Generator'},body:JSON.stringify({model:'openrouter/free',messages:[{role:'system',content:SYSTEM},{role:'user',content}],response_format:{type:'json_object'},temperature:.45,max_tokens:8000})});clearTimeout(timer);
  const data=await r.json();if(!r.ok)throw new Error(data?.error?.message||'OpenRouter gagal: '+r.status);
  const map=validate(parseContent(data?.choices?.[0]?.message?.content));return json({map,model:data.model||'openrouter/free'},200,h);
 }catch(e){return json({error:e.name==='AbortError'?'AI timeout. Coba lagi.':cleanText(e.message,200)||'Generate gagal'},502,h)}
}};
export{validate,parseContent,extractPlaceId,getReferenceContext,parseRbxlxSummary};
