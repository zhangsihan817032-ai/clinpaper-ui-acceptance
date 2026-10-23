import { createServer } from 'node:http';
import { timingSafeEqual } from 'node:crypto';
import { readFile, realpath, stat } from 'node:fs/promises';
import { extname, resolve, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ReviewStore } from './store.mjs';
import { projectOf } from './project-config.mjs';

const root=resolve(process.env.REVIEW_ROOT||fileURLToPath(new URL('.',import.meta.url)));
const store=await new ReviewStore(resolve(process.env.REVIEW_FILE||`${root}/data/review.json`),root).open();
const clients=new Map();
const mime={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.png':'image/png','.jpg':'image/jpeg','.jpeg':'image/jpeg','.webp':'image/webp','.svg':'image/svg+xml'};
function json(res,code,value) { const body=JSON.stringify(value);res.writeHead(code,{'Content-Type':'application/json; charset=utf-8','Cache-Control':'no-store','Content-Length':Buffer.byteLength(body),'X-Content-Type-Options':'nosniff'});res.end(body); }
function authorized(req) {
  if(!process.env.REPORT_USER&&!process.env.REPORT_PASSWORD)return true;
  if(!process.env.REPORT_USER||!process.env.REPORT_PASSWORD)return false;
  const supplied=Buffer.from((req.headers.authorization||'').replace(/^Basic /,''),'base64');
  const expected=Buffer.from(`${process.env.REPORT_USER}:${process.env.REPORT_PASSWORD}`);
  return supplied.length===expected.length&&timingSafeEqual(supplied,expected);
}
async function body(req) {
  let size=0;const chunks=[];
  for await(const c of req) {size+=c.length;if(size>4*1024*1024)throw Object.assign(new Error('批次数据超过 4MB'),{statusCode:413});chunks.push(c);}
  try{return JSON.parse(Buffer.concat(chunks).toString()||'{}');}catch{throw Object.assign(new Error('JSON 无效'),{statusCode:400});}
}
function broadcast(){for(const [res,projectId] of clients)res.write(`event: state\ndata: ${JSON.stringify(store.statuses(projectId))}\n\n`);}
async function staticFile(req,res,pathname) {
  const asset=pathname==='/'?'index.html':decodeURIComponent(pathname.slice(1));
  if(asset!=='index.html'&&!asset.startsWith('assets/'))return json(res,404,{error:'Not found'});
  const path=resolve(root,asset);
  if(relative(root,path).startsWith('..'))return json(res,404,{error:'Not found'});
  try {
    if(relative(await realpath(root),await realpath(path)).startsWith('..'))return json(res,404,{error:'Not found'});
    if(!(await stat(path)).isFile())return json(res,404,{error:'Not found'});
    const data=await readFile(path);
    res.writeHead(200,{'Content-Type':mime[extname(path)]||'application/octet-stream','Content-Length':data.length,'Cache-Control':asset.startsWith('assets/runs/')?'public, max-age=31536000, immutable':'no-store','X-Content-Type-Options':'nosniff','Referrer-Policy':'same-origin','X-Frame-Options':'SAMEORIGIN'});
    res.end(req.method==='HEAD'?undefined:data);
  }catch(e){if(e.code==='ENOENT'||e.code==='ENOTDIR')return json(res,404,{error:'Not found'});throw e;}
}
const server=createServer(async(req,res)=>{
  try {
    if(!authorized(req)){res.writeHead(401,{'WWW-Authenticate':'Basic realm="ClinPaper UI Review", charset="UTF-8"'});return res.end('Authentication required');}
    const url=new URL(req.url,'http://localhost');
    const scoped=url.pathname.match(/^\/api\/projects\/([a-z0-9-]+)(\/.*)?$/);
    const projectId=scoped?scoped[1]:'clinpaper';
    const p=scoped?`/api${scoped[2]||'/review'}`:url.pathname;
    if(scoped)store.project(projectId);
    if(!['GET','HEAD'].includes(req.method)&&req.headers.origin&&req.headers.origin!==`http://${req.headers.host}`&&req.headers.origin!==`https://${req.headers.host}`)return json(res,403,{error:'跨站写入已拒绝'});
    if(p==='/api/health'&&req.method==='GET')return json(res,200,{ok:true,sharedStatus:true,issueCount:store.db.issues.length,runCount:store.db.runs.filter(r=>!r.deletedAt).length});
    if(p==='/api/projects'&&req.method==='GET')return json(res,200,store.projects());
    if(p==='/api/review'&&req.method==='GET')return json(res,200,store.snapshot(projectId));
    if(p==='/api/status'&&req.method==='GET')return json(res,200,store.statuses(projectId));
    if(p==='/api/events'&&req.method==='GET'){
      res.writeHead(200,{'Content-Type':'text/event-stream','Cache-Control':'no-cache, no-transform','Connection':'keep-alive','X-Accel-Buffering':'no'});
      res.write(`event: state\ndata: ${JSON.stringify(store.statuses(projectId))}\n\n`);clients.set(res,projectId);req.on('close',()=>clients.delete(res));return;
    }
    if(p==='/api/status'&&req.method==='PUT'){const b=await body(req);if(b.projectId&&b.projectId!==projectId)return json(res,400,{error:'项目不一致'});await store.status(b.id,b.status,projectId);broadcast();return json(res,200,store.statuses(projectId));}
    if(p==='/api/status'&&req.method==='DELETE'){await store.reset(projectId);broadcast();return json(res,200,store.statuses(projectId));}
    if(p==='/api/status/import'&&req.method==='POST'){await store.importStatuses((await body(req)).statuses,projectId);broadcast();return json(res,200,store.statuses(projectId));}
    if(p==='/api/runs'&&req.method==='GET')return json(res,200,store.snapshot(projectId).runs.filter(r=>url.searchParams.get('deleted')==='true'?r.deletedAt:!r.deletedAt).map(({issueSnapshots,...r})=>r));
    if(p==='/api/runs'&&req.method==='POST'){const id=await store.publish(await body(req),projectId);broadcast();return json(res,201,{id,projectId,revision:store.db.revision,url:`/index.html#project/${projectId}/run/${id}`});}
    const match=p.match(/^\/api\/runs\/([a-z0-9-]+)(\/restore)?$/);
    if(match){
      const run=store.db.runs.find(r=>r.id===match[1]&&projectOf(r)===projectId);if(!run)return json(res,404,{error:'批次不存在'});
      if(req.method==='GET'&&!match[2])return run.deletedAt?json(res,410,{error:'批次已删除，可在回收站恢复'}):json(res,200,run);
      if((req.method==='DELETE'&&!match[2])||(req.method==='POST'&&match[2])){await store.trash(run.id,!!match[2],projectId);broadcast();return json(res,200,{ok:true,revision:store.db.revision});}
    }
    if(['GET','HEAD'].includes(req.method)&&!p.startsWith('/api/'))return await staticFile(req,res,p);
    return json(res,404,{error:'Not found'});
  }catch(e){console.error(e.message);if(!res.headersSent)json(res,e.statusCode||500,{error:e.statusCode?e.message:'服务器暂时无法保存，请重试；原数据未被替换'});else res.end();}
});
const heartbeat=setInterval(()=>{for(const r of clients.keys())r.write(': heartbeat\n\n');},25000);heartbeat.unref();
server.listen(Number(process.env.PORT||8786),process.env.HOST||'127.0.0.1',()=>console.log(`UI 样式验收中心本地预览，端口 ${process.env.PORT||8786}，${store.db.issues.length} 条问题，${store.db.runs.length} 个批次`));
for(const signal of ['SIGTERM','SIGINT'])process.on(signal,()=>{for(const r of clients.keys())r.end();server.close(()=>process.exit(0));});
