[CmdletBinding()]
param()

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. (Join-Path $PSScriptRoot 'runner-server.common.ps1')

$paths = Get-RunnerServerPaths
$config = Get-RunnerServerConfig
$runnerPid = Get-RunnerServerPid
$process = Get-RunnerServerProcess
$health = Test-RunnerServerHealth
$tail = Get-RunnerServerLogTail -Lines 20

Write-RunnerConsole "runner server base url: $($config.BaseUrl)"
Write-RunnerConsole ("RUNNER_SERVER_TOKEN loaded: " + ($(if ($config.Token) { 'yes' } else { 'no' })))

if ($runnerPid) {
  Write-RunnerConsole "PID file: $($paths.PidPath) pid=$runnerPid"
} else {
  Write-RunnerConsole "PID file: not found"
}

if ($process) {
  Write-RunnerConsole "Process: running pid=$($process.Id) name=$($process.ProcessName)"
} else {
  Write-RunnerConsole "Process: not running"
}

if ($health.Reachable) {
  Write-RunnerConsole "Health: reachable"
  $health.Response | ConvertTo-Json -Depth 6
} else {
  Write-RunnerConsole "Health: unreachable message=$($health.Error)"
}

if ($tail.Count -gt 0) {
  Write-RunnerConsole 'Recent log lines:'
  $tail | ForEach-Object { Write-Host $_ }
} else {
  Write-RunnerConsole 'Recent log lines: none'
}
