import fs from 'node:fs/promises';
const platform=process.argv[2];
if(!['android','ios'].includes(platform))throw new Error('Pass android or ios.');
const c=JSON.parse(await fs.readFile('mobile.config.json','utf8'));
const key=platform==='android'?(process.env.RC_ANDROID_PUBLIC_KEY||c.androidPublicApiKey):(process.env.RC_IOS_PUBLIC_KEY||c.iosPublicApiKey);
const failures=[];
if(!key||!key.startsWith(platform==='android'?'goog_':'appl_'))failures.push('Set the platform-specific RevenueCat PUBLIC SDK key (not a secret API key or a test-store key).');
for(const [field,env] of [['privacyUrl','PRIVACY_URL'],['termsUrl','TERMS_URL']]){
  let u;try{u=new URL(process.env[env]||c[field]);}catch{}
  if(!u||u.protocol!=='https:'||/example\.(com|org)|localhost/.test(u.hostname))failures.push(`Set a published HTTPS ${field}.`);
}
if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(process.env.SUPPORT_EMAIL||c.supportEmail))failures.push('Set the customer support email.');
if(failures.length){console.error('Release configuration is incomplete:\n'+failures.map(f=>'• '+f).join('\n'));process.exit(1);}
console.log('Local release configuration checks passed. Complete live store, purchase, physical-device and policy checks in docs/PLAY_CONSOLE_SETUP.md before submission.');
