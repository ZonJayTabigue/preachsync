param(
  [Parameter(Mandatory = $true)]
  [string] $InputPath,

  [Parameter(Mandatory = $true)]
  [string] $OutputDir
)

$ErrorActionPreference = "Stop"

if (-not (Test-Path -LiteralPath $OutputDir)) {
  New-Item -ItemType Directory -Path $OutputDir | Out-Null
}

$powerpoint = New-Object -ComObject PowerPoint.Application
try {
  $powerpoint.DisplayAlerts = 1
  $presentation = $null
  try {
    $presentation = $powerpoint.Presentations.Open($InputPath, $true, $false, $false)
  }
  catch {
    $powerpoint.Visible = $true
    $presentation = $powerpoint.Presentations.Open($InputPath, $true, $false, $true)
  }
  try {
    foreach ($slide in $presentation.Slides) {
      $fileName = Join-Path $OutputDir ("slide-{0:D4}.png" -f $slide.SlideIndex)
      $slide.Export($fileName, "PNG", 1920, 1080)
    }
  }
  finally {
    $presentation.Close()
  }
}
finally {
  $powerpoint.Quit()
  [System.Runtime.InteropServices.Marshal]::ReleaseComObject($powerpoint) | Out-Null
  [GC]::Collect()
  [GC]::WaitForPendingFinalizers()
}
