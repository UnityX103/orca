const base = require('./electron-builder.config.cjs')
const qa = process.env.SORCA_WINDOWS_QA === '1'
const productName = qa ? 'SOrca QA' : 'SOrca'

module.exports = {
  ...base,
  appId: qa ? 'io.github.unityx103.sorca.qa' : 'io.github.unityx103.sorca',
  productName,
  protocols: [],
  publish: null,
  extraMetadata: {
    ...base.extraMetadata,
    // Per-user NSIS uses the package name for its default directory and uninstall cleanup.
    name: qa ? 'sorca-qa' : 'sorca',
    productName
  },
  mac: {
    ...base.mac,
    identity: '-'
  },
  dmg: {
    ...base.dmg,
    artifactName: 'SOrca-macos-${arch}.${ext}'
  },
  win: {
    ...base.win,
    executableName: qa ? 'SOrcaQA' : 'SOrca',
    signtoolOptions: { sign: base.win.signtoolOptions.sign }
  },
  nsis: {
    ...base.nsis,
    // The official installer owns the Orca profile and its Windows file associations.
    include: null,
    artifactName: 'SOrca-windows-${arch}.${ext}'
  }
}
