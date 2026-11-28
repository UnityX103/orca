import { join } from 'node:path'
import { runProcess } from '@orca/process-host'

const identityComponents = [
  { path: '', identifier: 'com.stablyai.orca' },
  { path: 'Contents/Helpers/Orca Agents.app', identifier: 'com.stablyai.orca' },
  {
    path: 'Contents/Resources/Orca Computer Use.app',
    identifier: 'com.stablyai.orca.computer-use'
  },
  { path: 'Contents/Frameworks/Orca Helper.app', identifier: 'com.stablyai.orca.helper' }
] as const

export async function readSOrcaMacSigningIdentity(
  bundle: string,
  signal?: AbortSignal
): Promise<string[]> {
  return Promise.all(
    identityComponents.map(async ({ path, identifier }, index) => {
      const component = join(bundle, path)
      const verified = await runProcess({
        program: '/usr/bin/codesign',
        args: [
          '--verify',
          '--strict',
          ...(index === 0 ? ['--deep'] : []),
          '-R',
          `=identifier "${identifier}" and anchor apple generic`,
          component
        ],
        signal,
        timeoutMs: index === 0 ? 120_000 : 15_000
      })
      if (verified.code !== 0) {
        throw new Error('The Orca app and its permission helpers require Apple code signatures.')
      }
      const described = await runProcess({
        program: '/usr/bin/codesign',
        args: ['--display', '--requirements', '-', component],
        signal,
        timeoutMs: 5_000
      })
      const requirement = /^designated => (.+)$/m.exec(described.stdout + described.stderr)?.[1]
      if (
        described.code !== 0 ||
        !requirement ||
        !requirement.startsWith(`identifier "${identifier}" and anchor apple generic `) ||
        /\bcdhash\b/.test(requirement)
      ) {
        throw new Error(
          'The Orca app and its permission helpers require stable signing identities.'
        )
      }
      return requirement
    })
  )
}

export function sameSOrcaMacSigningIdentity(
  installed: readonly string[],
  replacement: readonly string[]
): boolean {
  return (
    installed.length === identityComponents.length &&
    replacement.length === installed.length &&
    installed.every((requirement, index) => requirement === replacement[index])
  )
}
