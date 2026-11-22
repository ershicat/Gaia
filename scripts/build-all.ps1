#!/usr/bin/env pwsh
# 一条命令出包：类型检查 → 依赖图检查 → web 构建 → APK。
#
# 用法（签名材料不入库，必须自己传）：
#   pwsh ./scripts/build-all.ps1 -VersionName 1.8.15 -VersionCode 1208 `
#     -Keystore C:\path\your.jks -KsPass <storepass> -KsAlias <alias>
#
# 依赖：Node 22.12+、pnpm、JDK 17（JAVA_HOME）、Android SDK（ANDROID_HOME）。
[CmdletBinding()]
param(
    [string]$VersionName = '1.0.0',
    [int]$VersionCode = 1000,
    [string]$Keystore = '',
    [string]$KsPass = '',
    [string]$KsAlias = 'release',
    [switch]$SkipDeps
)

$ErrorActionPreference = 'Continue'
function Step($name) { Write-Host "==> $name" -ForegroundColor Cyan }
function Fail($msg) { Write-Host "FAILED: $msg" -ForegroundColor Red; exit 1 }

$root = Split-Path $PSScriptRoot -Parent
$web  = Join-Path $root 'web'
$node = if ($env:DSH_NODE) { $env:DSH_NODE } else { 'node' }
# DSH_PNPM 可以是 pnpm 可执行文件，也可以是 pnpm.mjs 的路径
$pnpm = if ($env:DSH_PNPM) { $env:DSH_PNPM } else { 'pnpm' }

# pnpm.mjs 需要用 node 起；原生 pnpm 命令直接调
function Invoke-Pnpm {
    param([Parameter(ValueFromRemainingArguments = $true)][string[]]$PnpmArgs)
    if ($pnpm.ToLower().EndsWith('.mjs')) {
        & $node $pnpm @PnpmArgs
    } else {
        & $pnpm @PnpmArgs
    }
}

Push-Location $web

Step 'type check'
Invoke-Pnpm exec tsc -p tsconfig.json --noEmit
if ($LASTEXITCODE -ne 0) { Pop-Location; Fail 'tsc' }

if (-not $SkipDeps) {
    Step 'dependency graph check'
    $deps = Join-Path $PSScriptRoot 'check-deps.mjs'
    & $node $deps
    if ($LASTEXITCODE -ne 0) { Pop-Location; Fail 'check-deps' }
}

Step 'web build'
$env:NODE_ENV = 'production'
Invoke-Pnpm exec rspack build -c rspack.config.ts
$buildExit = $LASTEXITCODE
$env:NODE_ENV = ''
if ($buildExit -ne 0) { Pop-Location; Fail 'rspack' }

Pop-Location

Step 'apk'
$apkScript = Join-Path $root 'android\build.ps1'
& powershell.exe -NoProfile -ExecutionPolicy Bypass -File $apkScript `
    -VersionName $VersionName -VersionCode $VersionCode `
    -Keystore $Keystore -KsPass $KsPass -KsAlias $KsAlias
if ($LASTEXITCODE -ne 0) { Fail 'apk' }
