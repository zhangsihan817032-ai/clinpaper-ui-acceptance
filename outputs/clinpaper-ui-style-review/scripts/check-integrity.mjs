import { readFile, stat } from 'node:fs/promises';
import { resolve } from 'node:path';

const root=resolve(process.argv[2]||new URL('..',import.meta.url).pathname);
const db=JSON.parse(await readFile(resolve(process.env.REVIEW_FILE||resolve(root,'data/review.json')),'utf8'));
const ids=db.issues.map(i=>i.id);
if(new Set(ids).size!==ids.length)throw new Error('问题编号重复');
for(let n=1;n<=25;n++)if(!ids.includes(`CP-${String(n).padStart(3,'0')}`))throw new Error('历史问题缺失');
if(new Set(db.runs.map(r=>r.id)).size!==db.runs.length)throw new Error('批次编号重复');
let images=0;
for(const run of db.runs){
  const objects=[...run.pages.flatMap(p=>p.images),...run.findings.map(f=>f.evidence)].filter(Boolean);
  for(const evidence of objects){
    if(!evidence.asset.startsWith(`assets/runs/${run.id}/`)||evidence.asset.includes('..'))throw new Error(`证据不属于批次：${evidence.asset}`);
    if(!(await stat(resolve(root,evidence.asset))).isFile())throw new Error(`截图缺失：${evidence.asset}`);
    images++;
  }
  for(const issue of run.issueSnapshots){
    const asset=issue.evidence?.asset;
    if(!asset?.startsWith('assets/runs/')||asset.includes('..')||!(await stat(resolve(root,asset))).isFile())throw new Error(`原始问题证据缺失：${issue.id}`);
    images++;
  }
}
console.log(JSON.stringify({ok:true,issues:ids.length,runs:db.runs.length,evidenceReferences:images,statuses:Object.fromEntries(['待处理','已解决','已忽略'].map(s=>[s,db.issues.filter(i=>i.status===s).length]))}));
