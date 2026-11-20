# Building Notely for Windows (.exe)

Notely is packaged as a standalone **Windows Desktop Application (`.exe`)** powered by Electron with:
- Native **Windows 11 Fluent titlebar overlay** (synced with Light/Dark theme)
- **Local AppData storage** (`%APPDATA%\Notely\workspace.json`) with native File Explorer backup export/import
- **Native Windows clipboard writing** (`text/html` + `text/plain`) for Outlook, Teams, Gmail, Slack, and Word
- **Windows System Tray** + global **`Ctrl+Shift+Space`** hotkey to summon Notely from any app

---

## Option 1: One-Click Local Build on Windows

1. Install **Node.js (LTS)** from [https://nodejs.org](https://nodejs.org) if not already installed.
2. Download/export this project folder to your Windows PC and unzip it.
3. Double-click **`build-windows-exe.bat`** (or open PowerShell in the project folder and run `npm install` then `npm run dist:win`).
4. When finished, the `release\` folder opens automatically containing:
   - **`Notely-1.0.0-Portable.exe`** — Double-click to run directly with zero installation.
   - **`Notely-Setup-1.0.0.exe`** — Standard Windows installer with Desktop and Start Menu shortcuts.

---

## Option 2: Cloud Build via GitHub Actions (No Local Install Needed)

1. Export this project to a GitHub repository.
2. Open the **Actions** tab in GitHub and run **Build Windows Desktop App (.exe)** (it also runs automatically on push to `main`).
3. Download the **`Notely-Windows-EXE`** artifact containing both `.exe` files.
