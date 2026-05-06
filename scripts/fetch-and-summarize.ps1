[CmdletBinding()]
param(
  [int]$Limit = 10,
  [string]$ApiBaseUrl = 'http://localhost:3000',
  [switch]$SkipRssFetch,
  [string]$PickupMode = $env:PICKUP_MODE
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'
$Limit = [Math]::Min([Math]::Max($Limit, 1), 10)
if ([string]::IsNullOrWhiteSpace($PickupMode)) {
  $PickupMode = 'score'
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$logsDir = Join-Path $repoRoot 'logs'
$logPath = Join-Path $logsDir 'fetch-and-summarize.log'
$lockPath = Join-Path $logsDir 'fetch-and-summarize.lock'
$promptPath = Join-Path $repoRoot 'prompts/article_summary.md'
$schemaPath = Join-Path $PSScriptRoot 'article-summary.schema.json'
$summaryDir = Join-Path $repoRoot 'backend/src/scripts'
$backendContainerName = 'tech-catchup-backend'

$lockStream = $null
$lockAcquired = $false
$codexCommand = $null
$dockerCommand = $null
$resultStartMarker = 'FETCH_AND_SUMMARIZE_RESULT_START'
$resultEndMarker = 'FETCH_AND_SUMMARIZE_RESULT_END'

function Write-Log {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Message
  )

  $timestamp = (Get-Date).ToString('yyyy-MM-dd HH:mm:ss')
  $line = "[${timestamp}] $Message"
  Write-Host $line
  $line | Out-File -FilePath $script:logPath -Append -Encoding utf8
}

function Write-Utf8NoBomFile {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Path,
    [Parameter(Mandatory = $true)]
    [string]$Content
  )

  $utf8NoBom = New-Object System.Text.UTF8Encoding($false)
  [System.IO.File]::WriteAllText($Path, $Content, $utf8NoBom)
}

function Write-JsonLog {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Label,
    [Parameter(Mandatory = $true)]
    $Value
  )

  $json = $Value | ConvertTo-Json -Depth 10
  foreach ($line in ($json -split "`r?`n")) {
    if ($line.Trim().Length -gt 0) {
      Write-Log "[$Label] $line"
    }
  }
}

function Write-ResultJson {
  param(
    [Parameter(Mandatory = $true)]
    $Value
  )

  $json = $Value | ConvertTo-Json -Depth 10
  Write-Output $script:resultStartMarker
  Write-Output $json
  Write-Output $script:resultEndMarker
}

function Test-CommandAvailable {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  if (-not (Get-Command $Name -ErrorAction SilentlyContinue)) {
    throw "Required command not found: $Name"
  }
}

function Resolve-CommandPath {
  param(
    [Parameter(Mandatory = $true)]
    [string[]]$Candidates
  )

  foreach ($candidate in $Candidates) {
    $command = Get-Command $candidate -ErrorAction SilentlyContinue
    if ($command) {
      return $command.Source
    }
  }

  throw "Required command not found: $($Candidates -join ', ')"
}

function Get-OptionalPropertyValue {
  param(
    $Object,
    [Parameter(Mandatory = $true)]
    [string]$PropertyName
  )

  if ($null -eq $Object) {
    return $null
  }

  $property = $Object.PSObject.Properties[$PropertyName]
  if ($null -eq $property) {
    return $null
  }

  return $property.Value
}

function Acquire-Lock {
  $metadata = @{
    pid = $PID
    started_at = (Get-Date).ToString('o')
    machine = $env:COMPUTERNAME
  } | ConvertTo-Json -Compress

  try {
    $script:lockStream = [System.IO.File]::Open($script:lockPath, [System.IO.FileMode]::CreateNew, [System.IO.FileAccess]::ReadWrite, [System.IO.FileShare]::None)
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($metadata)
    $script:lockStream.Write($bytes, 0, $bytes.Length)
    $script:lockStream.Flush()
    $script:lockAcquired = $true
  } catch {
    return $false
  }

  return $true
}

function Release-Lock {
  if (-not $script:lockAcquired) {
    return
  }

  if ($script:lockStream) {
    $script:lockStream.Dispose()
    $script:lockStream = $null
  }

  if (Test-Path $script:lockPath) {
    Remove-Item -LiteralPath $script:lockPath -Force
  }

  $script:lockAcquired = $false
}

function Invoke-LoggedCommand {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Label,
    [Parameter(Mandatory = $true)]
    [scriptblock]$Action
  )

  Write-Log "$Label started."
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'

  try {
    $output = & $Action 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  foreach ($line in @($output)) {
    if ($null -ne $line -and "$line".Trim().Length -gt 0) {
      Write-Log "[$Label] $line"
    }
  }

  if ($exitCode -ne 0) {
    throw "$Label failed with exit code $exitCode."
  }

  Write-Log "$Label completed."
  return $output
}

function Invoke-CodexSummary {
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Article
  )

  $articleJson = $Article | ConvertTo-Json -Depth 10
  $promptTemplate = Get-Content -LiteralPath $script:promptPath -Raw -Encoding utf8
  $promptText = $promptTemplate.Replace('{{ARTICLE_JSON}}', $articleJson)
  $lastMessagePath = Join-Path $script:logsDir "codex-last-message-$($Article.id).json"

  if (Test-Path $lastMessagePath) {
    Remove-Item -LiteralPath $lastMessagePath -Force
  }

  $codexArgs = @(
    'exec',
    '--cd', $script:repoRoot,
    '--sandbox', 'read-only',
    '--skip-git-repo-check',
    '--output-schema', $script:schemaPath,
    '--output-last-message', $lastMessagePath,
    '--color', 'never',
    '-'
  )

  Invoke-LoggedCommand -Label "codex article $($Article.id)" -Action {
    $promptText | & $script:codexCommand @codexArgs
  } | Out-Null

  if (-not (Test-Path $lastMessagePath)) {
    throw "Codex output file was not created: $lastMessagePath"
  }

  $raw = Get-Content -LiteralPath $lastMessagePath -Raw -Encoding utf8
  $parsed = $raw | ConvertFrom-Json
  return @{
    Raw = $raw
    Parsed = $parsed
    OutputPath = $lastMessagePath
  }
}

function Invoke-ArticleSummaryWorkflow {
  param(
    [Parameter(Mandatory = $true)]
    [pscustomobject]$Article
  )

  $pickup = Get-OptionalPropertyValue -Object $Article -PropertyName 'pickup'
  $pickupSlot = Get-OptionalPropertyValue -Object $pickup -PropertyName 'slot'
  $pickupReason = Get-OptionalPropertyValue -Object $pickup -PropertyName 'reason'
  if ($pickupSlot) {
    Write-Log "Selected article id=$($Article.id) source=$($Article.source) slot=$pickupSlot reason=$pickupReason title=$($Article.title)"
  } else {
    Write-Log "Selected article id=$($Article.id) source=$($Article.source) title=$($Article.title)"
  }

  $codexResult = Invoke-CodexSummary -Article $Article
  $summaryJson = ($codexResult.Parsed | ConvertTo-Json -Depth 10)
  $summaryFilePath = Join-Path $script:summaryDir "summary-$($Article.id).json"
  $containerSummaryPath = "/app/backend/src/scripts/tmp-summary-$($Article.id).json"

  Write-Utf8NoBomFile -Path $summaryFilePath -Content $summaryJson
  Write-Log "Summary JSON saved: $summaryFilePath"

  Invoke-LoggedCommand -Label "summary:copy article $($Article.id)" -Action {
    & $script:dockerCommand cp $summaryFilePath "${script:backendContainerName}:$containerSummaryPath"
  } | Out-Null

  try {
    Invoke-LoggedCommand -Label "summary:post article $($Article.id)" -Action {
      & $script:dockerCommand compose exec -T backend node src/scripts/postSummaryFromFile.js $($Article.id) $containerSummaryPath
    } | Out-Null
  } finally {
    try {
      Invoke-LoggedCommand -Label "summary:cleanup article $($Article.id)" -Action {
        & $script:dockerCommand compose exec -T backend rm -f $containerSummaryPath
      } | Out-Null
    } catch {
      Write-Log "Summary cleanup warning: article_id=$($Article.id) message=$($_.Exception.Message)"
    }
  }

  $savedArticle = Invoke-RestMethod -Uri "$script:ApiBaseUrl/api/articles/$($Article.id)" -Method Get
  Write-Log "Article status after save: id=$($savedArticle.article.id) status=$($savedArticle.article.status)"

  return [pscustomobject]@{
    article_id = [int]$Article.id
    title = [string]$Article.title
    status = 'succeeded'
    summary_file = $summaryFilePath
    article_status = [string]$savedArticle.article.status
    slot = if ($pickupSlot) { [string]$pickupSlot } else { $null }
    reason = if ($pickupReason) { [string]$pickupReason } else { $null }
  }
}

function Get-ArticlesToSummarize {
  $normalizedMode = $script:PickupMode.ToLowerInvariant()

  if ($normalizedMode -eq 'score') {
    try {
      $pickupUrl = "$script:ApiBaseUrl/api/articles/pickup?limit=$Limit&include_failed=false"
      Write-Log "Fetching picked articles: $pickupUrl"
      $pickupResponse = Invoke-RestMethod -Uri $pickupUrl -Method Get
      $pickedArticles = @($pickupResponse.articles)

      if ($pickedArticles.Count -gt 0) {
        Write-Log "Fetched $($pickedArticles.Count) picked article(s)."
        foreach ($pickedArticle in $pickedArticles) {
          $pickup = Get-OptionalPropertyValue -Object $pickedArticle -PropertyName 'pickup'
          if ($pickup) {
            $slot = Get-OptionalPropertyValue -Object $pickup -PropertyName 'slot'
            $reason = Get-OptionalPropertyValue -Object $pickup -PropertyName 'reason'
            Write-Log "Pickup article id=$($pickedArticle.id) slot=$slot reason=$reason"
          }
        }
        return $pickedArticles
      }

      Write-Log 'Pickup API returned no articles. Falling back to latest unsummarized articles.'
    } catch {
      Write-Log "Pickup API failed. Falling back to latest unsummarized articles. message=$($_.Exception.Message)"
    }
  }

  $unsummarizedUrl = "$ApiBaseUrl/api/articles/unsummarized?limit=$Limit&include_failed=false"
  Write-Log "Fetching unsummarized articles: $unsummarizedUrl"
  $unsummarizedResponse = Invoke-RestMethod -Uri $unsummarizedUrl -Method Get
  $articles = @($unsummarizedResponse.articles)
  Write-Log "Fetched $($articles.Count) unsummarized article(s)."
  return $articles
}

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
New-Item -ItemType Directory -Force -Path $summaryDir | Out-Null

Push-Location $repoRoot
try {
  if (-not (Acquire-Lock)) {
    Write-Log "Another fetch-and-summarize process is already running. lock_path=$lockPath"
    $lockedSummary = [pscustomobject]@{
      attempted = 0
      succeeded = 0
      failed = 0
      processed_articles = @()
      already_running = $true
      message = 'Another fetch-and-summarize process is already running.'
    }
    Write-JsonLog -Label 'summary' -Value $lockedSummary
    Write-ResultJson -Value $lockedSummary
    exit 0
  }

  $codexCommand = Resolve-CommandPath -Candidates @('codex.exe', 'codex')
  $dockerCommand = Resolve-CommandPath -Candidates @('docker.exe', 'docker')
  Write-Log "Using codex command: $codexCommand"
  Write-Log "Using docker command: $dockerCommand"

  Write-Log "Starting fetch-and-summarize. repo_root=$repoRoot limit=$Limit api_base_url=$ApiBaseUrl pickup_mode=$PickupMode"

  if (-not $SkipRssFetch) {
    Invoke-LoggedCommand -Label 'rss:fetch' -Action {
      & $script:dockerCommand compose exec -T backend npm run rss:fetch
    } | Out-Null
  } else {
    Write-Log 'RSS fetch skipped by option.'
  }

  $articles = @(Get-ArticlesToSummarize)

  if ($articles.Count -eq 0) {
    Write-Log 'No unsummarized articles found.'
    $emptySummary = [pscustomobject]@{
      attempted = 0
      succeeded = 0
      failed = 0
      processed_articles = @()
    }
    Write-JsonLog -Label 'summary' -Value $emptySummary
    Write-ResultJson -Value $emptySummary
    exit 0
  }

  $results = @()
  $attempted = 0
  $succeeded = 0
  $failed = 0

  foreach ($article in $articles) {
    $attempted += 1

    try {
      $result = Invoke-ArticleSummaryWorkflow -Article $article
      $results += $result
      $succeeded += 1
      Write-Log "Article completed successfully: id=$($article.id)"
    } catch {
      $failed += 1
      $message = $_.Exception.Message
      Write-Log "Article failed: id=$($article.id) message=$message"
      $results += [pscustomobject]@{
        article_id = [int]$article.id
        title = [string]$article.title
        status = 'failed'
        summary_file = $null
        slot = if ((Get-OptionalPropertyValue -Object (Get-OptionalPropertyValue -Object $article -PropertyName 'pickup') -PropertyName 'slot')) { [string](Get-OptionalPropertyValue -Object (Get-OptionalPropertyValue -Object $article -PropertyName 'pickup') -PropertyName 'slot') } else { $null }
        reason = if ((Get-OptionalPropertyValue -Object (Get-OptionalPropertyValue -Object $article -PropertyName 'pickup') -PropertyName 'reason')) { [string](Get-OptionalPropertyValue -Object (Get-OptionalPropertyValue -Object $article -PropertyName 'pickup') -PropertyName 'reason') } else { $null }
        error = $message
      }
    }
  }

  $summary = [pscustomobject]@{
    attempted = $attempted
    succeeded = $succeeded
    failed = $failed
    processed_articles = $results
  }

  $summaryJson = $summary | ConvertTo-Json -Depth 10
  Write-Log 'Fetch-and-summarize summary follows.'
  Write-JsonLog -Label 'summary' -Value $summary
  Write-ResultJson -Value $summary
} finally {
  Release-Lock
  Pop-Location
}
