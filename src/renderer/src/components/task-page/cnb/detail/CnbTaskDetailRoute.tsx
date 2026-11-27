import { CnbIssueDetailPanel } from './CnbIssueDetailPanel'
import { CnbPullDetailPanel } from './CnbPullDetailPanel'
import { cnbRowWorkItemType } from '../cnb-work-item'
import type { PreloadApi } from '../../../../../../preload/api-types'
import type { CnbTaskRow } from '../../../../../../shared/cnb/cnb-tasks'

type CnbApi = NonNullable<PreloadApi['cnb']>

/** Routes a selected CNB row to its issue or PR detail panel; PRs can open on the Checks tab. */
export function CnbTaskDetailRoute({
  api,
  row,
  initialChecks,
  onBack,
  onChanged,
  onStartWorkspace
}: {
  api: CnbApi
  row: CnbTaskRow
  initialChecks: boolean
  onBack: () => void
  onChanged: () => void
  onStartWorkspace: (row: CnbTaskRow) => void
}): React.JSX.Element {
  return cnbRowWorkItemType(row) === 'pr' ? (
    <CnbPullDetailPanel
      api={api}
      row={row}
      initialTab={initialChecks ? 'checks' : undefined}
      onBack={onBack}
      onChanged={onChanged}
      onStartWorkspace={onStartWorkspace}
    />
  ) : (
    <CnbIssueDetailPanel
      api={api}
      row={row}
      onBack={onBack}
      onChanged={onChanged}
      onStartWorkspace={onStartWorkspace}
    />
  )
}
