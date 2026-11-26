// The dispatch instructions an owner typed for a CNB record, kept per work item so closing the detail
// (or creating its workspace and coming back) never loses them. Nothing here starts anything by itself:
// the owner dispatches again from the panel once the workspace exists.
import type { CnbTaskDispatchTarget } from '../../../../../../shared/cnb/cnb-task-dispatch'

const STORAGE_KEY = 'orca.cnb.dispatchDrafts'
const DRAFT_TTL_MS = 7 * 24 * 60 * 60_000
const MAX_DRAFTS = 50

type Draft = { spec: string; savedAt: number }

type DraftBook = Record<string, Draft>

function targetKey(target: CnbTaskDispatchTarget): string {
  return `${target.repoId}\u0000${target.type}\u0000${target.number}`
}

function isDraft(value: unknown): value is Draft {
  return (
    value !== null &&
    typeof value === 'object' &&
    'spec' in value &&
    typeof value.spec === 'string' &&
    'savedAt' in value &&
    typeof value.savedAt === 'number' &&
    Number.isFinite(value.savedAt)
  )
}

function readBook(): DraftBook {
  if (typeof localStorage === 'undefined') {
    return {}
  }
  try {
    const parsed: unknown = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}')
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return {}
    }
    const entries: [string, unknown][] = Object.entries(parsed)
    return Object.fromEntries(
      entries.filter((entry): entry is [string, Draft] => isDraft(entry[1]))
    )
  } catch {
    return {}
  }
}

function writeBook(book: DraftBook): void {
  if (typeof localStorage === 'undefined') {
    return
  }
  // Keep the newest drafts only, so a long history never grows without bound.
  const entries = Object.entries(book)
    .sort((a, b) => a[1].savedAt - b[1].savedAt)
    .slice(-MAX_DRAFTS)
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(Object.fromEntries(entries)))
  } catch {
    // Storage full or disabled: the draft stays in this detail's state.
  }
}

/** The instructions last typed for a work item; empty when none were kept. */
export function readCnbDispatchDraft(target: CnbTaskDispatchTarget): string {
  const draft = readBook()[targetKey(target)]
  return draft && Date.now() - draft.savedAt < DRAFT_TTL_MS ? draft.spec : ''
}

/** Keeps the owner's instructions; an empty text forgets them. */
export function saveCnbDispatchDraft(target: CnbTaskDispatchTarget, spec: string): void {
  const book = readBook()
  const key = targetKey(target)
  if (spec.trim() === '') {
    delete book[key]
  } else {
    book[key] = { spec, savedAt: Date.now() }
  }
  writeBook(book)
}
