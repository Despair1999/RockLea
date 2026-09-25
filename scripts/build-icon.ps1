$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$root = Split-Path -Parent $PSScriptRoot
$source = [Drawing.Bitmap]::FromFile((Join-Path $root 'assets/RockLea.png'))
$sizes = @(16,24,32,48,64,128,256)
$images = @()
try {
  foreach ($size in $sizes) {
    $bitmap = New-Object Drawing.Bitmap($size,$size,[Drawing.Imaging.PixelFormat]::Format32bppArgb)
    $graphics = [Drawing.Graphics]::FromImage($bitmap)
    $graphics.Clear([Drawing.Color]::Transparent)
    $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $scale = [Math]::Min($size / $source.Width, $size / $source.Height)
    $width = [int][Math]::Round($source.Width * $scale)
    $height = [int][Math]::Round($source.Height * $scale)
    $graphics.DrawImage($source, [Drawing.Rectangle]::new([int](($size-$width)/2),[int](($size-$height)/2),$width,$height))
    $stream = [IO.MemoryStream]::new()
    $bitmap.Save($stream,[Drawing.Imaging.ImageFormat]::Png)
    $images += ,$stream.ToArray()
    $stream.Dispose(); $graphics.Dispose(); $bitmap.Dispose()
  }
  $output = [IO.File]::Create((Join-Path $root 'assets/RockLea.ico'))
  $writer = [IO.BinaryWriter]::new($output)
  try {
    $writer.Write([uint16]0); $writer.Write([uint16]1); $writer.Write([uint16]$sizes.Length)
    $offset = 6 + 16 * $sizes.Length
    for ($i=0;$i -lt $sizes.Length;$i++) {
      $dimension = if ($sizes[$i] -eq 256) { 0 } else { $sizes[$i] }
      $writer.Write([byte]$dimension); $writer.Write([byte]$dimension)
      $writer.Write([byte]0); $writer.Write([byte]0)
      $writer.Write([uint16]1); $writer.Write([uint16]32)
      $writer.Write([uint32]$images[$i].Length); $writer.Write([uint32]$offset)
      $offset += $images[$i].Length
    }
    foreach ($bytes in $images) { $writer.Write([byte[]]$bytes) }
  } finally { $writer.Dispose(); $output.Dispose() }
} finally { $source.Dispose() }
Write-Output 'RockLea.ico: 16, 24, 32, 48, 64, 128, 256 px; original alpha and aspect ratio preserved.'
