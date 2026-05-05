[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'runner-server.common.ps1')

$config = Get-RunnerServerConfig

if (-not $config.Token) {
  throw 'RUNNER_SERVER_TOKEN is not set in .env or environment variables.'
}

$headers = @{
  'x-runner-token' = $config.Token
}

$body = @{
  type = 'fetch_and_summarize'
} | ConvertTo-Json

Write-RunnerConsole "POST $($config.BaseUrl)/run-job"

try {
  $response = Invoke-WebRequest `
    -Uri "$($config.BaseUrl)/run-job" `
    -Method Post `
    -Headers $headers `
    -ContentType 'application/json; charset=utf-8' `
    -Body $body `
    -TimeoutSec 5

  $payload = $response.Content | ConvertFrom-Json
  Write-RunnerConsole "result=accepted status_code=$($response.StatusCode)"
  $payload | ConvertTo-Json -Depth 6
} catch {
  if ($_.Exception.Response) {
    $statusCode = [int]$_.Exception.Response.StatusCode
    $reader = New-Object System.IO.StreamReader($_.Exception.Response.GetResponseStream())
    $content = $reader.ReadToEnd()
    $payload = $null

    try {
      $payload = $content | ConvertFrom-Json
    } catch {
    }

    if ($statusCode -eq 409 -and $payload?.already_running) {
      Write-RunnerConsole "result=already_running status_code=$statusCode"
    } else {
      Write-RunnerConsole "result=error status_code=$statusCode"
    }

    if ($payload) {
      $payload | ConvertTo-Json -Depth 6
    } elseif ($content) {
      Write-Host $content
    }
  } else {
    Write-RunnerConsole "result=error message=$($_.Exception.Message)"
  }
}

Write-RunnerConsole 'Checking latest job via backend API'
$latest = Invoke-RestMethod -Uri 'http://localhost:3000/api/jobs/fetch-and-summarize/latest' -Method Get -TimeoutSec 5
$latest | ConvertTo-Json -Depth 8
