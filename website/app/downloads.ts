// Single source of truth for the current release + installer URLs.
// macOS is on 1.0.3; the Windows installer is built on a Windows machine and
// is one release behind (1.0.2) until it's rebuilt and re-uploaded. Keep
// WIN_VERSION honest so the download page can show it and note the pending
// update, rather than implying Windows is on APP_VERSION too.
export const APP_VERSION = "1.0.5";
export const WIN_VERSION = "1.0.2";

export const DL_MAC_ARM = "https://downloads.ourcosycorner.com/Our-Cosy-Corner-1.0.5-arm64.dmg";
export const DL_MAC_INTEL = "https://downloads.ourcosycorner.com/Our-Cosy-Corner-1.0.5-x64.dmg";
export const DL_WIN = "https://downloads.ourcosycorner.com/Our-Cosy-Corner-Setup-1.0.2.exe";
