@echo off
setlocal
cd /d "%~dp0"
if not defined JAVA_HOME if exist "%ProgramFiles%\Android\Android Studio\jbr\bin\java.exe" set "JAVA_HOME=%ProgramFiles%\Android\Android Studio\jbr"
if not defined ANDROID_HOME if exist "%LOCALAPPDATA%\Android\Sdk" set "ANDROID_HOME=%LOCALAPPDATA%\Android\Sdk"
where node >nul 2>nul
if errorlevel 1 (
  echo Install Node.js 24 and Android Studio with SDK 36 first, or use the included GitHub workflow.
  pause
  exit /b 1
)
if not exist node_modules call npm ci
if errorlevel 1 exit /b 1
call npm run sync
if errorlevel 1 exit /b 1
cd android
call gradlew.bat :app:assembleDebug
if errorlevel 1 exit /b 1
echo Preview APK: %~dp0android\app\build\outputs\apk\debug\app-debug.apk
pause
