[CmdletBinding()]
param(
  [string]$ApiBaseUrl = 'http://localhost:3000'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$logsDir = Join-Path $repoRoot 'logs'
$logPath = Join-Path $logsDir 'run-fetch-and-summarize-job.log'
$scriptPath = Join-Path $PSScriptRoot 'fetch-and-summarize.ps1'
$resultStartMarker = 'FETCH_AND_SUMMARIZE_RESULT_START'
$resultEndMarker = 'FETCH_AND_SUMMARIZE_RESULT_END'

function Write-RunnerLog {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Message
  )

  $timestamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  $line = "[${timestamp}] $Message"
  Write-Host $line
  $line | Out-File -FilePath $script:logPath -Append -Encoding utf8
}

function Invoke-JobApi {
  param(
    [Parameter(Mandatory = $true)]
    [ValidateSet('GET', 'POST')]
    [string]$Method,
    [Parameter(Mandatory = $true)]
    [string]$Path,
    $Body = $null
  )

  $invokeParams = @{
    Method = $Method
    Uri = "$ApiBaseUrl$Path"
  }

  if ($null -ne $Body) {
    $invokeParams.ContentType = 'application/json; charset=utf-8'
    $invokeParams.Body = ($Body | ConvertTo-Json -Depth 10)
  }

  return Invoke-RestMethod @invokeParams
}

function Get-ResultJsonPayload {
  param(
    [Parameter(Mandatory = $true)]
    [string]$OutputText
  )

  $startIndex = $OutputText.LastIndexOf($script:resultStartMarker)
  $endIndex = $OutputText.LastIndexOf($script:resultEndMarker)

  if ($startIndex -lt 0 -or $endIndex -lt 0 -or $endIndex -le $startIndex) {
    throw 'fetch-and-summarize.ps1 did not emit a parseable result block.'
  }

  $jsonText = $OutputText.Substring(
    $startIndex + $script:resultStartMarker.Length,
    $endIndex - ($startIndex + $script:resultStartMarker.Length)
  ).Trim()

  if ([string]::IsNullOrWhiteSpace($jsonText)) {
    throw 'fetch-and-summarize.ps1 emitted an empty result block.'
  }

  return $jsonText
}

function Parse-ResultJson {
  param(
    [Parameter(Mandatory = $true)]
    [string]$JsonText
  )

  return $JsonText | ConvertFrom-Json
}

function Test-ResultAlreadyRunning {
  param(
    [Parameter(Mandatory = $true)]
    $Result
  )

  $property = $Result.PSObject.Properties['already_running']
  if ($null -eq $property) {
    return $false
  }

  return [bool]$property.Value
}

function Invoke-FetchAndSummarizeScript {
  $command = (Resolve-Path $script:scriptPath).Path

  Write-RunnerLog "fetch-and-summarize.ps1 start path=$command"
  $output = & powershell.exe -NoProfile -ExecutionPolicy Bypass -File $command 2>&1
  $exitCode = $LASTEXITCODE
  Write-RunnerLog "fetch-and-summarize.ps1 exit_code=$exitCode"
  $outputText = (@($output) | ForEach-Object { "$_" }) -join [Environment]::NewLine

  if ($exitCode -ne 0) {
    throw "fetch-and-summarize.ps1 failed with exit code $exitCode."
  }

  return [pscustomobject]@{
    OutputText = $outputText
    JsonText = Get-ResultJsonPayload -OutputText $outputText
  }
}

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null

Write-RunnerLog "Runner job script started. api_base_url=$ApiBaseUrl script_path=$scriptPath"

$nextResponse = Invoke-JobApi -Method GET -Path '/api/jobs/fetch-and-summarize/next'
Write-RunnerLog 'Job lookup succeeded.'
$job = $nextResponse.job

if (-not $job) {
  Write-RunnerLog 'No queued fetch-and-summarize job found.'
  exit 0
}

Write-RunnerLog "Picked queued job id=$($job.id)"
Write-RunnerLog "start API sending. url=$ApiBaseUrl/api/jobs/$($job.id)/start"
$startedJob = (Invoke-JobApi -Method POST -Path "/api/jobs/$($job.id)/start").job
Write-RunnerLog "Started job id=$($startedJob.id)"

try {
  $scriptResult = Invoke-FetchAndSummarizeScript
  Write-RunnerLog "Result JSON extract succeeded. length=$($scriptResult.JsonText.Length)"
  $result = Parse-ResultJson -JsonText $scriptResult.JsonText
  Write-RunnerLog "Result JSON parse succeeded. attempted=$($result.attempted) succeeded=$($result.succeeded) failed=$($result.failed)"
  $completionStatus = if (Test-ResultAlreadyRunning -Result $result) { 'skipped' } else { 'succeeded' }

  Write-RunnerLog "complete API sending. url=$ApiBaseUrl/api/jobs/$($job.id)/complete status=$completionStatus"
  Invoke-JobApi -Method POST -Path "/api/jobs/$($job.id)/complete" -Body @{
    status = $completionStatus
    result_json = $result
  } | Out-Null

  Write-RunnerLog "complete API succeeded. job_id=$($job.id)"
  Write-RunnerLog "Completed job id=$($job.id) status=$completionStatus attempted=$($result.attempted) succeeded=$($result.succeeded) failed=$($result.failed)"
} catch {
  $message = $_.Exception.Message
  Write-RunnerLog "Runner job exception: $message"
  if ($_.ScriptStackTrace) {
    Write-RunnerLog "Runner job stack: $($_.ScriptStackTrace)"
  }
  try {
    Write-RunnerLog "fail API sending. url=$ApiBaseUrl/api/jobs/$($job.id)/fail"
    Invoke-JobApi -Method POST -Path "/api/jobs/$($job.id)/fail" -Body @{
      error_message = $message
    } | Out-Null
    Write-RunnerLog "fail API succeeded. job_id=$($job.id)"
  } catch {
    Write-RunnerLog "Failed to report job failure: $($_.Exception.Message)"
  }

  Write-RunnerLog "Job failed id=$($job.id) message=$message"
  throw
}
