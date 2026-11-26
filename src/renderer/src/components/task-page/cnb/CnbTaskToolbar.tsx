import { LoaderCircle, Plus, RefreshCw, Search, Tag, X } from 'lucide-react'
import { useState } from 'react'
import { cn } from '@/lib/class-names'
import { useTranslate } from '@/i18n/use-translate'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip'
import TaskProjectSourceCombobox from '@/components/task-page/source-selection/task-project-source-combobox'
import type { Repo } from '../../../../../shared/repository/repo-types'
import type { TaskProjectPickerGroup } from '../../../../../shared/work-items/task-repo-selection'
import type { CnbMode, CnbParticipantPreset } from './cnb-task-filters'

const STATE_CHIP =
  'rounded-md border px-2.5 py-1 text-xs font-medium transition border-border/60 bg-background text-foreground shadow-xs hover:bg-muted/60'
const ACTIVE_CHIP =
  'rounded-md border px-2.5 py-1 text-xs font-medium transition border-border/50 bg-foreground/90 text-background shadow-xs'

function Chip({
  label,
  active,
  onClick
}: {
  label: string
  active: boolean
  onClick: () => void
}): React.JSX.Element {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(active ? ACTIVE_CHIP : STATE_CHIP)}
    >
      {label}
    </button>
  )
}

export function CnbTaskToolbar({
  mode,
  onModeChange,
  pickerGroups,
  selectedIds,
  onSelectionChange,
  onSelectAll,
  getRepoHostLabel,
  stateChips,
  activeState,
  onStateChange,
  participantChips,
  activeParticipant,
  onParticipantChange,
  searchValue,
  onSearchChange,
  onSearchSubmit,
  onSearchClear,
  labelOptions,
  activeLabels,
  onToggleLabel,
  onRefresh,
  refreshing,
  createDisabled,
  onCreateIssue
}: {
  mode: CnbMode
  onModeChange: (mode: CnbMode) => void
  pickerGroups: TaskProjectPickerGroup<Repo>[]
  selectedIds: ReadonlySet<string>
  onSelectionChange: (next: ReadonlySet<string>) => void
  onSelectAll: () => void
  getRepoHostLabel: (repo: Repo) => string | null
  stateChips: { id: string; label: string }[]
  activeState: string
  onStateChange: (id: string) => void
  participantChips: { id: CnbParticipantPreset; label: string }[]
  activeParticipant: CnbParticipantPreset
  onParticipantChange: (id: CnbParticipantPreset) => void
  searchValue: string
  onSearchChange: (value: string) => void
  onSearchSubmit: () => void
  onSearchClear: () => void
  labelOptions: string[]
  activeLabels: readonly string[]
  onToggleLabel: (label: string) => void
  onRefresh: () => void
  refreshing: boolean
  createDisabled: boolean
  onCreateIssue: () => void
}): React.JSX.Element {
  const t = useTranslate()
  const [labelOpen, setLabelOpen] = useState(false)
  const modes: { id: CnbMode; label: string }[] = [
    { id: 'issues', label: t('cnb.tasks.issues', 'Issues') },
    { id: 'pull-requests', label: t('cnb.tasks.pulls', 'Pull requests') },
    { id: 'missions', label: t('cnb.tasks.missions', 'Missions') }
  ]
  const showFilters = mode !== 'missions'
  return (
    <div className="flex min-w-0 flex-col gap-2.5 rounded-md rounded-b-none border border-border/50 bg-muted/35 px-3 py-2.5">
      <div className="flex min-w-0 flex-wrap items-center gap-2">
        <div className="flex items-center gap-1">
          {modes.map((entry) => (
            <Chip
              key={entry.id}
              label={entry.label}
              active={mode === entry.id}
              onClick={() => onModeChange(entry.id)}
            />
          ))}
        </div>
        <div className="min-w-0 max-w-[220px] shrink-0">
          <TaskProjectSourceCombobox
            groups={pickerGroups}
            selected={selectedIds}
            getRepoHostLabel={getRepoHostLabel}
            onChange={onSelectionChange}
            onSelectAll={onSelectAll}
            triggerClassName="h-8 w-auto max-w-[220px]"
          />
        </div>
      </div>

      {showFilters ? (
        <div className="flex flex-wrap items-center gap-1.5">
          <div className="flex flex-wrap gap-1.5">
            {stateChips.map((chip) => (
              <Chip
                key={chip.id}
                label={chip.label}
                active={activeState === chip.id}
                onClick={() => onStateChange(chip.id)}
              />
            ))}
          </div>
          <span aria-hidden className="mx-0.5 h-4 w-px bg-border/60" />
          <div className="flex flex-wrap gap-1.5">
            {participantChips.map((chip) => (
              <Chip
                key={chip.id}
                label={chip.label}
                active={activeParticipant === chip.id}
                onClick={() => onParticipantChange(chip.id)}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex min-w-0 flex-wrap items-center gap-2">
        {showFilters ? (
          <div className="relative min-w-0 flex-1 basis-64">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  onSearchSubmit()
                }
              }}
              placeholder={
                mode === 'pull-requests'
                  ? t('cnb.tasks.searchPulls', 'Search pull request titles…')
                  : t('cnb.tasks.searchIssues', 'Search issues…')
              }
              density="compact"
              inset="leadingIcon"
              adornment="trailing"
            />
            {searchValue ? (
              <button
                type="button"
                aria-label={t('cnb.tasks.clearSearch', 'Clear search')}
                onClick={onSearchClear}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground transition hover:text-foreground"
              >
                <X className="size-4" />
              </button>
            ) : null}
          </div>
        ) : (
          <div className="flex-1" />
        )}
        {showFilters ? (
          <Popover open={labelOpen} onOpenChange={setLabelOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                size="sm"
                className="h-8 shrink-0"
                aria-label={t('cnb.tasks.filterLabels', 'Filter by label')}
              >
                <Tag className="size-3.5" />
                {t('cnb.tasks.labelsButton', 'Labels')}
                {activeLabels.length > 0 ? (
                  <span className="rounded-full bg-primary px-1.5 text-[10px] text-primary-foreground">
                    {activeLabels.length}
                  </span>
                ) : null}
              </Button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-64">
              {labelOptions.length === 0 ? (
                <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                  {t('cnb.tasks.noLabelsAvailable', 'No labels on the selected projects.')}
                </p>
              ) : (
                <ul className="scrollbar-sleek max-h-64 overflow-y-auto">
                  {labelOptions.map((label) => {
                    const active = activeLabels.includes(label)
                    return (
                      <li key={label}>
                        <button
                          type="button"
                          aria-pressed={active}
                          onClick={() => onToggleLabel(label)}
                          className={cn(
                            'flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left text-xs transition hover:bg-accent hover:text-accent-foreground',
                            active && 'font-medium text-foreground'
                          )}
                        >
                          <span
                            className={cn(
                              'inline-flex size-3.5 items-center justify-center rounded border',
                              active ? 'border-primary bg-primary' : 'border-border'
                            )}
                            aria-hidden
                          >
                            {active ? (
                              <span className="size-1.5 rounded-sm bg-primary-foreground" />
                            ) : null}
                          </span>
                          <span className="truncate">{label}</span>
                        </button>
                      </li>
                    )
                  })}
                </ul>
              )}
              {activeLabels.length > 0 ? (
                <div className="border-t border-border/50 p-1">
                  <Button
                    variant="ghost"
                    size="sm"
                    className="w-full"
                    onClick={() => {
                      for (const label of activeLabels) {
                        onToggleLabel(label)
                      }
                    }}
                  >
                    {t('cnb.tasks.clearLabels', 'Clear labels')}
                  </Button>
                </div>
              ) : null}
            </PopoverContent>
          </Popover>
        ) : null}
        <div className="flex shrink-0 items-center gap-2">
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={onCreateIssue}
                disabled={createDisabled}
                aria-label={t('cnb.tasks.createIssue', 'New CNB issue')}
                className="size-8"
              >
                <Plus className="size-4" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {t('cnb.tasks.createIssue', 'New CNB issue')}
            </TooltipContent>
          </Tooltip>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="outline"
                size="icon"
                onClick={onRefresh}
                disabled={refreshing}
                aria-busy={refreshing}
                aria-label={t('cnb.tasks.refresh', 'Refresh CNB tasks')}
                className="size-8"
              >
                {refreshing ? (
                  <LoaderCircle className="size-4 animate-spin" />
                ) : (
                  <RefreshCw className="size-4" />
                )}
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom" sideOffset={6}>
              {t('cnb.tasks.refresh', 'Refresh CNB tasks')}
            </TooltipContent>
          </Tooltip>
        </div>
      </div>
    </div>
  )
}
