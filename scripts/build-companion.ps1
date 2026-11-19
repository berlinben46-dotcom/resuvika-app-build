$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
Set-Location -LiteralPath $projectRoot
$pythonExecutable = if ($env:PYTHON_PATH) { $env:PYTHON_PATH } else { 'python' }
& $pythonExecutable -m venv '.build-cache\companion-venv'
if ($LASTEXITCODE -ne 0) { throw 'Could not create the local companion build environment.' }
$buildPython = Join-Path $projectRoot '.build-cache\companion-venv\Scripts\python.exe'
& $buildPython -m pip install 'pyinstaller==6.22.3' --disable-pip-version-check
if ($LASTEXITCODE -ne 0) { throw 'Could not install the companion packager.' }
$viewerHtml = (Join-Path $projectRoot 'companion\viewer.html') + ';.'
$viewerJs = (Join-Path $projectRoot 'companion\viewer.js') + ';.'
& $buildPython -m PyInstaller --noconfirm --onefile --console --name 'Omniball-Windows-Companion-Preview' --distpath 'dist' --workpath '.build-cache\companion-build' --specpath '.build-cache' --add-data $viewerHtml --add-data $viewerJs 'companion\receiver.py'
if ($LASTEXITCODE -ne 0) { throw 'Companion packaging failed.' }
