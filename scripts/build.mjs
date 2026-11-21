import { mkdir, cp, readFile, writeFile, rm } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { build } from 'esbuild';

const root = process.cwd();
const www = join(root, 'www');
const config = JSON.parse(await readFile(join(root, 'mobile.config.json'), 'utf8'));

if (existsSync(www)) await rm(www, { recursive: true, force: true });
await mkdir(join(www, 'assets'), { recursive: true });

await build({
  entryPoints: [join(root, 'src', 'app.mjs')],
  bundle: true,
  format: 'esm',
  minify: true,
  sourcemap: false,
  outfile: join(www, 'app.bundle.js'),
  define: {
    __MOBILE_CONFIG__: JSON.stringify(config)
  }
});

await cp(join(root, 'src', 'index.html'), join(www, 'index.html'));
await cp(join(root, 'src', 'styles.css'), join(www, 'styles.css'));
if (existsSync(join(root, 'assets'))) {
  await cp(join(root, 'assets'), join(www, 'assets'), { recursive: true });
}
if (existsSync(join(root, 'THIRD-PARTY-NOTICES.txt'))) {
  await cp(join(root, 'THIRD-PARTY-NOTICES.txt'), join(www, 'assets', 'THIRD-PARTY-NOTICES.txt'));
}

console.log('Built clean Resuvika Notes Studio -> www/');
