import fs from 'node:fs/promises';
import sharp from 'sharp';
const icon=await fs.readFile('engine/assets/app-icon.png');
const logo=await fs.readFile('engine/assets/vikashya.png');
for(const [density,size] of Object.entries({mdpi:48,hdpi:72,xhdpi:96,xxhdpi:144,xxxhdpi:192})){
  const dir=`android/app/src/main/res/mipmap-${density}`;await fs.mkdir(dir,{recursive:true});
  for(const name of ['ic_launcher','ic_launcher_round'])await sharp(icon).resize(size,size,{fit:'contain',background:'#fff'}).flatten({background:'#fff'}).png().toFile(`${dir}/${name}.png`);
  await sharp(icon).resize(Math.round(size*1.35),Math.round(size*1.35),{fit:'contain',background:'#ffffff00'}).extend({top:Math.round(size*.45),bottom:Math.round(size*.45),left:Math.round(size*.45),right:Math.round(size*.45),background:'#ffffff00'}).resize(Math.round(size*2.25)).png().toFile(`${dir}/ic_launcher_foreground.png`);
}
const launch=Buffer.from(`<svg width="1200" height="1200" xmlns="http://www.w3.org/2000/svg"><rect width="1200" height="1200" fill="white"/><image href="data:image/png;base64,${logo.toString('base64')}" x="380" y="290" width="440" height="310"/><text x="600" y="690" text-anchor="middle" font-family="sans-serif" font-size="30" fill="#31517d" font-weight="700">VIKASHYA RESUVIKA PRESENTS</text><text x="600" y="770" text-anchor="middle" font-family="sans-serif" font-size="54" fill="#173b6b" font-weight="700">Resuvika Omniball</text></svg>`);
await sharp(launch).png().toFile('www/assets/launch.png');
const splashDirs=(await fs.readdir('android/app/src/main/res')).filter(name=>name.startsWith('drawable'));
for(const dir of splashDirs){try{await fs.access(`android/app/src/main/res/${dir}/splash.png`);await sharp(launch).resize(1200,1200).png().toFile(`android/app/src/main/res/${dir}/splash.png`);}catch{}}
await sharp(icon).resize(1024,1024,{fit:'contain',background:'#fff'}).flatten({background:'#fff'}).png().toFile('ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png');
for(const name of ['splash-2732x2732-1.png','splash-2732x2732-2.png','splash-2732x2732.png']){
  await sharp(launch).resize(2732,2732).png().toFile(`ios/App/App/Assets.xcassets/Splash.imageset/${name}`);
}
// Keep the app privacy manifest in Xcode's resource phase (the CLI uses explicit references).
const project='ios/App/App.xcodeproj/project.pbxproj';let p=await fs.readFile(project,'utf8');
if(!p.includes('AA0000000000000000000001')){
  p=p.replace('/* Begin PBXBuildFile section */','/* Begin PBXBuildFile section */\n\t\tAA0000000000000000000001 /* PrivacyInfo.xcprivacy in Resources */ = {isa = PBXBuildFile; fileRef = AA0000000000000000000002; };');
  p=p.replace('/* Begin PBXFileReference section */','/* Begin PBXFileReference section */\n\t\tAA0000000000000000000002 /* PrivacyInfo.xcprivacy */ = {isa = PBXFileReference; lastKnownFileType = text.xml; path = PrivacyInfo.xcprivacy; sourceTree = "<group>"; };');
  p=p.replace('504EC3131FED79650016851F /* Info.plist */,','504EC3131FED79650016851F /* Info.plist */,\n\t\t\t\tAA0000000000000000000002 /* PrivacyInfo.xcprivacy */,');
  p=p.replace('504EC30F1FED79650016851F /* Assets.xcassets in Resources */,','504EC30F1FED79650016851F /* Assets.xcassets in Resources */,\n\t\t\t\tAA0000000000000000000001 /* PrivacyInfo.xcprivacy in Resources */,');
}
// In-app purchase capability is implemented by the store SDK; enable the Xcode capability marker.
if(!p.includes('com.apple.InAppPurchase'))p=p.replace(/CreatedOnToolsVersion = ([^;]+);/,'CreatedOnToolsVersion = $1;\n\t\t\t\t\t\tSystemCapabilities = { com.apple.InAppPurchase = { enabled = 1; }; };');
const version=JSON.parse(await fs.readFile('package.json','utf8')).version;
await fs.writeFile(project,p.replace(/MARKETING_VERSION = [\d.]+;/g,`MARKETING_VERSION = ${version};`).replaceAll('IPHONEOS_DEPLOYMENT_TARGET = 15.0;', 'IPHONEOS_DEPLOYMENT_TARGET = 16.0;'));
console.log('Prepared Vikashya app icons, launch artwork and iOS privacy resources.');
