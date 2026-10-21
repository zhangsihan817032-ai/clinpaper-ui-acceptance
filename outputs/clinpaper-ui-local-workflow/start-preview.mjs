import { readFile, realpath } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawn } from 'node:child_process';

const outputs = resolve(fileURLToPath(new URL('..', import.meta.url)));
const args = process.argv.slice(2);
const i = args.indexOf('--preview');
const preview = await realpath(resolve(i >= 0 ? args[i + 1] : join(outputs, 'clinpaper-ui-style-review-preview')));
const metadata = JSON.parse(await readFile(join(preview, 'preview.json'), 'utf8'));
if (metadata.environment !== 'local-preview' || preview === await realpath(metadata.source)) throw new Error('拒绝把线上目录作为本地预览启动');
const child = spawn(process.execPath, [join(preview, 'server.mjs')], {
  cwd: preview, stdio: 'inherit',
  env: { ...process.env, HOST: '127.0.0.1', PORT: '8767', REVIEW_ROOT: preview, REVIEW_FILE: join(preview, 'data/review.json'), REPORT_USER: '', REPORT_PASSWORD: '' },
});
child.on('error', error => { console.error(error.message); process.exitCode = 1; });
for (const signal of ['SIGTERM', 'SIGINT']) process.on(signal, () => child.kill(signal));
child.on('exit', code => { process.exitCode = code ?? 1; });
console.log('仅本地预览：http://127.0.0.1:8767/index.html#records；不会启动公网隧道或发布修改。');
