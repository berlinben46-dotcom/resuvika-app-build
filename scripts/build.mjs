import fs from 'node:fs/promises';
import path from 'node:path';
import { build } from 'esbuild';
const root = process.cwd();
const config = JSON.parse(await fs.readFile('mobile.config.json', 'utf8'));
for (const [key, env] of Object.entries({ androidPublicApiKey: 'RC_ANDROID_PUBLIC_KEY', iosPublicApiKey: 'RC_IOS_PUBLIC_KEY', privacyUrl: 'PRIVACY_URL', termsUrl: 'TERMS_URL', supportEmail: 'SUPPORT_EMAIL' })) {
  if (process.env[env]) config[key] = process.env[env];
}
await fs.mkdir('www/js', { recursive: true });
await fs.mkdir('www/css', { recursive: true });
await fs.mkdir('www/assets', { recursive: true });
for (const name of ['canvas', 'notepad', 'presentation', 'ui', 'tool-preferences']) {
  let code = await fs.readFile(`engine/js/${name}.js`, 'utf8');
  if (name === 'canvas') code = code.replace('onPointerDown(e) {', 'onPointerDown(e) {\n    if(window.mobileCanEdit && !window.mobileCanEdit()){window.openMobilePaywall?.();return;}');
  if (name === 'canvas') code = code.replace('viewportHeight - wrap.offsetHeight - 82', 'viewportHeight - wrap.offsetHeight - (window.mobileEditorReserve?.() || 82)');
  if(name==='canvas')for(const method of ['undo','redo','clear'])code=code.replace(`${method}(isRemote = false) {`,`${method}(isRemote = false) {\n    if(!isRemote && window.mobileCanEdit && !window.mobileCanEdit()){window.openMobilePaywall?.();return;}`);
  await fs.writeFile(`www/js/${name}.js`, code);
}
await fs.copyFile('engine/css/style.css', 'www/css/style.css');
await fs.copyFile('src/mobile.css', 'www/css/mobile.css');
await fs.copyFile('src/offline.js', 'www/js/offline.js');
for (const asset of ['vikashya.png', 'app-icon.png']) await fs.copyFile(`engine/assets/${asset}`, `www/assets/${asset}`);
await fs.copyFile('THIRD-PARTY-NOTICES.txt','www/assets/THIRD-PARTY-NOTICES.txt');
let html = await fs.readFile('engine/ipad.html', 'utf8');
html = html.replace(/<title>[^<]+<\/title>/, '<title>Resuvika Omniball</title>');
html = html.replace('<body class="theme-dark tablet-app">', '<body class="theme-light tablet-app mobile-app">');
html = html.replace('Connecting to computer…', 'Saved on this device').replace('Local pairing', 'Offline board');
html = html.replaceAll('Touch + Pencil', 'Touch + Stylus').replaceAll('Pencil only', 'Stylus only').replaceAll('Apple Pencil (P)', 'Pen (P)').replaceAll('Draw with a finger or Pencil', 'Draw with a finger or stylus');
html = html.replace('<script src="js/sync-local.js"></script>', '<script src="js/offline.js"></script>');
html = html.replace(/<script>\s*document\.getElementById\('ipad-room-display'\)[\s\S]*?<\/script>/, '');
html = html.replace('</head>', `<meta http-equiv="Content-Security-Policy" content="default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; connect-src 'self' https://*.revenuecat.com https://*.rc-backup.com; object-src 'none'; base-uri 'none'; form-action 'none'">\n<link rel="stylesheet" href="css/mobile.css">\n</head>`);
html = html.replace('</body>', '<script src="js/mobile.js" defer></script>\n</body>');
await fs.writeFile('www/index.html', html);
await build({ entryPoints: ['src/mobile.mjs'], outfile: 'www/js/mobile.js', bundle: true, format: 'iife', target: ['chrome109','safari16'], define: { __MOBILE_CONFIG__: JSON.stringify(config) }, minify: true, sourcemap: false });
console.log('Built standalone mobile whiteboard (no desktop licensing or seller files).');
