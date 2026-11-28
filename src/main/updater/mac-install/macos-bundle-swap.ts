import { runProcess } from '@orca/process-host'

const SWAP_BUNDLES = `
ObjC.import('Foundation')
ObjC.bindFunction('renamex_np', ['int', ['char *', 'char *', 'unsigned int']])
function run(paths) {
  const RENAME_SWAP = 2
  if ($.renamex_np(paths[0], paths[1], RENAME_SWAP) !== 0) {
    throw new Error('Could not atomically replace Orca.app')
  }
}
`

export async function swapMacAppBundles(staged: string, installed: string): Promise<void> {
  const result = await runProcess({
    program: '/usr/bin/osascript',
    args: ['-l', 'JavaScript', '-e', SWAP_BUNDLES, staged, installed],
    timeoutMs: 5_000
  })
  if (result.code !== 0) {
    throw new Error(`Could not swap Orca bundles: ${result.stderr.trim()}`)
  }
}
