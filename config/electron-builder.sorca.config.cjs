const base = require('./electron-builder.config.cjs')
const qa = process.env.SORCA_WINDOWS_QA === '1'

module.exports = {
  ...base,
  ...(qa && { appId: 'com.stablyai.orca.qa', productName: 'Orca QA', protocols: [] }),
  publish: null,
  extraMetadata: {
    ...base.extraMetadata,
    ...(qa && { name: 'orca-qa', productName: 'Orca QA' })
  },
  mac: {
    ...base.mac,
    identity: '-'
  },
  win: {
    ...base.win,
    ...(qa && { executableName: 'OrcaQA' }),
    signtoolOptions: { sign: base.win.signtoolOptions.sign }
  },
  nsis: {
    ...base.nsis,
    deleteAppDataOnUninstall: false
  }
}
