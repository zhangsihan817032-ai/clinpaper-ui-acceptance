import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { projectOf,platformOf,getProject } from '../project-config.mjs';

const root=resolve(process.argv[2]||fileURLToPath(new URL('..',import.meta.url)));
const db=JSON.parse(await readFile(resolve(process.env.REVIEW_FILE||resolve(root,'data/review.json')),'utf8'));
const ids=db.issues.map(i=>i.id);
if(new Set(ids).size!==ids.length)throw new Error('问题编号重复');
if(db.runs.some(r=>r.id==='cp-20261020-initial'))for(let n=1;n<=25;n++)if(!ids.includes(`CP-${String(n).padStart(3,'0')}`))throw new Error('历史问题缺失');
for(const i of db.issues){const p=getProject(projectOf(i));if(!p||!p.platforms.some(x=>x.id===platformOf(i))||!i.id.startsWith(p.prefix+'-'))throw new Error('问题项目或端别无效');for(const id of i.relatedIssueIds||[])if(!db.issues.some(o=>o.id===id&&projectOf(o)===p.id))throw new Error('跨项目问题关联');}
if(new Set(db.runs.map(r=>r.id)).size!==db.runs.length)throw new Error('批次编号重复');
let images=0;
for(const run of db.runs){
  const project=getProject(projectOf(run));if(!project)throw new Error('批次项目无效');
  for(const p of run.pages)if(!project.platforms.some(x=>x.id===platformOf(p)))throw new Error('批次页面端别无效');
  for(const f of run.findings)if(!db.issues.some(i=>i.id===f.issueId&&projectOf(i)===project.id))throw new Error('跨项目复核');
  const objects=[...run.pages.flatMap(p=>p.images),...run.findings.map(f=>f.evidence)].filter(Boolean);
  for(const evidence of objects){
    if(!evidence.asset.startsWith(`assets/runs/${run.id}/`)||evidence.asset.includes('..'))throw new Error(`证据不属于批次：${evidence.asset}`);
    if(!(await stat(resolve(root,evidence.asset))).isFile())throw new Error(`截图缺失：${evidence.asset}`);
    images++;
  }
  for(const issue of run.issueSnapshots){
    if(projectOf(issue)!==project.id)throw new Error('跨项目快照');
    const asset=issue.evidence?.asset;
    if(!asset?.startsWith('assets/runs/')||asset.includes('..')||!(await stat(resolve(root,asset))).isFile())throw new Error(`原始问题证据缺失：${issue.id}`);
    images++;
  }
}
let visualImages=0;
async function checkVisual(v,label) {
  if(!v)return;
  if(!v.location||!v.note)throw new Error(`界面定位缺少位置或来源：${label}`);
  for(const [side,s] of Object.entries({actual:v.actual,design:v.design})) {
    if(!s){if(side==='actual')throw new Error(`缺少实际界面图：${label}`);continue;}
    if(!['actual','source-render','dom-replay','figma'].includes(s.kind)||!s.label||!s.version)throw new Error(`截图来源缺失：${label}`);
    if(side==='actual'&&s.kind==='figma')throw new Error(`设计图不能代替实际截图：${label}`);
    if(!/^assets\/runs\/[a-z0-9-]+\/[a-zA-Z0-9_./-]+\.(png|jpe?g|webp)$/i.test(s.asset||'')||s.asset.includes('..')||!(await stat(resolve(root,s.asset))).isFile())throw new Error(`界面截图缺失或类型无效：${label}`);
    if(![s.width,s.height].every(n=>Number.isFinite(n)&&n>0)||!Array.isArray(s.regions)||!s.regions.length)throw new Error(`截图尺寸/标注无效：${label}`);
    for(const r of [s.crop,...s.regions.map(r=>r.rect)])if(!Array.isArray(r)||r.length!==4||!r.every(Number.isFinite)||r[0]<0||r[1]<0||r[2]<=0||r[3]<=0||r[0]+r[2]>s.width||r[1]+r[3]>s.height)throw new Error(`截图裁切/标注越界：${label}`);
    visualImages++;
  }
}
for(const i of db.issues){await checkVisual(i.evidence?.visual,i.id);for(const h of i.history||[])await checkVisual(h.evidence?.visual,`${i.id}/${h.runId}`);}
for(const r of db.runs){for(const f of r.findings)await checkVisual(f.evidence?.visual,`${r.id}/${f.issueId}`);for(const i of r.issueSnapshots)await checkVisual(i.evidence?.visual,`${r.id}/${i.id}`);}
const supplement=await readFile(resolve(root,'assets/evidence-locations.js'),'utf8').catch(e=>{if(e.code==='ENOENT')return null;throw e;});
if(supplement){const data=JSON.parse(supplement.replace(/^window.CLINPAPER_VISUAL_EVIDENCE=/,'').replace(/;\s*$/,''));for(const [key,v] of Object.entries(data.records||{})){if(key!==`${v.runId}:${v.issueId}`||!db.runs.find(r=>r.id===v.runId)?.issueSnapshots.some(i=>i.id===v.issueId))throw new Error(`补充定位未关联原始问题：${key}`);await checkVisual(v,key);}}
console.log(JSON.stringify({ok:true,issues:ids.length,runs:db.runs.length,evidenceReferences:images,visualImageReferences:visualImages,statuses:Object.fromEntries(['待处理','已解决','已忽略'].map(s=>[s,db.issues.filter(i=>i.status===s).length]))}));
