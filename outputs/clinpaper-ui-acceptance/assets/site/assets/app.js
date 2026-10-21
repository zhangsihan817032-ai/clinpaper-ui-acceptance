(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeAsset=s=>/^assets\/runs\/[a-z0-9-]+\/[a-zA-Z0-9_./-]+$/.test(s||'')&&!s.includes('..')?s:'';
  const platforms={desktop:'桌面端',mobile:'移动端'};
  const statuses=['待处理','已解决','已忽略'];
  const categories=['字体','字重','颜色','间距','尺寸与对齐','线条','圆角'];
  const cacheKey='clinpaper-review:v2';
  let db,online=false,busy=false,pollBusy=false,toastTimer;
  let issueFilters={page:'all',platform:'all',category:'all',status:'all',search:''};
  let recordSearch='';
  function cached(){try{return JSON.parse(localStorage.getItem(cacheKey));}catch{return null;}}
  function cache(){try{localStorage.setItem(cacheKey,JSON.stringify(db));}catch{}}
  function sync(text,mode=''){const el=$('#sync-status');el.textContent=text;el.className=`sync ${mode}`;}
  function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,5000);}
  async function api(path,options={}) {
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
    try {const res=await fetch(path,{cache:'no-store',...options,signal:controller.signal,headers:{'Content-Type':'application/json',...options.headers}});const data=await res.json();if(!res.ok)throw new Error(data.error||`HTTP ${res.status}`);return data;}finally{clearTimeout(timer);}
  }
  function activeRuns(){return db.runs.filter(r=>!r.deletedAt).sort((a,b)=>b.date.localeCompare(a.date)||b.snapshotAt.localeCompare(a.snapshotAt));}
  function badge(text,style=''){return `<span class="badge ${style}">${escape(text)}</span>`;}
  function metric(value,label){return `<div class="metric"><b>${escape(value)}</b><span>${escape(label)}</span></div>`;}
  function counts(r){return `<div class="count-row"><span><b>${r.counts.added}</b>新增</span><span><b>${r.counts.fixed}</b>修复</span><span><b>${r.counts.reopened}</b>复发</span><span><b>${r.counts.pendingReview}</b>待复核项</span></div>`;}
  function shareButton(id){return `<button type="button" class="btn" data-share="${escape(id||'')}">复制分享链接</button>`;}
  function runCard(r,trash=false) {
    return `<article class="run-card" data-run-id="${escape(r.id)}"><div class="run-top"><div><div class="meta">${escape(r.date)} · ${escape(r.id)}</div><h2>${trash?escape(r.name):`<a href="#run/${escape(r.id)}">${escape(r.name)}</a>`}</h2></div>${badge(r.type,'purple')}</div><p class="run-summary">${escape(r.scope)}</p>${counts(r)}<div class="run-bottom"><span class="mini muted">${trash?`删除于 ${escape(new Date(r.deletedAt).toLocaleString('zh-CN'))}`:escape(r.conclusion)}</span><div class="actions">${trash?`<button class="btn primary" data-restore="${escape(r.id)}">恢复批次</button>`:`<a class="btn primary" href="#run/${escape(r.id)}">查看验收详情</a>${shareButton(r.id)}<button class="btn danger" data-trash="${escape(r.id)}">删除</button>`}</div></div></article>`;
  }
  function recordsView(trash=false) {
    const runs=trash?db.runs.filter(r=>r.deletedAt).sort((a,b)=>b.deletedAt.localeCompare(a.deletedAt)):activeRuns();
    $('#content').innerHTML=`<div class="heading"><div><p class="eyebrow">${trash?'RECYCLE BIN':'ACCEPTANCE HISTORY'}</p><h1>${trash?'回收站':'每次验收，都有记录'}</h1><p class="intro">${trash?'删除的批次可在这里恢复。删除不会影响当前问题与其他批次，本版本不提供永久清空。':'同一个验收中心，持续记录 ClinPaper 的设计对照与修复回归。历史保留当次结论和证据，当前问题集中跟进。'}</p></div>${trash?'':shareButton('')}</div>${trash?'':`<div class="metrics">${metric(runs.length,'验收批次')}${metric(db.issues.filter(i=>i.status==='待处理').length,'当前待处理')}${metric(db.issues.filter(i=>i.status==='已解决').length,'当前已解决')}${metric(db.issues.filter(i=>i.status==='已忽略').length,'当前已忽略')}</div>`}<div class="toolbar"><div class="field"><label for="record-search">查找验收记录</label><input id="record-search" type="search" placeholder="输入批次名称、日期或验收范围" value="${escape(recordSearch)}"></div></div><p class="mini muted" id="record-count"></p><div id="run-list"></div><footer>ClinPaper · 统一验收记录与共享问题状态。截图随批次保留。</footer>`;
    const apply=()=>{const text=recordSearch.toLowerCase();const filtered=runs.filter(r=>`${r.name} ${r.date} ${r.scope} ${r.type}`.toLowerCase().includes(text));$('#record-count').textContent=`共 ${filtered.length} 个${trash?'已删除':'验收'}批次`;$('#run-list').innerHTML=filtered.map(r=>runCard(r,trash)).join('')||`<div class="empty">${trash?'回收站为空。':'没有匹配的验收记录。'}</div>`;};
    $('#record-search').addEventListener('input',e=>{recordSearch=e.target.value;apply();});apply();
  }
  function image(image) {
    const asset=safeAsset(image?.asset);if(!asset)return '';
    const preview=safeAsset(image.preview||window.CLINPAPER_PREVIEWS?.[asset])||asset;
    return `<button type="button" class="thumb" data-image="${escape(asset)}" data-title="${escape(image.label||'实际页面证据')}"><img src="${escape(preview)}" data-original="${escape(asset)}" alt="${escape(image.label||'实际页面证据')}" loading="lazy"><span>${escape(image.label||'实际页面证据')} · 点击查看原图</span></button>`;
  }
  function pageName(id){return db.runs.flatMap(r=>r.pages).find(p=>p.id===id)?.name||id;}
  function runLinks(ids) {
    return (ids||[]).map(id=>{const r=db.runs.find(r=>r.id===id);return r?.deletedAt?`<span>${escape(r.name)}（批次已删除）</span>`:`<a href="#run/${escape(id)}">${escape(r?.name||id)}</a>`;}).join(' · ');
  }
  function comparison(actual,expected){return `<div class="comparison"><div class="fact"><small>实际表现</small>${escape(actual)}</div><div class="fact expected"><small>设计期望 / 基准</small>${escape(expected)}</div></div>`;}
  function historyItem(h) {
    const r=db.runs.find(r=>r.id===h.runId);
    return `<div class="history-item"><div>${escape(h.date)} · ${r&&!r.deletedAt?`<a href="#run/${escape(r.id)}">${escape(r.name)}</a>`:escape(r?.name||h.kind||'状态更新')} · ${escape(h.result||h.kind||'复核')}</div>${h.note?`<p>${escape(h.note)}</p>`:''}${h.actual?comparison(h.actual,h.expected):''}${h.previousStatus?`<p>${escape(h.previousStatus)} → ${escape(h.status)}</p>`:''}${h.evidence?image({...h.evidence,label:'本次复核截图'}):''}${h.evidence?.coordinates?`<p>证据坐标：${escape(h.evidence.coordinates)}</p>`:''}</div>`;
  }
  function issueCard(i,snapshot=false,finding=null) {
    const noteList=i.notes?.length?i.notes:[i.recommendation?`建议：${i.recommendation}`:''];
    return `<article class="issue" id="issue-${escape(i.id)}" data-issue-id="${escape(i.id)}"><div class="issue-head"><div><span class="issue-id">${escape(i.id)}</span>${badge(i.priority,i.priority==='P1'?'red':'amber')} ${badge(platforms[i.platform||'desktop'])} ${badge(i.category)}</div><span class="meta">${escape(pageName(i.pageId))}</span></div><h3>${escape(i.title)}</h3>${comparison(i.actual,i.expected)}<div class="notes">${noteList.filter(Boolean).map(n=>`<p>${escape(n)}</p>`).join('')}</div>${finding?`<div class="notice"><b>当次结论：${escape(finding.result)}</b><p>${escape(finding.note)}</p>${finding.actual?comparison(finding.actual,finding.expected):''}</div>`:''}<p class="coords">证据坐标：${escape(i.evidence?.coordinates||'见截图')} ${i.evidence?.figmaNode?` · Figma 节点 ${escape(i.evidence.figmaNode)}`:''}</p><div class="issue-footer">${image({...i.evidence,label:`${i.id} 原始页面证据`})}<div><div class="mini muted">${snapshot?'当次状态快照（只读）':'当前处理状态'}</div>${snapshot?`<p>${badge(i.status,i.status==='已解决'?'green':i.status==='已忽略'?'':'amber')}</p><a class="mini" href="#issues/${escape(i.id)}">查看当前问题与最新状态 →</a>`:`<div class="segmented" role="group" aria-label="${escape(i.id)} 状态">${statuses.map(s=>`<button type="button" class="${i.status===s?'active':''}" aria-pressed="${i.status===s}" data-status="${s}" data-issue="${escape(i.id)}">${s}</button>`).join('')}</div><p class="mini muted">${online?'状态将同步到其他电脑。':'仅本机状态；恢复连接后以服务器记录为准。'}</p>`}<div class="issue-links">关联验收：${runLinks(i.runIds)}</div></div></div>${finding?.evidence?.asset&&finding.evidence.asset!==i.evidence?.asset?`<div class="screens">${image({...finding.evidence,label:'当次复核截图'})}</div><p class="coords">当次证据坐标：${escape(finding.evidence.coordinates)}</p>`:''}${!snapshot&&i.history?.length?`<details class="history"><summary>复核与状态历史 · ${i.history.length} 条</summary>${[...i.history].reverse().map(historyItem).join('')}</details>`:''}</article>`;
  }
  function option(value,text,selected){return `<option value="${escape(value)}"${value===selected?' selected':''}>${escape(text)}</option>`;}
  function select(id,label,values,key){return `<div class="field"><label for="${id}">${label}</label><select id="${id}" data-filter="${key}">${option('all',`全部${label}`,issueFilters[key])}${values.map(([v,t])=>option(v,t,issueFilters[key])).join('')}</select></div>`;}
  function issuesView(target='') {
    if(target)issueFilters={page:'all',platform:'all',category:'all',status:'all',search:target};
    const pages=[...new Set(db.runs.flatMap(r=>r.pages.map(p=>p.id)))].map(id=>[id,pageName(id)]);
    $('#content').innerHTML=`<div class="heading"><div><p class="eyebrow">ISSUE REGISTER</p><h1>当前问题总表</h1><p class="intro">${db.issues.length} 条问题持续保留，沿用原编号。这里只修改当前状态；历史验收详情始终保留当次快照。</p></div></div><div class="metrics">${metric(db.issues.length,'问题总数')}${metric(db.issues.filter(i=>i.status==='待处理').length,'待处理')}${metric(db.issues.filter(i=>i.status==='已解决').length,'已解决')}${metric(db.issues.filter(i=>i.status==='已忽略').length,'已忽略')}</div><div class="toolbar">${select('filter-page','页面',pages,'page')}${select('filter-platform','端别',Object.entries(platforms),'platform')}${select('filter-category','类型',categories.map(c=>[c,c]),'category')}${select('filter-status','状态',statuses.map(s=>[s,s]),'status')}<div class="field"><label for="issue-search">搜索问题</label><input id="issue-search" type="search" placeholder="编号或标题" value="${escape(issueFilters.search)}"></div></div><p id="filter-result" class="mini muted"></p><div id="issue-list"></div><footer>已忽略问题继续保留。没有复核到的问题不会自动变为已解决。</footer>`;
    const apply=()=>{const filtered=db.issues.filter(i=>(issueFilters.page==='all'||issueFilters.page===i.pageId)&&(issueFilters.platform==='all'||issueFilters.platform===(i.platform||'desktop'))&&(issueFilters.category==='all'||issueFilters.category===i.category)&&(issueFilters.status==='all'||issueFilters.status===i.status)&&`${i.id} ${i.title}`.toLowerCase().includes(issueFilters.search.toLowerCase()));$('#filter-result').textContent=`显示 ${filtered.length} / ${db.issues.length} 条 · 桌面端 ${filtered.filter(i=>i.platform!=='mobile').length} · 移动端 ${filtered.filter(i=>i.platform==='mobile').length}`;$('#issue-list').innerHTML=filtered.map(i=>issueCard(i)).join('')||'<div class="empty">当前筛选下没有问题。</div>';};
    document.querySelectorAll('[data-filter]').forEach(el=>el.addEventListener('change',e=>{issueFilters[e.target.dataset.filter]=e.target.value;apply();}));$('#issue-search').addEventListener('input',e=>{issueFilters.search=e.target.value;apply();});apply();
  }
  function codeComparisonTable(r) {
    if(!Array.isArray(r.codeComparison?.rows)||!r.codeComparison.rows.length)return '';
    const rows=r.codeComparison.rows;
    const sourceLink=row=>/^https:\/\/gitlab\.dxy\.net\/f2e\/tod\/clinic-paper\/-\/blob\/[a-f0-9]{40}\//.test(row.sourceUrl||'')?`<a href="${escape(row.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escape(row.source)}</a>`:escape(row.source);
    return `<section class="panel code-comparison" id="code-comparison"><h2>代码与新设计差异表 · ${rows.length} 项</h2><p class="mini muted">${escape(r.codeComparison.branch)} @ ${escape(r.codeComparison.commit)} · Figma ${escape(r.codeComparison.figmaNode)}。下表为源码对照，状态与本批次快照分别保留。</p><div class="code-table-scroll" role="region" aria-label="代码差异表，可横向滚动" tabindex="0"><table class="code-table"><caption>GitLab 源码对照最新 Figma</caption><thead><tr><th scope="col">编号 / 优先级</th><th scope="col">差异元素</th><th scope="col">最新设计</th><th scope="col">GitLab 源码</th><th scope="col">修改建议</th><th scope="col">代码定位</th></tr></thead><tbody>${rows.map(row=>`<tr><td><a href="#issues/${escape(row.id)}">${escape(row.id)}</a><br>${escape(row.priority)}</td><th scope="row">${escape(row.title)}</th><td>${escape(row.expected)}</td><td>${escape(row.actual)}</td><td>${escape(row.recommendation)}</td><td>${sourceLink(row)}</td></tr>`).join('')}</tbody></table></div></section>`;
  }
  function runView(id,anchor='') {
    const r=db.runs.find(r=>r.id===id);
    if(!r||r.deletedAt){$('#content').innerHTML=`<a class="back" href="#records">← 验收记录</a><div class="empty"><h2>${r?'此批次已删除':'未找到验收批次'}</h2><p>${r?'可在回收站恢复，当前问题未受影响。':'请从验收记录列表重新打开。'}</p><a class="btn" href="#${r?'trash':'records'}">${r?'查看回收站':'返回列表'}</a></div>`;return;}
    $('#content').innerHTML=`<a class="back" href="#records">← 全部验收记录</a><div class="heading"><div><p class="eyebrow">ACCEPTANCE SNAPSHOT · ${escape(r.date)}</p><h1>${escape(r.name)}</h1><p class="intro">${escape(r.scope)}</p></div><div class="actions">${shareButton(r.id)}<button class="btn danger" data-trash="${escape(r.id)}">删除批次</button></div></div><div class="notice">这是当次验收快照，问题状态及证据不会随后续操作改写。快照保存于 ${escape(new Date(r.snapshotAt).toLocaleString('zh-CN'))}。</div><div class="metrics">${metric(r.counts.added,'当次新增')}${metric(r.counts.fixed,'当次修复')}${metric(r.counts.reopened,'当次复发')}${metric(r.counts.pendingReview,'待复核项')}</div><div class="coverage"><div><h3>桌面端覆盖</h3><p class="muted">${escape(r.coverage.desktop)}</p></div><div><h3>移动端覆盖</h3><p class="muted">${escape(r.coverage.mobile)}</p></div></div><section class="panel section-title"><h2>验收结论</h2><p>${escape(r.conclusion)}</p>${badge(r.type,'purple')} ${badge(`${r.rounds.length} 轮检查`)}</section><details class="panel"><summary>检查轮次 · ${r.rounds.length} 轮</summary><div class="rounds">${r.rounds.map(p=>`<div class="round"><b>${escape(p.title)}</b> ${badge(p.result)}<p>${escape(p.note)}</p></div>`).join('')}</div></details>${r.baseline.length?`<details class="panel"><summary>当次设计规范与基准</summary><table class="baseline"><tbody>${r.baseline.map(b=>`<tr><th>${escape(b.name)}</th><td>${escape(b.value)}</td></tr>`).join('')}</tbody></table></details>`:''}<h2 class="section-title">当次问题与复核 · ${r.issueSnapshots.length} 条</h2><div>${r.issueSnapshots.map(i=>issueCard(i,true,r.findings.find(f=>f.issueId===i.id))).join('')||'<div class="empty">本次未记录问题，查看下方页面证据与检查范围。</div>'}</div><section class="panel"><h2>逐页证据 · ${r.pages.length} 个页面 / 端别记录</h2>${r.pages.map(p=>`<article class="page-proof" id="proof-${escape(p.id)}"><h3>${escape(p.name)} ${badge(platforms[p.platform]||p.platform)} ${badge(p.status,p.status==='已复核'?'green':'amber')}</h3><p>${p.figmaNode?`Figma Frame ${escape(p.figmaNode)}`:'未提供移动端设计稿时，仅检查客观响应式表现。'}</p><div class="screens">${p.images.map(image).join('')}</div>${(p.notes||[]).map(n=>`<p>${escape(n)}</p>`).join('')}</article>`).join('')}</section><footer>所有图片按批次保存为本地资源；后续验收不会覆盖本批次截图。</footer>`;
    const table=codeComparisonTable(r);
    if(table)$('#content .section-title')?.insertAdjacentHTML('afterend',table);
    if(anchor)document.getElementById(`proof-${anchor}`)?.scrollIntoView();
  }
  function render(preserveScroll=false) {
    if(!db)return;const y=scrollY;const route=location.hash.slice(1)||'records';
    $('#nav-runs').textContent=activeRuns().length;$('#nav-issues').textContent=db.issues.length;$('#nav-trash').textContent=db.runs.filter(r=>r.deletedAt).length;
    document.querySelectorAll('[data-nav]').forEach(n=>n.classList.toggle('active',n.dataset.nav===(route.startsWith('issues')?'issues':route==='trash'?'trash':'records')));
    if(route==='trash')recordsView(true);else if(route==='issues'||route.startsWith('issues/'))issuesView(route.slice(7));else if(route.startsWith('run/'))runView(route.slice(4));else if(route.startsWith('page-'))runView(db.runs[0]?.id,route.slice(5));else recordsView();
    if(preserveScroll)scrollTo(0,y);
  }
  async function refresh() {const next=await api('/api/review');if(!db||next.revision>=db.revision){db=next;online=true;cache();sync('共享状态已同步','ok');return true;}return false;}
  async function writeStatus(id,status) {
    if(busy)return;busy=true;document.querySelectorAll(`[data-issue="${id}"]`).forEach(b=>b.disabled=true);
    try {
      if(online){await api('/api/status',{method:'PUT',body:JSON.stringify({id,status})});await refresh();}
      else {db.issues.find(i=>i.id===id).status=status;cache();toast('已保存到本机；当前未连接共享服务。');}
      render(true);
    }catch(e){toast(`状态未保存：${e.message}`);sync('保存失败，请重试','error');render(true);}finally{busy=false;}
  }
  async function trashRun(id,restore=false) {
    if(!online){toast('删除与恢复需要连接共享服务。');return;}
    if(busy)return;
    const r=db.runs.find(r=>r.id===id);
    if(!restore&&!confirm(`将「${r.name}」移入回收站？\n可恢复，不会删除问题或改变处理状态。`))return;
    busy=true;
    try{await api(`/api/runs/${id}${restore?'/restore':''}`,{method:restore?'POST':'DELETE'});await refresh();if(location.hash.startsWith('#run/')&&!restore)location.hash='records';else render(true);toast(restore?'验收批次已恢复。':'验收批次已移入回收站，可随时恢复。');}catch(e){toast(`操作失败：${e.message}`);}finally{busy=false;}
  }
  document.addEventListener('click',async e=>{
    const button=e.target.closest('button');if(!button)return;
    if(button.dataset.image){$('#viewer-image').src=safeAsset(button.dataset.image);$('#viewer-title').textContent=button.dataset.title||'截图原图';$('#viewer').showModal();}
    if(button.dataset.status)writeStatus(button.dataset.issue,button.dataset.status);
    if(button.hasAttribute('data-trash'))trashRun(button.dataset.trash);
    if(button.hasAttribute('data-restore'))trashRun(button.dataset.restore,true);
    if(button.hasAttribute('data-share')){
      const url=new URL(location.href);url.hash=button.dataset.share?`run/${button.dataset.share}`:'records';
      if(url.protocol==='file:'){toast('当前为本地文件，请使用公开部署地址分享。');return;}
      try{await navigator.clipboard.writeText(url.href);toast('分享链接已复制。');}catch{prompt('复制以下分享链接：',url.href);}
    }
  });
  document.addEventListener('error',e=>{const img=e.target;if(img.tagName==='IMG'&&img.dataset.original&&img.getAttribute('src')!==img.dataset.original)img.src=img.dataset.original;},true);
  $('#viewer-close').addEventListener('click',()=>$('#viewer').close());
  $('#viewer').addEventListener('click',e=>{if(e.target===$('#viewer'))$('#viewer').close();});
  window.addEventListener('hashchange',()=>{issueFilters.search='';render();scrollTo(0,0);});
  async function init(){
    db=cached()||window.CLINPAPER_SNAPSHOT;
    if(db)render();
    try{await refresh();render();}catch{online=false;sync('仅本机快照','error');if(db)render();else $('#content').innerHTML='<div class="empty">未能加载验收数据，请刷新重试。</div>';}
    setInterval(async()=>{
      if(busy||pollBusy||document.hidden||$('#viewer').open)return;pollBusy=true;
      try{const state=await api('/api/status');if(!online||state.revision!==db?.revision){await refresh();render(true);}online=true;sync('共享状态已同步','ok');}catch{if(online)sync('共享状态重连中');}finally{pollBusy=false;}
    },3000);
  }
  init();
})();
