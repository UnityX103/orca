import type { HeadlessEmulator } from '../../../daemon/emulation/headless-emulator'
import type { AgentStatusIpcPayload } from '../../../../shared/agent-status/contracts/agent-status-ipc-payload'
import type { ParsedAgentStatusPayload } from '../../../../shared/agent-status/contracts/agent-status-types'
import { AGENT_STATUS_STALE_AFTER_MS } from '../../../../shared/agent-status/contracts/agent-status-freshness'

const DIVIDER = /^\u2500{8,}$/
const COMPOSER = /^\u25b6(?:\s|$)/
const WORKSPACE = /^\[.+ \](?: \(|$)/
const INTERRUPT_HINT = /\besc to interrupt\b/
const COMPOSER_FOOTER = /\(shift\+tab\b|\? for shortcuts\b| \u00b7 \/effort\b/
const SPINNER = /^[\u25c7\u25c6]\s+.+(?:\.\.\.|\u2026)/

function readComposerActivity(emulator: HeadlessEmulator): 'working' | 'done' | null {
  if (emulator.isSynchronizedOutput) {
    return null
  }
  const lines = emulator
    .getVisibleLines()
    .map((line) => line.trimEnd())
    .filter(Boolean)
  const bottom = lines.findLastIndex((line) => DIVIDER.test(line))
  const top = lines.findLastIndex((line, index) => index < bottom && DIVIDER.test(line))
  if (top === -1 || !WORKSPACE.test(lines[top + 1] ?? '')) {
    return null
  }
  if (!lines.slice(top + 2, bottom).some((line) => COMPOSER.test(line))) {
    return null
  }
  const footer = lines.slice(bottom + 1).join(' ')
  if (INTERRUPT_HINT.test(footer) || SPINNER.test(lines[top - 1] ?? '')) {
    return 'working'
  }
  return COMPOSER_FOOTER.test(footer) ? 'done' : null
}

export function observeBobotTerminalStatus(
  emulator: HeadlessEmulator,
  readStatus: () => AgentStatusIpcPayload | undefined,
  observedAt: number
): ParsedAgentStatusPayload | null {
  const state = readComposerActivity(emulator)
  if (state === null) {
    return null
  }
  const previous = readStatus()
  const bobot = previous?.agentType === 'bobot' ? previous : undefined
  if (bobot?.observation?.origin === 'hook' || (state === 'done' && !bobot)) {
    return null
  }
  if (
    bobot?.state === state &&
    !bobot.restoredUnconfirmed &&
    !bobot.providerSessionOnly &&
    observedAt - (bobot.evidenceObservedAt ?? bobot.receivedAt) < AGENT_STATUS_STALE_AFTER_MS / 2
  ) {
    return null
  }
  return {
    agentType: 'bobot',
    state,
    prompt: '',
    // An idle composer can't attest that the worker completed its task.
    ...(state === 'done' ? { sessionBoundary: true } : {})
  }
}
