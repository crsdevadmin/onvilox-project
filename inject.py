import os

def inject_theme():
    directory = r"c:\Users\mjaff\Downloads\onvilox-corrected-pdf-qr-pdf-fixed"
    for filename in os.listdir(directory):
        if filename.endswith(".html") and filename != "index.html":
            filepath = os.path.join(directory, filename)
            with open(filepath, 'r', encoding='utf-8') as f:
                content = f.read()

            modified = False
            
            # Add missing meta viewport if needed
            if '<meta name="viewport"' not in content:
                content = content.replace('<head>', '<head>\n  <meta name="viewport" content="width=device-width, initial-scale=1.0">')
                modified = True

            # Add theme.js
            if 'src="js/theme.js"' not in content:
                content = content.replace('</body>', '<script src="js/theme.js"></script>\n</body>')
                modified = True

            # Add toggle button next to Logout
            logout_tag = '<a href="#" onclick="auth.logout()">Logout</a>'
            toggle_btn = '<a href="#" onclick="auth.logout()">Logout</a>\n    <button id="themeToggleBtn" onclick="toggleTheme()" class="btn-secondary btn-sm" style="margin-left: 20px; border-radius: 30px; padding: 6px 14px; cursor: pointer;">🌙 Dark Mode</button>'
            if logout_tag in content and 'id="themeToggleBtn"' not in content:
                content = content.replace(logout_tag, toggle_btn)
                modified = True
                
            if modified:
                with open(filepath, 'w', encoding='utf-8') as f:
                    f.write(content)
                    print(f"Injected into {filename}")

if __name__ == "__main__":
    inject_theme()
