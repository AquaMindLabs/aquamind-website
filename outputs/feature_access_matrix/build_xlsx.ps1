$ErrorActionPreference = 'Stop'

$BaseDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$Stamp = Get-Date -Format 'yyyyMMdd_HHmmss'
$BuildDir = Join-Path $BaseDir "_xlsx_build_$Stamp"
$OutPath = Join-Path $BaseDir "macierz_funkcji_i_dostepu_$Stamp.xlsx"

New-Item -ItemType Directory -Force -Path $BuildDir | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $BuildDir '_rels') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $BuildDir 'xl') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $BuildDir 'xl\_rels') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $BuildDir 'xl\worksheets') | Out-Null
New-Item -ItemType Directory -Force -Path (Join-Path $BuildDir 'docProps') | Out-Null

function Escape-Xml([string]$Value) {
  if ($null -eq $Value) { return '' }
  return [System.Security.SecurityElement]::Escape($Value)
}

function Get-ColName([int]$Index) {
  $name = ''
  $n = $Index
  while ($n -gt 0) {
    $mod = ($n - 1) % 26
    $name = [char](65 + $mod) + $name
    $n = [math]::Floor(($n - $mod) / 26)
  }
  return $name
}

function Read-PipeRows([string]$Path) {
  $lines = Get-Content -LiteralPath $Path -Encoding UTF8 | Where-Object { $_.Trim().Length -gt 0 }
  $rows = @()
  foreach ($line in $lines) {
    $rows += ,($line -split '\|', -1)
  }
  return $rows
}

function New-WorksheetXml($Rows, [int]$HeaderStyle, [int]$DataStyle, [int[]]$Widths) {
  $rowCount = $Rows.Count
  $colCount = ($Rows | ForEach-Object { $_.Count } | Measure-Object -Maximum).Maximum
  $lastCell = "$(Get-ColName $colCount)$rowCount"
  $sb = [System.Text.StringBuilder]::new()

  [void]$sb.Append('<?xml version="1.0" encoding="UTF-8" standalone="yes"?>')
  [void]$sb.Append('<worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">')
  [void]$sb.Append("<dimension ref=`"A1:$lastCell`"/>")
  [void]$sb.Append('<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>')
  [void]$sb.Append('<sheetFormatPr defaultRowHeight="15"/>')

  [void]$sb.Append('<cols>')
  for ($i = 0; $i -lt $Widths.Count; $i++) {
    $col = $i + 1
    [void]$sb.Append("<col min=`"$col`" max=`"$col`" width=`"$($Widths[$i])`" customWidth=`"1`"/>")
  }
  [void]$sb.Append('</cols>')

  [void]$sb.Append('<sheetData>')
  for ($r = 0; $r -lt $Rows.Count; $r++) {
    $rowNum = $r + 1
    [void]$sb.Append("<row r=`"$rowNum`">")
    $cells = $Rows[$r]
    for ($c = 0; $c -lt $cells.Count; $c++) {
      $colName = Get-ColName ($c + 1)
      $cellRef = "$colName$rowNum"
      $style = if ($rowNum -eq 1) { $HeaderStyle } else { $DataStyle }
      $text = Escape-Xml ([string]$cells[$c])
      [void]$sb.Append("<c r=`"$cellRef`" s=`"$style`" t=`"inlineStr`"><is><t>$text</t></is></c>")
    }
    [void]$sb.Append('</row>')
  }
  [void]$sb.Append('</sheetData>')
  [void]$sb.Append("<autoFilter ref=`"A1:$lastCell`"/>")
  [void]$sb.Append('<pageMargins left="0.7" right="0.7" top="0.75" bottom="0.75" header="0.3" footer="0.3"/>')
  [void]$sb.Append('</worksheet>')
  return $sb.ToString()
}

$mainRows = Read-PipeRows (Join-Path $BaseDir 'access_matrix.psv')
$summaryRows = Read-PipeRows (Join-Path $BaseDir 'plan_summary.psv')
$sourceRows = Read-PipeRows (Join-Path $BaseDir 'sources.psv')

New-WorksheetXml $mainRows 1 4 @(20,38,28,28,28,45) | Set-Content -LiteralPath (Join-Path $BuildDir 'xl\worksheets\sheet1.xml') -Encoding UTF8
New-WorksheetXml $summaryRows 2 4 @(30,32,32,34) | Set-Content -LiteralPath (Join-Path $BuildDir 'xl\worksheets\sheet2.xml') -Encoding UTF8
New-WorksheetXml $sourceRows 3 4 @(18,90) | Set-Content -LiteralPath (Join-Path $BuildDir 'xl\worksheets\sheet3.xml') -Encoding UTF8

@'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/>
  <Override PartName="/xl/worksheets/sheet1.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet2.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/worksheets/sheet3.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>
  <Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>
  <Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/>
  <Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>
</Types>
'@ | Set-Content -LiteralPath (Join-Path $BuildDir '[Content_Types].xml') -Encoding UTF8

@'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/>
</Relationships>
'@ | Set-Content -LiteralPath (Join-Path $BuildDir '_rels\.rels') -Encoding UTF8

@'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships">
  <sheets>
    <sheet name="Macierz funkcji" sheetId="1" r:id="rId1"/>
    <sheet name="Skrot planow" sheetId="2" r:id="rId2"/>
    <sheet name="Zrodla i zalozenia" sheetId="3" r:id="rId3"/>
  </sheets>
</workbook>
'@ | Set-Content -LiteralPath (Join-Path $BuildDir 'xl\workbook.xml') -Encoding UTF8

@'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet1.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet2.xml"/>
  <Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet3.xml"/>
  <Relationship Id="rId4" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
</Relationships>
'@ | Set-Content -LiteralPath (Join-Path $BuildDir 'xl\_rels\workbook.xml.rels') -Encoding UTF8

@'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
  <fonts count="2">
    <font><sz val="11"/><color theme="1"/><name val="Aptos"/><family val="2"/></font>
    <font><b/><sz val="11"/><color rgb="FFFFFFFF"/><name val="Aptos"/><family val="2"/></font>
  </fonts>
  <fills count="5">
    <fill><patternFill patternType="none"/></fill>
    <fill><patternFill patternType="gray125"/></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF0F766E"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF1D4ED8"/><bgColor indexed="64"/></patternFill></fill>
    <fill><patternFill patternType="solid"><fgColor rgb="FF334155"/><bgColor indexed="64"/></patternFill></fill>
  </fills>
  <borders count="2">
    <border><left/><right/><top/><bottom/><diagonal/></border>
    <border><left style="thin"><color rgb="FFE2E8F0"/></left><right style="thin"><color rgb="FFE2E8F0"/></right><top style="thin"><color rgb="FFE2E8F0"/></top><bottom style="thin"><color rgb="FFE2E8F0"/></bottom><diagonal/></border>
  </borders>
  <cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
  <cellXfs count="5">
    <xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
    <xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="3" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="1" fillId="4" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1" applyAlignment="1"><alignment horizontal="center" vertical="center" wrapText="1"/></xf>
    <xf numFmtId="0" fontId="0" fillId="0" borderId="1" xfId="0" applyBorder="1" applyAlignment="1"><alignment vertical="top" wrapText="1"/></xf>
  </cellXfs>
  <cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles>
  <dxfs count="0"/>
  <tableStyles count="0" defaultTableStyle="TableStyleMedium2" defaultPivotStyle="PivotStyleLight16"/>
</styleSheet>
'@ | Set-Content -LiteralPath (Join-Path $BuildDir 'xl\styles.xml') -Encoding UTF8

@'
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Codex</Application></Properties>
'@ | Set-Content -LiteralPath (Join-Path $BuildDir 'docProps\app.xml') -Encoding UTF8

$created = (Get-Date).ToUniversalTime().ToString('s') + 'Z'
@"
<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Macierz funkcji i dostepu</dc:title><dc:creator>Codex</dc:creator><cp:lastModifiedBy>Codex</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">$created</dcterms:created><dcterms:modified xsi:type="dcterms:W3CDTF">$created</dcterms:modified></cp:coreProperties>
"@ | Set-Content -LiteralPath (Join-Path $BuildDir 'docProps\core.xml') -Encoding UTF8

[System.Reflection.Assembly]::LoadWithPartialName('System.IO.Compression') | Out-Null
[System.Reflection.Assembly]::LoadWithPartialName('System.IO.Compression.FileSystem') | Out-Null
$archive = [System.IO.Compression.ZipFile]::Open($OutPath, [System.IO.Compression.ZipArchiveMode]::Create)
try {
  Get-ChildItem -LiteralPath $BuildDir -File -Recurse | ForEach-Object {
    $relative = $_.FullName.Substring($BuildDir.Length).TrimStart('\', '/')
    $entryName = $relative -replace '\\', '/'
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, $_.FullName, $entryName) | Out-Null
  }
}
finally {
  $archive.Dispose()
}
Get-Item -LiteralPath $OutPath | Select-Object FullName, Length, LastWriteTime
