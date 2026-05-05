[CmdletBinding()]
param(
  [string]$ApiBaseUrl = 'http://localhost:3000'
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

$repoRoot = Split-Path -Parent $PSScriptRoot
$logsDir = Join-Path $repoRoot 'logs'
$logPath = Join-Path $logsDir 'run-summarize-link-job.log'
$promptPath = Join-Path $repoRoot 'prompts/link_summary.md'
$schemaPath = Join-Path $PSScriptRoot 'link-summary.schema.json'
$summaryDir = Join-Path $repoRoot 'backend/src/scripts'
$codexCommand = $null

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

function Invoke-CodexLinkSummary {
  param(
    [Parameter(Mandatory = $true)]
    [int]$JobId,
    [Parameter(Mandatory = $true)]
    [string]$Url,
    [string]$Title,
    [string]$Memo,
    [string]$BodyText,
    $FetchedPage = $null
  )

  $inputPayload = [pscustomobject]@{
    url = $Url
    title = if ([string]::IsNullOrWhiteSpace($Title)) { $null } else { $Title }
    memo = if ([string]::IsNullOrWhiteSpace($Memo)) { $null } else { $Memo }
    pasted_body_text = if ([string]::IsNullOrWhiteSpace($BodyText)) { $null } else { $BodyText }
    fetched_page = $FetchedPage
  }

  $promptTemplate = Get-Content -LiteralPath $script:promptPath -Raw -Encoding utf8
  $promptText = $promptTemplate.Replace('{{LINK_INPUT_JSON}}', ($inputPayload | ConvertTo-Json -Depth 10))
  $lastMessagePath = Join-Path $script:logsDir "codex-link-last-message-job-$JobId.json"

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

  Write-RunnerLog "Codex summarize start job_id=$JobId url=$Url"
  $previousErrorActionPreference = $ErrorActionPreference
  $ErrorActionPreference = 'Continue'

  try {
    $output = $promptText | & $script:codexCommand @codexArgs 2>&1
    $exitCode = $LASTEXITCODE
  } finally {
    $ErrorActionPreference = $previousErrorActionPreference
  }

  Write-RunnerLog "Codex summarize exit_code=$exitCode job_id=$JobId"

  foreach ($line in @($output)) {
    if ($null -ne $line -and "$line".Trim().Length -gt 0) {
      Write-RunnerLog "[codex:$JobId] $line"
    }
  }

  if ($exitCode -ne 0) {
    throw "Codex summarize failed with exit code $exitCode."
  }

  if (-not (Test-Path $lastMessagePath)) {
    throw "Codex output file was not created: $lastMessagePath"
  }

  $raw = Get-Content -LiteralPath $lastMessagePath -Raw -Encoding utf8
  return [pscustomobject]@{
    Raw = $raw
    Parsed = ($raw | ConvertFrom-Json)
    OutputPath = $lastMessagePath
  }
}

function Get-IsSocialUrl {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Url
  )

  try {
    $uri = [System.Uri]$Url
    return $uri.Host -match '(^|\.)(x\.com|twitter\.com)$'
  } catch {
    return $false
  }
}

function Normalize-PlainText {
  param(
    [string]$Value
  )

  if ([string]::IsNullOrWhiteSpace($Value)) {
    return ''
  }

  $text = [System.Text.RegularExpressions.Regex]::Replace($Value, '\s+', ' ')
  return $text.Trim()
}

function Get-HtmlTitle {
  param([string]$Html)
  $match = [System.Text.RegularExpressions.Regex]::Match($Html, '<title[^>]*>(.*?)</title>', 'IgnoreCase, Singleline')
  if (-not $match.Success) { return '' }
  return Normalize-PlainText $match.Groups[1].Value
}

function Get-MetaDescription {
  param([string]$Html)
  $patterns = @(
    '<meta\s+name=["'']description["'']\s+content=["''](.*?)["'']',
    '<meta\s+property=["'']og:description["'']\s+content=["''](.*?)["'']'
  )

  foreach ($pattern in $patterns) {
    $match = [System.Text.RegularExpressions.Regex]::Match($Html, $pattern, 'IgnoreCase, Singleline')
    if ($match.Success) {
      return Normalize-PlainText $match.Groups[1].Value
    }
  }

  return ''
}

function Convert-HtmlToPlainText {
  param([string]$Html)

  $text = $Html
  $text = [System.Text.RegularExpressions.Regex]::Replace($text, '<script\b[^<]*(?:(?!</script>)<[^<]*)*</script>', ' ', 'IgnoreCase, Singleline')
  $text = [System.Text.RegularExpressions.Regex]::Replace($text, '<style\b[^<]*(?:(?!</style>)<[^<]*)*</style>', ' ', 'IgnoreCase, Singleline')
  $text = [System.Text.RegularExpressions.Regex]::Replace($text, '<[^>]+>', ' ')
  $text = $text -replace '&nbsp;', ' '
  $text = $text -replace '&amp;', '&'
  $text = $text -replace '&lt;', '<'
  $text = $text -replace '&gt;', '>'
  $text = $text -replace '&quot;', '"'
  return Normalize-PlainText $text
}

function Get-FetchedPage {
  param(
    [Parameter(Mandatory = $true)]
    [string]$Url
  )

  if (Get-IsSocialUrl -Url $Url) {
    Write-RunnerLog "Skipping host-side fetch for social URL: $Url"
    return $null
  }

  try {
    Write-RunnerLog "Fetching URL content: $Url"
    $response = Invoke-WebRequest -Uri $Url -Method Get -MaximumRedirection 5 -TimeoutSec 30 -Headers @{
      'User-Agent' = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/136.0 Safari/537.36'
      'Accept-Language' = 'ja,en-US;q=0.9,en;q=0.8'
    }

    $html = [string]$response.Content
    $title = Get-HtmlTitle -Html $html
    $description = Get-MetaDescription -Html $html
    $plainText = Convert-HtmlToPlainText -Html $html
    $excerpt = if ($plainText.Length -gt 6000) { $plainText.Substring(0, 6000) } else { $plainText }

    $fetched = [pscustomobject]@{
      final_url = [string]$response.BaseResponse.ResponseUri.AbsoluteUri
      status_code = [int]$response.StatusCode
      title = if ([string]::IsNullOrWhiteSpace($title)) { $null } else { $title }
      description = if ([string]::IsNullOrWhiteSpace($description)) { $null } else { $description }
      excerpt = if ([string]::IsNullOrWhiteSpace($excerpt)) { $null } else { $excerpt }
    }

    Write-RunnerLog "Fetched URL content successfully. status=$($fetched.status_code) title=$($fetched.title)"
    return $fetched
  } catch {
    Write-RunnerLog "URL fetch failed: $($_.Exception.Message)"
    return $null
  }
}

function Normalize-SummaryPayload {
  param(
    [Parameter(Mandatory = $true)]
    $Parsed,
    [string]$FallbackTitle,
    [string]$FallbackMemo,
    [string]$FallbackBodyText
  )

  return [pscustomobject]@{
    title_suggested = StringOrEmpty $Parsed.title_suggested
    summary_short = StringOrEmpty $Parsed.summary_short
    tech_points = StringOrEmpty $Parsed.tech_points
    relevance = StringOrEmpty $Parsed.relevance
    next_action = StringOrEmpty $Parsed.next_action
    tags = @($Parsed.tags)
    priority = [int]$Parsed.priority
    source_type = StringOrEmpty $Parsed.source_type
    raw_excerpt = if (-not [string]::IsNullOrWhiteSpace((StringOrEmpty $Parsed.raw_excerpt))) {
      StringOrEmpty $Parsed.raw_excerpt
    } elseif (-not [string]::IsNullOrWhiteSpace((StringOrEmpty $FallbackMemo))) {
      StringOrEmpty $FallbackMemo
    } else {
      (StringOrEmpty $FallbackBodyText)
    }
    needs_manual_text = [bool]$Parsed.needs_manual_text
  }
}

function StringOrEmpty {
  param($Value)
  if ($null -eq $Value) {
    return ''
  }

  return [string]$Value
}

function Get-OptionalPayloadValue {
  param(
    [Parameter(Mandatory = $true)]
    $Payload,
    [Parameter(Mandatory = $true)]
    [string]$Name
  )

  if ($null -eq $Payload) {
    return $null
  }

  $property = $Payload.PSObject.Properties[$Name]
  if ($null -eq $property) {
    return $null
  }

  return $property.Value
}

function Test-NeedsManualText {
  param(
    [Parameter(Mandatory = $true)]
    $Summary
  )

  return [bool]$Summary.needs_manual_text
}

function Assert-SummaryReadyToSave {
  param(
    [Parameter(Mandatory = $true)]
    $Summary
  )

  if ([string]::IsNullOrWhiteSpace($Summary.summary_short) -or
      [string]::IsNullOrWhiteSpace($Summary.tech_points) -or
      [string]::IsNullOrWhiteSpace($Summary.relevance)) {
    throw 'Codex summary result was incomplete.'
  }
}

function Test-SummaryLooksUrlBased {
  param(
    [Parameter(Mandatory = $true)]
    $Summary
  )

  $combined = (
    @(
      StringOrEmpty $Summary.title_suggested
      StringOrEmpty $Summary.summary_short
      StringOrEmpty $Summary.tech_points
      StringOrEmpty $Summary.relevance
      StringOrEmpty $Summary.next_action
      StringOrEmpty $Summary.source_type
      StringOrEmpty $Summary.raw_excerpt
    ) -join ' '
  ).ToLowerInvariant()

  $forbiddenPatterns = @(
    'prompts/link_summary.md',
    'link-summary.schema.json',
    'workspace',
    'workspace_inspection',
    'read-only',
    'local file',
    'schema',
    'prompt',
    'repo',
    'manual-link-summary'
  )

  foreach ($pattern in $forbiddenPatterns) {
    if ($combined.Contains($pattern)) {
      return $false
    }
  }

  return $true
}

New-Item -ItemType Directory -Force -Path $logsDir | Out-Null
New-Item -ItemType Directory -Force -Path $summaryDir | Out-Null

Write-RunnerLog "Runner summarize_link script started. api_base_url=$ApiBaseUrl"
$script:codexCommand = Resolve-CommandPath -Candidates @('codex.exe', 'codex')
Write-RunnerLog "Using codex command: $script:codexCommand"

$nextResponse = Invoke-JobApi -Method GET -Path '/api/jobs/summarize-link/next'
Write-RunnerLog 'Job lookup succeeded.'
$job = $nextResponse.job

if (-not $job) {
  Write-RunnerLog 'No queued summarize_link job found.'
  exit 0
}

$payload = $job.payload_json
if (-not $payload -or [string]::IsNullOrWhiteSpace([string]$payload.url)) {
  throw "Job payload is missing url. job_id=$($job.id)"
}

$payloadTitle = [string](Get-OptionalPayloadValue -Payload $payload -Name 'title')
$payloadMemo = [string](Get-OptionalPayloadValue -Payload $payload -Name 'memo')
$payloadBodyText = [string](Get-OptionalPayloadValue -Payload $payload -Name 'body_text')

Write-RunnerLog "Picked queued job id=$($job.id) url=$($payload.url)"
if (-not [string]::IsNullOrWhiteSpace($payloadBodyText)) {
  Write-RunnerLog "Body text supplied for job id=$($job.id). length=$(($payloadBodyText.Length))"
}
Write-RunnerLog "start API sending. url=$ApiBaseUrl/api/jobs/$($job.id)/start"
$startedJob = (Invoke-JobApi -Method POST -Path "/api/jobs/$($job.id)/start").job
Write-RunnerLog "Started job id=$($startedJob.id)"

try {
  $fetchedPage = Get-FetchedPage -Url ([string]$payload.url)
  $codexResult = Invoke-CodexLinkSummary -JobId $job.id -Url ([string]$payload.url) -Title $payloadTitle -Memo $payloadMemo -BodyText $payloadBodyText -FetchedPage $fetchedPage
  $summary = Normalize-SummaryPayload -Parsed $codexResult.Parsed -FallbackTitle $payloadTitle -FallbackMemo $payloadMemo -FallbackBodyText $payloadBodyText
  $summaryJson = $summary | ConvertTo-Json -Depth 10
  $summaryFilePath = Join-Path $summaryDir "manual-summary-job-$($job.id).json"
  Write-Utf8NoBomFile -Path $summaryFilePath -Content $summaryJson
  Write-RunnerLog "Summary JSON saved: $summaryFilePath"

  if (Test-NeedsManualText -Summary $summary) {
    Write-RunnerLog "complete API sending. status=needs_manual_text job_id=$($job.id)"
    Invoke-JobApi -Method POST -Path "/api/jobs/$($job.id)/complete" -Body @{
      status = 'needs_manual_text'
      result_json = @{
        url = [string]$payload.url
        title = if ([string]::IsNullOrWhiteSpace($payloadTitle)) { $null } else { $payloadTitle }
        memo = if ([string]::IsNullOrWhiteSpace($payloadMemo)) { $null } else { $payloadMemo }
        body_text = if ([string]::IsNullOrWhiteSpace($payloadBodyText)) { $null } else { $payloadBodyText }
        summary_file = $summaryFilePath
        needs_manual_text = $true
        summary = $summary
      }
    } | Out-Null
    Write-RunnerLog "complete API succeeded. job_id=$($job.id) status=needs_manual_text"
    exit 0
  }

  Assert-SummaryReadyToSave -Summary $summary

  if (-not (Test-SummaryLooksUrlBased -Summary $summary)) {
    Write-RunnerLog "Codex output did not look URL-based. job_id=$($job.id)"
    Invoke-JobApi -Method POST -Path "/api/jobs/$($job.id)/complete" -Body @{
      status = 'needs_manual_text'
      result_json = @{
        url = [string]$payload.url
        title = if ([string]::IsNullOrWhiteSpace($payloadTitle)) { $null } else { $payloadTitle }
        memo = if ([string]::IsNullOrWhiteSpace($payloadMemo)) { $null } else { $payloadMemo }
        body_text = if ([string]::IsNullOrWhiteSpace($payloadBodyText)) { $null } else { $payloadBodyText }
        summary_file = $summaryFilePath
        needs_manual_text = $true
        reason = 'unverified_url_content'
        summary = $summary
      }
    } | Out-Null
    Write-RunnerLog "complete API succeeded. job_id=$($job.id) status=needs_manual_text reason=unverified_url_content"
    exit 0
  }

  Write-RunnerLog "manual-summary save API sending. job_id=$($job.id)"
  $saveResult = Invoke-JobApi -Method POST -Path '/api/articles/manual-summary' -Body @{
    url = [string]$payload.url
    title = $payloadTitle
    memo = $payloadMemo
    body_text = $payloadBodyText
    summary = $summary
  }
  Write-RunnerLog "manual-summary save API succeeded. article_id=$($saveResult.article.id)"

  Write-RunnerLog "complete API sending. status=succeeded job_id=$($job.id)"
  Invoke-JobApi -Method POST -Path "/api/jobs/$($job.id)/complete" -Body @{
    status = 'succeeded'
    result_json = @{
      article_id = [int]$saveResult.article.id
      title = [string]$saveResult.article.title
      url = [string]$saveResult.article.url
      source = [string]$saveResult.article.source
      status = [string]$saveResult.article.status
      summary_file = $summaryFilePath
      needs_manual_text = $false
      summary = $summary
    }
  } | Out-Null
  Write-RunnerLog "complete API succeeded. job_id=$($job.id) status=succeeded article_id=$($saveResult.article.id)"
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
