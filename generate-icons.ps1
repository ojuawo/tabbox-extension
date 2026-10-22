Add-Type -AssemblyName System.Drawing
New-Item -ItemType Directory -Force -Path 'icons' | Out-Null

function Generate-Icon($size, $path) {
    $bmp = New-Object System.Drawing.Bitmap $size, $size
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $g.Clear([System.Drawing.Color]::Transparent)
    
    $bgBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 26, 115, 232))
    $rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
    $cornerRad = [int]($size * 0.22)
    
    $pathObj = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = [Math]::Max(1, $cornerRad * 2)
    $pathObj.AddArc(0, 0, $d, $d, 180, 90)
    $pathObj.AddArc($size - $d, 0, $d, $d, 270, 90)
    $pathObj.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
    $pathObj.AddArc(0, $size - $d, $d, $d, 90, 90)
    $pathObj.CloseFigure()
    $g.FillPath($bgBrush, $pathObj)

    $boxBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
    $margin = [Math]::Max(1, [int]($size * 0.22))
    $gap = [Math]::Max(1, [int]($size * 0.12))
    $boxW = [Math]::Max(1, [int](($size - (2 * $margin) - $gap) / 2))
    
    $g.FillRectangle($boxBrush, $margin, $margin, $boxW, $boxW)
    $g.FillRectangle($boxBrush, $margin + $boxW + $gap, $margin, $boxW, $boxW)
    $g.FillRectangle($boxBrush, $margin, $margin + $boxW + $gap, $boxW, $boxW)
    $g.FillRectangle($boxBrush, $margin + $boxW + $gap, $margin + $boxW + $gap, $boxW, $boxW)
    
    $bmp.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
}

Generate-Icon 16 'icons/icon16.png'
Generate-Icon 32 'icons/icon32.png'
Generate-Icon 48 'icons/icon48.png'
Generate-Icon 128 'icons/icon128.png'
Write-Output "Successfully generated extension icons."
