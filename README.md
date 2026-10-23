# 设计验收：丁香园社区与 ClinPaper

本项目维护多项目 UI 验收网站、统一验收主流程和各端源码解析参考。社区与 ClinPaper 独立编号、端别、问题状态和开发入口，共用报告网站。

GitHub 私有仓库：[zhangsihan817032-ai/clinpaper-ui-acceptance](https://github.com/zhangsihan817032-ai/clinpaper-ui-acceptance)。沿用原仓库名及提交历史，当前同时维护两个项目。

## 当前工作入口

需要 Node.js 22+，无第三方运行依赖。在仓库根目录执行：

```sh
npm start
```

打开 <http://127.0.0.1:8786/index.html#projects>。已有 8786 服务时直接使用，不重复启动。本仓库副本不会替换原电脑上正在运行的网站；登记的服务目录见 [项目与环境](skills/design-acceptance/references/projects.md)。

- [丁香园社区问题](http://127.0.0.1:8786/index.html#project/community/issues)：iOS、Android、鸿蒙、前端 PC／移动。
- [ClinPaper 问题](http://127.0.0.1:8786/index.html#project/clinpaper/issues)：前端 PC／移动。

项目默认展示待处理问题；全部、已解决、已忽略及历史批次均保留。卡片集中展示问题差异、状态和对照图，源码、历史及补充说明按需展开。

## 验收流程

唯一维护入口为 [skills/design-acceptance/SKILL.md](skills/design-acceptance/SKILL.md)，前端、iOS、Android、鸿蒙的解析规则分别放在同目录的 references 中。源码与设计稿是主要对比材料，首次发现附可核验的图片证据。

问题二次验收核验目标源码的实际生效参数与当前设计稿是否一致。一致则更新原问题为已解决，明确标为源码验收；缺运行截图本身不阻止源码验收通过，源码结论不冒充真机实测。一次任务集中提交，相同基线与结论不重复生成批次，不给每轮检查增加装饰信息。

项目内固定路径是维护者电脑的环境登记，在其他电脑上使用时先确认实际源码和服务位置。Figma、GitLab 和 GitHub 的登录权限由使用者自己的环境提供。

## 数据与历史

`outputs/ui-style-review-preview/data/review.json` 是 2026-10-23 导出的种子快照，revision 71，包含 119 条问题、20 个批次；详细数量以实际运行库及筛选条件为准。该快照包含安卓源码二次验收的 11 条已解决结果。

网站代码、历史证据与离线缓存一起纳入版本管理。**已部署服务的运行数据库才是权威数据，更新代码不能用 GitHub 种子快照覆盖它。** 状态变化不会自动推送到 GitHub。新增批次使用项目接口增量提交；数据库和截图一起备份，仅运行一个数据库写入进程。

旧 ClinPaper 网站、旧 Skill、旧预览工具及文档保留为历史参考，默认不再用于日常验收或发布。本次没有删除旧内容，也没有合并旧环境数据库。`npm run start:legacy` 仅用于明确需要的历史访问，不要与现有服务重复启动。

## 检查

```sh
npm run check
npm test
```

完整性检查验证项目归属、问题编号与图片引用；测试在临时目录使用隔离数据，不修改真实问题库。历史版本完整性可单独执行 `npm run check:legacy`。

## 目录与同步范围

- `skills/design-acceptance/`：当前统一主流程及各端参考。
- `outputs/ui-style-review-preview/`：当前多项目网站、种子快照及证据素材。
- `outputs/clinpaper-ui-style-review/`、`outputs/clinpaper-ui-acceptance/`、`outputs/clinpaper-ui-local-workflow/`：旧版历史参考。
- `docs/`、`tests/`：历史差异记录及隔离测试。

`work/`、运行备份、临时交付截图、产品源码副本、依赖压缩包、凭据和浏览器登录态不上传。

GitHub 用于版本管理，不等于已部署的公网网站。共享状态需要持续运行的 Node 服务、持久化数据及截图；GitHub Pages 不能提供本项目的状态写入接口。本次同步不新建托管、隧道或公网入口。
