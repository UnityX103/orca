import { mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { applyAgentWorkspaceTrustToSpawn } from '../agent-launch/trust/agent-workspace-trust-spawn'

describe('BoBot workspace trust', () => {
  it('persists trust for the selected workspace in the launched BoBot profile', async () => {
    const directory = mkdtempSync(join(tmpdir(), 'orca-bobot-trust-'))
    try {
      const profile = join(directory, 'profile')
      const workspace = join(directory, 'workspace')
      const configFile = join(profile, '.bobot.json')
      mkdirSync(profile)
      mkdirSync(workspace)
      const existingConfig = {
        projects: {
          '/other-project': { hasTrustDialogAccepted: false }
        }
      }
      writeFileSync(configFile, JSON.stringify(existingConfig))
      const launch = {
        launchAgent: 'bobot',
        worktreeId: `repo::${workspace}`,
        cwd: workspace,
        isFreshLaunch: true,
        env: { BOBOT_CONFIG_DIR: profile },
        claudeAuth: null,
        wslDistro: null,
        connectionId: null,
        spawnOptions: {}
      }

      await applyAgentWorkspaceTrustToSpawn({
        ...launch,
        store: undefined,
        settings: { agentWorkspaceTrustEnabled: false }
      })
      expect(JSON.parse(readFileSync(configFile, 'utf8'))).toEqual(existingConfig)

      await applyAgentWorkspaceTrustToSpawn({
        ...launch,
        store: undefined,
        settings: { agentWorkspaceTrustEnabled: true }
      })
      expect(JSON.parse(readFileSync(configFile, 'utf8'))).toEqual({
        projects: {
          ...existingConfig.projects,
          [workspace.replaceAll('\\', '/').normalize('NFC')]: { hasTrustDialogAccepted: true },
          [realpathSync.native(workspace).replaceAll('\\', '/').normalize('NFC')]: {
            hasTrustDialogAccepted: true
          }
        }
      })
    } finally {
      rmSync(directory, { recursive: true, force: true })
    }
  })
})
