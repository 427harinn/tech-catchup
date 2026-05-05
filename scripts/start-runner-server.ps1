[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'runner-server.common.ps1')

Ensure-RunnerDirectories
$paths = Get-RunnerServerPaths
$config = Set-RunnerServerEnvironment
$existingProcess = Get-RunnerServerProcess
$health = Test-RunnerServerHealth

Push-Location $paths.RepoRoot
try {
  if ($existingProcess -and -not $existingProcess.HasExited -and $health.Reachable) {
    Write-RunnerConsole "runner server is already running. pid=$($existingProcess.Id) url=$($config.BaseUrl)"
    exit 0
  }

  if ($existingProcess -and -not $existingProcess.HasExited -and -not $health.Reachable) {
    throw "runner server process exists but health check failed. pid=$($existingProcess.Id)"
  }

  if (-not $config.Token) {
    throw 'RUNNER_SERVER_TOKEN is not set in .env or environment variables.'
  }

  if (-not (Get-Command node -ErrorAction SilentlyContinue)) {
    throw 'node command was not found.'
  }

  Write-RunnerConsole "Starting runner server on $($config.BaseUrl)"

  $process = Start-Process `
    -FilePath 'node' `
    -ArgumentList @($paths.RunnerServerScriptPath) `
    -WorkingDirectory $paths.RepoRoot `
    -WindowStyle Hidden `
    -PassThru

  Start-Sleep -Seconds 2
  $postHealth = Test-RunnerServerHealth

  if (-not $postHealth.Reachable) {
    throw "runner server did not become healthy. $($postHealth.Error)"
  }

  Write-RunnerConsole "runner server started successfully. pid=$($process.Id)"
} finally {
  Pop-Location
}
