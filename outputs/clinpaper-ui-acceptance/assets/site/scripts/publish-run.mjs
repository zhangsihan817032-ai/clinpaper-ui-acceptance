import { readFile, writeFile, mkdir, readdir, copyFile, stat, rename } from 'node:fs/promises';
import { resolve, join, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { ReviewStore } from '../store.mjs';

const args=process.argv.slice(2);
const get=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:null;};
const site=resolve(get('--site')||new URL('..',import.meta.url).pathname);
const database=resolve(process.env.REVIEW_FILE||join(site,'data/review.json'));
const input=get('--input');
if(!input)throw new Error('Usage: node scripts/publish-run.mjs --site SITE --origin http://127.0.0.1:8766 --input draft.json [--assets CAPTURE_DIR] [--check]');
const payload=JSON.parse(await readFile(resolve(input),'utf8'));
const runId=payload.run?.id;
if(!/^[a-z0-9][a-z0-9-]{2,79}$/.test(runId||''))throw new Error('批次 ID 无效');
const origin=get('--origin')||'http://127.0.0.1:8766';
const assetDir=get('--assets');
if(args.includes('--check')&&assetDir)throw new Error('--check 只验证已准备的数据与证据，不复制素材；请先准备批次素材目录');
if(assetDir){
  const source=resolve(assetDir),target=join(site,'assets/runs',runId);
  const existing=await new ReviewStore(database,site).open();
  if(existing.db.runs.some(r=>r.id===runId))throw new Error('批次已发布，禁止覆盖截图；使用新的批次 ID');
  await mkdir(target,{recursive:true});
  const hash=b=>createHash('sha256').update(b).digest('hex');
  async function copyTree(src,dst){
    for(const entry of await readdir(src,{withFileTypes:true})){
      if(entry.isSymbolicLink())throw new Error('素材目录不可包含符号链接');
      const from=join(src,entry.name),to=join(dst,entry.name);
      if(entry.isDirectory()){await mkdir(to,{recursive:true});await copyTree(from,to);}
      else{
        if(!/\.(png|jpe?g|webp|svg)$/i.test(entry.name))throw new Error(`素材目录只允许图片：${entry.name}`);
        const present=await stat(to).catch(()=>null);
        if(present){if(hash(await readFile(from))!==hash(await readFile(to)))throw new Error(`拒绝覆盖既有素材：${basename(to)}`);}
        else await copyFile(from,to,1);
      }
    }
  }
  await copyTree(source,target);
}
const store=await new ReviewStore(database,site).open();
const preview=await store.preview(payload);
if(args.includes('--check')){console.log(JSON.stringify({valid:true,id:runId,counts:preview.counts}));process.exit(0);}
const headers={'Content-Type':'application/json'};
if(process.env.REPORT_USER&&process.env.REPORT_PASSWORD)headers.Authorization=`Basic ${Buffer.from(`${process.env.REPORT_USER}:${process.env.REPORT_PASSWORD}`).toString('base64')}`;
const response=await fetch(new URL('/api/runs',origin),{method:'POST',headers,body:JSON.stringify(payload),signal:AbortSignal.timeout(30000)});
const result=await response.json();if(!response.ok)throw new Error(`${response.status}: ${result.error}`);
// Refresh the portable fallback after publication; the server database remains authoritative.
try {
  const snapshot=await (await fetch(new URL('/api/review',origin),{headers,signal:AbortSignal.timeout(30000)})).json();
  const target=join(site,'assets/offline-snapshot.js');
  await writeFile(`${target}.tmp`,'window.CLINPAPER_SNAPSHOT='+JSON.stringify(snapshot).replace(/</g,'\\u003c')+';\n');
  await rename(`${target}.tmp`,target);
}catch(error){console.error(`批次已发布，但离线副本未刷新：${error.message}`);}
console.log(JSON.stringify({...result,sharePath:`index.html#run/${runId}`}));
