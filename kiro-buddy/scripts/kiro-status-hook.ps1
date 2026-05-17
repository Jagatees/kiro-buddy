param(
  [Parameter(Mandatory = $true)]
  [ValidateSet("idle", "working", "waiting", "asking", "done", "error")]
  [string] $Status,

  [Parameter(Mandatory = $false)]
  [ValidateSet("auto", "design", "requirements", "tasks")]
  [string] $Phase = "auto",

  [Parameter(Mandatory = $false, ValueFromRemainingArguments = $true)]
  [string[]] $Flags = @()
)

$defaultMessages = @{
  idle = "Kiro is ready"
  working = "Kiro is working"
  waiting = "Kiro is waiting for input"
  asking = "Kiro is asking for your input"
  done = "Kiro finished"
  error = "Kiro hit an error"
}

$phaseTitles = @{
  design = "Design"
  requirements = "Requirements"
  tasks = "Task List"
}

function Get-FlagValue([string] $Prefix) {
  foreach ($flag in $Flags) {
    if ($flag.StartsWith($Prefix)) {
      return $flag.Substring($Prefix.Length)
    }
  }

  return $null
}

function Quote-ProcessArgument([string] $Value) {
  return "`"$($Value -replace '"', '\"')`""
}

function Get-InstallMetadata {
  $metadataPath = Join-Path $PSScriptRoot "install.json"
  if (-not (Test-Path $metadataPath)) {
    return $null
  }

  try {
    return Get-Content -Raw -Path $metadataPath | ConvertFrom-Json
  } catch {
    return $null
  }
}

function Test-KiroBuddyRunning([string] $PackageRoot) {
  try {
    $escapedRoot = [Regex]::Escape($PackageRoot)
    $matching = Get-CimInstance Win32_Process |
      Where-Object { $_.CommandLine -match $escapedRoot -and $_.CommandLine -match "kiro-buddy" }
    return $null -ne $matching
  } catch {
    return $false
  }
}

function Start-KiroBuddyIfNeeded {
  if ($env:KIRO_BUDDY_NO_AUTOSTART -eq "1") {
    return
  }

  $metadata = Get-InstallMetadata
  if (-not $metadata -or [string]::IsNullOrWhiteSpace($metadata.packageRoot)) {
    return
  }

  $packageRoot = [string]$metadata.packageRoot
  if (Test-KiroBuddyRunning $packageRoot) {
    return
  }

  $electronModule = Join-Path $packageRoot "node_modules\electron"
  try {
    $electronBinary = node -e "process.stdout.write(require(process.argv[1]))" $electronModule
  } catch {
    return
  }

  if ([string]::IsNullOrWhiteSpace($electronBinary) -or -not (Test-Path $electronBinary)) {
    return
  }

  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = $electronBinary
  $startInfo.Arguments = "`"$packageRoot`""
  $startInfo.WorkingDirectory = $packageRoot
  $startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
  $startInfo.UseShellExecute = $false
  $startInfo.EnvironmentVariables["KIRO_BUDDY_EXIT_WITH_KIRO"] = "1"
  [System.Diagnostics.Process]::Start($startInfo) | Out-Null
}

Start-KiroBuddyIfNeeded

$statusFilePath = $env:KIRO_BUDDY_STATUS_FILE
if ([string]::IsNullOrWhiteSpace($statusFilePath)) {
  $statusFilePath = Join-Path $env:USERPROFILE ".kiro\status.json"
}

$delayMsText = Get-FlagValue "--delay-ms="
if (-not [string]::IsNullOrWhiteSpace($delayMsText)) {
  $delayMs = [int]$delayMsText
  if ($delayMs -gt 0) {
    Start-Sleep -Milliseconds ([Math]::Min($delayMs, 10000))
  }

  $startedAtText = Get-FlagValue "--started-at="
  if (-not [string]::IsNullOrWhiteSpace($startedAtText) -and (Test-Path $statusFilePath)) {
    try {
      $existingForDelay = Get-Content -Raw -Path $statusFilePath | ConvertFrom-Json
      $startedAt = [Int64]$startedAtText
      if ($existingForDelay.timestamp -gt $startedAt) {
        Write-Output "Kiro Buddy: skipped delayed $Status"
        exit 0
      }
    } catch {
      # Continue with the delayed write if the existing status cannot be parsed.
    }
  }
}

$message = $env:KIRO_BUDDY_MESSAGE
if ([string]::IsNullOrWhiteSpace($message) -and $Status -eq "working" -and -not [string]::IsNullOrWhiteSpace($env:USER_PROMPT)) {
  $message = "Prompt: $env:USER_PROMPT"
}

if ([string]::IsNullOrWhiteSpace($message)) {
  $message = $defaultMessages[$Status]
}

$message = ($message -replace "\s+", " ").Trim()
if ($message.Length -gt 120) {
  $message = $message.Substring(0, 120)
}

$existingPhase = $null
if (Test-Path $statusFilePath) {
  try {
    $existing = Get-Content -Raw -Path $statusFilePath | ConvertFrom-Json
    if ($existing.phase -in @("design", "requirements", "tasks")) {
      $existingPhase = [string]$existing.phase
    }
  } catch {
    $existingPhase = $null
  }
}

$phaseCandidates = @(
  $env:KIRO_BUDDY_PHASE,
  $env:USER_PROMPT,
  $env:KIRO_ACTIVE_FILE,
  $env:KIRO_FILE,
  $env:ACTIVE_FILE,
  $env:CURRENT_FILE,
  $env:WORKSPACE_FILE
) -join " "

if ($env:KIRO_BUDDY_READ_STDIN -eq "1" -or $Flags -contains "--read-stdin") {
  try {
    $stdinTask = [Console]::In.ReadToEndAsync()
    $timeoutMs = 100
    if (-not [string]::IsNullOrWhiteSpace($env:KIRO_BUDDY_STDIN_TIMEOUT_MS)) {
      $timeoutMs = [int]$env:KIRO_BUDDY_STDIN_TIMEOUT_MS
    }

    if ($stdinTask.Wait($timeoutMs)) {
      $phaseCandidates = "$phaseCandidates $($stdinTask.Result)"
    }
  } catch {
    $phaseCandidates = $phaseCandidates
  }
}

$resolvedPhase = $null
if ($Phase -ne "auto") {
  $resolvedPhase = $Phase
} elseif ($phaseCandidates -match "(?i)\b(tasks?|task\s*list)\b|tasks\.md") {
  $resolvedPhase = "tasks"
} elseif ($phaseCandidates -match "(?i)\brequirements?\b|requirements\.md") {
  $resolvedPhase = "requirements"
} elseif ($phaseCandidates -match "(?i)\bdesign\b|design\.md") {
  $resolvedPhase = "design"
} elseif ($Status -in @("done", "error") -and $existingPhase) {
  $resolvedPhase = $existingPhase
}

$existingStatus = $null
if (Test-Path $statusFilePath) {
  try {
    $existingForStatus = Get-Content -Raw -Path $statusFilePath | ConvertFrom-Json
    if ($existingForStatus.status -in @("idle", "working", "waiting", "asking", "done", "error")) {
      $existingStatus = [string]$existingForStatus.status
    }
  } catch {
    $existingStatus = $null
  }
}

$requiresPhase = $env:KIRO_BUDDY_REQUIRE_PHASE -eq "1" -or $Flags -contains "--require-phase"
$canResumeFromInput = $Status -eq "working" -and $existingStatus -in @("asking", "waiting")
$isSpecActivityDuringInput = $Status -eq "working" -and $resolvedPhase -and $existingStatus -in @("asking", "waiting")

if ($requiresPhase -and -not $resolvedPhase -and -not $canResumeFromInput) {
  Write-Output "Kiro Buddy: skipped $Status without phase"
  exit 0
}

if ($isSpecActivityDuringInput) {
  Write-Output "Kiro Buddy: skipped spec activity during input"
  exit 0
}

if (
  $resolvedPhase -and
  $Status -eq "working" -and
  [string]::IsNullOrWhiteSpace($env:KIRO_BUDDY_MESSAGE) -and
  [string]::IsNullOrWhiteSpace($env:USER_PROMPT)
) {
  $message = "$($phaseTitles[$resolvedPhase]) in progress"
}

$payload = [ordered]@{
  status = $Status
  message = $message
  timestamp = [DateTimeOffset]::UtcNow.ToUnixTimeMilliseconds()
}

if ($resolvedPhase) {
  $payload.phase = $resolvedPhase
}

$directory = Split-Path -Parent $statusFilePath
if (-not (Test-Path $directory)) {
  New-Item -ItemType Directory -Path $directory -Force | Out-Null
}

$json = $payload | ConvertTo-Json -Compress
$tempFile = "$statusFilePath.$PID.tmp"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)
[System.IO.File]::WriteAllText($tempFile, "$json`n", $utf8NoBom)
Move-Item -Force -Path $tempFile -Destination $statusFilePath

$fallbackAskingMsText = Get-FlagValue "--fallback-asking-ms="
if ([string]::IsNullOrWhiteSpace($fallbackAskingMsText)) {
  $fallbackAskingMsText = Get-FlagValue "--fallback-waiting-ms="
}
if (
  $Status -eq "working" -and
  -not [string]::IsNullOrWhiteSpace($fallbackAskingMsText)
) {
  $scriptArgs = @(
    "-NoProfile",
    "-ExecutionPolicy",
    "Bypass",
    "-File",
    $PSCommandPath,
    "asking",
    "--delay-ms=$fallbackAskingMsText",
    "--started-at=$($payload.timestamp)"
  )
  $startInfo = New-Object System.Diagnostics.ProcessStartInfo
  $startInfo.FileName = "powershell.exe"
  $startInfo.Arguments = ($scriptArgs | ForEach-Object { Quote-ProcessArgument $_ }) -join " "
  $startInfo.WorkingDirectory = (Get-Location).Path
  $startInfo.WindowStyle = [System.Diagnostics.ProcessWindowStyle]::Hidden
  $startInfo.UseShellExecute = $false
  $startInfo.EnvironmentVariables["KIRO_BUDDY_MESSAGE"] = "Kiro is asking for your input"
  if (-not [string]::IsNullOrWhiteSpace($env:KIRO_BUDDY_STATUS_FILE)) {
    $startInfo.EnvironmentVariables["KIRO_BUDDY_STATUS_FILE"] = $env:KIRO_BUDDY_STATUS_FILE
  }
  [System.Diagnostics.Process]::Start($startInfo) | Out-Null
}

Write-Output "Kiro Buddy: $Status"
