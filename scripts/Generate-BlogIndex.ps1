[CmdletBinding()]
param(
    [switch]$Watch
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

$scriptRoot = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectRoot = Split-Path -Parent $scriptRoot
$postsDir = Join-Path $projectRoot "posts"
$blogDir = Join-Path $projectRoot "blog"
$indexPath = Join-Path $blogDir "index.json"
$feedPath = Join-Path $blogDir "feed.xml"
$utf8NoBom = New-Object System.Text.UTF8Encoding($false)

$baseUrl = 'https://caracal-lang.org'
$blogFeedUrl = "$baseUrl/blog/feed.xml"

function Get-FrontMatter {
    param(
        [string]$Markdown
    )

    $meta = @{}
    $content = $Markdown

    if ($Markdown -match '(?ms)^---\s*\r?\n(.*?)\r?\n---\s*\r?\n?(.*)$') {
        $rawMeta = $Matches[1]
        $content = $Matches[2]

        foreach ($line in ($rawMeta -split "`r?`n")) {
            if ($line -match '^\s*([^:]+)\s*:\s*(.*?)\s*$') {
                $key = $Matches[1].Trim().ToLowerInvariant()
                $value = $Matches[2].Trim()
                if ($key) {
                    $meta[$key] = $value
                }
            }
        }
    }

    return [PSCustomObject]@{
        Meta = $meta
        Content = $content
    }
}

function Get-Slug {
    param(
        [string]$Text
    )

    $slug = ($Text.ToLowerInvariant() -replace '[^a-z0-9]+', '-')
    $slug = $slug.Trim('-')

    if ([string]::IsNullOrWhiteSpace($slug)) {
        return "post"
    }

    return $slug
}

function Get-Description {
    param(
        [string]$RawDescription,
        [string]$Content
    )

    if (-not [string]::IsNullOrWhiteSpace($RawDescription)) {
        return $RawDescription.Trim()
    }

    foreach ($line in ($Content -split "`r?`n")) {
        $trimmed = $line.Trim()
        if (-not $trimmed) { continue }
        if ($trimmed.StartsWith('#')) { continue }
        if ($trimmed.StartsWith('```')) { continue }
        if ($trimmed.StartsWith('- ')) { continue }
        return $trimmed
    }

    return ""
}

function Escape-Html {
    param(
        [string]$Text
    )

    if ($null -eq $Text) {
        return ""
    }

    return [System.Net.WebUtility]::HtmlEncode($Text)
}

function Escape-Xml {
    param(
        [string]$Text
    )

    if ($null -eq $Text) {
        return ""
    }

    return [System.Security.SecurityElement]::Escape($Text)
}

function ConvertTo-RssDate {
    param(
        [string]$DateText
    )

    if ([string]::IsNullOrWhiteSpace($DateText)) {
        return [DateTimeOffset]::UtcNow.ToString("r", [System.Globalization.CultureInfo]::InvariantCulture)
    }

    $styles = [System.Globalization.DateTimeStyles]::AllowWhiteSpaces
    $culture = [System.Globalization.CultureInfo]::InvariantCulture
    $trimmedDate = $DateText.Trim()

    try {
        $dateValue = [DateTime]::ParseExact($trimmedDate, "yyyy-MM-dd", $culture, $styles)
        $rssDate = [DateTimeOffset]::new($dateValue.Year, $dateValue.Month, $dateValue.Day, 0, 0, 0, [TimeSpan]::Zero)
        return $rssDate.ToString("r", $culture)
    } catch {
    }

    try {
        $dateTimeOffset = [DateTimeOffset]::Parse($trimmedDate, $culture, $styles)
        return $dateTimeOffset.ToUniversalTime().ToString("r", $culture)
    } catch {
    }

    try {
        $dateValue = [DateTime]::Parse($trimmedDate, $culture, $styles)
        $rssDate = [DateTimeOffset]::new($dateValue.ToUniversalTime())
        return $rssDate.ToString("r", $culture)
    } catch {
    }

    return [DateTimeOffset]::UtcNow.ToString("r", $culture)
}

function Resolve-SocialImageUrl {
    param(
        [string]$ImagePath
    )

    if ([string]::IsNullOrWhiteSpace($ImagePath)) {
        return "$baseUrl/assets/caracal-banner.png"
    }

    $trimmed = $ImagePath.Trim()

    if ($trimmed -match '^https?://') {
        return $trimmed
    }

    return "$baseUrl/$($trimmed.TrimStart('/'))"
}

function Convert-InlineMarkdown {
    param(
        [string]$Text
    )

    if ($null -eq $Text) {
        return ""
    }

    # Preserve raw inline HTML tags, then escape and process markdown around them.
    $htmlTokens = New-Object System.Collections.Generic.List[string]
    $placeholderBase = "@@RAW_HTML_"

    $textWithPlaceholders = [regex]::Replace($Text, '<\/?[A-Za-z][^>]*?>', {
        param($m)
        $index = $htmlTokens.Count
        $htmlTokens.Add($m.Value) | Out-Null
        return "$placeholderBase$index@@"
    })

    $result = Escape-Html $textWithPlaceholders

    $result = [regex]::Replace($result, '`([^`]+)`', '<code>$1</code>')
    $result = [regex]::Replace($result, '\*\*([^*]+)\*\*', '<strong>$1</strong>')
    $result = [regex]::Replace($result, '\*([^*]+)\*', '<em>$1</em>')
    $result = [regex]::Replace($result, '\[([^\]]+)\]\(([^)]+)\)', {
        param($m)
        $label = $m.Groups[1].Value
        $url = $m.Groups[2].Value
        return ('<a href="{0}">{1}</a>' -f (Escape-Html $url), $label)
    })

    # handling raw URLs like https://example.com -> <a href="https://example.com">https://example.com</a>
    $result = [regex]::Replace($result, '(?<![A-Za-z0-9"''=])https?://[^\s<>"\)\]]+', {
        param($m)
        $url = $m.Value
        $href = Escape-Html $url
        return '<a href="' + $href + '">' + $href + '</a>'
    })

    for ($i = 0; $i -lt $htmlTokens.Count; $i++) {
        $placeholder = "$placeholderBase$i@@"
        $result = $result.Replace($placeholder, $htmlTokens[$i])
    }

    return $result
}

function Convert-MarkdownToHtml {
    param(
        [string]$Markdown
    )

    $lines = $Markdown -split "`r?`n"
    $htmlLines = @()
    $inCodeBlock = $false
    $codeBlockLanguage = ""
    $codeBlockLines = New-Object System.Collections.Generic.List[string]
    $inList = $false
    $headingIdCounts = @{}

    function Get-CodeLanguageClass {
        param(
            [string]$Language
        )

        if ([string]::IsNullOrWhiteSpace($Language)) {
            return ""
        }

        $normalized = $Language.Trim().ToLowerInvariant()
        switch ($normalized) {
            "caracal" { return "cara" }
            default { return $normalized }
        }
    }

    foreach ($line in $lines) {
        $trimmed = $line.Trim()

        if ($trimmed -match '^```') {
            if ($inCodeBlock) {
                $codeText = ($codeBlockLines -join "`n")
                if ($codeBlockLanguage) {
                    $htmlLines += ('<pre><code class="language-{0}">{1}</code></pre>' -f (Escape-Html $codeBlockLanguage), $codeText)
                } else {
                    $htmlLines += ('<pre><code>{0}</code></pre>' -f $codeText)
                }
                $codeBlockLines.Clear()
                $codeBlockLanguage = ""
                $inCodeBlock = $false
            } else {
                if ($inList) {
                    $htmlLines += '</ul>'
                    $inList = $false
                }

                $lang = ($trimmed -replace '^```', '').Trim()
                $codeBlockLanguage = Get-CodeLanguageClass -Language $lang
                $inCodeBlock = $true
            }
            continue
        }

        if ($inCodeBlock) {
            $codeBlockLines.Add((Escape-Html $line)) | Out-Null
            continue
        }

        if (-not $trimmed) {
            if ($inList) {
                $htmlLines += '</ul>'
                $inList = $false
            }
            continue
        }

        if ($trimmed -match '^(#{1,6})\s+(.+)$') {
            if ($inList) {
                $htmlLines += '</ul>'
                $inList = $false
            }

            $level = $Matches[1].Length
            $rawHeading = $Matches[2].Trim()
            $text = Convert-InlineMarkdown $rawHeading
            $baseHeadingId = Get-Slug $rawHeading
            if (-not $baseHeadingId) {
                $baseHeadingId = "section"
            }

            if ($headingIdCounts.ContainsKey($baseHeadingId)) {
                $headingIdCounts[$baseHeadingId] += 1
                $headingId = "$baseHeadingId-$($headingIdCounts[$baseHeadingId])"
            } else {
                $headingIdCounts[$baseHeadingId] = 0
                $headingId = $baseHeadingId
            }

            $headingLabel = Escape-Html $rawHeading
            $htmlLines += ('<h{0} id="{1}"><a class="heading-anchor" href="#{1}" aria-label="Link to section {2}">{3}</a> <a class="blog-anchor" href="#{1}" aria-label="Copy link to section {2}">#</a></h{0}>' -f $level, $headingId, $headingLabel, $text)
            continue
        }

        if ($trimmed -match '^-\s+(.+)$') {
            if (-not $inList) {
                $htmlLines += '<ul>'
                $inList = $true
            }

            $itemText = Convert-InlineMarkdown $Matches[1]
            $htmlLines += ('<li>{0}</li>' -f $itemText)
            continue
        }

        if ($inList) {
            $htmlLines += '</ul>'
            $inList = $false
        }

        $paragraph = Convert-InlineMarkdown $trimmed
        $htmlLines += ('<p>{0}</p>' -f $paragraph)
    }

    if ($inCodeBlock) {
        $codeText = ($codeBlockLines -join "`n")
        if ($codeBlockLanguage) {
            $htmlLines += ('<pre><code class="language-{0}">{1}</code></pre>' -f (Escape-Html $codeBlockLanguage), $codeText)
        } else {
            $htmlLines += ('<pre><code>{0}</code></pre>' -f $codeText)
        }
    }

    if ($inList) {
        $htmlLines += '</ul>'
    }

    return ($htmlLines -join "`n")
}

function New-PostHtmlPage {
    param(
        [PSCustomObject]$Post
    )

    $titleEscaped = Escape-Html $Post.title
    $dateEscaped = Escape-Html $Post.date
    $bodyHtml = Convert-MarkdownToHtml $Post.content
    $pageTitle = "$titleEscaped - Caracal Blog"
    $postDescription = Escape-Html ($Post.description)
    $socialImageUrl = Escape-Html (Resolve-SocialImageUrl -ImagePath $Post.image)
    $socialImageAlt = Escape-Html $(if ([string]::IsNullOrWhiteSpace($Post.image_alt)) { "Caracal social preview image" } else { $Post.image_alt })

    $html = @"
<!DOCTYPE html>
<html lang="en" data-theme="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>$pageTitle</title>
    <meta name="description" content="$postDescription" />
    <meta property="og:type" content="article" />
    <meta property="og:site_name" content="Caracal" />
    <meta property="og:title" content="$pageTitle" />
    <meta property="og:description" content="$postDescription" />
    <meta property="og:url" content="$baseUrl/blog/$($Post.slug)/" />
    <meta property="og:image" content="$socialImageUrl" />
    <meta property="og:image:alt" content="$socialImageAlt" />
    <meta property="og:image:width" content="1200" />
    <meta property="og:image:height" content="630" />
    <meta name="twitter:card" content="summary_large_image" />
    <meta name="twitter:title" content="$pageTitle" />
    <meta name="twitter:description" content="$postDescription" />
    <meta name="twitter:image" content="$socialImageUrl" />
    <meta name="twitter:image:alt" content="$socialImageAlt" />
    <link rel="canonical" href="$baseUrl/blog/$($Post.slug)/" />
    <link rel="alternate" type="application/rss+xml" title="Caracal Blog RSS" href="$blogFeedUrl" />
    <link rel="icon" type="image/svg+xml" href="../../assets/favicon.svg" />
  <script src="../../preload-theme.js"></script>
  <link rel="stylesheet" href="../../style.css" />
</head>
<body class="post-page">
<div class="top-nav">
  <div class="top-nav-left">
    <a class="top-nav-logo top-nav-logo-link" href="../../" aria-label="Go to home page">
      <img src="../../assets/caracal.svg" alt="Caracal Logo" class="top-nav-logo-image" />
      <span class="top-nav-logo-text">Caracal</span>
    </a>
    <div class="top-nav-content">
    <a href="../../" class="top-nav-link">Home</a>
    <a href="../../docs/" class="top-nav-link">Docs</a>
    <a href="../../blog/" class="top-nav-link active">Blog</a>
    </div>
  </div>
  <a class="top-nav-link github-link" href="https://github.com/arminherling/Caracal" target="_blank" rel="noopener noreferrer" aria-label="Open GitHub">
    <img src="../../assets/github-logo.png" alt="GitHub" />
    <span>Repo</span>
  </a>
  <button class="theme-toggle" id="themeToggle" title="Toggle light/dark mode">
    <span class="icon" id="themeIcon">&#9788;</span>
    <span id="themeLabel">Light</span>
  </button>
  <button class="hamburger" id="hamburger" aria-label="Toggle menu">
    <span></span>
    <span></span>
    <span></span>
  </button>
</div>
<div class="nav-overlay" id="navOverlay"></div>
<nav id="nav">
  <ul>
    <li class="mobile-only-link"><a href="../../">Home</a></li>
    <li class="mobile-only-link"><a href="../../docs/">Docs</a></li>
    <li><a class="rss-sidebar-link" href="../../blog/feed.xml"><img src="../../assets/rss-icon.svg" alt="" aria-hidden="true" /> <span>RSS Feed</span></a></li>
    <div class="section-title">Blog</div>
    <li><a href="../../blog/">All Posts</a></li>
        <div class="section-title">This Post</div>
        <li id="postTocLoading"><span class="post-toc-empty">Loading headings...</span></li>
        <li id="postToc"></li>
  </ul>
</nav>
<main>
  <p><a href="../../blog/">&larr; Back to blog</a></p>
  <h1>$titleEscaped</h1>
  <p class="post-meta"><time datetime="$dateEscaped">$dateEscaped</time></p>
  <article class="blog-content">
  $bodyHtml
  </article>
</main>
<script src="../../highlight.js"></script>
<script src="../../theme.js"></script>
<script src="../postToc.js"></script>
</body>
</html>
"@

    $postDir = Join-Path $blogDir $Post.slug
    if (-not (Test-Path -LiteralPath $postDir)) {
        $null = New-Item -Path $postDir -ItemType Directory -Force
    }

    $outputPath = Join-Path $postDir "index.html"
    [System.IO.File]::WriteAllText($outputPath, $html, $utf8NoBom)
}

function New-RssFeed {
        param(
                [PSCustomObject[]]$Posts
        )

        $channelTitle = Escape-Xml "Caracal Blog"
        $channelLink = Escape-Xml "$baseUrl/blog/"
        $channelDescription = Escape-Xml "Development notes and updates from the Caracal project."
        $lastBuildDate = [DateTimeOffset]::UtcNow.ToString("r", [System.Globalization.CultureInfo]::InvariantCulture)

        $items = foreach ($post in $Posts) {
                $postUrl = "$baseUrl/blog/$($post.slug)/"
                $itemTitle = Escape-Xml $post.title
                $itemLink = Escape-Xml $postUrl
                $itemGuid = Escape-Xml $postUrl
                $itemDate = ConvertTo-RssDate -DateText $post.date
                $itemDescription = Escape-Xml $post.description

@"
        <item>
            <title>$itemTitle</title>
            <link>$itemLink</link>
            <guid>$itemGuid</guid>
            <pubDate>$itemDate</pubDate>
            <description>$itemDescription</description>
        </item>
"@
        }

        $rss = @"
<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
    <channel>
        <title>$channelTitle</title>
        <link>$channelLink</link>
        <description>$channelDescription</description>
        <language>en-us</language>
        <lastBuildDate>$lastBuildDate</lastBuildDate>
        <atom:link href="$blogFeedUrl" rel="self" type="application/rss+xml" />
$($items -join "`n")
    </channel>
</rss>
"@

        [System.IO.File]::WriteAllText($feedPath, $rss, $utf8NoBom)
}

function New-BlogArtifacts {
    if (-not (Test-Path -LiteralPath $postsDir)) {
        throw "Posts directory was not found: $postsDir"
    }

    if (-not (Test-Path -LiteralPath $blogDir)) {
        throw "Blog directory was not found: $blogDir"
    }

    $legacyGeneratedDir = Join-Path $postsDir "generated"
    if (Test-Path -LiteralPath $legacyGeneratedDir) {
        Remove-Item -LiteralPath $legacyGeneratedDir -Recurse -Force
    }

    Get-ChildItem -Path $postsDir -Filter "*.html" -File | ForEach-Object {
        Remove-Item -LiteralPath $_.FullName -Force
    }

    $legacyIndexPath = Join-Path $postsDir "index.json"
    if (Test-Path -LiteralPath $legacyIndexPath) {
        Remove-Item -LiteralPath $legacyIndexPath -Force
    }

    Get-ChildItem -Path $postsDir -Directory | ForEach-Object {
        Remove-Item -LiteralPath $_.FullName -Recurse -Force
    }

    Get-ChildItem -Path $blogDir -Directory | ForEach-Object {
        Remove-Item -LiteralPath $_.FullName -Recurse -Force
    }

    $slugCounts = @{}
    $entries = @()

    $files = Get-ChildItem -Path $postsDir -Filter "*.md" -File | Sort-Object Name

    foreach ($file in $files) {
        $markdown = Get-Content -LiteralPath $file.FullName -Raw -Encoding utf8
        $parsed = Get-FrontMatter -Markdown $markdown

        $title = $parsed.Meta["title"]
        if ([string]::IsNullOrWhiteSpace($title)) {
            $title = [System.IO.Path]::GetFileNameWithoutExtension($file.Name)
        }

        $date = $parsed.Meta["date"]
        if ([string]::IsNullOrWhiteSpace($date)) {
            $date = $file.LastWriteTime.ToString("yyyy-MM-dd")
        }

        $description = Get-Description -RawDescription $parsed.Meta["description"] -Content $parsed.Content

        $baseSlug = Get-Slug -Text $title
        if ($slugCounts.ContainsKey($baseSlug)) {
            $slugCounts[$baseSlug] += 1
            $slug = "$baseSlug-$($slugCounts[$baseSlug])"
        } else {
            $slugCounts[$baseSlug] = 0
            $slug = $baseSlug
        }

        $entries += [PSCustomObject]@{
            slug = $slug
            file = $file.Name
            title = $title
            date = $date
            description = $description
            image = $parsed.Meta["image"]
            image_alt = $parsed.Meta["image_alt"]
            content = $parsed.Content
        }
    }

    $sortedEntries = @($entries | Sort-Object @{ Expression = { $_.date }; Descending = $true }, @{ Expression = { $_.title }; Descending = $false })

    foreach ($entry in $sortedEntries) {
        New-PostHtmlPage -Post $entry
    }

    $indexEntries = @($sortedEntries | ForEach-Object {
        [PSCustomObject]@{
            slug = $_.slug
            file = $_.file
            url = "$baseUrl/blog/$($_.slug)/"
            title = $_.title
            date = $_.date
            description = $_.description
        }
    })

    $json = ConvertTo-Json -InputObject $indexEntries -Depth 4
    [System.IO.File]::WriteAllText($indexPath, $json, $utf8NoBom)
    New-RssFeed -Posts $sortedEntries

    $timestamp = (Get-Date).ToString("HH:mm:ss")
    Write-Host "Updated $indexPath, $feedPath and generated $($sortedEntries.Count) post pages at $timestamp"
}

New-BlogArtifacts

if (-not $Watch) {
    return
}

Write-Host "Watching posts folder for changes. Press Ctrl+C to stop."

$script:NeedsRefresh = $false

$watcher = New-Object System.IO.FileSystemWatcher
$watcher.Path = $postsDir
$watcher.Filter = "*.md"
$watcher.IncludeSubdirectories = $false
$watcher.NotifyFilter = [System.IO.NotifyFilters]'FileName, LastWrite, CreationTime'
$watcher.EnableRaisingEvents = $true

$null = Register-ObjectEvent -InputObject $watcher -EventName Created -SourceIdentifier "BlogPostCreated" -Action { $script:NeedsRefresh = $true }
$null = Register-ObjectEvent -InputObject $watcher -EventName Changed -SourceIdentifier "BlogPostChanged" -Action { $script:NeedsRefresh = $true }
$null = Register-ObjectEvent -InputObject $watcher -EventName Deleted -SourceIdentifier "BlogPostDeleted" -Action { $script:NeedsRefresh = $true }
$null = Register-ObjectEvent -InputObject $watcher -EventName Renamed -SourceIdentifier "BlogPostRenamed" -Action { $script:NeedsRefresh = $true }

try {
    while ($true) {
        Start-Sleep -Milliseconds 350

        if ($script:NeedsRefresh) {
            $script:NeedsRefresh = $false
            New-BlogArtifacts
        }
    }
} finally {
    Unregister-Event -SourceIdentifier "BlogPostCreated" -ErrorAction SilentlyContinue
    Unregister-Event -SourceIdentifier "BlogPostChanged" -ErrorAction SilentlyContinue
    Unregister-Event -SourceIdentifier "BlogPostDeleted" -ErrorAction SilentlyContinue
    Unregister-Event -SourceIdentifier "BlogPostRenamed" -ErrorAction SilentlyContinue

    if ($watcher) {
        $watcher.EnableRaisingEvents = $false
        $watcher.Dispose()
    }
}
