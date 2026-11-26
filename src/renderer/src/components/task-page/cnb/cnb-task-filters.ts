import type { CnbListFilters, CnbTaskKind } from '../../../../../shared/cnb/cnb-tasks'

export type CnbMode = CnbTaskKind | 'missions'

export type CnbRepoOption = { id: string; slug: string }

/** Presets mirror GitHub's state chips, keeping CNB's merged list distinct from closed. */
export const CNB_ISSUE_PRESETS = ['open', 'closed', 'all'] as const
export type CnbIssuePreset = (typeof CNB_ISSUE_PRESETS)[number]
export const CNB_PULL_PRESETS = ['open', 'merged', 'closed', 'all'] as const
export type CnbPullPreset = (typeof CNB_PULL_PRESETS)[number]

export type CnbParticipantPreset = 'everyone' | 'mine' | 'reviewing'

export function emptyCnbFilters(): CnbListFilters {
  return { state: 'open', keyword: '', authors: [], assignees: [], reviewers: [], labels: [] }
}

/** Narrow an arbitrary preset string, since resume state stores it loosely. */
export function normalizeCnbPreset(
  value: string,
  kind: CnbTaskKind
): CnbIssuePreset | CnbPullPreset {
  if (kind === 'pull-requests') {
    for (const preset of CNB_PULL_PRESETS) {
      if (preset === value) {
        return preset
      }
    }
    return 'open'
  }
  for (const preset of CNB_ISSUE_PRESETS) {
    if (preset === value) {
      return preset
    }
  }
  return 'open'
}

/** Presets double as the list's state filter so one chip row drives both. */
export function filtersForPreset(args: {
  preset: CnbIssuePreset | CnbPullPreset
  kind: CnbTaskKind
  participant: CnbParticipantPreset
  viewer: string | null
  labels: readonly string[]
}): CnbListFilters {
  const { preset, kind, participant, viewer, labels } = args
  const filters = emptyCnbFilters()
  filters.state = preset === 'open' ? 'open' : preset === 'closed' ? 'closed' : 'all'
  if (kind === 'pull-requests' && preset === 'merged') {
    filters.state = 'all'
  }
  filters.labels = [...labels]
  if (participant !== 'everyone' && viewer) {
    if (kind === 'issues') {
      if (participant === 'mine') {
        filters.assignees = [viewer]
      }
    } else if (participant === 'mine') {
      filters.authors = [viewer]
    } else {
      filters.reviewers = [viewer]
    }
  }
  return filters
}

/** Merged pulls arrive inside CNB's closed window; filter them locally to keep the chip honest. */
export function rowMatchesPreset(
  row: { state: string },
  preset: CnbIssuePreset | CnbPullPreset,
  kind: CnbTaskKind
): boolean {
  if (kind === 'issues') {
    return preset === 'all' || row.state === preset
  }
  if (preset === 'all') {
    return true
  }
  if (preset === 'merged') {
    return row.state === 'merged'
  }
  if (preset === 'closed') {
    return row.state === 'closed'
  }
  return row.state === 'open'
}
