// electron-builder afterPack hook.
//
// package.json sets build.mac.identity = null so electron-builder never
// searches the keychain for a certificate we don't have — but that also
// makes electron-builder SKIP signing entirely (see its log line "skipped
// macOS code signing reason=identity explicitly is set to null"), leaving
// only the Electron linker's partial signature (no bundle Info.plist bound,
// no resource seal). `codesign --verify --deep --strict` fails on that, and
// a browser-downloaded (quarantined) copy shows "is damaged and can't be
// opened". So we apply a real ad-hoc signature ourselves, after packaging
// and before the dmg is built, using the `-` identity (ad-hoc, no cert
// required — this is what's required for Apple Silicon arm64 binaries to
// launch at all).
const path = require('path');
const { execFileSync } = require('child_process');

module.exports = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') {
    return;
  }

  const appPath = path.join(
    context.appOutDir,
    context.packager.appInfo.productFilename + '.app'
  );

  // execFileSync (not exec/execSync) so the path — which contains spaces —
  // is never interpolated into a shell string.
  execFileSync('codesign', ['--force', '--deep', '--sign', '-', appPath], {
    stdio: 'inherit',
  });
};
