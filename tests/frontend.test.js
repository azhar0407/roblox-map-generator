const test=require('node:test'),assert=require('node:assert/strict'),fs=require('fs');
const html=fs.readFileSync(require('path').join(__dirname,'..','index.html'),'utf8');
test('checkpoint exports as Part, only spawn is SpawnLocation',()=>{assert.match(html,/p\.kind==='spawn'\?'SpawnLocation':'Part'/);assert.doesNotMatch(html,/p\.kind==='spawn'\|\|p\.kind==='checkpoint'/)});
test('new player defaults to Spawn not Checkpoint1',()=>{assert.match(html,/workspace:FindFirstChild\(stage\[pl\.UserId\] and \("Checkpoint"\.\./)});
test('browser parses RBXLX with DOMParser and sends summary not XML',()=>{assert.match(html,/new DOMParser\(\)/);assert.match(html,/rbxlxSummary/);assert.doesNotMatch(html,/const rbxlx=f\?await f\.text\(\):''/)});
test('upload disclosure says summary reaches AI provider',()=>{assert.match(html,/ringkasan struktur dan mekanik dikirim ke penyedia AI/i)});
test('handles empty or non-JSON API response',()=>{assert.match(html,/async function readApiResponse/);assert.match(html,/Respons server kosong/);assert.doesNotMatch(html,/d=await r\.json\(\)/)});
