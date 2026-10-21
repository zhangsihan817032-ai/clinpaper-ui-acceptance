import { cp, mkdir, readFile, writeFile, access, realpath } from 'node:fs/promises';
import { resolve, join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';

const outputs = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const option = name => {
  const i = args.indexOf(name);
  if (i < 0) return null;
  if (!args[i + 1] || args[i + 1].startsWith('--')) throw new Error(`缺少参数：${name}`);
  return args[i + 1];
};
const source = await realpath(resolve(option('--source') || join(outputs, 'clinpaper-ui-style-review')));
const preview = resolve(option('--preview') || join(outputs, 'clinpaper-ui-style-review-preview'));
if (!relative(source, preview).startsWith('..') || !relative(preview, source).startsWith('..')) {
  throw new Error('预览与已发布目录必须完全隔离，不能相同或互为子目录');
}
try {
  await access(preview);
  throw new Error('预览目录已存在；为保留未发布修改，拒绝覆盖。请继续使用现有预览或指定新的 --preview 目录');
} catch (error) {
  if (error.code !== 'ENOENT') throw error;
}
// Read a complete atomically persisted snapshot before copying anything. Never write to source.
const snapshot = JSON.parse(await readFile(join(source, 'data/review.json'), 'utf8'));
if (!Array.isArray(snapshot.issues) || !Array.isArray(snapshot.runs)) throw new Error('线上数据库格式无效');
await cp(source, preview, {
  recursive: true,
  errorOnExist: true,
  force: false,
  filter: path => {
    const local = relative(source, path);
    return local !== 'data' && !local.startsWith('data/');
  },
});
await mkdir(join(preview, 'data'));
await writeFile(join(preview, 'data/review.json'), JSON.stringify(snapshot, null, 2) + '\n', { flag: 'wx' });
await writeFile(join(preview, 'assets/offline-snapshot.js'), 'window.CLINPAPER_SNAPSHOT=' + JSON.stringify(snapshot).replace(/</g, '\\u003c') + ';\n');
const htmlPath = join(preview, 'index.html');
const html = await readFile(htmlPath, 'utf8');
if (!html.includes('<body>')) throw new Error('无法插入本地预览标识，请检查 index.html');
await writeFile(htmlPath, html.replace('<body>', '<body>\n  <!-- LOCAL_PREVIEW_ONLY: remove this notice from approved production HTML. -->\n  <aside data-local-preview role="note" style="padding:10px 16px;background:#fff4d8;color:#704c0a;border-bottom:1px solid #e3cd96;text-align:center;font-size:13px;line-height:1.6;overflow-wrap:anywhere">本地预览 · 尚未发布｜问题状态与线上隔离｜确认后才发布到正式网站</aside>'));
const publishPath = join(preview, 'scripts/publish-run.mjs');
await writeFile(publishPath, (await readFile(publishPath, 'utf8')).replaceAll('http://127.0.0.1:8766', 'http://127.0.0.1:8767'));
const packagePath = join(preview, 'package.json');
const pkg = JSON.parse(await readFile(packagePath, 'utf8'));
pkg.name = 'clinpaper-ui-style-review-local-preview';
// Even npm start must force the isolated root and database instead of inherited production settings.
pkg.scripts = { ...pkg.scripts, start: `node ${JSON.stringify(fileURLToPath(new URL('start-preview.mjs', import.meta.url)))} --preview ${JSON.stringify(preview)}` };
await writeFile(packagePath, JSON.stringify(pkg, null, 2) + '\n');
await writeFile(join(preview, 'README.md'), '# 本地预览（尚未发布）\n\n运行 `npm start`，打开 `http://127.0.0.1:8767/index.html#records`。本目录独立于已发布目录，状态测试不会影响线上。\n\n在此修改与验证，用户确认具体版本后才发布。不得用本目录的数据库覆盖正式状态；发布流程参见同级 `clinpaper-ui-local-workflow/README.md`。\n');
await writeFile(join(preview, 'preview.json'), JSON.stringify({
  environment: 'local-preview', source, createdAt: new Date().toISOString(),
  sourceRevision: snapshot.revision, origin: 'http://127.0.0.1:8767',
  publishRequiresUserConfirmation: true,
}, null, 2) + '\n', { flag: 'wx' });
console.log(JSON.stringify({ preview, sourceRevision: snapshot.revision, issues: snapshot.issues.length, runs: snapshot.runs.length, origin: 'http://127.0.0.1:8767', published: false }));
