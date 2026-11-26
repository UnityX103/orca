import { expect, it } from 'vitest'
import { AgentHookServer } from '../../../agent-hooks/server/agent-hook-server'
import { OrcaRuntimeService } from '../../orca-runtime'

it('projects the current BoBot turn from a live terminal without recording a completed turn', async () => {
  const hooks = new AgentHookServer()
  const runtime = new OrcaRuntimeService(null, undefined, {
    onTerminalAgentStatus: (event) => hooks.ingestTerminalStatus(event),
    getAgentStatusSnapshotForPane: (pane) => hooks.getStatusSnapshotForPane(pane)
  })
  const ptyId = 'pty-bobot'
  const tabId = '11111111-1111-4111-8111-111111111111'
  const leafId = '22222222-2222-4222-8222-222222222222'
  const pane = `${tabId}:${leafId}`
  const rule = '─'.repeat(104)
  const footer = '  ⏵⏵ bypass permissions on (shift+tab  ·       ● high · /…'
  runtime.setPtyController({
    write: () => true,
    kill: () => true,
    getForegroundProcess: async () => 'bobot',
    getSize: () => ({ cols: 104, rows: 28 })
  })
  runtime.registerPty(ptyId, 'repo::/workspace', null, {
    tabId,
    leafId,
    incarnationId: 'bobot-incarnation',
    agentLaunchAuthority: { launchToken: 'bobot-test-launch', launchAgent: 'bobot' }
  })

  let receivedAt = 1_700_000_000_000
  const render = async (lines: string[]) => {
    runtime.onPtyData(ptyId, `\x1b[2J\x1b[H${lines.join('\r\n')}`, receivedAt++)
    await runtime.serializeHiddenOutputRecoveryBuffer(ptyId)
    return hooks.getStatusSnapshotForPane(pane)[0]
  }
  const composer = [rule, '[ /workspace ] (main)', '▶ ', rule]
  const prompt = '❯ Reply with the fixture marker.'
  const spinner = '◇ Wibbling...'
  try {
    expect(await render([...composer, footer])).toBeUndefined()
    expect(await render([prompt, spinner, '', ...composer, footer])).toMatchObject({
      agentType: 'bobot',
      state: 'working'
    })
    const idle = await render([prompt, spinner, '⏺ Fixture marker', ...composer, footer])
    expect(idle).toMatchObject({
      agentType: 'bobot',
      state: 'done',
      sessionBoundary: true
    })
    expect(idle?.turnEndedAt).toBeUndefined()
    const wrappedComposer = [rule, '[/private/path/ ]', ' workspace', '▶', rule]
    expect(
      await render([
        prompt,
        '⏺ Fixture marker',
        '❯ Another request',
        ...wrappedComposer,
        '  esc to interrupt',
        '  ● high · /effort'
      ])
    ).toMatchObject({ agentType: 'bobot', state: 'working' })
  } finally {
    await runtime.onPtyExit(ptyId, 0)
    await hooks.stop()
  }
})
