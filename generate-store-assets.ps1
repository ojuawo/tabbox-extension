Add-Type -AssemblyName System.Drawing

New-Item -ItemType Directory -Force -Path "assets/store" | Out-Null

function Draw-RoundedRect($g, $brush, $x, $y, $w, $h, $radius) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $radius * 2
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    $g.FillPath($brush, $path)
}

function Draw-RoundedRectBorder($g, $pen, $x, $y, $w, $h, $radius) {
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $radius * 2
    $path.AddArc($x, $y, $d, $d, 180, 90)
    $path.AddArc($x + $w - $d, $y, $d, $d, 270, 90)
    $path.AddArc($x + $w - $d, $y + $h - $d, $d, $d, 0, 90)
    $path.AddArc($x, $y + $h - $d, $d, $d, 90, 90)
    $path.CloseFigure()
    $g.DrawPath($pen, $path)
}

function Save-Jpeg($bmp, $filePath, $quality = 95) {
    $encoder = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.FormatDescription -eq "JPEG" }
    $encoderParams = New-Object System.Drawing.Imaging.EncoderParameters(1)
    $encoderParams.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$quality)
    $bmp.Save($filePath, $encoder, $encoderParams)
}

# Common Colors & Fonts
$bgBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(15, 17, 23))
$glowBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Point 0, 0), (New-Object System.Drawing.Point 0, 200), ([System.Drawing.Color]::FromArgb(40, 99, 102, 241)), ([System.Drawing.Color]::Transparent)
$pillBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(35, 99, 102, 241))
$badgeFont = New-Object System.Drawing.Font('Segoe UI', [float]11, [System.Drawing.FontStyle]::Bold)
$badgeColor = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(165, 180, 252))
$titleFont = New-Object System.Drawing.Font('Segoe UI', [float]34, [System.Drawing.FontStyle]::Bold)
$subFont = New-Object System.Drawing.Font('Segoe UI', [float]16, [System.Drawing.FontStyle]::Regular)
$whiteBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::White)
$subBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(148, 163, 184))
$cyanBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(56, 189, 248))
$greenBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(16, 185, 129))

# ==============================================================================
# 1. SCREENSHOT 1: 4 ARCHITECTURE MODES (1280x800)
# ==============================================================================
Write-Host "Generating Screenshot 1: 4 Architecture Modes (1280x800)..."
$bmp1 = New-Object System.Drawing.Bitmap 1280, 800
$g1 = [System.Drawing.Graphics]::FromImage($bmp1)
$g1.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g1.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

$g1.FillRectangle($bgBrush, 0, 0, 1280, 800)
$g1.FillRectangle($glowBrush, 0, 0, 1280, 200)

Draw-RoundedRect $g1 $pillBrush 60 50 140 32 8
$g1.DrawString("TABBOX v2.0", $badgeFont, $badgeColor, 80, 57)

$g1.DrawString("4 Architectural Workspace Modes", $titleFont, $whiteBrush, 60, 95)
$g1.DrawString("Bypass Chrome's hard-coded 320px side panel floor with instant-switch layouts.", $subFont, $subBrush, 60, 150)

$cardW = 270
$cardH = 500
$cardY = 220
$cardStartX = 60
$cardGap = 26

$modes = @(
    @{ Name = "Mode 1: Docked"; Sub = "Tiled Companion Window"; Desc = "Snaps alongside Chrome as a separate window. Perfect for multi-monitors."; Badge = "PRO"; Tag = "[COMPANION]"; Bg = [System.Drawing.Color]::FromArgb(26, 30, 42) },
    @{ Name = "Mode 2: In-Page Rail"; Sub = "56px Mini Margin Strip"; Desc = "Zero layout shift. Injected into webpage margin with 120ms hover-peek."; Badge = "PRO"; Tag = "[IN-PAGE]"; Bg = [System.Drawing.Color]::FromArgb(26, 30, 42) },
    @{ Name = "Mode 3: Command"; Sub = "Alt+B Center Modal"; Desc = "Arc-style command switcher. Zero permanent screen space used until summoned."; Badge = "PRO"; Tag = "[MODAL]"; Bg = [System.Drawing.Color]::FromArgb(26, 30, 42) },
    @{ Name = "Mode 4: Side Panel"; Sub = "Native 2-6 Bento Grid"; Desc = "100% Free Forever. Dynamic column slider with live tab visual thumbnails."; Badge = "100% FREE"; Tag = "[NATIVE]"; Bg = [System.Drawing.Color]::FromArgb(22, 33, 50) }
)

$cardTitleFont = New-Object System.Drawing.Font('Segoe UI', [float]15, [System.Drawing.FontStyle]::Bold)
$cardSubFont = New-Object System.Drawing.Font('Segoe UI', [float]11.5, [System.Drawing.FontStyle]::Bold)
$cardDescFont = New-Object System.Drawing.Font('Segoe UI', [float]10.5, [System.Drawing.FontStyle]::Regular)
$cardBadgeFont = New-Object System.Drawing.Font('Segoe UI', [float]9.5, [System.Drawing.FontStyle]::Bold)
$tagFont = New-Object System.Drawing.Font('Segoe UI', [float]14, [System.Drawing.FontStyle]::Bold)

for ($i = 0; $i -lt 4; $i++) {
    $m = $modes[$i]
    $cx = $cardStartX + ($i * ($cardW + $cardGap))
    
    $cBrush = New-Object System.Drawing.SolidBrush $m.Bg
    Draw-RoundedRect $g1 $cBrush $cx $cardY $cardW $cardH 14
    
    $borderPen = if ($m.Badge -eq "100% FREE") {
        New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(16, 185, 129)), 1.5
    } else {
        New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(51, 65, 85)), 1.2
    }
    Draw-RoundedRectBorder $g1 $borderPen $cx $cardY $cardW $cardH 14
    
    $bColor = if ($m.Badge -eq "100% FREE") { [System.Drawing.Color]::FromArgb(16, 185, 129) } else { [System.Drawing.Color]::FromArgb(99, 102, 241) }
    $bBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(35, $bColor.R, $bColor.G, $bColor.B))
    Draw-RoundedRect $g1 $bBrush ($cx + 16) ($cardY + 18) 84 24 6
    $bTextBrush = New-Object System.Drawing.SolidBrush $bColor
    $g1.DrawString($m.Badge, $cardBadgeFont, $bTextBrush, ($cx + 22), ($cardY + 22))
    
    $g1.DrawString($m.Tag, $tagFont, $cyanBrush, ($cx + 16), ($cardY + 60))
    $g1.DrawString($m.Name, $cardTitleFont, $whiteBrush, ($cx + 16), ($cardY + 110))
    $g1.DrawString($m.Sub, $cardSubFont, $cyanBrush, ($cx + 16), ($cardY + 140))
    
    $rect = New-Object System.Drawing.RectangleF ($cx + 16), ($cardY + 175), ($cardW - 32), 95
    $g1.DrawString($m.Desc, $cardDescFont, $subBrush, $rect)
    
    $mockY = $cardY + 285
    $mockH = 185
    $mockW = $cardW - 32
    $mockX = $cx + 16
    
    $mockBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(15, 17, 23))
    Draw-RoundedRect $g1 $mockBrush $mockX $mockY $mockW $mockH 10
    
    $tabBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(38, 44, 60))
    $activeTabBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(49, 75, 130))
    
    if ($i -eq 3) {
        for ($r = 0; $r -lt 3; $r++) {
            $ty = $mockY + 15 + ($r * 52)
            $colW = ($mockW - 24) / 2
            $rBrush = if ($r -eq 0) { $activeTabBrush } else { $tabBrush }
            Draw-RoundedRect $g1 $rBrush ($mockX + 8) $ty $colW 42 6
            Draw-RoundedRect $g1 $tabBrush ($mockX + 16 + $colW) $ty $colW 42 6
        }
    } else {
        for ($r = 0; $r -lt 3; $r++) {
            $ty = $mockY + 15 + ($r * 52)
            $rBrush = if ($r -eq 0) { $activeTabBrush } else { $tabBrush }
            Draw-RoundedRect $g1 $rBrush ($mockX + 10) $ty ($mockW - 20) 42 6
        }
    }
}

Save-Jpeg $bmp1 "assets/store/screenshot1-modes-1280x800.jpg"
$g1.Dispose()
$bmp1.Dispose()

# ==============================================================================
# 2. SCREENSHOT 2: DYNAMIC BENTO GRID (1280x800)
# ==============================================================================
Write-Host "Generating Screenshot 2: Bento Grid View (1280x800)..."
$bmp2 = New-Object System.Drawing.Bitmap 1280, 800
$g2 = [System.Drawing.Graphics]::FromImage($bmp2)
$g2.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g2.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

$g2.FillRectangle($bgBrush, 0, 0, 1280, 800)
$g2.FillRectangle($glowBrush, 0, 0, 1280, 200)

Draw-RoundedRect $g2 $pillBrush 60 50 170 32 8
$g2.DrawString("BENTO ARCHITECTURE", $badgeFont, $badgeColor, 72, 57)

$g2.DrawString("Visual Bento Grid and Column Slider", $titleFont, $whiteBrush, 60, 95)
$g2.DrawString("Drag smoothly between 2 and 6 columns. Instant fuzzy search across titles and domains.", $subFont, $subBrush, 60, 150)

$frameX = 60
$frameY = 210
$frameW = 1160
$frameH = 530

$frameBg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(21, 24, 33))
Draw-RoundedRect $g2 $frameBg $frameX $frameY $frameW $frameH 16
$frameBorder = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(45, 55, 72)), 1.5
Draw-RoundedRectBorder $g2 $frameBorder $frameX $frameY $frameW $frameH 16

$ctrlY = $frameY + 20
$searchBg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(15, 17, 23))
Draw-RoundedRect $g2 $searchBg ($frameX + 24) $ctrlY 420 42 8
$searchBorder = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(55, 65, 81)), 1
Draw-RoundedRectBorder $g2 $searchBorder ($frameX + 24) $ctrlY 420 42 8
$searchTextFont = New-Object System.Drawing.Font('Segoe UI', [float]12, [System.Drawing.FontStyle]::Regular)
$searchPlaceholder = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(100, 116, 139))
$g2.DrawString("Search 42 open tabs or domains...", $searchTextFont, $searchPlaceholder, ($frameX + 38), ($ctrlY + 11))

$sliderBg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(30, 36, 50))
Draw-RoundedRect $g2 $sliderBg ($frameX + 465) $ctrlY 260 42 8
$sliderTextFont = New-Object System.Drawing.Font('Segoe UI', [float]11, [System.Drawing.FontStyle]::Bold)
$sliderTextBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(203, 213, 225))
$g2.DrawString("Columns: 4 Columns [2 --- 6]", $sliderTextFont, $sliderTextBrush, ($frameX + 480), ($ctrlY + 12))

Draw-RoundedRect $g2 $sliderBg ($frameX + 745) $ctrlY 200 42 8
$g2.DrawString("Height: S  [M]  L", $sliderTextFont, $sliderTextBrush, ($frameX + 765), ($ctrlY + 12))

$memBtnBg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(16, 185, 129))
Draw-RoundedRect $g2 $memBtnBg ($frameX + 965) $ctrlY 165 42 8
$memBtnFont = New-Object System.Drawing.Font('Segoe UI', [float]11, [System.Drawing.FontStyle]::Bold)
$memBtnText = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(10, 30, 20))
$g2.DrawString("Sleep Inactive (70%)", $memBtnFont, $memBtnText, ($frameX + 975), ($ctrlY + 12))

$cols = 4
$rows = 3
$tabCardW = 260
$tabCardH = 120
$gridStartX = $frameX + 24
$gridStartY = $ctrlY + 68
$gapX = 24
$gapY = 16

$tabTitles = @(
    @{ Title = "GitHub - TabBox Extension"; Domain = "github.com"; Color = "#2563eb"; Active = $true },
    @{ Title = "Google Chrome Web Store"; Domain = "chrome.google.com"; Color = "#0284c7"; Active = $false },
    @{ Title = "Paystack Live Dashboard"; Domain = "dashboard.paystack.com"; Color = "#059669"; Active = $false },
    @{ Title = "Komunis Concept Portal"; Domain = "komunisconcept.org.ng"; Color = "#7c3aed"; Active = $false },
    @{ Title = "Figma - UI Design System v2"; Domain = "figma.com"; Color = "#ea580c"; Active = $false },
    @{ Title = "Linear - Sprint Planning"; Domain = "linear.app"; Color = "#6366f1"; Active = $false },
    @{ Title = "Vercel - Analytics Dashboard"; Domain = "vercel.com"; Color = "#000000"; Active = $false },
    @{ Title = "ChatGPT - Research Tasks"; Domain = "chatgpt.com"; Color = "#10a37f"; Active = $false },
    @{ Title = "Stripe Docs - Webhook Logic"; Domain = "stripe.com"; Color = "#6366f1"; Active = $false },
    @{ Title = "StackOverflow - Shadow DOM"; Domain = "stackoverflow.com"; Color = "#f97316"; Active = $false },
    @{ Title = "Notion - Product Roadmap"; Domain = "notion.so"; Color = "#334155"; Active = $false },
    @{ Title = "Twitter / X - Product Launch"; Domain = "x.com"; Color = "#0f172a"; Active = $false }
)

$tFont = New-Object System.Drawing.Font('Segoe UI', [float]11, [System.Drawing.FontStyle]::Bold)
$dFont = New-Object System.Drawing.Font('Segoe UI', [float]9.5, [System.Drawing.FontStyle]::Regular)

for ($c = 0; $c -lt $cols; $c++) {
    for ($r = 0; $r -lt $rows; $r++) {
        $idx = ($r * $cols) + $c
        $tab = $tabTitles[$idx]
        $tx = $gridStartX + ($c * ($tabCardW + $gapX))
        $ty = $gridStartY + ($r * ($tabCardH + $gapY))
        
        $tBg = if ($tab.Active) {
            New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(35, 50, 80))
        } else {
            New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(26, 31, 44))
        }
        Draw-RoundedRect $g2 $tBg $tx $ty $tabCardW $tabCardH 10
        
        $tBorder = if ($tab.Active) {
            New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(99, 102, 241)), 1.8
        } else {
            New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(45, 55, 75)), 1
        }
        Draw-RoundedRectBorder $g2 $tBorder $tx $ty $tabCardW $tabCardH 10
        
        $favBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.ColorTranslator]::FromHtml($tab.Color))
        $g2.FillEllipse($favBrush, ($tx + 12), ($ty + 14), 16, 16)
        
        $titleTextBrush = if ($tab.Active) { New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(224, 231, 255)) } else { $whiteBrush }
        $g2.DrawString($tab.Title, $tFont, $titleTextBrush, ($tx + 36), ($ty + 12))
        $g2.DrawString($tab.Domain, $dFont, $subBrush, ($tx + 36), ($ty + 34))
        
        $thumbBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(18, 21, 29))
        Draw-RoundedRect $g2 $thumbBrush ($tx + 12) ($ty + 56) ($tabCardW - 24) 50 6
        
        if ($tab.Active) {
            $activePill = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(99, 102, 241))
            Draw-RoundedRect $g2 $activePill ($tx + $tabCardW - 65) ($ty + 12) 52 18 4
            $pFont = New-Object System.Drawing.Font('Segoe UI', [float]8.5, [System.Drawing.FontStyle]::Bold)
            $g2.DrawString("ACTIVE", $pFont, $whiteBrush, ($tx + $tabCardW - 61), ($ty + 14))
        }
    }
}

Save-Jpeg $bmp2 "assets/store/screenshot2-bento-1280x800.jpg"
$g2.Dispose()
$bmp2.Dispose()

# ==============================================================================
# 3. SCREENSHOT 3: MEMORY SAVER & PERFORMANCE (1280x800)
# ==============================================================================
Write-Host "Generating Screenshot 3: Memory Saver & Tab Snooze (1280x800)..."
$bmp3 = New-Object System.Drawing.Bitmap 1280, 800
$g3 = [System.Drawing.Graphics]::FromImage($bmp3)
$g3.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g3.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

$g3.FillRectangle($bgBrush, 0, 0, 1280, 800)
$g3.FillRectangle($glowBrush, 0, 0, 1280, 200)

Draw-RoundedRect $g3 $pillBrush 60 50 180 32 8
$g3.DrawString("PERFORMANCE ENGINE", $badgeFont, $badgeColor, 72, 57)

$g3.DrawString("Memory Saver: Sleep Inactive Tabs", $titleFont, $whiteBrush, 60, 95)
$g3.DrawString("Reclaim up to 70% RAM across dozens of open tabs. Wake them instantly on click.", $subFont, $subBrush, 60, 150)

$lCardX = 60
$lCardY = 220
$lCardW = 560
$lCardH = 490

$card1Bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(20, 24, 34))
Draw-RoundedRect $g3 $card1Bg $lCardX $lCardY $lCardW $lCardH 16
$c1Border = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(59, 130, 246)), 1.5
Draw-RoundedRectBorder $g3 $c1Border $lCardX $lCardY $lCardW $lCardH 16

$g3.DrawString("[!] Active Tab (Full Memory)", $titleFont, $whiteBrush, ($lCardX + 30), ($lCardY + 30))
$g3.DrawString("Consumes ~180MB RAM per complex JavaScript app", $subFont, $subBrush, ($lCardX + 30), ($lCardY + 80))

$barBg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(35, 40, 55))
Draw-RoundedRect $g3 $barBg ($lCardX + 30) ($lCardY + 130) 500 24 6
$barActive = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(239, 68, 68))
Draw-RoundedRect $g3 $barActive ($lCardX + 30) ($lCardY + 130) 420 24 6
$g3.DrawString("Memory Footprint: 185 MB RAM", $cardSubFont, $whiteBrush, ($lCardX + 30), ($lCardY + 170))

$rCardX = 660
$rCardY = 220
$rCardW = 560
$rCardH = 490

$card2Bg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(16, 28, 26))
Draw-RoundedRect $g3 $card2Bg $rCardX $rCardY $rCardW $rCardH 16
$c2Border = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(16, 185, 129)), 1.5
Draw-RoundedRectBorder $g3 $c2Border $rCardX $rCardY $rCardW $rCardH 16

$greenText = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(52, 211, 153))
$g3.DrawString("[Zzz] Sleeping Tab (Snoozed)", $titleFont, $greenText, ($rCardX + 30), ($rCardY + 30))
$g3.DrawString("Discarded from memory while retaining favicon, scroll position, and title", $subFont, $subBrush, ($rCardX + 30), ($rCardY + 80))

Draw-RoundedRect $g3 $barBg ($rCardX + 30) ($rCardY + 130) 500 24 6
$barSleeping = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(16, 185, 129))
Draw-RoundedRect $g3 $barSleeping ($rCardX + 30) ($rCardY + 130) 45 24 6
$g3.DrawString("Memory Footprint: 2.1 MB RAM (98.8% Saved!)", $cardSubFont, $greenText, ($rCardX + 30), ($rCardY + 170))

$statBg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(25, 30, 42))
Draw-RoundedRect $g3 $statBg ($lCardX + 30) ($lCardY + 230) 1100 210 14
Draw-RoundedRectBorder $g3 (New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(60, 70, 95)), 1) ($lCardX + 30) ($lCardY + 230) 1100 210 14

$metricTitleFont = New-Object System.Drawing.Font('Segoe UI', [float]24, [System.Drawing.FontStyle]::Bold)
$metricSubFont = New-Object System.Drawing.Font('Segoe UI', [float]13, [System.Drawing.FontStyle]::Regular)

$g3.DrawString("1-Click Hibernation Engine", $metricTitleFont, $whiteBrush, ($lCardX + 60), ($lCardY + 260))
$g3.DrawString("Automatic snoozing for inactive background tabs`nNative chrome.tabs.discard() API with zero telemetry`nInstant 1-click restore without losing your work state", $metricSubFont, $subBrush, ($lCardX + 60), ($lCardY + 310))

Save-Jpeg $bmp3 "assets/store/screenshot3-memory-1280x800.jpg"
$g3.Dispose()
$bmp3.Dispose()

# ==============================================================================
# 4. SCREENSHOT 4: ARROW NAVIGATION & SHORTCUTS (1280x800)
# ==============================================================================
Write-Host "Generating Screenshot 4: Shortcuts & Fast Navigation (1280x800)..."
$bmp4 = New-Object System.Drawing.Bitmap 1280, 800
$g4 = [System.Drawing.Graphics]::FromImage($bmp4)
$g4.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$g4.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

$g4.FillRectangle($bgBrush, 0, 0, 1280, 800)
$g4.FillRectangle($glowBrush, 0, 0, 1280, 200)

Draw-RoundedRect $g4 $pillBrush 60 50 170 32 8
$g4.DrawString("KEYBOARD WORKFLOW", $badgeFont, $badgeColor, 72, 57)

$g4.DrawString("Lightning-Fast Command Palette (Alt+B)", $titleFont, $whiteBrush, 60, 95)
$g4.DrawString("Switch tabs in under 50ms using arrow keys and fuzzy search without reaching for your mouse.", $subFont, $subBrush, 60, 150)

$modalW = 760
$modalH = 500
$modalX = 260
$modalY = 220

$modalBg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(20, 24, 34))
Draw-RoundedRect $g4 $modalBg $modalX $modalY $modalW $modalH 18
$modalBorder = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(99, 102, 241)), 2
Draw-RoundedRectBorder $g4 $modalBorder $modalX $modalY $modalW $modalH 18

Draw-RoundedRect $g4 $searchBg ($modalX + 24) ($modalY + 24) ($modalW - 48) 50 10
$g4.DrawString("Type tab title, URL or shortcut...  [Alt+B]", $searchTextFont, $searchPlaceholder, ($modalX + 44), ($modalY + 38))

$itemTitles = @(
    @{ Name = "GitHub - ojuawo/tabbox-extension"; Key = "Enter to switch"; Active = $true },
    @{ Name = "Chrome Web Store Developer Console"; Key = "Alt+2"; Active = $false },
    @{ Name = "Paystack Dashboard - Live Transactions"; Key = "Alt+3"; Active = $false },
    @{ Name = "Komunis Concept Official Website"; Key = "Alt+4"; Active = $false },
    @{ Name = "Linear App - Product Backlog"; Key = "Alt+5"; Active = $false }
)

$iFont = New-Object System.Drawing.Font('Segoe UI', [float]13, [System.Drawing.FontStyle]::Bold)
$kFont = New-Object System.Drawing.Font('Segoe UI', [float]11, [System.Drawing.FontStyle]::Bold)

for ($i = 0; $i -lt 5; $i++) {
    $item = $itemTitles[$i]
    $iy = $modalY + 95 + ($i * 72)
    
    $itemBg = if ($item.Active) {
        New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(45, 60, 95))
    } else {
        New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(26, 31, 45))
    }
    Draw-RoundedRect $g4 $itemBg ($modalX + 24) $iy ($modalW - 48) 60 10
    
    $itemTextColor = if ($item.Active) { $whiteBrush } else { New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(203, 213, 225)) }
    $g4.DrawString($item.Name, $iFont, $itemTextColor, ($modalX + 45), ($iy + 18))
    
    $keyPillBg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(35, 42, 60))
    Draw-RoundedRect $g4 $keyPillBg ($modalX + $modalW - 170) ($iy + 16) 130 28 6
    $keyTextColor = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(148, 163, 184))
    $g4.DrawString($item.Key, $kFont, $keyTextColor, ($modalX + $modalW - 160), ($iy + 21))
}

Save-Jpeg $bmp4 "assets/store/screenshot4-productivity-1280x800.jpg"
$g4.Dispose()
$bmp4.Dispose()

# ==============================================================================
# 5. SMALL PROMO TILE (440x280)
# ==============================================================================
Write-Host "Generating Small Promo Tile (440x280)..."
$bmpSmall = New-Object System.Drawing.Bitmap 440, 280
$gS = [System.Drawing.Graphics]::FromImage($bmpSmall)
$gS.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$gS.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

$sBg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(15, 17, 23))
$gS.FillRectangle($sBg, 0, 0, 440, 280)

$accentBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Point 0, 0), (New-Object System.Drawing.Point 440, 280), ([System.Drawing.Color]::FromArgb(35, 99, 102, 241)), ([System.Drawing.Color]::Transparent)
$gS.FillRectangle($accentBrush, 0, 0, 440, 280)

$logoBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(26, 115, 232))
Draw-RoundedRect $gS $logoBrush 30 30 52 52 12
$gS.FillRectangle($whiteBrush, 40, 40, 14, 14)
$gS.FillRectangle($whiteBrush, 58, 40, 14, 14)
$gS.FillRectangle($whiteBrush, 40, 58, 14, 14)
$gS.FillRectangle($whiteBrush, 58, 58, 14, 14)

$sTitleFont = New-Object System.Drawing.Font('Segoe UI', [float]22, [System.Drawing.FontStyle]::Bold)
$sSubFont = New-Object System.Drawing.Font('Segoe UI', [float]11.5, [System.Drawing.FontStyle]::Bold)
$gS.DrawString("TabBox", $sTitleFont, $whiteBrush, 96, 32)
$gS.DrawString("Multi-Mode Grid Vertical Tabs", $sSubFont, $cyanBrush, 98, 62)

$fBoxBg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(24, 28, 40))
Draw-RoundedRect $gS $fBoxBg 30 102 380 144 10
Draw-RoundedRectBorder $gS (New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(50, 60, 80)), 1) 30 102 380 144 10

$fFont = New-Object System.Drawing.Font('Segoe UI', [float]11, [System.Drawing.FontStyle]::Regular)

$gS.DrawString("+ 4 Architecture Modes (Rail, Dock, Bento, Side Panel)", $fFont, $whiteBrush, 45, 116)
$gS.DrawString("+ Dynamic 2 to 6 Column Bento Grid", $fFont, $whiteBrush, 45, 144)
$gS.DrawString("+ Instant Tab Snooze (Save up to 70% RAM)", $fFont, $whiteBrush, 45, 172)
$gS.DrawString("+ 100% Client-Side - Zero Telemetry", $fFont, $greenBrush, 45, 200)

Save-Jpeg $bmpSmall "assets/store/promo-small-440x280.jpg"
$gS.Dispose()
$bmpSmall.Dispose()

# ==============================================================================
# 6. MARQUEE PROMO TILE (1400x560)
# ==============================================================================
Write-Host "Generating Marquee Promo Tile (1400x560)..."
$bmpMarquee = New-Object System.Drawing.Bitmap 1400, 560
$gM = [System.Drawing.Graphics]::FromImage($bmpMarquee)
$gM.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
$gM.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::ClearTypeGridFit

$gM.FillRectangle($bgBrush, 0, 0, 1400, 560)

$mGlow = New-Object System.Drawing.Drawing2D.LinearGradientBrush (New-Object System.Drawing.Point 0, 0), (New-Object System.Drawing.Point 700, 560), ([System.Drawing.Color]::FromArgb(50, 79, 70, 229)), ([System.Drawing.Color]::Transparent)
$gM.FillRectangle($mGlow, 0, 0, 700, 560)

$mqBadgeBg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(40, 99, 102, 241))
Draw-RoundedRect $gM $mqBadgeBg 80 70 240 36 8
$mqBadgeFont = New-Object System.Drawing.Font('Segoe UI', [float]12, [System.Drawing.FontStyle]::Bold)
$gM.DrawString("VERTICAL TABS REDEFINED", $mqBadgeFont, $badgeColor, 96, 78)

$mqTitleFont = New-Object System.Drawing.Font('Segoe UI', [float]42, [System.Drawing.FontStyle]::Bold)
$mqSubFont = New-Object System.Drawing.Font('Segoe UI', [float]18, [System.Drawing.FontStyle]::Regular)

$gM.DrawString("TabBox", $mqTitleFont, $whiteBrush, 80, 125)

$mqTaglineFont = New-Object System.Drawing.Font('Segoe UI', [float]24, [System.Drawing.FontStyle]::Bold)
$gM.DrawString("The Next Evolution of Vertical Tabs", $mqTaglineFont, $cyanBrush, 80, 195)

$gM.DrawString("Bypass Chrome's 320px Side Panel floor.`nBento Grid, In-Page Rail, and Docked Companion.`nNo subscriptions - 100% Free Native Side Panel.", $mqSubFont, $subBrush, 80, 250)

$pills = @("Free Native Side Panel", "Bento Grid 2-6 Cols", "In-Page Margin Rail", "Memory Saver")
$pillX = 80
$pillY = 370
$pillFont = New-Object System.Drawing.Font('Segoe UI', [float]11.5, [System.Drawing.FontStyle]::Bold)

foreach ($p in $pills) {
    $pBg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(30, 36, 52))
    Draw-RoundedRect $gM $pBg $pillX $pillY 180 38 8
    Draw-RoundedRectBorder $gM (New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(60, 70, 95)), 1) $pillX $pillY 180 38 8
    $gM.DrawString($p, $pillFont, $whiteBrush, ($pillX + 14), ($pillY + 9))
    $pillX += 192
}

$footerFont = New-Object System.Drawing.Font('Segoe UI', [float]12, [System.Drawing.FontStyle]::Regular)
$gM.DrawString("Product of Komunis Concept (komunisconcept.org.ng) - Chrome Manifest V3 Certified", $footerFont, $subBrush, 80, 450)

$rBoxX = 880
$rBoxY = 70
$rBoxW = 460
$rBoxH = 420

$rBoxBg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(22, 26, 36))
Draw-RoundedRect $gM $rBoxBg $rBoxX $rBoxY $rBoxW $rBoxH 16
$rBoxPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(99, 102, 241)), 1.8
Draw-RoundedRectBorder $gM $rBoxPen $rBoxX $rBoxY $rBoxW $rBoxH 16

$headerBg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(16, 18, 26))
Draw-RoundedRect $gM $headerBg $rBoxX $rBoxY $rBoxW 50 16
$headerFont = New-Object System.Drawing.Font('Segoe UI', [float]12, [System.Drawing.FontStyle]::Bold)
$gM.DrawString("TabBox Companion Workspace", $headerFont, $whiteBrush, ($rBoxX + 20), ($rBoxY + 15))

$itemTabFont = New-Object System.Drawing.Font('Segoe UI', [float]10, [System.Drawing.FontStyle]::Bold)
$cyanDot = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(56, 189, 248))
$innerCardBg = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(18, 20, 28))
$gridPen = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(50, 60, 80)), 1

for ($r = 0; $r -lt 3; $r++) {
    for ($c = 0; $c -lt 2; $c++) {
        $bx = $rBoxX + 20 + ($c * 215)
        $by = $rBoxY + 70 + ($r * 105)
        $bBg = if ($r -eq 0 -and $c -eq 0) {
            New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(40, 55, 90))
        } else {
            New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(28, 33, 46))
        }
        Draw-RoundedRect $gM $bBg $bx $by 200 90 8
        Draw-RoundedRectBorder $gM $gridPen $bx $by 200 90 8
        
        $gM.FillEllipse($cyanDot, ($bx + 12), ($by + 14), 12, 12)
        $gM.DrawString("Open Tab Item", $itemTabFont, $whiteBrush, ($bx + 30), ($by + 11))
        
        Draw-RoundedRect $gM $innerCardBg ($bx + 12) ($by + 36) 176 42 4
    }
}

Save-Jpeg $bmpMarquee "assets/store/promo-marquee-1400x560.jpg"
$gM.Dispose()
$bmpMarquee.Dispose()

# Copy icon128.png to assets/store/icon128.png
Copy-Item "icons/icon128.png" "assets/store/icon128.png" -Force

Write-Host "All Chrome Web Store graphic assets successfully generated in assets/store/ !"
