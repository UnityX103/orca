import { homedir } from 'node:os'
import { isAbsolute, resolve } from 'node:path'
import { withoutInheritedClaudeConfigDir } from '../claude/structured/launch/claude-config-dir-pin'
import { buildClaudeChildProcessEnv } from '../claude/child-process/claude-child-process-environment'
import { AgentSessionPreSpawnError } from '../native-chat/agent-session-wire/providers/structured-agent-session-adapter-errors'

function defaultBoBotHome(env: NodeJS.ProcessEnv): string {
  return resolve(env.HOME || env.USERPROFILE || homedir(), '.bobot')
}

export function bobotConfigHome(env: NodeJS.ProcessEnv): string {
  const configured = env.BOBOT_CONFIG_DIR?.trim()
  if (configured && !isAbsolute(configured)) {
    throw new AgentSessionPreSpawnError('BOBOT_CONFIG_DIR must be an absolute path')
  }
  return configured || defaultBoBotHome(env)
}

export function bobotEnvironment(
  base: Record<string, string>,
  overlay: NodeJS.ProcessEnv,
  pinnedHome?: string
): Record<string, string> {
  const env = withoutInheritedClaudeConfigDir(
    buildClaudeChildProcessEnv(overlay, { inheritedEnv: base })
  )
  const home = pinnedHome ?? bobotConfigHome(env)
  // Even an explicit default path changes BoBot's Keychain item.
  for (const key of Object.keys(env)) {
    if ((process.platform === 'win32' ? key.toUpperCase() : key) === 'BOBOT_CONFIG_DIR') {
      delete env[key]
    }
  }
  if (resolve(home) !== defaultBoBotHome(env)) {
    env.BOBOT_CONFIG_DIR = home
  }
  return env
}
