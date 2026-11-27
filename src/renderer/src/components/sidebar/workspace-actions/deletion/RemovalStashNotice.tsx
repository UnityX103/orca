import { useSyncExternalStore } from 'react'
import { Bookmark } from 'lucide-react'
import { useTranslate } from '@/i18n/use-translate'
import {
  countNativeChatStashEntriesOwnedBy,
  subscribeToAnyNativeChatStash
} from '@/components/native-chat/drafts/native-chat-prompt-stash-store'
import type { ExecutionHostId } from '../../../../../../shared/execution-host/execution-host'

/** Says a removal also clears the workspace's stashed prompts; empty when none are stashed. */
export function RemovalStashNotice({
  workspaceIds,
  executionHostId
}: {
  workspaceIds: readonly string[]
  /** A single workspace's host; omitted for a batch, whose workspaces may span hosts. */
  executionHostId?: ExecutionHostId | null
}): React.JSX.Element | null {
  const t = useTranslate()
  const count = useSyncExternalStore(subscribeToAnyNativeChatStash, () =>
    workspaceIds.reduce(
      (sum, workspaceId) =>
        sum +
        countNativeChatStashEntriesOwnedBy(
          executionHostId ? { workspaceId, executionHostId } : { workspaceId }
        ),
      0
    )
  )
  if (count === 0) {
    return null
  }
  return (
    <div className="flex items-start gap-2 rounded-md border border-border/70 bg-muted/35 px-3 py-2 text-xs text-muted-foreground">
      <Bookmark className="mt-0.5 size-3.5 shrink-0" />
      <span className="min-w-0 flex-1">
        {t(
          'components.native-chat.stash.clearedOnRemoval',
          '{{count}} stashed prompts will also be cleared.',
          {
            count,
            defaultValue_one: '{{count}} stashed prompt will also be cleared.'
          }
        )}
      </span>
    </div>
  )
}
