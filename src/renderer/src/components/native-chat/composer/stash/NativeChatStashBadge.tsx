import { Bookmark } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import { useTranslate } from '@/i18n/use-translate'

/** The composer's stash control: it appears with the first entry, and pulses once per stash. */
export function NativeChatStashBadge({
  count,
  menuOpen,
  pulseKey,
  disabled,
  onToggle
}: {
  count: number
  menuOpen: boolean
  /** Bumped per stash; a new key replays the one-shot pulse. 0 means never pulsed. */
  pulseKey: number
  disabled?: boolean
  onToggle: () => void
}): React.JSX.Element | null {
  const t = useTranslate()
  if (count === 0) {
    return null
  }
  const pulsed = pulseKey > 0
  const label = t('components.native-chat.stash.badgeLabel', 'Stashed prompts: {{count}}', {
    count
  })
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          variant={menuOpen ? 'secondary' : 'ghost'}
          size="icon-sm"
          aria-label={label}
          aria-expanded={menuOpen}
          data-native-chat-stash-badge="true"
          // The count remounts per stash so its pulse restarts; no timer has to end it.
          data-stash-pulse={pulsed ? pulseKey % 2 : undefined}
          disabled={disabled}
          onMouseDown={(event) => event.preventDefault()}
          onClick={onToggle}
          className="pointer-coarse:size-11 relative"
        >
          <Bookmark className="size-4" />
          <span
            key={pulseKey}
            aria-hidden="true"
            className={`absolute -right-0.5 -top-0.5 min-w-3.5 rounded-full bg-secondary px-0.5 text-3xs font-medium text-chat-foreground-strong tabular-nums ${
              pulsed ? 'native-chat-stash-count-pulse motion-reduce:animate-none' : ''
            }`}
          >
            {count}
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent side="top" sideOffset={4}>
        {label}
      </TooltipContent>
    </Tooltip>
  )
}
