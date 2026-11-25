import { homedir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { bobotEnvironment } from './bobot-environment'

describe('BoBot account isolation', () => {
  it('uses the default Keychain identity without inheriting another agent account', () => {
    const home = homedir()
    const env = bobotEnvironment(
      {
        HOME: home,
        BOBOT_CONFIG_DIR: join(home, '.bobot-other'),
        CLAUDE_CONFIG_DIR: join(home, '.claude-other'),
        ANTHROPIC_API_KEY: 'inherited-credential'
      },
      {},
      join(home, '.bobot')
    )
    expect(env.BOBOT_CONFIG_DIR).toBeUndefined()
    expect(env.CLAUDE_CONFIG_DIR).toBeUndefined()
    expect(env.ANTHROPIC_API_KEY).toBeUndefined()
  })

  it('keeps the pinned BoBot home and accepts explicit BoBot launch credentials', () => {
    const home = homedir()
    const pinned = join(home, '.bobot-pinned')
    const env = bobotEnvironment(
      { HOME: home },
      { BOBOT_CONFIG_DIR: join(home, '.bobot-new'), ANTHROPIC_API_KEY: 'explicit-credential' },
      pinned
    )
    expect(env.BOBOT_CONFIG_DIR).toBe(pinned)
    expect(env.ANTHROPIC_API_KEY).toBe('explicit-credential')
  })
})
