import { createRequire } from 'node:module';
import { readFile, writeFile, readdir, stat, rename } from 'node:fs/promises';
import { resolve,join } from 'node:path';

const args=process.argv.slice(2);const get=name=>{const i=args.indexOf(name);return i>=0?args[i+1]:null;};
const root=resolve(get('--site')||new URL('..',import.meta.url).pathname),runId=get('--run');
if(!/^[a-z0-9][a-z0-9-]{2,79}$/.test(runId||''))throw new Error('Usage: node scripts/build-previews.mjs --site SITE --run RUN_ID [--sharp PATH_TO_SHARP]');
const sharp=createRequire(import.meta.url)(get('--sharp')||'sharp');
const directory=`assets/runs/${runId}`,mapPath=join(root,'assets/previews.js');
let mapping={};
try{mapping=JSON.parse((await readFile(mapPath,'utf8')).match(/=\s*([\s\S]*?);?\s*$/)[1].replace(/;$/,''));}catch(error){if(error.code!=='ENOENT')throw error;}
let images=0,bytes=0;
for(const file of await readdir(join(root,directory))){
  if(!/\.(png|jpe?g|webp)$/i.test(file)||file.endsWith('.preview.webp'))continue;
  const asset=`${directory}/${file}`,preview=asset.replace(/\.[^.]+$/,'.preview.webp');
  if(!(await stat(join(root,preview)).catch(()=>null)))await sharp(join(root,asset)).resize({width:720,withoutEnlargement:true}).webp({quality:82}).toFile(join(root,preview));
  mapping[asset]=preview;images++;bytes+=(await stat(join(root,preview))).size;
}
await writeFile(`${mapPath}.tmp`,'window.CLINPAPER_PREVIEWS='+JSON.stringify(mapping)+';\n');await rename(`${mapPath}.tmp`,mapPath);
console.log(JSON.stringify({images,previewBytes:bytes,runId}));
