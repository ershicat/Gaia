#!/usr/bin/env pwsh
# 构建 Gaia APK：不依赖 Gradle，只用 Android SDK 自带工具。
# 前置：..\web\dist 已由 scripts\build-web.ps1 生成。
[CmdletBinding()]
param(
    [string]$VersionName = '1.0.0',
    [int]$VersionCode = 1000,
    [string]$OutputDir = '',
    # 交付包沿用旧版 dialog-shell 的 applicationId 与签名，才能覆盖安装旧版
    [string]$PackageName = 'com.dialogshell.app',
    [string]$Keystore = '',
    [string]$KsPass = '',
    [string]$KsAlias = 'release'
)
$ErrorActionPreference = 'Continue'
function Step($name) { Write-Host "==> $name" -ForegroundColor Cyan }
function Fail($msg) { Write-Host "FAILED: $msg" -ForegroundColor Red; exit 1 }

$root     = $PSScriptRoot
$webDist  = Join-Path (Split-Path $PSScriptRoot -Parent) 'web\dist'
$sdk      = if ($env:ANDROID_HOME) { $env:ANDROID_HOME } else { '' }
$bt       = if ($sdk) { Join-Path $sdk 'build-tools\36.0.0' } else { '' }
$platform = if ($sdk) { Join-Path $sdk 'platforms\android-36\android.jar' } else { '' }
$jdk      = if ($env:JAVA_HOME) { $env:JAVA_HOME } else { '' }

# 公开版：签名材料不入库。跑构建前自己准备 keystore 并传参：
#   -Keystore <你的.jks> -KsPass <storepass> -KsAlias <alias>
if (-not $OutputDir) { $OutputDir = Join-Path $root 'out' }
if (-not $Keystore)  { Fail '缺少 -Keystore（公开仓库不提供签名文件）' }
if (-not $KsPass)    { Fail '缺少 -KsPass' }
if (-not $sdk)       { Fail '请先设置 ANDROID_HOME' }
if (-not $jdk)       { Fail '请先设置 JAVA_HOME' }

foreach ($p in @($bt, $platform, $jdk, $root, $webDist)) { if (-not (Test-Path $p)) { Fail "missing: $p" } }
$env:JAVA_HOME = $jdk
$env:PATH = "$jdk\bin;$bt;$env:PATH"

$build  = Join-Path $root 'build'
$out    = Join-Path $root 'out'

Step 'clean'
Remove-Item $build -Recurse -Force -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path "$build\assets", "$build\gen", "$build\classes", "$build\dex", $out | Out-Null

Step 'stage web assets'
Copy-Item $webDist "$build\assets\web" -Recurse -Force
# 壳自带的静态资源（反馈二维码等）直接并进 web 根目录
$shellAssets = Join-Path $root 'shell-assets'
if (Test-Path $shellAssets) {
    Copy-Item (Join-Path $shellAssets '*') "$build\assets\web\" -Recurse -Force
    Write-Host 'shell assets merged'
}
$indexPath = "$build\assets\web\index.html"
if (-not (Test-Path $indexPath)) { Fail 'web assets missing index.html' }

# 运行期配置：把动态配置脚本插到 </head> 之前（静态文件内容本身不动）
$html = [System.IO.File]::ReadAllText($indexPath, [System.Text.Encoding]::UTF8)
if ($html -notmatch '__gaia/config\.js') {
    $html = $html -replace '</head>', '<script src="/__gaia/config.js"></script></head>'
    [System.IO.File]::WriteAllText($indexPath, $html, (New-Object System.Text.UTF8Encoding($false)))
    Write-Host 'config script injected'
} else {
    Write-Host 'config script already present'
}

Step 'aapt2 compile resources'
& "$bt\aapt2.exe" compile --dir (Join-Path $root 'res') -o "$build\res.zip"
if ($LASTEXITCODE -ne 0) { Fail 'aapt2 compile' }

Step 'aapt2 link'
# --rename-manifest-package：Java 源码仍在 com.gaia.app 下（R 也在那里），
# 只把最终 applicationId 改成旧版的 com.dialogshell.app，这样能覆盖安装旧版。
& "$bt\aapt2.exe" link `
    -o "$build\base.apk" `
    -I $platform `
    --manifest (Join-Path $root 'AndroidManifest.xml') `
    --rename-manifest-package $PackageName `
    --java "$build\gen" `
    --min-sdk-version 24 `
    --target-sdk-version 34 `
    --version-code $VersionCode `
    --version-name $VersionName `
    --auto-add-overlay `
    "$build\res.zip"
if ($LASTEXITCODE -ne 0) { Fail 'aapt2 link' }

Step 'javac'
$sources = @(Get-ChildItem (Join-Path $root 'src') -Recurse -Filter *.java | ForEach-Object { $_.FullName })
$sources += @(Get-ChildItem "$build\gen" -Recurse -Filter *.java | ForEach-Object { $_.FullName })
& "$jdk\bin\javac.exe" -encoding UTF-8 --release 11 -classpath $platform -d "$build\classes" @sources
if ($LASTEXITCODE -ne 0) { Fail 'javac' }

Step 'd8'
$classes = @(Get-ChildItem "$build\classes" -Recurse -Filter *.class | ForEach-Object { $_.FullName })
& "$bt\d8.bat" --lib $platform --min-api 24 --output "$build\dex" @classes
if ($LASTEXITCODE -ne 0) { Fail 'd8' }
if (-not (Test-Path "$build\dex\classes.dex")) { Fail 'classes.dex missing' }

Step 'pack assets + dex into apk'
# 用 JDK 自带的 jar 打包：aapt2 在 Windows 上会把 -A 的条目名写成反斜杠（AssetManager 找不到），
# 而 .NET 的 ZipFile 在部分 PowerShell 宿主下类型不可用；jar 两者都没有，且 JDK 本来就是构建依赖。
$stageDir = $build + '\stage'
if (Test-Path -LiteralPath $stageDir) { Remove-Item -LiteralPath $stageDir -Recurse -Force }
New-Item -ItemType Directory -Force -Path ($stageDir + '\assets') | Out-Null
Copy-Item ($build + '\assets\web') ($stageDir + '\assets\web') -Recurse -Force
Copy-Item ($build + '\dex\classes.dex') ($stageDir + '\classes.dex') -Force
$jarExe = $jdk + '\bin\jar.exe'
$apkFile = $build + '\base.apk'
& $jarExe --update --file $apkFile -C $stageDir assets
if ($LASTEXITCODE -ne 0) { Fail 'jar pack assets' }
& $jarExe --update --file $apkFile -C $stageDir classes.dex
if ($LASTEXITCODE -ne 0) { Fail 'jar pack dex' }
Write-Host 'assets + classes.dex packed'

Step 'zipalign'
& "$bt\zipalign.exe" -p -f 4 "$build\base.apk" "$build\aligned.apk"
if ($LASTEXITCODE -ne 0) { Fail 'zipalign' }

Step 'keystore'
# 用旧版 dialog-shell 的签名：同一 applicationId + 同一证书才能覆盖安装旧版
if (-not (Test-Path $Keystore)) { Fail "missing keystore: $Keystore" }

Step 'apksigner'
$final = Join-Path $out "gaia-$VersionName.apk"
& "$bt\apksigner.bat" sign --ks $Keystore --ks-pass "pass:$KsPass" --key-pass "pass:$KsPass" `
    --ks-key-alias $KsAlias `
    --v1-signing-enabled true --v2-signing-enabled true --v3-signing-enabled true `
    --out $final "$build\aligned.apk"
if ($LASTEXITCODE -ne 0) { Fail 'apksigner' }
$verifyOut = & "$bt\apksigner.bat" verify --print-certs $final 2>&1
$verifyCode = $LASTEXITCODE
$verifyOut | Select-Object -First 3
if ($verifyCode -ne 0) { Fail 'apksigner verify' }

Step 'deliver'
if (-not (Test-Path $OutputDir)) { New-Item -ItemType Directory -Force -Path $OutputDir | Out-Null }
Copy-Item $final (Join-Path $OutputDir (Split-Path $final -Leaf)) -Force
$hash = (Get-FileHash $final -Algorithm SHA256).Hash
$size = [math]::Round((Get-Item $final).Length / 1MB, 2)
Write-Host ''
Write-Host "APK : $final" -ForegroundColor Green
Write-Host ('SIZE: {0} MB' -f $size)
Write-Host "SHA256: $hash"
Write-Host "COPIED TO: $OutputDir"
