(() => {
const PROJECTS = [
  {id:'community',name:'丁香园社区',prefix:'DXY',evidenceMode:'App 截图对照 · 前端源码辅助',description:'App 按各端适配规则对照运行截图；前端可接入固定提交源码，视觉结果用目标版本运行截图复核。',platforms:[
    {id:'android',name:'Android',team:'Android'}, {id:'ios',name:'iOS',team:'iOS'},
    {id:'harmony',name:'鸿蒙',team:'鸿蒙'}, {id:'web-pc',name:'前端 PC',team:'前端'}, {id:'web-mobile',name:'前端移动',team:'前端'}
  ]},
  {id:'clinpaper',name:'ClinPaper',prefix:'CP',evidenceMode:'源码辅助＋运行截图',description:'对照指定提交的源码与设计稿，用目标版本运行截图确认视觉结果。',platforms:[
    {id:'web-pc',name:'前端 PC',team:'前端'}, {id:'web-mobile',name:'前端移动',team:'前端'}
  ]}
];
const projectOf = value => value?.projectId || 'clinpaper';
const platformOf = value => ({desktop:'web-pc',mobile:'web-mobile'}[value?.platform] || value?.platform || 'web-pc');
const getProject = id => PROJECTS.find(p=>p.id===id);
globalThis.UI_REVIEW_CONFIG={PROJECTS,projectOf,platformOf,getProject};
})();
