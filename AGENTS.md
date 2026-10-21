# ClinPaper 验收项目

- 本项目包含验收网站与 Skill，不是 ClinPaper 产品源码仓库。
- 先读 `outputs/clinpaper-ui-acceptance/SKILL.md` 和其引用规范，再开始产品样式验收。
- `outputs/clinpaper-ui-style-review/` 是正式版本；开发先用 `outputs/clinpaper-ui-style-review-preview/`，localhost:8767，仅监听回环地址并使用独立数据库。
- 每次修改先交付本地预览，用户确认具体版本后才发布。用户明确要求发布当前版本即是本次发布授权，不重复索要确认。
- 不覆盖、重排或删除历史问题。正式发布重读 revision 与状态，经正式接口增量提交批次；不能整库覆盖或发布预览状态测试。
- 仓库中的数据库是交付种子快照，不代表持续变化的运行数据库。更新部署时保护外置持久数据库与历史截图。
- 不上传凭据、产品源码副本、浏览器登录态、预览状态测试或运行备份。仅批次可恢复删除，删除不影响问题状态。
- 当前无固定托管网址；不要把 GitHub 仓库或 GitHub Pages 当成支持状态同步的 Node 托管。不自动创建新隧道或更换临时域名。
