# UI 样式验收中心 · 多项目

本目录是当前日常工作网站，名称沿用“预览”。运行 `npm start`，默认监听 `127.0.0.1:8786`；Node.js 22+，无需安装依赖。已有服务时直接使用，不重复启动。

- 首页：<http://127.0.0.1:8786/index.html#projects>
- 社区问题：<http://127.0.0.1:8786/index.html#project/community/issues>
- ClinPaper 问题：<http://127.0.0.1:8786/index.html#project/clinpaper/issues>

社区支持 iOS、Android、鸿蒙、前端 PC／移动；ClinPaper 支持前端 PC／移动。项目独立编号、端别、状态及历史。当前主流程为 [design-acceptance](../../skills/design-acceptance/SKILL.md)，证据与发布格式见 [report.md](../../skills/design-acceptance/references/report.md)。

## 数据与接口

`data/review.json` 在仓库中是交付种子快照，部署后的运行数据库为权威数据；代码升级不得覆盖实际运行库。`assets/runs/` 保存批次证据，`assets/drafts/` 保留仍被历史记录引用的页面。备份与内部工作草稿不纳入 Git。

`GET /api/projects` 获取项目配置及数量。各项目使用 `/api/projects/community/...`、`/api/projects/clinpaper/...` 下的 review、status、runs、events；旧 `/api/...` 仅兼容 ClinPaper。项目隔离用于协作分流，不是用户权限系统。

批次通过项目接口增量追加，不能整库覆盖状态。提交示例：

```sh
node scripts/publish-run.mjs --site /absolute/site --origin http://127.0.0.1:8786 --input /absolute/run.json --assets /absolute/captures
```

收到 409 后重读 revision 并复核，不强改版本号。Android 二次源码验收支持 `evidenceMode: source-acceptance`，必须有当前设计定位、固定提交和完整代码依据；通过时更新原问题，保留历史图片，不把它们展示成修改后的效果。其他端使用前核对当前接口支持范围。

## 检查与运行边界

`npm test` 使用临时目录验证项目隔离、状态持久化与接口；`node scripts/check-integrity.mjs` 核对图片及项目关联，不写真实库。

后续走查、登记、复验和发布均使用多项目工作环境。旧 8766 与 8767 仅作历史参考，不默认同步、迁库或删除。GitHub 同步仅更新版本库，不启动新服务、不变更现有运行库、不创建公网托管。
