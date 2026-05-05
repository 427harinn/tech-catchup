[CmdletBinding()]
param()

Set-StrictMode -Version Latest

function Get-RepoRoot {
  return (Split-Path -Parent $PSScriptRoot)
}

function Get-RunnerServerPaths {
  $repoRoot = Get-RepoRoot
  $logsDir = Join-Path $repoRoot 'logs'

  return [pscustomobject]@{
    RepoRoot = $repoRoot
    LogsDir = $logsDir
    LogPath = Join-Path $logsDir 'runner-server.log'
    PidPath = Join-Path $logsDir 'runner-server.pid'
    EnvPath = Join-Path $repoRoot '.env'
    RunnerServerScriptPath = Join-Path $repoRoot 'scripts/runner-server.js'
    JobRunnerScriptPath = Join-Path $repoRoot 'scripts/run-fetch-and-summarize-job.ps1'
  }
}

function Ensure-RunnerDirectories {
  $paths = Get-RunnerServerPaths
  New-Item -ItemType Directory -Force -Path $paths.LogsDir | Out-Null
}

function Read-DotEnv {
  $paths = Get-RunnerServerPaths
  $values = @{}

  if (-not (Test-Path $paths.EnvPath)) {
    return $values
  }

  foreach ($line in Get-Content -LiteralPath $paths.EnvPath) {
    $trimmed = $line.Trim()
    if (-not $trimmed -or $trimmed.StartsWith('#')) {
      continue
    }

    $parts = $trimmed -split '=', 2
    if ($parts.Count -ne 2) {
      continue
    }

    $name = $parts[0].Trim()
    $value = $parts[1].Trim()
    $values[$name] = $value
  }

  return $values
}

function Get-RunnerServerConfig {
  $envFile = Read-DotEnv

  $token = if ($env:RUNNER_SERVER_TOKEN) { $env:RUNNER_SERVER_TOKEN } elseif ($envFile.ContainsKey('RUNNER_SERVER_TOKEN')) { $envFile['RUNNER_SERVER_TOKEN'] } else { '' }
  $port = if ($env:RUNNER_SERVER_PORT) { [int]$env:RUNNER_SERVER_PORT } elseif ($envFile.ContainsKey('RUNNER_SERVER_PORT')) { [int]$envFile['RUNNER_SERVER_PORT'] } else { 3900 }
  $runnerHost = if ($env:RUNNER_SERVER_HOST) { $env:RUNNER_SERVER_HOST } elseif ($envFile.ContainsKey('RUNNER_SERVER_HOST')) { $envFile['RUNNER_SERVER_HOST'] } else { '127.0.0.1' }
  $backendApiBaseUrl = if ($env:RUNNER_BACKEND_API_BASE_URL) { $env:RUNNER_BACKEND_API_BASE_URL } elseif ($envFile.ContainsKey('RUNNER_BACKEND_API_BASE_URL')) { $envFile['RUNNER_BACKEND_API_BASE_URL'] } else { 'http://localhost:3000' }

  return [pscustomobject]@{
    Token = $token
    Port = $port
    Host = $runnerHost
    BaseUrl = "http://${runnerHost}:${port}"
    BackendApiBaseUrl = $backendApiBaseUrl
  }
}

function Set-RunnerServerEnvironment {
  $config = Get-RunnerServerConfig
  $env:RUNNER_SERVER_TOKEN = $config.Token
  $env:RUNNER_SERVER_PORT = [string]$config.Port
  $env:RUNNER_SERVER_HOST = $config.Host
  $env:RUNNER_BACKEND_API_BASE_URL = $config.BackendApiBaseUrl
  return $config
}

function Write-RunnerConsole {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Message
  )

  $timestamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  Write-Host "[${timestamp}] $Message"
}

function Get-RunnerServerPid {
  $paths = Get-RunnerServerPaths

  if (-not (Test-Path $paths.PidPath)) {
    return $null
  }

  $raw = (Get-Content -LiteralPath $paths.PidPath -Raw).Trim()
  if (-not $raw) {
    return $null
  }

  return [int]$raw
}

function Get-RunnerServerProcess {
  $runnerPid = Get-RunnerServerPid
  if (-not $runnerPid) {
    return $null
  }

  try {
    return Get-Process -Id $runnerPid -ErrorAction Stop
  } catch {
    return $null
  }
}

function Test-RunnerServerHealth {
  $config = Get-RunnerServerConfig
  try {
    $response = Invoke-RestMethod -Uri "$($config.BaseUrl)/health" -Method Get -TimeoutSec 3
    return [pscustomobject]@{
      Reachable = $true
      Response = $response
    }
  } catch {
    return [pscustomobject]@{
      Reachable = $false
      Error = $_.Exception.Message
    }
  }
}

function Get-RunnerServerLogTail {
  param(
    [int]$Lines = 20
  )

  $paths = Get-RunnerServerPaths
  if (-not (Test-Path $paths.LogPath)) {
    return @()
  }

  return Get-Content -LiteralPath $paths.LogPath -Tail $Lines
}
