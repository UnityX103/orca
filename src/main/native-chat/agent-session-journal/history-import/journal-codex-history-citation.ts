import { codexWebCitationMessage } from '../../../codex/structured/items/codex-web-citations'
import type { JournalReplacementItem } from '../context-epochs/journal-epoch-replacement'
import {
  boundLegacyImportBody,
  type JournalPayloadLimits
} from '../item-lifecycle/journal-payload-bounds'
import type { createNewestItemWindow } from './journal-newest-item-window'
import type { createCodexHistoryPlacement } from './journal-codex-history-placement'

export function reviseCodexHistoryCitation(
  payload: unknown,
  segment: string,
  window: ReturnType<typeof createNewestItemWindow>,
  placement: ReturnType<typeof createCodexHistoryPlacement>,
  limits: JournalPayloadLimits
): void {
  const citation = codexWebCitationMessage(payload)
  if (!citation) {
    return
  }
  const key = `${segment}:${citation.id}`
  const previous = window.get(key)
  const body = previous?.body
  if (
    !previous ||
    body?.kind !== 'message' ||
    body.role !== 'assistant' ||
    body.blocks.length !== 1
  ) {
    return
  }
  const [block] = body.blocks
  if (block?.type !== 'text' || block.text !== citation.text) {
    return
  }
  const row: JournalReplacementItem = {
    ...previous,
    body: boundLegacyImportBody(
      { ...body, blocks: [{ ...block, text: citation.markdown }] },
      limits
    )
  }
  placement.keepPlacement(row, previous)
  window.upsert(key, row, 128)
}
