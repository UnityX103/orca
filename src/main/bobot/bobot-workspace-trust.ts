import { existsSync } from 'node:fs'
import { isAbsolute, join } from 'node:path'
import { grantClaudeWorkspaceTrust } from '../claude/configuration/claude-folder-trust-file'

export async function markBobotWorkspaceTrusted(
  workspacePath: string,
  home: string,
  env: NodeJS.ProcessEnv
): Promise<void> {
  const configDir = env.BOBOT_CONFIG_DIR
  if (configDir !== undefined && !isAbsolute(configDir)) {
    return
  }
  const legacyConfig = join((configDir ?? join(home, '.bobot')).normalize('NFC'), '.config.json')
  const name = env.BOBOT_CUSTOM_OAUTH_URL ? '.bobot-custom-oauth.json' : '.bobot.json'
  const configFile = existsSync(legacyConfig) ? legacyConfig : join(configDir ?? home, name)
  await grantClaudeWorkspaceTrust(
    { configFile, keyStyle: process.platform === 'win32' ? 'win32' : 'posix' },
    workspacePath
  )
}
