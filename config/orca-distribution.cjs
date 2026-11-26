const macInstaller = 'orca-macos-arm64.dmg'
const windowsInstaller = 'orca-windows-setup.exe'

function buildBaseVersion(...versions) {
  const bases = ['1.4.278', ...versions].map((version) => {
    const base = /^\d+\.\d+\.\d+(?=$|[-+])/.exec(version)?.[0]
    if (!base) {
      throw new Error(`Invalid Orca version: ${version}`)
    }
    return base
  })
  const { compare } = new Intl.Collator('en', { numeric: true })
  return bases.sort(compare).at(-1)
}

module.exports = { macInstaller, windowsInstaller, buildBaseVersion }
