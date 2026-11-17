import fs from 'node:fs/promises';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
const root=process.cwd();const version=JSON.parse(await fs.readFile('package.json','utf8')).version;const output=path.join(root,'dist');const source=path.join(output,`Mobile_Source_${version}`);
await fs.mkdir(source,{recursive:true});
const forbidden=new Set(['node_modules','.build-cache','.gradle','.git','build','dist','verification','xcuserdata','Pods']);
const engineAllow=new Set(['ipad.html','css/style.css','js/canvas.js','js/notepad.js','js/presentation.js','js/ui.js','js/tool-preferences.js','assets/vikashya.png','assets/app-icon.png']);
async function copyDirectory(from,to){
  for(const entry of await fs.readdir(from,{withFileTypes:true})){
    if(forbidden.has(entry.name)||['local.properties','keystore.properties'].includes(entry.name)||/\.(jks|keystore|p12|mobileprovision)$/.test(entry.name))continue;
    const a=path.join(from,entry.name),b=path.join(to,entry.name);const relative=path.relative(root,a).replaceAll('\\','/');
    if(relative==='ios/App/App/public'||relative==='ios/App/App/capacitor.config.json'||relative==='android/app/src/main/assets/public')continue;
    if(entry.isDirectory()){await fs.mkdir(b,{recursive:true});await copyDirectory(a,b);}else{await fs.mkdir(path.dirname(b),{recursive:true});await fs.copyFile(a,b);}
  }
}
for(const dir of ['src','scripts','tests','docs','.github','android','ios'])await copyDirectory(path.join(root,dir),path.join(source,dir));
for(const relative of engineAllow){await fs.mkdir(path.dirname(path.join(source,'engine',relative)),{recursive:true});await fs.copyFile(path.join(root,'engine',relative),path.join(source,'engine',relative));}
for(const name of ['package.json','package-lock.json','capacitor.config.json','mobile.config.json','.gitignore','README.md','Build_Android.bat','Build_iPhone.command','THIRD-PARTY-NOTICES.txt'])await fs.copyFile(path.join(root,name),path.join(source,name));
const files=[];
async function inventory(dir){for(const entry of await fs.readdir(dir,{withFileTypes:true})){const p=path.join(dir,entry.name);if(entry.isDirectory())await inventory(p);else files.push(p);}}
await inventory(source);
for(const p of files){
  if(/Seller_Private|KEEP_PRIVATE|License_Key_Creator|signing-key|\.jks$|\.p12$/i.test(p))throw new Error('Private seller/signing material in source package.');
  if(/\.(js|mjs|json|html|pem)$/.test(p)){
    const text=await fs.readFile(p,'utf8');if(/-----BEGIN (?:EC |RSA )?PRIVATE KEY-----|"kty"\s*:\s*"EC"[\s\S]{0,800}"d"\s*:/.test(text))throw new Error('Private signing key in package.');
  }
}
const zip=path.join(output,`Resuvika-Omniball-Mobile-${version}-Source.zip`);
// Use .NET ZipFile so hidden .github/.gitignore entries are included.
const script=path.join(output,'zip-source.ps1');
const quote=s=>"'"+s.replaceAll("'","''")+"'";
await fs.writeFile(script,`$ErrorActionPreference='Stop'\nAdd-Type -AssemblyName System.IO.Compression\nAdd-Type -AssemblyName System.IO.Compression.FileSystem\nif(Test-Path -LiteralPath ${quote(zip)}){Remove-Item -LiteralPath ${quote(zip)}}\n$sourceRoot=${quote(source)}\n$archive=[System.IO.Compression.ZipFile]::Open(${quote(zip)},[System.IO.Compression.ZipArchiveMode]::Create)\ntry { Get-ChildItem -LiteralPath $sourceRoot -Recurse -Force -File | ForEach-Object { $relative=$_.FullName.Substring($sourceRoot.Length+1).Replace('\\','/'); [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive,$_.FullName,$relative,[System.IO.Compression.CompressionLevel]::Optimal) | Out-Null } } finally { $archive.Dispose() }\n`);
const zipped=spawnSync('powershell.exe',['-NoProfile','-ExecutionPolicy','Bypass','-File',script],{stdio:'inherit'});if(zipped.status!==0)throw Error('Source ZIP creation failed.');
if(!(await fs.stat(zip)).size)throw new Error('The source archive is empty.');
const apk=path.join(root,'android/app/build/outputs/apk/debug/app-debug.apk');
try{await fs.copyFile(apk,path.join(output,`Resuvika-Omniball-Android-${version}-PREVIEW.apk`));}catch(error){if(error.code!=='ENOENT')throw error;}
const releaseFiles=(await fs.readdir(output)).filter(f=>f.includes(`-${version}-`)&&/\.(zip|apk)$/.test(f));
const hashes=[];for(const name of releaseFiles){const hash=createHash('sha256').update(await fs.readFile(path.join(output,name))).digest('hex');hashes.push(`${hash}  ${name}`);}
await fs.writeFile(path.join(output,'SHA256SUMS.txt'),hashes.join('\n')+'\n');
console.log(`Packaged ${files.length} owner source files. Excluded SDKs, caches and private signing/seller files.`);
