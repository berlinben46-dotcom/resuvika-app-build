param([string]$Apk='android/app/build/outputs/apk/debug/app-debug.apk',[string]$SdkRoot=$env:ANDROID_HOME)
$ErrorActionPreference='Stop'
Add-Type -AssemblyName System.IO.Compression.FileSystem
$apkPath=(Resolve-Path -LiteralPath $Apk).Path
$zip=[System.IO.Compression.ZipFile]::OpenRead($apkPath)
try {
  $names=@($zip.Entries | ForEach-Object {$_.FullName})
  if($names | Where-Object {$_ -match 'Seller_Private|KEEP_PRIVATE|License_Key_Creator|signing-key|license-public-key|licensing\.js|server\.js'}){throw 'Desktop/private files in APK'}
  foreach($file in @('index.html','js/mobile.js','js/canvas.js','js/offline.js','css/mobile.css','assets/vikashya.png','assets/THIRD-PARTY-NOTICES.txt')){
    $entry=$zip.GetEntry("assets/public/$file")
    if($null -eq $entry){throw "Missing app asset: $file"}
    $stream=$entry.Open();$sha=[System.Security.Cryptography.SHA256]::Create()
    try{$actual=([BitConverter]::ToString($sha.ComputeHash($stream))).Replace('-','')}finally{$stream.Dispose();$sha.Dispose()}
    $expected=(Get-FileHash -LiteralPath (Join-Path 'www' $file) -Algorithm SHA256).Hash
    if($actual -ne $expected){throw "Stale APK asset: $file"}
  }
  'APK assets match the tested web build; no desktop/private seller files.'
}finally{$zip.Dispose()}
if($SdkRoot){
  $tools=Join-Path $SdkRoot 'build-tools/36.0.0'
  & (Join-Path $tools 'apksigner.bat') verify --verbose $apkPath
  if($LASTEXITCODE -ne 0){throw 'APK signature verification failed'}
  & (Join-Path $tools 'aapt.exe') dump badging $apkPath | Select-String '^package:|^sdkVersion:|^targetSdkVersion:|^launchable-activity:'
  if($LASTEXITCODE -ne 0){throw 'APK metadata check failed'}
  & (Join-Path $tools 'aapt.exe') dump permissions $apkPath
  if($LASTEXITCODE -ne 0){throw 'APK permission check failed'}
}
Get-FileHash -LiteralPath $apkPath -Algorithm SHA256 | Format-List
