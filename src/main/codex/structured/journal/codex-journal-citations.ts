import { createHash } from 'node:crypto'
import type { AgentJournalItemIdentity } from '../../../../shared/agent-session/journal/agent-session-journal-identity'
import type { AgentJournalRowAttribution } from '../../../../shared/agent-session/journal/agent-session-journal-types'
import { readRecord } from '../../app-server/codex-item-field-readers'
import { readCodexTurnId } from '../../app-server/codex-structured-thread-facts'
import type { CodexThreadItem } from '../items/codex-thread-item-identity'
import { codexWebCitationMessage } from '../items/codex-web-citations'
import { CODEX_JOURNAL_ADMITTED } from './codex-structured-journal-contracts'
import { appendCodexLifecycleItem, publishCodexLifecycle } from './codex-structured-journal-sink'
import type { StructuredAgentSessionEventSink } from '../../../native-chat/agent-session-wire/journal-ingress/structured-agent-session-event-sink'

type Attribution = AgentJournalRowAttribution & { observedAt?: number }
type CitedMessage = NonNullable<ReturnType<typeof codexWebCitationMessage>>
type KnownMessage = { digest: string; identity: AgentJournalItemIdentity; attribution: Attribution }

const MAX_RECENT_MESSAGES = 32
const MAX_PENDING_MARKDOWN_LENGTH = 64 * 1024

function remember<T>(entries: Map<string, T>, key: string, item: T): void {
  entries.delete(key)
  entries.set(key, item)
  if (entries.size > MAX_RECENT_MESSAGES) {
    entries.delete(entries.keys().next().value!)
  }
}

function digest(text: string): string {
  return createHash('sha256').update(text).digest('hex')
}

function citationKey(threadId: string, turnId: string, itemId: string): string {
  return JSON.stringify([threadId, turnId, itemId])
}

/** The raw response and the completed transcript row can arrive in either order. */
export class CodexJournalCitations {
  private readonly pending = new Map<string, CitedMessage>()
  private readonly completed = new Map<string, KnownMessage>()

  constructor(private readonly sink: StructuredAgentSessionEventSink) {}

  complete(item: CodexThreadItem, threadId: string, turnId: string | null) {
    const original = item.text
    if (
      !turnId ||
      item.type !== 'agentMessage' ||
      item.delivery === 'async' ||
      typeof original !== 'string' ||
      !original.includes('\uE200cite')
    ) {
      return null
    }
    const key = citationKey(threadId, turnId, item.id)
    const citation = this.pending.get(key)
    const withCitations = citation?.text === original ? { ...item, text: citation.markdown } : item
    return {
      item: withCitations,
      commit: (identity: AgentJournalItemIdentity, attribution: Attribution) => {
        this.pending.delete(key)
        if (withCitations === item) {
          remember(this.completed, key, { digest: digest(original), identity, attribution })
        }
      }
    }
  }

  rawResponse(threadId: string, params: unknown) {
    const turnId = readCodexTurnId(params)
    const citation = codexWebCitationMessage(readRecord(params).item)
    if (!turnId || !citation) {
      return CODEX_JOURNAL_ADMITTED
    }
    const key = citationKey(threadId, turnId, citation.id)
    const completed = this.completed.get(key)
    if (!completed) {
      if (citation.markdown.length <= MAX_PENDING_MARKDOWN_LENGTH) {
        remember(this.pending, key, citation)
      }
      return CODEX_JOURNAL_ADMITTED
    }
    if (completed.digest !== digest(citation.text)) {
      return CODEX_JOURNAL_ADMITTED
    }
    const admission = appendCodexLifecycleItem(
      this.sink,
      completed.identity,
      { kind: 'message', role: 'assistant', blocks: [{ type: 'text', text: citation.markdown }] },
      completed.attribution
    )
    if (!admission.accepted) {
      return admission
    }
    const published = publishCodexLifecycle(this.sink)
    if (published.accepted) {
      this.completed.delete(key)
    }
    return published
  }
}
