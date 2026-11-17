import fs from 'node:fs/promises';
const p=JSON.parse(await fs.readFile('package.json','utf8'));
let text='Resuvika Omniball mobile — third-party components\n\nPublisher application code and branding: Vikashya Resuvika Private Limited.\n\n';
for(const [name,version] of Object.entries(p.dependencies)){
  const installed=JSON.parse(await fs.readFile(`node_modules/${name}/package.json`,'utf8'));
  text+=`${name} ${installed.version} — ${installed.license||'see package license'}\n`;
  for(const license of ['LICENSE','LICENSE.md','LICENSE.txt']){
    try{text+=(await fs.readFile(`node_modules/${name}/${license}`,'utf8'))+'\n';break;}catch{}
  }
  text+='\n';
}
text+='The native build also includes AndroidX, Kotlin, Capacitor native components, Google Play Billing, and RevenueCat native/hybrid dependencies; the iOS build includes Apple system frameworks and RevenueCat native dependencies. Review native resolved dependency licenses and required notices for the final signed store build. Developer-only build tools are not distributed to customers.\n';
text+='\nAndroidX: Copyright The Android Open Source Project. Kotlin: Copyright JetBrains s.r.o. These components are licensed under the Apache License, Version 2.0.\n';
text+=await fs.readFile('docs/licenses/Apache-2.0.txt','utf8');
await fs.writeFile('THIRD-PARTY-NOTICES.txt',text);
