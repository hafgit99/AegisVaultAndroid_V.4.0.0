param(
  [string]$ApkPath = "f:\AegisAndroid_publish\android\app\build\outputs\apk\release\app-release.apk"
)

$ErrorActionPreference = "Stop"

function Resolve-AdbPath {
  $candidates = @()
  if ($env:ANDROID_SDK_ROOT) {
    $candidates += (Join-Path $env:ANDROID_SDK_ROOT "platform-tools\adb.exe")
  }
  if ($env:ANDROID_HOME) {
    $candidates += (Join-Path $env:ANDROID_HOME "platform-tools\adb.exe")
  }
  if ($env:LOCALAPPDATA) {
    $candidates += (Join-Path $env:LOCALAPPDATA "Android\Sdk\platform-tools\adb.exe")
  }

  foreach ($p in $candidates) {
    if ($p -and (Test-Path $p)) { return $p }
  }
  throw "ADB bulunamadı. Android SDK platform-tools kurulumu/PATH kontrol et."
}

function Start-AdbServer {
  param(
    [string]$AdbPath,
    [int]$Port
  )

  $env:ANDROID_ADB_SERVER_PORT = "$Port"
  & $AdbPath kill-server | Out-Null
  $startOut = & $AdbPath start-server 2>&1 | Out-String
  $devicesOut = & $AdbPath devices 2>&1 | Out-String

  if ($startOut -match "failed to start daemon" -or $devicesOut -match "cannot connect to daemon") {
    return $null
  }

  $serial = ($devicesOut -split "`r?`n" | Where-Object { $_ -match "^\S+\s+device$" } | Select-Object -First 1)
  if (-not $serial) {
    if ($devicesOut -match "unauthorized") {
      throw "Cihaz unauthorized. Telefonda USB hata ayıklama iznini onayla ve tekrar dene."
    }
    throw "USB bağlı cihaz bulunamadı. Kablo/USB debugging/driver kontrol et."
  }

  return (($serial -split "\s+")[0])
}

if (-not (Test-Path $ApkPath)) {
  throw "APK bulunamadı: $ApkPath"
}

$adb = Resolve-AdbPath
$ports = @(5037, 5038, 5039)
$installed = $false
$lastError = ""

foreach ($port in $ports) {
  try {
    $serial = Start-AdbServer -AdbPath $adb -Port $port
    if (-not $serial) { continue }

    Write-Host "ADB port $port ile cihaz bulundu: $serial"
    $installOut = & $adb -P $port -s $serial install -r $ApkPath 2>&1 | Out-String
    if ($LASTEXITCODE -eq 0 -and $installOut -match "Success") {
      Write-Host "Kurulum başarılı."
      Write-Host $installOut.Trim()
      $installed = $true
      break
    }
    $lastError = $installOut.Trim()
  } catch {
    $lastError = $_.Exception.Message
  }
}

if (-not $installed) {
  throw "APK kurulamadı. Son hata: $lastError`nFirewall/antivirüs ADB socket engeli (127.0.0.1) olabilir."
}

