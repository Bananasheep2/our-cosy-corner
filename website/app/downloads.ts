// Single source of truth for the current release + installer URLs.
// Both platforms are on the same version again: the Windows installer is now
// produced by the GitHub Actions workflow (.github/workflows/build-windows.yml)
// on a windows-latest runner, so it no longer lags behind macOS.
export const APP_VERSION = "1.0.5";
export const WIN_VERSION = "1.0.5";

export const DL_MAC_ARM = "https://downloads.ourcosycorner.com/Our-Cosy-Corner-1.0.5-arm64.dmg";
export const DL_MAC_INTEL = "https://downloads.ourcosycorner.com/Our-Cosy-Corner-1.0.5-x64.dmg";
export const DL_WIN = "https://downloads.ourcosycorner.com/Our-Cosy-Corner-Setup-1.0.5.exe";
