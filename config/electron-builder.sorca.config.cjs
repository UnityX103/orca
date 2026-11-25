const base = require('./electron-builder.config.cjs')

module.exports = {
  ...base,
  appId: 'io.github.unityx103.sorca',
  productName: 'SOrca',
  protocols: [],
  publish: null,
  extraMetadata: { ...base.extraMetadata, productName: 'SOrca' },
  mac: {
    ...base.mac,
    identity: '-',
    artifactName: 'SOrca-macos-${arch}.${ext}'
  },
  win: {
    ...base.win,
    executableName: 'SOrca',
    signtoolOptions: { sign: base.win.signtoolOptions.sign }
  },
  nsis: {
    ...base.nsis,
    // The official installer owns the Orca profile and its Windows file associations.
    include: null,
    artifactName: 'SOrca-windows-${arch}.${ext}'
  }
}
