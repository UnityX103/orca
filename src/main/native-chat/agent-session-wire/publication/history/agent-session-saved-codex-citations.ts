import { parseAgentJournalItemKey } from '../../../../../shared/agent-session/journal/agent-session-journal-item-key'
import type { AgentSessionHistoryPage } from '../../../../../shared/agent-session/agent-session-wire'
import { parseJsonObject } from '../../../../ai-vault/parsing/session-json-object'
import { readRecord, readString } from '../../../../codex/app-server/codex-item-field-readers'
import { codexWebCitationMessage } from '../../../../codex/structured/items/codex-web-citations'
import { resolveSessionFilePath } from '../../../session-file-resolver'
import { readCodexRolloutBytes } from '../../../transcript-history/codex/codex-rollout-history-stream'
import { splitTranscriptStreamLines } from '../../../transcript-streaming/transcript-stream-lines'
import type { SqlAgentSessionJournal } from '../../../agent-session-journal/journal-sql-store'
import {
  historyContentBytes,
  submissionBytesByItemId,
  type HistoryReader
} from './agent-session-history-page-bounds'

const MAX_ROLLOUT_BYTES = 16 * 1024 * 1024
const MAX_INDEXED_MESSAGES = 128
const MAX_MESSAGE_CHARS = 16 * 1024
const lookupByJournal = new WeakMap<SqlAgentSessionJournal, Promise<Map<string, string>>>()

/** Older journal rows saved only the marker. Recover its URL from the same provider turn. */
export async function withSavedCodexCitations(
  journal: SqlAgentSessionJournal,
  page: AgentSessionHistoryPage,
  reader: HistoryReader
): Promise<AgentSessionHistoryPage> {
  const handle = journal.identity.providerHandle
  if (handle?.transport !== 'codex-app-server') {
    return page
  }
  const candidates = page.items.flatMap((item, index) => {
    const { body } = item
    if (
      item.shortened ||
      !journal.wroteBeforeOpen(item.sequence) ||
      body.kind !== 'message' ||
      body.role !== 'assistant' ||
      !body.blocks.some((block) => block.type === 'text' && block.text.includes('\uE200cite'))
    ) {
      return []
    }
    const id = parseAgentJournalItemKey(item.itemId)
    return id?.provider === 'codex' && id.threadId === handle.nativeId
      ? [{ item, index, body, turnId: id.turnId }]
      : []
  })
  if (!candidates.length) {
    return page
  }
  let lookup = lookupByJournal.get(journal)
  if (!lookup) {
    lookup = readSavedCitations(handle.nativeId).catch(() => new Map<string, string>())
    lookupByJournal.set(journal, lookup)
  }
  const citations = await lookup
  const items = page.items.slice()
  let changed = false
  for (const { item, index, body, turnId } of candidates) {
    const blocks = body.blocks.map((block) => {
      const markdown = block.type === 'text' && citations.get(JSON.stringify([turnId, block.text]))
      return markdown ? { ...block, text: markdown } : block
    })
    if (blocks.some((block, at) => block !== body.blocks[at])) {
      items[index] = { ...item, body: { ...body, blocks } }
      changed = true
    }
  }
  if (!changed) {
    return page
  }
  const forms = items.map(reader.form)
  const bytes = historyContentBytes(
    forms,
    page.removedItemIds,
    submissionBytesByItemId(page.submissions)
  )
  return bytes <= reader.budgetBytes ? { ...page, items: forms.map(({ item }) => item) } : page
}

async function readSavedCitations(threadId: string): Promise<Map<string, string>> {
  const citations = new Map<string, string>()
  const signal = AbortSignal.timeout(1500)
  const path = await resolveSessionFilePath('codex', threadId, {}, signal)
  if (!path) {
    return citations
  }
  const messages = new Map<string, { id: string; text: string; markdown?: string } | null>()
  const keysById = new Map<string, string>()
  let header = false
  for await (const { line, terminated } of splitTranscriptStreamLines(
    readCodexRolloutBytes(path, MAX_ROLLOUT_BYTES),
    256 * 1024
  )) {
    if (signal.aborted) {
      break
    }
    if (
      !terminated ||
      !line ||
      (header && !line.includes('\uE200cite') && !line.includes('\\ue200cite'))
    ) {
      continue
    }
    const record = parseJsonObject(line)
    const payload = readRecord(record?.payload)
    if (!header) {
      if (record?.type !== 'session_meta' || payload.id !== threadId) {
        return citations
      }
      header = true
    } else if (record?.type === 'event_msg' && payload.type === 'item_completed') {
      const item = readRecord(payload.item)
      const id = readString(item, 'id')
      const turn = readString(payload, 'turn_id')
      if (!id || !turn || item.type !== 'AgentMessage') {
        continue
      }
      const text = Array.isArray(item.content)
        ? item.content.map((value: unknown) => readString(readRecord(value), 'text') ?? '').join('')
        : ''
      if (!text || text.length > MAX_MESSAGE_CHARS) {
        continue
      }
      const key = JSON.stringify([turn, text])
      const previous = messages.get(key)
      if (previous === undefined && messages.size < MAX_INDEXED_MESSAGES) {
        messages.set(key, { id, text })
        keysById.set(id, key)
      } else if (previous && previous.id !== id) {
        messages.set(key, null)
      }
    } else if (record?.type === 'response_item') {
      const citation = codexWebCitationMessage(payload)
      const key = citation && keysById.get(citation.id)
      const message = key ? messages.get(key) : null
      if (message && citation?.id === message.id && citation.text === message.text) {
        message.markdown = citation.markdown
      }
    }
  }
  for (const [key, message] of messages) {
    if (message?.markdown) {
      citations.set(key, message.markdown)
    }
  }
  return citations
}
