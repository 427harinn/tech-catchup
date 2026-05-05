[CmdletBinding()]
param(
  [int]$TimeoutSeconds = 360
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'runner-server.common.ps1')

$config = Get-RunnerServerConfig

function Wait-LatestJobCompletion {
  param(
    [datetime]$Deadline
  )

  do {
    $latest = Invoke-RestMethod -Uri 'http://localhost:3000/api/jobs/fetch-and-summarize/latest' -Method Get -TimeoutSec 5
    $job = $latest.job

    if ($job) {
      Write-RunnerConsole "latest job id=$($job.id) status=$($job.status)"

      if ($job.status -notin @('queued', 'running')) {
        return $job
      }
    } else {
      Write-RunnerConsole 'latest job: none'
    }

    Start-Sleep -Seconds 3
  } while ([datetime]::UtcNow -lt $Deadline.ToUniversalTime())

  throw "Timed out waiting for job completion after $TimeoutSeconds seconds."
}

Write-RunnerConsole 'Checking backend health'
$backendHealth = Invoke-RestMethod -Uri 'http://localhost:3000/api/health' -Method Get -TimeoutSec 5
$backendHealth | ConvertTo-Json -Depth 4

Write-RunnerConsole 'Checking runner server health'
$runnerHealth = Invoke-RestMethod -Uri "$($config.BaseUrl)/health" -Method Get -TimeoutSec 5
$runnerHealth | ConvertTo-Json -Depth 4

Write-RunnerConsole 'Creating fetch-and-summarize job via backend'
$creation = Invoke-RestMethod -Uri 'http://localhost:3000/api/jobs/fetch-and-summarize' -Method Post -TimeoutSec 10
$creation | ConvertTo-Json -Depth 8

if ($creation.notification) {
  Write-RunnerConsole "runner notification succeeded=$($creation.notification.succeeded) message=$($creation.notification.message)"
}

Write-RunnerConsole "Waiting for job completion timeout_seconds=$TimeoutSeconds"
$deadline = (Get-Date).AddSeconds($TimeoutSeconds)
$finalJob = Wait-LatestJobCompletion -Deadline $deadline

Write-RunnerConsole 'Final job payload:'
$finalJob | ConvertTo-Json -Depth 10

if ($finalJob.result_json) {
  $result = $finalJob.result_json
  Write-RunnerConsole "attempted=$($result.attempted) succeeded=$($result.succeeded) failed=$($result.failed)"

  if ($result.processed_articles) {
    Write-RunnerConsole 'processed_articles:'
    $result.processed_articles | ConvertTo-Json -Depth 10
  }
}
