// Embed our icon/metadata into the app exe with the `rcedit` package.
// (electron-builder's own step needs symlink privileges on Windows; this works everywhere.)
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'win32') return;
  const mod = await import('rcedit');
  const rcedit = mod.rcedit || mod.default.rcedit || mod.default;
  const exe = path.join(context.appOutDir, `${context.packager.appInfo.productFilename}.exe`);
  await rcedit(exe, {
    icon: path.join(__dirname, 'icon.ico'),
    'version-string': {
      ProductName: 'Speaker Awake',
      FileDescription: 'Speaker Awake',
      CompanyName: 'Speaker Awake contributors',
      LegalCopyright: 'MIT License',
    },
    'file-version': context.packager.appInfo.version,
    'product-version': context.packager.appInfo.version,
  });
};
