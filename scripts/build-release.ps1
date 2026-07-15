param(
  [string]$Version = $(Get-Content -Raw (Join-Path $PSScriptRoot '..\\VERSION')).Trim()
)

$ErrorActionPreference = 'Stop'

$RepoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..')).Path
$DistDir = Join-Path $RepoRoot 'dist'
$BuildDir = Join-Path $RepoRoot 'build'

Remove-Item -Recurse -Force $DistDir,$BuildDir -ErrorAction SilentlyContinue
New-Item -ItemType Directory -Force -Path $DistDir,$BuildDir | Out-Null

function New-Ipk {
  param(
    [string]$PackageName
  )

  $pkgRoot = Join-Path $BuildDir $PackageName
  $metaSrc = Join-Path $RepoRoot "packaging\\$PackageName"
  $filesSrc = Join-Path $RepoRoot "packages\\$PackageName\\files"
  $controlDir = Join-Path $pkgRoot 'control'
  $dataDir = Join-Path $pkgRoot 'data'

  New-Item -ItemType Directory -Force -Path $controlDir,$dataDir | Out-Null
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

New-Ipk -PackageName 'cf-ip-speed-client'
New-Ipk -PackageName 'luci-app-cf-ip-speed-client'
Copy-Item -Force (Join-Path $RepoRoot 'install.sh') (Join-Path $DistDir 'install.sh')
