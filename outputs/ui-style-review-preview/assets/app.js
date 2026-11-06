const { PROJECTS, platformOf, getProject } = globalThis.UI_REVIEW_CONFIG;
(() => {
  'use strict';
  const $=s=>document.querySelector(s);
  const P=globalThis.UI_REVIEW_PRESENTATION;
  const uiState=new Map(), expandedText=new Set(), visualRegistry=new Map();
  let renderedRoute='', composing=false;
  const escape=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const safeAsset=s=>/^assets\/runs\/[a-z0-9-]+\/[a-zA-Z0-9_./-]+$/.test(s||'')&&!s.includes('..')?s:'';
  let projectId=null;
  let platforms={};
  const project=()=>getProject(projectId);
  const teamOf=i=>project()?.platforms.find(p=>p.id===platformOf(i))?.team||'';
  const platformName=i=>platforms[platformOf(i)]||i.platform;
  const projectApi=path=>`/api/projects/${projectId}${path}`;
  const statuses=['待处理','已解决','已忽略'];
  const categories=['字体','字重','颜色','间距','尺寸与对齐','线条','圆角'];
  const cacheKey=()=>`ui-review:v3:${projectId}`;
  let db,online=false,busy=false,pollBusy=false,toastTimer,liveRevision=-1;
  const emptyFilters=P.defaults;
  let issueFilters=emptyFilters(),catalog=PROJECTS,routeGeneration=0;
  let recordSearch='';
  function cached(id=projectId){try{const d=JSON.parse(localStorage.getItem(`ui-review:v3:${id}`));return d?.projectId===id?d:null;}catch{return null;}}
  function cache(){try{localStorage.setItem(cacheKey(),JSON.stringify(db));}catch{}}
  function route(){const hash=location.hash.slice(1);if(!hash||hash==='projects')return {home:true};if(hash.startsWith('project/')){const parts=hash.split('/');return {projectId:parts[1],path:parts.slice(2).join('/')||'issues'};}return {projectId:'clinpaper',path:hash};}
  function scoped(path){return `#project/${projectId}/${path}`;}
  function filterMatch(i){return issueFilters.platform==='all'||issueFilters.platform===platformOf(i);}
  function updateFilterUrl(){const path=(route().path||'issues').split('?')[0];history.replaceState(null,'',scoped(path)+P.queryFor(issueFilters));}
  function issueLink(id){return scoped(`issues/${id}`)+P.queryFor(issueFilters);}
  function rememberUI(){
    if(!renderedRoute)return;
    const open=[...document.querySelectorAll('details[data-key][open]')].map(d=>d.dataset.key);
    const el=document.activeElement;
    const anchor=[...document.querySelectorAll('.issue,.run-card')].find(e=>e.getBoundingClientRect().bottom>0);
    uiState.set(renderedRoute,{open,y:scrollY,anchor:anchor?.id||anchor?.dataset.runId,offset:anchor?.getBoundingClientRect().top,focus:el?.id,start:el?.selectionStart,end:el?.selectionEnd});
  }
  function restoreUI(preserve){
    measureText();
    renderedRoute=location.hash.split('?')[0];const s=uiState.get(renderedRoute);
    if(s){document.querySelectorAll('details[data-key]').forEach(d=>d.open=s.open.includes(d.dataset.key));
      if(preserve){const el=s.focus?document.getElementById(s.focus):null;el?.focus?.({preventScroll:true});if(typeof s.start==='number'&&el?.setSelectionRange)try{el.setSelectionRange(s.start,s.end);}catch{}
        const anchor=document.getElementById(s.anchor)||[...document.querySelectorAll('[data-run-id]')].find(e=>e.dataset.runId===s.anchor);scrollTo(0,s.y===0?0:anchor?scrollY+anchor.getBoundingClientRect().top-s.offset:s.y);}}
  }
  function longText(text,key){const id=`text-${key}`;return `<p id="${escape(id)}" class="text-content ${expandedText.has(id)?'':'clamped'}">${escape(text)}</p><button class="text-expand" data-expand="${escape(id)}" aria-controls="${escape(id)}" aria-expanded="${expandedText.has(id)}">${expandedText.has(id)?'收起':'展开全文'}</button>`;}
  function measureText(){document.querySelectorAll('[data-expand]').forEach(b=>{const t=document.getElementById(b.dataset.expand);b.hidden=!expandedText.has(t.id)&&t.scrollHeight<=t.clientHeight+1;});}
  function fold(key,label,body){return `<details data-key="${escape(key)}"><summary>${escape(label)}</summary><div class="detail-body">${body}</div></details>`;}
  function connection(){const cachedAt=db?.updatedAt||catalog.map(p=>cached(p.id)?.updatedAt||fallback(p.id)?.updatedAt||'').sort().at(-1);sync(online?'已连接 · 状态已同步':`服务未连接 · 缓存 ${cachedAt?new Date(cachedAt).toLocaleString('zh-CN'):'时间未知'}`,online?'ok':'error');$('#sync-status').title=online?'状态保存到服务端，其他页面自动同步。':'正在查看本机缓存；离线修改仅保存在本机，重连后以服务端记录为准。';}
  function scopeLinks(){document.querySelectorAll('a[href^="#"]').forEach(a=>{const h=a.getAttribute('href').slice(1);if(/^(records|issues|run\/|trash|page-)/.test(h))a.setAttribute('href',scoped(h));});}
  function homeView(){
    document.title='UI 样式验收中心';
    $('nav').innerHTML='<a class="active" href="#projects">全部项目</a>';
    $('#content').innerHTML=`<div class="heading"><div><h1>验收项目</h1><p class="home-caption">选择项目，查看待处理问题。</p></div></div><div class="project-grid">${catalog.map(p=>`<article class="project-card"><h2>${escape(p.name)}</h2><div class="project-platforms">${p.platforms.map(x=>badge(x.name)).join('')}</div><div class="project-pending"><b>${p.pendingCount??'—'}</b> 条待处理</div><div class="project-actions"><a class="btn primary" href="#project/${p.id}/issues">查看待处理问题 →</a><a href="#project/${p.id}/records">验收记录${p.runCount!=null?` · ${p.runCount}`:''}</a></div></article>`).join('')}</div>`;
  }
  function projectNav(){
    document.title=`${project().name} · UI 样式验收中心`;
    $('nav').innerHTML=`<a href="#projects">← 全部项目</a><div class="project-context"><label class="mini muted" for="project-switch">切换项目</label><select id="project-switch">${PROJECTS.map(p=>option(p.id,p.name,projectId)).join('')}</select></div><a href="${scoped('issues')}" data-nav="issues">问题总表 <span class="nav-num" id="nav-issues">${db.issues.length}</span></a><a href="${scoped('records')}" data-nav="records">验收记录 <span class="nav-num" id="nav-runs">${activeRuns().length}</span></a><a href="${scoped('trash')}" data-nav="trash">回收站 <span class="nav-num" id="nav-trash">${db.runs.filter(r=>r.deletedAt).length}</span></a>`;
    $('#project-switch').addEventListener('change',e=>{location.hash=`project/${e.target.value}/issues`;});
  }
  function coverageView(r){return `<div class="coverage">${project().platforms.map(p=>`<div><h3>${escape(p.name)}覆盖</h3><p class="muted">${escape(r.coverage[p.id]||r.coverage[p.id==='web-pc'?'desktop':p.id==='web-mobile'?'mobile':p.id]||'本次未覆盖')}</p></div>`).join('')}</div>`;}
  function sync(text,mode=''){const el=$('#sync-status');el.textContent=text;el.className=`sync ${mode}`;}
  function toast(text){$('#toast').textContent=text;$('#toast').hidden=false;clearTimeout(toastTimer);toastTimer=setTimeout(()=>$('#toast').hidden=true,5000);}
  async function api(path,options={}) {
    const controller=new AbortController();const timer=setTimeout(()=>controller.abort(),12000);
    try {const res=await fetch(path,{cache:'no-store',...options,signal:controller.signal,headers:{'Content-Type':'application/json',...options.headers}});const data=await res.json();if(!res.ok)throw new Error(data.error||`HTTP ${res.status}`);return data;}finally{clearTimeout(timer);}
  }
  function activeRuns(){return db.runs.filter(r=>!r.deletedAt).sort((a,b)=>b.date.localeCompare(a.date)||b.snapshotAt.localeCompare(a.snapshotAt));}
  function badge(text,style=''){return `<span class="badge ${style}">${escape(text)}</span>`;}
  function metric(value,label){return `<div class="metric"><b>${escape(value)}</b><span>${escape(label)}</span></div>`;}
  function counts(r){return `<div class="count-row"><span><b>${r.counts.added}</b>新增</span><span><b>${r.counts.fixed}</b>修复</span><span><b>${r.counts.reopened}</b>复发</span></div>`;}
  function shareButton(id){return `<button type="button" class="btn" data-share="${escape(id||'')}">复制分享链接</button>`;}
  function image(image) {
    const asset=safeAsset(image?.asset);if(!asset)return '';
    const preview=safeAsset(image.preview||window.CLINPAPER_PREVIEWS?.[asset])||asset;
    return `<button type="button" class="thumb" data-image="${escape(asset)}" data-title="${escape(image.label||'实际页面证据')}"><img src="${escape(preview)}" data-original="${escape(asset)}" alt="${escape(image.label||'实际页面证据')}" loading="lazy"><span>${escape(image.label||'实际页面证据')} · 点击查看原图</span></button>`;
  }
  function pageName(id,platform='',runIds=[]) {
    const match=p=>p.id===id&&(!platform||platform==='all'||platformOf(p)===platform);
    for(const runId of runIds){const page=db.runs.find(r=>r.id===runId)?.pages.find(match);if(page)return page.name;}
    return db.runs.flatMap(r=>r.pages).find(match)?.name||id;
  }
  function pageOptions() {
    return P.pageOptions(db.issues,db.runs,issueFilters.platform,platformOf);
  }
  function runLinks(ids) {
    return (ids||[]).map(id=>{const r=db.runs.find(r=>r.id===id);return r?.deletedAt?`<span>${escape(r.name)}（批次已删除）</span>`:`<a href="#run/${escape(id)}">${escape(r?.name||id)}</a>`;}).join(' · ');
  }
  function relationLinks(i,snapshot){const ids=[...new Set([...(i.relatedIssueIds||[]),...(snapshot?[]:db.issues.filter(other=>other.relatedIssueIds?.includes(i.id)).map(other=>other.id))])];return ids.length?`<p>跨端关联：${ids.map(id=>`<a href="${scoped(`issues/${id}`)}">${escape(id)}</a>`).join(' · ')}</p>`:'';}
  function comparison(actual,expected,key=''){return `<div class="comparison"><div class="fact"><small>实际</small>${key?longText(actual,key+'-actual'):escape(actual)}</div><div class="fact expected"><small>设计</small>${key?longText(expected,key+'-expected'):escape(expected)}</div></div>`;}
  function sourceEvidence(e){return /\.svg$/i.test(e?.asset||'')&&/源码/.test(e?.coordinates||'');}
  function sourceFor(i,runId='') {
    if(runId)return db.runs.find(r=>r.id===runId)?.findings.find(f=>f.issueId===i.id)?.evidence;
    return [...(i.history||[])].reverse().find(h=>h.evidence)?.evidence||i.evidence;
  }
  function visualFor(i,runId='') {
    const selectedReview=runId?db.runs.find(r=>r.id===runId)?.findings.find(f=>f.issueId===i.id):P.observation(i).review;
    // A source acceptance must not inherit an older runtime image as current proof.
    if(selectedReview?.verificationBasis==='source')return null;
    const records=window.CLINPAPER_VISUAL_EVIDENCE?.records||{};
    const ids=runId?[runId]:[...(i.runIds||[])].reverse();
    for(const id of ids) {
      const supplement=records[`${id}:${i.id}`];
      if(supplement?.locationCorrection)return supplement;
      const finding=db?.runs.find(r=>r.id===id)?.findings.find(f=>f.issueId===i.id);
      const historical=[...(i.history||[])].reverse().find(h=>h.runId===id&&h.evidence?.visual);
      const visual=finding?.evidence?.visual||historical?.evidence?.visual||supplement;
      if(visual)return visual;
    }
    return i.evidence?.visual;
  }
  function validShot(s) {
    const rect=(r,w,h)=>Array.isArray(r)&&r.length===4&&r.every(Number.isFinite)&&r[0]>=0&&r[1]>=0&&r[2]>0&&r[3]>0&&r[0]+r[2]<=w&&r[1]+r[3]<=h;
    return s&&safeAsset(s.asset)&&Number.isFinite(s.width)&&Number.isFinite(s.height)&&s.width>0&&s.height>0&&rect(s.crop,s.width,s.height)&&Array.isArray(s.regions)&&s.regions.length&&s.regions.every(r=>rect(r.rect,s.width,s.height));
  }
  function marks(shot,crop) {
    const [x,y,w,h]=crop;
    const labels=[];
    return shot.regions.map((r,n)=>{const [rx,ry,rw,rh]=r.rect,left=(rx-x)/w*100,top=(ry-y)/h*100;const nearby=labels.filter(p=>Math.abs(p.left-left)<5&&Math.abs(p.top-top)<5).length;labels.push({left,top});return `<span class="evidence-mark" style="left:${left}%;top:${top}%;width:${rw/w*100}%;height:${rh/h*100}%"></span><b class="evidence-number" style="left:clamp(0px,calc(${left}% - 20px),calc(100% - 18px));top:clamp(0px,calc(${top}% + ${nearby*18}px),calc(100% - 18px))">${n+1}</b>`;}).join('');
  }
  function legend(shot){return `<ol class="evidence-legend">${shot.regions.map(r=>`<li>${escape(r.label.replace(/^\s*\d+\s*[·.、]\s*/,''))}</li>`).join('')}</ol>`;}
  function visualFigure(shot,ref,side) {
    if(!validShot(shot))return '<p class="notice">缺少有效界面定位图，待补充。</p>';
    const [x,y,w,h]=shot.crop;
    return `<figure class="evidence-figure"><figcaption><b>${side==='actual'?'实际':'设计'}</b></figcaption><button type="button" class="evidence-open" data-visual="${escape(ref)}" data-side="${side}" aria-label="查看${escape(shot.label)}整页定位"><span class="crop-fit"><span class="evidence-crop" style="aspect-ratio:${w}/${h};width:min(100%,${160*w/h}px)"><img src="${escape(safeAsset(shot.asset))}" alt="${escape(shot.label)}局部截图" loading="lazy" style="width:${shot.width/w*100}%;left:${-x/w*100}%;top:${-y/h*100}%">${marks(shot,shot.crop)}</span></span><span class="evidence-open-label">查看整页定位 ↗</span></button>${legend(shot)}</figure>`;
  }
  function historyItem(h) {
    const r=db.runs.find(r=>r.id===h.runId);
    return `<div class="history-item"><div>${escape(h.date)} · ${r&&!r.deletedAt?`<a href="#run/${escape(r.id)}">${escape(r.name)}</a>`:escape(r?.name||h.kind||'状态更新')} · ${escape(h.result||h.kind||'复核')}</div>${h.note?`<p>${escape(h.note)}</p>`:''}${h.actual?comparison(h.actual,h.expected):''}${h.previousStatus?`<p>${escape(h.previousStatus)} → ${escape(h.status)}</p>`:''}${h.evidence?image({...h.evidence,label:sourceEvidence(h.evidence)?'本次源码文字证据（非界面截图）':'本次复核截图'}):''}${h.evidence?.coordinates?`<p>证据坐标：${escape(h.evidence.coordinates)}</p>`:''}</div>`;
  }
  function option(value,text,selected){return `<option value="${escape(value)}"${value===selected?' selected':''}>${escape(text)}</option>`;}
  function select(id,label,values,key){return `<div class="field"><label for="${id}">${label}</label><select id="${id}" data-filter="${key}">${option('all',`全部${label}`,issueFilters[key])}${values.map(([v,t])=>option(v,t,issueFilters[key])).join('')}</select></div>`;}
  function codeComparisonTable(r) {
    if(!Array.isArray(r.codeComparison?.rows)||!r.codeComparison.rows.length)return '';
    const rows=r.codeComparison.rows;
    const sourceLink=row=>/^https:\/\/gitlab\.dxy\.net\/f2e\/tod\/clinic-paper\/-\/blob\/[a-f0-9]{40}\//.test(row.sourceUrl||'')?`<a href="${escape(row.sourceUrl)}" target="_blank" rel="noopener noreferrer">${escape(row.source)}</a>`:escape(row.source);
    return `<section class="panel code-comparison" id="code-comparison"><h2>代码与新设计差异表 · ${rows.length} 项</h2><p class="mini muted">${escape(r.codeComparison.branch)} @ ${escape(r.codeComparison.commit)} · Figma ${escape(r.codeComparison.figmaNode)}。下表为源码对照，状态与本批次快照分别保留。</p><div class="code-table-scroll" role="region" aria-label="代码差异表，可横向滚动" tabindex="0"><table class="code-table"><caption>GitLab 源码对照最新 Figma</caption><thead><tr><th scope="col">编号 / 优先级</th><th scope="col">差异元素</th><th scope="col">最新设计</th><th scope="col">GitLab 源码</th><th scope="col">修改建议</th><th scope="col">代码定位</th></tr></thead><tbody>${rows.map(row=>`<tr><td><a href="#issues/${escape(row.id)}">${escape(row.id)}</a><br>${escape(row.priority)}</td><th scope="row">${escape(row.title)}</th><td>${escape(row.expected)}</td><td>${escape(row.actual)}</td><td>${escape(row.recommendation)}</td><td>${sourceLink(row)}</td></tr>`).join('')}</tbody></table></div></section>`;
  }
  function evidenceBundle(i,runId=''){
    const v=visualFor(i,runId)||{},e=sourceFor(i,runId)||i.evidence||{};
    return {...v,actual:validShot(v.actual)?v.actual:null,design:validShot(v.design)?v.design:validShot(e.design)?e.design:null,location:v.location||e.location||''};
  }
  function evidenceType(v){return !v.actual?'缺运行图':v.sourcePreview||v.actual.kind==='source-render'?'源码局部渲染':v.actual.kind==='dom-replay'?'DOM 重放':/历史|归档|非当前|非本次|复用/.test(`${v.actual.label} ${v.actual.version}`)?'历史截图':'运行截图';}
  function compactIssue(i,snapshot=false,finding=null,runId=''){
    const o=P.observation(i,{snapshot,finding}),v=evidenceBundle(i,runId),e=sourceFor(i,runId)||i.evidence||{},ref=`${runId||'current'}:${i.id}`;
    const sourceReview=o.review?.verificationBasis==='source';
    visualRegistry.set(ref,v);const type=sourceReview?'源码验收':evidenceType(v),key=`${runId||'current'}-${i.id}`;
    const source=e.source,safeSource=source&&/^https:\/\/gitlab\.dxy\.net\//.test(source.repository||'')&&/^[a-f0-9]{40}$/.test(source.commit||'')&&/^[a-zA-Z0-9_./-]+$/.test(source.path||'')&&!source.path.includes('..')&&Number.isInteger(source.lineStart)&&source.lineStart>0;
    const code=source?`<p>代码位置：${safeSource?`<a target="_blank" rel="noopener noreferrer" href="${escape(`${source.repository}/-/blob/${source.commit}/${source.path}#L${source.lineStart}`)}">${escape(source.path)}:${source.lineStart}</a>`:escape(source.path)}</p><p>${escape(source.commit)}</p><pre class="source-excerpt">${escape(source.excerpt)}</pre>`:'';
    const original=`${image({...i.evidence,label:sourceEvidence(i.evidence)?'原始源码文字材料（非运行截图）':'原始证据'})}${o.review?.evidence?.asset&&o.review.evidence.asset!==i.evidence?.asset?image({...o.review.evidence,label:sourceEvidence(o.review.evidence)?'复核源码文字材料（非运行截图）':'复核原始证据'}):''}<p>坐标：${escape(e.coordinates||i.evidence?.coordinates||'未记录')}</p>${e.figmaNode?`<p>Figma 节点：${escape(e.figmaNode)}</p>`:''}`;
    const env=`${o.review?.note?`<p>复核说明：${escape(o.review.note)}</p>`:''}${code}<p>${escape(v.note||'')}</p>${[v.actual,v.design].filter(Boolean).map(s=>`<p>${escape(s.label)} · ${escape(s.version)}</p>`).join('')}${original}`;
    const history=`${o.updated?`<h4>原始发现与当时基准</h4>${comparison(i.actual,i.expected)}<p>原始建议：${escape(i.recommendation||'未记录')}</p>${(i.notes||[]).map(n=>`<p>${escape(n)}</p>`).join('')}`:''}<p>关联验收：${runLinks(i.runIds)}</p>${relationLinks(i,snapshot)}${!snapshot?(i.history||[]).slice().reverse().map(historyItem).join(''):''}`;
    const missingActual=sourceReview?'<div class="missing-runtime"><b>本次按源码验收</b><p>已核对代码、资源定义及设计参数；未进行真机实测。</p></div>':'<div class="missing-runtime"><b>缺少运行截图</b><p>当前提供源码或文字依据。</p></div>';
    return `<article class="issue" id="issue-${escape(i.id)}" data-issue-id="${escape(i.id)}"><div class="issue-top"><div class="issue-title-group"><div class="issue-labels"><span class="issue-id">${escape(i.id)}</span>${badge(platformName(i))}${badge(i.priority,i.priority==='P0'||i.priority==='P1'?'red':'priority-P2')}${badge(type,type==='缺运行图'?'amber':'')}</div><h3><a href="${issueLink(i.id)}">${escape(i.title)}</a></h3><p class="issue-location"><span class="location-label">位置</span>${escape(v.location||pageName(i.pageId,platformOf(i),runId?[runId]:[...(i.runIds||[])].reverse()))}</p></div><div class="issue-status">${snapshot?`<div class="snapshot-status">${badge(i.status)}<span>当次状态 · 只读</span><a href="${issueLink(i.id)}">当前问题 →</a></div>`:`<div class="segmented" role="group" aria-label="${escape(i.id)} 状态">${statuses.map(s=>`<button type="button" aria-pressed="${i.status===s}" class="${i.status===s?'active':''}" data-issue="${escape(i.id)}" data-status="${s}" ${busy?'disabled':''}>${s}</button>`).join('')}</div>`}</div></div><div class="issue-main"><div class="issue-copy">${comparison(o.value.actual,o.value.expected,key)}</div><section class="visual-evidence" aria-label="${escape(i.id)} 对照图"><div class="visual-pair">${v.actual?visualFigure(v.actual,ref,'actual'):missingActual}${v.design?visualFigure(v.design,ref,'design'):'<div class="missing-runtime"><b>缺少设计定位图</b><p>待补对应设计证据。</p></div>'}</div></section></div><div class="issue-extras">${o.recommendation||(i.notes?.length&&!o.updated)?fold(key+'-suggestion','修改建议与补充说明',`<p>${escape(o.recommendation)}</p>${(i.notes||[]).map(n=>`<p>${escape(n)}</p>`).join('')}`):''}${fold(key+'-evidence','代码、版本与原始证据',env)}${fold(key+'-history',snapshot?'关联记录':'原始发现与复核历史',history)}</div></article>`;
  }
  function compactIssuesView(target=''){
    const direct=target?db.issues.find(i=>i.id===target):null;
    $('#content').innerHTML=`${target?`<a class="back" href="${scoped('issues')+P.queryFor(issueFilters)}">← 返回问题列表（保留筛选）</a>`:''}<div class="heading"><h1>${target?'问题详情':'问题总表'}<span class="heading-count">${escape(project().name)}</span></h1></div>${target?'':`<div class="status-tabs" id="status-tabs"></div><div class="filter-panel"><div class="toolbar">${select('filter-platform','端别',Object.entries(platforms),'platform').replace('class="field"','class="field platform-field"')}<div class="field search-field"><label for="issue-search">搜索</label><input id="issue-search" type="search" value="${escape(issueFilters.search)}" placeholder="编号、标题或差异内容"></div><details class="filter-more" data-key="more-filters"><summary>更多筛选</summary><div class="filter-more-content">${select('filter-page','页面',pageOptions(),'page')}${select('filter-category','类型',[...new Set(db.issues.map(i=>i.category))].map(c=>[c,c]),'category')}</div></details></div><div class="filter-chips" id="filter-chips"></div><p class="filter-result" id="filter-result"></p></div>`}<div id="issue-list"></div>`;
    if(target){$('#issue-list').innerHTML=direct?compactIssue(direct):'<div class="empty">未找到该问题。</div>';measureText();return;}
    let initial=true;const apply=()=>{
      const base=db.issues.filter(i=>P.matches(i,issueFilters,platformOf,false)),filtered=P.sortIssues(base.filter(i=>issueFilters.status==='all'||i.status===issueFilters.status));
      $('#status-tabs').innerHTML=[['待处理','待处理'],['all','全部'],['已解决','已解决'],['已忽略','已忽略']].map(([id,name])=>`<button class="status-tab ${issueFilters.status===id?'active':''}" data-tab="${id}" aria-pressed="${issueFilters.status===id}">${name}<b>${base.filter(i=>id==='all'||i.status===id).length}</b></button>`).join('');
      const labels={platform:platforms[issueFilters.platform],page:pageOptions().find(p=>p[0]===issueFilters.page)?.[1]||issueFilters.page,category:issueFilters.category,search:`搜索：${issueFilters.search}`};
      const active=['platform','page','category','search'].filter(k=>issueFilters[k]&&issueFilters[k]!=='all');
      $('#filter-chips').innerHTML=active.map(k=>`<button class="filter-chip" data-clear="${k}" aria-label="清除${escape(labels[k])}"><span>${escape(labels[k])}</span> ×</button>`).join('')+(active.length?'<button class="clear-filters" data-clear="extras">清除筛选</button>':'');
      $('#filter-result').textContent=`${issueFilters.status==='all'?'全部问题':`只看${issueFilters.status}`} · 显示 ${filtered.length} 条 / 项目共 ${db.issues.length} 条`;
      if(!initial)rememberUI();initial=false;$('#issue-list').innerHTML=filtered.map(i=>compactIssue(i)).join('')||'<div class="empty">当前条件下没有问题。<br><button class="btn" data-clear="all">查看全部问题</button></div>';scopeLinks();restoreUI(false);
    };
    const change=()=>{updateFilterUrl();apply();};
    $('#status-tabs').onclick=e=>{const b=e.target.closest('[data-tab]');if(b){issueFilters.status=b.dataset.tab;change();}};
    $('#content').onchange=e=>{if(!e.target.dataset.filter)return;issueFilters[e.target.dataset.filter]=e.target.value;if(e.target.dataset.filter==='platform'){const pages=pageOptions();if(!pages.some(p=>p[0]===issueFilters.page))issueFilters.page='all';$('#filter-page').innerHTML=option('all','全部页面',issueFilters.page)+pages.map(([id,name])=>option(id,name,issueFilters.page)).join('');}change();};
    $('#issue-search').oninput=e=>{issueFilters.search=e.target.value;change();};
    $('#content').onclick=e=>{const b=e.target.closest('[data-clear]');if(!b)return;const key=b.dataset.clear;rememberUI();if(key==='all')issueFilters={...emptyFilters(),status:'all'};else if(key==='extras')issueFilters={...emptyFilters(),status:issueFilters.status};else issueFilters[key]=key==='search'?'':'all';updateFilterUrl();render(true);};
    apply();
  }
  function runMore(r){return `<details class="more-menu" data-key="more-${escape(r.id)}"><summary>更多</summary><div class="more-menu-content">${shareButton(r.id)}<button class="btn danger" data-trash="${escape(r.id)}">移入回收站</button></div></details>`;}
  function compactCounts(r){return `<div class="run-counts"><span><b>${r.counts.added}</b>新增</span><span><b>${r.counts.fixed}</b>修复</span><span><b>${r.counts.reopened}</b>复发</span></div>`;}
  function compactRecords(trash=false){
    $('#content').innerHTML=`<div class="heading"><h1>${trash?'回收站':'验收记录'}<span class="heading-count">${escape(project().name)}</span></h1></div><div class="toolbar">${select('filter-platform','端别',Object.entries(platforms),'platform')}<div class="field search-field"><label for="record-search">搜索记录</label><input id="record-search" type="search" placeholder="名称、日期或范围" value="${escape(recordSearch)}"></div></div><p id="record-count" class="filter-result"></p><div id="run-list"></div>`;
    const apply=()=>{const runs=(trash?db.runs.filter(r=>r.deletedAt):activeRuns()).filter(r=>r.pages.some(filterMatch)&&`${r.name} ${r.date} ${r.scope}`.toLowerCase().includes(recordSearch.toLowerCase()));$('#record-count').textContent=`${runs.length} 个${trash?'已删除':'验收'}批次`;
      $('#run-list').innerHTML=runs.map(r=>`<article class="run-card" data-run-id="${escape(r.id)}"><div class="run-top"><div><div class="run-meta"><span class="meta">${escape(r.date)}</span><span class="run-platforms">${[...new Set(r.pages.map(platformName))].map(escape).join(' · ')}</span></div><h2>${trash?escape(r.name):`<a href="${scoped('run/'+r.id)}">${escape(r.name)}</a>`}</h2>${compactCounts(r)}</div><div class="run-actions">${trash?`<button class="btn primary" data-restore="${escape(r.id)}">恢复批次</button>`:`<a class="btn" href="${scoped('run/'+r.id)}">查看详情 →</a>${runMore(r)}`}</div></div><div class="run-details">${fold('scope-'+r.id,'查看范围与结论',`<p>${escape(r.scope)}</p><p>${escape(r.conclusion)}</p>${trash?`<p>删除于 ${escape(r.deletedAt)}</p>`:''}`)}</div></article>`).join('')||'<div class="empty">没有匹配的记录。</div>';restoreUI(false);};
    $('#record-search').oninput=e=>{recordSearch=e.target.value;rememberUI();apply();};$('#filter-platform').onchange=e=>{issueFilters.platform=e.target.value;updateFilterUrl();rememberUI();apply();};apply();
  }
  function compactRun(id,anchor=''){
    const r=db.runs.find(r=>r.id===id);if(!r||r.deletedAt){$('#content').innerHTML=`<a class="back" href="${scoped('records')}">← 验收记录</a><div class="empty">${r?'批次已移入回收站，可恢复。':'未找到该批次。'}</div>`;return;}
    $('#content').innerHTML=`<a class="back" href="${scoped('records')}">← 验收记录</a><div class="heading"><div><p class="meta">${escape(r.date)} · ${escape(project().name)}</p><h1>${escape(r.name)}</h1></div>${runMore(r)}</div><p class="snapshot-note">当次快照 · 只读 · ${escape(new Date(r.snapshotAt).toLocaleString('zh-CN'))}，当前处理状态见问题总表。</p><section class="run-conclusion"><h2>当次结论</h2>${longText(r.conclusion,'run-'+r.id)}${compactCounts(r)}</section><h2 class="section-title">当次问题与复核 <span class="run-section-count">${r.issueSnapshots.length} 条</span></h2>${P.sortIssues(r.issueSnapshots).map(i=>compactIssue(i,true,r.findings.find(f=>f.issueId===i.id),r.id)).join('')||'<div class="empty">本批次没有记录问题。</div>'}<div class="supplements">${fold('coverage-'+r.id,'验收范围与覆盖说明',`<p>${escape(r.scope)}</p>${coverageView(r)}${(r.platformNotes||[]).map(n=>`<p>${badge(platforms[n.platform]||n.platform)} ${escape(n.status)} · ${escape(n.note)}<br>${escape(n.basis||'')}</p>`).join('')}`)}${fold('rounds-'+r.id,`检查轮次 · ${r.rounds.length} 轮`,r.rounds.map(p=>`<p><b>${escape(p.title)}</b> · ${escape(p.result)}<br>${escape(p.note)}</p>`).join(''))}${r.baseline?.length?fold('baseline-'+r.id,'当次设计规范与基准',`<table class="baseline"><tbody>${r.baseline.map(b=>`<tr><th>${escape(b.name)}</th><td>${escape(b.value)}</td></tr>`).join('')}</tbody></table>`):''}${codeComparisonTable(r)?fold('code-'+r.id,'源码对照表（当次记录）',codeComparisonTable(r)):''}${fold('pages-'+r.id,`逐页证据 · ${r.pages.length} 项`,r.pages.map(p=>`<article class="page-proof" id="proof-${escape(p.id)}-${escape(platformOf(p))}"><h3>${escape(p.name)} ${badge(platformName(p))} ${badge(p.status)}</h3><p>${p.figmaNode?`Figma ${escape(p.figmaNode)}`:'无对应设计定位'}</p><div class="screens">${(p.images||[]).map(image).join('')}</div>${(p.notes||[]).map(n=>`<p>${escape(n)}</p>`).join('')}</article>`).join(''))}</div>`;
    if(anchor){const proof=document.getElementById('proof-'+anchor);if(proof){proof.closest('details').open=true;proof.scrollIntoView();}}
  }
  function render(preserveScroll=false) {
    if(preserveScroll)rememberUI();
    $('#content').onclick=null;$('#content').onchange=null;
    const current=route(),y=scrollY;
    if(current.home){homeView();restoreUI(preserveScroll);return;}
    if(!getProject(current.projectId)){$('nav').innerHTML='<a href="#projects">← 全部项目</a>';$('#content').innerHTML='<div class="empty">项目不存在，请返回全部项目。</div>';return;}
    if(!db||db.projectId!==current.projectId)return;
    const path=current.path.split('?')[0];
    projectNav();
    document.querySelectorAll('[data-nav]').forEach(n=>n.classList.toggle('active',n.dataset.nav===(path.startsWith('issues')?'issues':path==='trash'?'trash':'records')));
    if(path==='trash')compactRecords(true);else if(path==='issues'||path.startsWith('issues/'))compactIssuesView(path.slice(7));else if(path.startsWith('run/'))compactRun(path.slice(4));else if(path.startsWith('page-'))compactRun(db.runs[0]?.id,path.slice(5));else compactRecords();
    scopeLinks();
    if(preserveScroll)scrollTo(0,y);restoreUI(preserveScroll);
  }
  async function refresh() {const id=projectId,generation=routeGeneration;const next=await api(`/api/projects/${id}/review`);if(id!==projectId||generation!==routeGeneration)return false;if(next.revision>=liveRevision){db=next;liveRevision=next.revision;online=true;cache();connection();return true;}return false;}
  async function writeStatus(id,status) {
    if(busy)return;busy=true;const selected=projectId,generation=routeGeneration;let savedOnline=online;document.querySelectorAll(`[data-issue="${id}"]`).forEach(b=>b.disabled=true);
    try {
      if(online){await api(projectApi('/status'),{method:'PUT',body:JSON.stringify({id,status})});await refresh();}
      else {db.issues.find(i=>i.id===id).status=status;db.updatedAt=new Date().toISOString();cache();}
      if(selected===projectId&&generation===routeGeneration){busy=false;render(true);connection();toast(`${id} 已${savedOnline?'保存到服务端':'仅保存到本机'}${issueFilters.status==='待处理'&&status!=='待处理'?`，已移至「${status}」。`:'。'}`);}
    }catch(e){if(selected===projectId){busy=false;toast(`状态未保存：${e.message}`);sync('保存失败，请重试','error');render(true);}}finally{busy=false;}
  }
  async function trashRun(id,restore=false) {
    if(!online){toast('删除与恢复需要连接共享服务。');return;}
    if(busy)return;
    const r=db.runs.find(r=>r.id===id);
    if(!restore&&!confirm(`将「${r.name}」移入回收站？\n可恢复，不会删除问题或改变处理状态。`))return;
    busy=true;
    const selected=projectId;
    try{await api(projectApi(`/runs/${id}${restore?'/restore':''}`),{method:restore?'POST':'DELETE'});await refresh();if(projectId===selected&&route().path?.startsWith('run/')&&!restore)location.hash=scoped('records');else render(true);toast(restore?'验收批次已恢复。':'验收批次已移入回收站，可随时恢复。');}catch(e){toast(`操作失败：${e.message}`);}finally{busy=false;}
  }
  document.addEventListener('click',async e=>{
    if(e.target.closest('.skip-link')){e.preventDefault();$('#content').focus();return;}
    if(e.target.closest('a[href^="#"]'))rememberUI();
    const button=e.target.closest('button');if(!button)return;
    if(button.dataset.expand){const id=button.dataset.expand,el=document.getElementById(id);if(expandedText.has(id))expandedText.delete(id);else expandedText.add(id);el.classList.toggle('clamped',!expandedText.has(id));button.setAttribute('aria-expanded',String(expandedText.has(id)));button.textContent=expandedText.has(id)?'收起':'展开全文';return;}
    if(button.dataset.image||button.dataset.visual||button.dataset.sourceVisual){$('.viewer-stage').style.width='';$('#viewer-zoom').textContent='原尺寸查看';$('#viewer-zoom').setAttribute('aria-pressed','false');}
    if(button.dataset.image){$('#viewer-marks').innerHTML='';$('#viewer-legend').innerHTML='';$('#viewer-image').src=safeAsset(button.dataset.image);$('#viewer-title').textContent=button.dataset.title||'截图原图';$('#viewer').showModal();}
    if(button.dataset.visual||button.dataset.sourceVisual){
      const reference=button.dataset.visual||button.dataset.sourceVisual;
      const split=reference.lastIndexOf(':');
      const runId=reference.slice(0,split),id=reference.slice(split+1);
      const visual=visualRegistry.get(reference);
      const shot=visual?.[button.dataset.side];
      if(validShot(shot)){
        $('#viewer-image').src=safeAsset(shot.asset);
        $('#viewer-title').textContent=`${id} · ${shot.label} · 整页位置`;
        $('#viewer-marks').innerHTML=marks(shot,[0,0,shot.width,shot.height]);
        $('#viewer-legend').innerHTML=`<p>${escape(visual.location)}</p>${legend(shot)}<p class="mini muted">${escape(shot.version)}</p>`;
        $('#viewer').showModal();
      }
    }
    if(button.dataset.status)writeStatus(button.dataset.issue,button.dataset.status);
    if(button.hasAttribute('data-trash'))trashRun(button.dataset.trash);
    if(button.hasAttribute('data-restore'))trashRun(button.dataset.restore,true);
    if(button.hasAttribute('data-share')){
      const url=new URL(location.href);url.hash=button.dataset.share?scoped(`run/${button.dataset.share}`):location.hash;
      if(url.protocol==='file:'){toast('当前为本地文件，请使用公开部署地址分享。');return;}
      try{await navigator.clipboard.writeText(url.href);toast('分享链接已复制。');}catch{prompt('复制以下分享链接：',url.href);}
    }
  });
  document.addEventListener('error',e=>{const img=e.target;if(img.tagName!=='IMG')return;if(img.dataset.original&&img.getAttribute('src')!==img.dataset.original){img.src=img.dataset.original;return;}const button=img.closest('.evidence-open,.thumb');if(button){button.innerHTML='<span class="missing-runtime"><b>图片加载失败</b><span>证据文件暂不可用，请检查服务或原始记录。</span></span>';button.disabled=true;}},true);
  $('#viewer-close').addEventListener('click',()=>$('#viewer').close());
  $('#viewer-zoom').addEventListener('click',()=>{
    const zoom=$('#viewer-zoom').getAttribute('aria-pressed')!=='true';
    const width=$('#viewer-image').naturalWidth;if(!width)return;
    $('.viewer-stage').style.width=zoom?`${width}px`:'';
    $('#viewer-zoom').textContent=zoom?'适应窗口':'原尺寸查看';$('#viewer-zoom').setAttribute('aria-pressed',String(zoom));
  });
  $('#viewer').addEventListener('click',e=>{if(e.target===$('#viewer'))$('#viewer').close();});
  function fallback(id){
    const source=window.UI_REVIEW_SNAPSHOTS?.[id]||(id==='clinpaper'?window.CLINPAPER_SNAPSHOT:null);
    return source?{...source,projectId:id}:null;
  }
  async function refreshCatalog(){const data=await api('/api/projects');catalog=data.projects;return data;}
  async function navigate(){
    const current=route(),generation=++routeGeneration;liveRevision=-1;
    issueFilters=P.filtersFrom(current.path?.split('?')[1]||'');recordSearch='';
    const params=new URLSearchParams(current.path?.split('?')[1]||'');
    for(const [k,v] of params)if(k in issueFilters)issueFilters[k]=v;
    if(current.home){projectId=null;online=false;render();try{await refreshCatalog();if(generation===routeGeneration){online=true;connection();render();}}catch{connection();}return;}
    projectId=current.projectId;
    if(!project()){render();return;}
    if(params.has('team')){
      const matches=project().platforms.filter(p=>p.team===params.get('team'));
      if(issueFilters.platform==='all'&&matches.length===1)issueFilters.platform=matches[0].id;
      updateFilterUrl();
    }
    platforms=Object.fromEntries(project().platforms.map(p=>[p.id,p.name]));
    const local=cached(),built=fallback(projectId);db=local&&(!built||local.revision>=built.revision)?local:built;online=false;
    if(db)db=structuredClone(db);connection();
    if(db){render();restoreUI(true);}else{$('nav').innerHTML='<a href="#projects">← 全部项目</a>';$('#content').textContent=`正在加载 ${project().name}…`;}
    try{await refresh();if(generation===routeGeneration)render(true);}catch{if(generation!==routeGeneration)return;online=false;connection();if(db)render(true);else $('#content').innerHTML='<div class="empty">未能加载此项目数据，请连接服务后重试。</div>';}
  }
  document.addEventListener('compositionstart',()=>composing=true);document.addEventListener('compositionend',()=>composing=false);
  window.addEventListener('hashchange',()=>{if($('#viewer').open)$('#viewer').close();renderedRoute='';scrollTo(0,0);navigate();});
  async function init(){
    catalog=PROJECTS.map(p=>{const local=cached(p.id),built=fallback(p.id),d=local&&(!built||local.revision>=built.revision)?local:built;return {...p,runCount:d?.runs.filter(r=>!r.deletedAt).length??0,pendingCount:d?.issues.filter(i=>i.status==='待处理').length??0};});
    await navigate();
    setInterval(async()=>{
      if(busy||pollBusy||composing||document.hidden||$('#viewer').open)return;pollBusy=true;
      const selected=projectId,generation=routeGeneration;
      try{if(route().home){const previous=JSON.stringify(catalog);await refreshCatalog();if(generation===routeGeneration){if(previous!==JSON.stringify(catalog))render(true);online=true;connection();}}else if(project()){const state=await api(projectApi('/status'));if(selected!==projectId||generation!==routeGeneration)return;if(!online||state.revision!==db?.revision){await refresh();render(true);}online=true;connection();}}catch{online=false;connection();}finally{pollBusy=false;}
    },3000);
  }
  init();
})();
