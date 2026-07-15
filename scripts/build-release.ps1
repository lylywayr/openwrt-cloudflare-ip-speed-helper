param(
  [string]$Version = $(Get-Content -Raw (Join-Path $PSScriptRoot '..\\VERSION')).Trim()
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$DistDir = Join-Path $RepoRoot 'dist'
$BuildDir = Join-Path $RepoRoot 'build'
$DownloadDir = Join-Path $BuildDir 'downloads'
$CfstRepo = 'XIU2/CloudflareSpeedTest'
$CfstTag = 'v2.3.5'
$CfstBaseUrl = "https://github.com/$CfstRepo/releases/download/$CfstTag"
$OfflineTargets = @(
  @{ BundleArch = 'x86_64'; Asset = 'cfst_linux_amd64.tar.gz'; Match = 'x86_64' },
  @{ BundleArch = 'arm64'; Asset = 'cfst_linux_arm64.tar.gz'; Match = 'aarch64_generic / aarch64_cortex-a53 / aarch64_cortex-a72 / arm64' },
  @{ BundleArch = 'armv7'; Asset = 'cfst_linux_armv7.tar.gz'; Match = 'arm_cortex-a7_neon-vfpv4 / armv7 / armhf' },
  @{ BundleArch = 'mips'; Asset = 'cfst_linux_mips.tar.gz'; Match = 'mips_24kc / mips' }
)

Remove-Item -Recurse -Force $DistDir, $BuildDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $DistDir, $BuildDir, $DownloadDir | Out-Null

function New-Ipk {
  param(
    [string]$PackageName
  )

  $pkgRoot = Join-Path $BuildDir $PackageName
  $metaSrc = Join-Path $RepoRoot "packaging\\$PackageName"
  $filesSrc = Join-Path $RepoRoot "packages\\$PackageName\\files"
  $controlDir = Join-Path $pkgRoot 'control'
  $dataDir = Join-Path $pkgRoot 'data'

  New-Item -ItemType Directory -Force -Path $controlDir, $dataDir | Out-Null
  Copy-Item -Recurse -Force "$filesSrc\\*" $dataDir
  Copy-Item -Force (Join-Path $metaSrc 'conffiles') $controlDir -ErrorAction SilentlyContinue
  Copy-Item -Force (Join-Path $metaSrc 'postinst') $controlDir -ErrorAction SilentlyContinue
  Copy-Item -Force (Join-Path $metaSrc 'postinst-pkg') $controlDir -ErrorAction SilentlyContinue
  Copy-Item -Force (Join-Path $metaSrc 'prerm') $controlDir -ErrorAction SilentlyContinue

  $control = Get-Content -Raw (Join-Path $metaSrc 'control')
  $control = $control.Replace('@VERSION@', $Version)
  Set-Content -NoNewline -Path (Join-Path $controlDir 'control') -Value $control
  Set-Content -NoNewline -Path (Join-Path $pkgRoot 'debian-binary') -Value "2.0`n"

  tar -C $controlDir -czf (Join-Path $pkgRoot 'control.tar.gz') .
  tar -C $dataDir -czf (Join-Path $pkgRoot 'data.tar.gz') .

  $outFile = Join-Path $DistDir "${PackageName}_${Version}_all.ipk"
  tar -C $pkgRoot -cf $outFile debian-binary control.tar.gz data.tar.gz
  Write-Host $outFile
}

function Get-CfstBinary {
  param(
    [string]$Asset
  )

  $archive = Join-Path $DownloadDir $Asset
  if (-not (Test-Path $archive)) {
    Invoke-WebRequest -Uri "$CfstBaseUrl/$Asset" -OutFile $archive
  }

  $unpackDir = Join-Path $BuildDir ("cfst-" + $Asset.Replace('.tar.gz', ''))
  Remove-Item -Recurse -Force $unpackDir -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path $unpackDir | Out-Null
  tar -xzf $archive -C $unpackDir

  $bin = Get-ChildItem -Path $unpackDir -Recurse -File | Where-Object { $_.Name -eq 'cfst' } | Select-Object -First 1
  if (-not $bin) {
    throw "cfst binary not found in $Asset"
  }
  return $bin.FullName
}

function New-OfflineBundle {
  param(
    [string]$BundleArch,
    [string]$Asset,
    [string]$Match
  )

  $bundleName = "cf-ip-speed-offline_${BundleArch}_${Version}"
  $bundleRoot = Join-Path $BuildDir $bundleName
  $offlineAssetsDir = Join-Path $bundleRoot 'offline-assets'

  Remove-Item -Recurse -Force $bundleRoot -ErrorAction SilentlyContinue
  New-Item -ItemType Directory -Force -Path $bundleRoot, $offlineAssetsDir | Out-Null

  Copy-Item -Force (Join-Path $RepoRoot 'install.sh') (Join-Path $bundleRoot 'install.sh')
  Copy-Item -Force (Join-Path $RepoRoot 'README.md') (Join-Path $bundleRoot 'README.md')
  Copy-Item -Force (Join-Path $RepoRoot 'README.en.md') (Join-Path $bundleRoot 'README.en.md')
  Copy-Item -Recurse -Force (Join-Path $RepoRoot 'packages') (Join-Path $bundleRoot 'packages')
  Copy-Item -Force (Get-CfstBinary -Asset $Asset) (Join-Path $offlineAssetsDir 'cfst')

  $bundleReadme = @"
离线整包

版本: $Version
适用架构: $Match

安装:
1. 上传并解压本压缩包
2. 进入解压目录
3. 执行: sh ./install.sh

说明:
- 本整包已内置 cfst
- install.sh 会优先使用整包内本地文件
- 若系统缺少基础依赖, install.sh 会尝试通过 opkg 补齐
"@
  Set-Content -Path (Join-Path $bundleRoot 'BUNDLE-README.txt') -Value $bundleReadme -Encoding UTF8

  $outFile = Join-Path $DistDir "${bundleName}.tar.gz"
  tar -C $BuildDir -czf $outFile $bundleName
  Write-Host $outFile
}

New-Ipk -PackageName 'cf-ip-speed-client'
New-Ipk -PackageName 'luci-app-cf-ip-speed-client'
Copy-Item -Force (Join-Path $RepoRoot 'install.sh') (Join-Path $DistDir 'install.sh')

foreach ($target in $OfflineTargets) {
  New-OfflineBundle -BundleArch $target.BundleArch -Asset $target.Asset -Match $target.Match
}
