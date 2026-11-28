import { useEffect, useState } from 'react'
import { FolderOpen, Loader2 } from 'lucide-react'
import { useTranslate } from '@/i18n/use-translate'
import type {
  SOrcaLocalUpdateError,
  SOrcaLocalUpdateStatus
} from '../../../../../shared/updater/sorca-local-update'
import { Button } from '../../ui/button'
import { SearchableSetting } from '../section-layout/SearchableSetting'

export function SOrcaLocalUpdatePackage(): React.JSX.Element | null {
  const t = useTranslate()
  const { sorcaLocalPackageStatus, chooseSorcaLocalPackage, clearSorcaLocalPackage } =
    window.api.updater
  const [status, setStatus] = useState<SOrcaLocalUpdateStatus | null>(null)
  const [error, setError] = useState<SOrcaLocalUpdateError | null>(null)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let active = true
    void sorcaLocalPackageStatus?.().then((next) => {
      if (active) {
        setStatus(next)
      }
    }, console.warn)
    return () => {
      active = false
    }
  }, [sorcaLocalPackageStatus])

  if (!status || !chooseSorcaLocalPackage || !clearSorcaLocalPackage) {
    return null
  }

  const selectPackage = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const result = await chooseSorcaLocalPackage()
      if (result.kind === 'staged') {
        setStatus({ pendingVersion: result.version })
      } else if (result.kind === 'error') {
        setError(result.reason)
      }
    } catch {
      setError('prepare-failed')
    }
    setBusy(false)
  }

  const discardPackage = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      setStatus(await clearSorcaLocalPackage())
    } catch {
      setError('prepare-failed')
    }
    setBusy(false)
  }

  const title = t('sorca.localUpdate.title', 'Local update package')
  const description = t(
    'sorca.localUpdate.description',
    'Choose a local Orca disk image. Orca applies it the next time you quit normally.'
  )
  const errorText: Record<SOrcaLocalUpdateError, string> = {
    'already-installed': t('sorca.localUpdate.alreadyInstalled', 'Choose a newer Orca build.'),
    'invalid-package': t(
      'sorca.localUpdate.invalidPackage',
      'This file does not match the latest development package built on this Mac.'
    ),
    'package-unavailable': t(
      'sorca.localUpdate.packageUnavailable',
      'No local development package is registered. Run ./scripts/update-orca-dev --package-only in the Orca repository.'
    ),
    'install-location': t(
      'sorca.localUpdate.installLocation',
      'Orca cannot write to its installation folder. Open Orca from a writable Applications folder.'
    ),
    'release-update-in-progress': t(
      'sorca.localUpdate.releaseUpdateInProgress',
      'Finish the release update before choosing a local package.'
    ),
    'signing-identity': t(
      'sorca.localUpdate.signingIdentity',
      'The update could not preserve Orca’s macOS signing identity.'
    ),
    'system-version': t(
      'sorca.localUpdate.systemVersion',
      'This update requires a newer macOS version.'
    ),
    'prepare-failed': t(
      'sorca.localUpdate.prepareFailed',
      'Could not prepare the update package. Try selecting it again.'
    )
  }

  return (
    <SearchableSetting title={title} description={description} className="space-y-2 py-3">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium">{title}</p>
          <p className="text-xs text-muted-foreground">{description}</p>
        </div>
        <Button variant="outline" size="sm" disabled={busy} onClick={() => void selectPackage()}>
          {busy ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <FolderOpen className="size-3.5" />
          )}
          {t('sorca.localUpdate.choose', 'Choose update package…')}
        </Button>
      </div>
      {status.pendingVersion !== null && (
        <div role="status" className="flex flex-wrap items-center gap-2 text-xs">
          <span>
            {t('sorca.localUpdate.ready', '{{version}} will install when you quit Orca.', {
              version: status.pendingVersion
            })}
          </span>
          <Button size="sm" variant="ghost" disabled={busy} onClick={() => void discardPackage()}>
            {t('sorca.localUpdate.discard', 'Cancel pending update')}
          </Button>
        </div>
      )}
      {error && (
        <p role="alert" className="text-xs text-destructive">
          {errorText[error]}
        </p>
      )}
    </SearchableSetting>
  )
}
