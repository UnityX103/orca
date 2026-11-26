import { useEffect, useState } from 'react'
import type { PreloadApi } from '../../../../../preload/api-types'
import type { CnbTaskRepository } from '../../../../../shared/cnb/cnb-tasks'

type CnbApi = NonNullable<PreloadApi['cnb']>

/** The signed-in CNB viewer, resolved once per refresh; drives the "Mine" participant filter. */
export function useCnbViewer(api: CnbApi | undefined, refreshNonce: number): string | null {
  const [viewer, setViewer] = useState<string | null>(null)
  useEffect(() => {
    if (!api) {
      return
    }
    let active = true
    void api.viewer().then(
      (user) => {
        if (active) {
          setViewer(user?.username ?? null)
        }
      },
      () => {}
    )
    return () => {
      active = false
    }
  }, [api, refreshNonce])
  return viewer
}

/** Label names available across the selected repos, for the label filter popover. */
export function useCnbLabelOptions(args: {
  api: CnbApi | undefined
  enabled: boolean
  repositories: CnbTaskRepository[]
  selectedIds: ReadonlySet<string>
  refreshNonce: number
}): string[] {
  const { api, enabled, repositories, selectedIds, refreshNonce } = args
  const [options, setOptions] = useState<string[]>([])
  useEffect(() => {
    if (!api || !enabled) {
      return
    }
    const repoIds = repositories.filter((repo) => selectedIds.has(repo.id)).map((repo) => repo.id)
    if (repoIds.length === 0) {
      setOptions([])
      return
    }
    let active = true
    void api.labels({ repoIds }).then(
      (names) => {
        if (active) {
          setOptions(names)
        }
      },
      () => {
        if (active) {
          setOptions([])
        }
      }
    )
    return () => {
      active = false
    }
  }, [api, enabled, repositories, selectedIds, refreshNonce])
  return options
}
