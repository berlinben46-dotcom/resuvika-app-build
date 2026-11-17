import fs from 'node:fs/promises';
// Merge files rather than deleting the public directory; cloud-sync/AV processes can
// lock directories on Windows while Capacitor attempts its usual remove-and-copy.
const targets=['android/app/src/main/assets','ios/App/App'];
for(const target of targets){
  await fs.mkdir(`${target}/public`,{recursive:true});
  await fs.cp('www',`${target}/public`,{recursive:true,force:true});
  await fs.copyFile('capacitor.config.json',`${target}/capacitor.config.json`);
}
console.log('Copied current mobile assets without removing synced directories.');
