# Update all HTML files except index.html with the theme toggle button and script

$dir = "c:\Users\mjaff\Downloads\onvilox-corrected-pdf-qr-pdf-fixed"
$htmlFiles = Get-ChildItem -Path $dir -Filter "*.html" | Where-Object { $_.Name -ne "index.html" }

foreach ($file in $htmlFiles) {
    $content = Get-Content $file.FullName -Raw
    $modified = $false

    # Add script if not there
    if ($content -notmatch 'src="js/theme.js"') {
        $content = $content -replace "</body>", "<script src=`"js/theme.js`"></script>`n</body>"
        $modified = $true
    }

    # Add button to topbar next to Logout
    $logoutTag = "<a href=`"#`" onclick=`"auth.logout\(\)`">Logout</a>"
    if ($content -match $logoutTag -and $content -notmatch 'id="themeToggleBtn"') {
        $replacement = "<a href=`"#`" onclick=`"auth.logout()`">Logout</a>`n    <button id=`"themeToggleBtn`" onclick=`"toggleTheme()`" class=`"btn-secondary btn-sm`" style=`"margin-left: 20px; border-radius: 30px; padding: 6px 14px; cursor: pointer;`">🌙 Dark Mode</button>"
        $content = $content -replace $logoutTag, $replacement
        $modified = $true
    }

    if ($modified) {
        Set-Content -Path $file.FullName -Value $content -NoNewline
    }
}
Write-Output "Injected theme toggle to global HTML pages."
