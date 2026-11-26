import type { AgentSessionModelOption } from '../../shared/agent-session/options/model-catalog/agent-session-model-option'
import { record, text } from '../claude/structured/launch/claude-structured-model-catalog'

/** BoBot's initialize lists the signed-in account's models but supplies presets for direct API keys. */
export async function listBobotDirectApiModels(
  launchEnv: NodeJS.ProcessEnv,
  settings: unknown,
  signal?: AbortSignal
): Promise<AgentSessionModelOption[] | null> {
  const configured = record(record(record(settings)?.effective)?.env)
  const read = (key: string): string | null => text(launchEnv[key]) ?? text(configured?.[key])
  const base = read('BOBOT_BASE_URL')
  const apiKey = read('BOBOT_API_KEY')
  if (!base || !apiKey) {
    return null
  }
  const url = URL.parse(base)
  if (!url || !['http:', 'https:'].includes(url.protocol) || url.username || url.password) {
    throw new Error('BoBot has an invalid model API URL')
  }
  const path = url.pathname.replace(/\/+$/, '')
  url.pathname = `${path}${path.endsWith('/v1') ? '' : '/v1'}/models`
  const format = read('BOBOT_API_FORMAT')
  const headers: Record<string, string> =
    format === 'openai' || format === 'openai-responses'
      ? { Authorization: `Bearer ${apiKey}` }
      : { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01' }
  const timeout = AbortSignal.timeout(10_000)
  const combined = signal ? AbortSignal.any([signal, timeout]) : timeout
  const models = new Map<string, AgentSessionModelOption>()
  const cursors = new Set<string>()
  while (true) {
    const response = await fetch(url, { headers, redirect: 'error', signal: combined })
    if (!response.ok) {
      throw new Error(`BoBot model API returned HTTP ${response.status}`)
    }
    const page = record(await response.json())
    if (!Array.isArray(page?.data)) {
      throw new Error('BoBot model API returned an invalid model list')
    }
    for (const entry of page.data) {
      const row = record(entry)
      const id = text(row?.id)
      if (id && !models.has(id)) {
        models.set(id, {
          id,
          label: text(row?.display_name) ?? text(row?.displayName) ?? id,
          isDefault: row?.is_default === true,
          efforts: [],
          effortsKnown: false
        })
      }
    }
    if (page.has_more !== true) {
      return [...models.values()]
    }
    const cursor = text(page.last_id)
    if (!cursor || cursors.has(cursor)) {
      throw new Error('BoBot model API returned an invalid pagination cursor')
    }
    cursors.add(cursor)
    url.searchParams.set('after_id', cursor)
  }
}
