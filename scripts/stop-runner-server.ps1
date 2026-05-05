[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'runner-server.common.ps1')

$paths = Get-RunnerServerPaths
$process = Get-RunnerServerProcess

if (-not $process) {
  if (Test-Path $paths.PidPath) {
    Remove-Item -LiteralPath $paths.PidPath -Force
  }

  Write-RunnerConsole 'runner server is not running.'
  exit 0
}

try {
  Stop-Process -Id $process.Id -Force -ErrorAction Stop
  Start-Sleep -Seconds 1
} finally {
  if (Test-Path $paths.PidPath) {
    Remove-Item -LiteralPath $paths.PidPath -Force
  }
}

Write-RunnerConsole "runner server stopped. pid=$($process.Id)"
