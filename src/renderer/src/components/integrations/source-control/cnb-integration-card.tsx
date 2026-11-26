import { GitPullRequest } from 'lucide-react'
import { type FormEvent, useEffect, useState } from 'react'
import type { CnbCredentialStatus } from '../../../../../shared/cnb/cnb-credentials'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { useTranslate } from '@/i18n/use-translate'
import {
  IntegrationCardDetails,
  IntegrationCardShell
} from '../presentation/integration-card-shell'

export function CnbIntegrationCard(): React.JSX.Element | null {
  const t = useTranslate()
  const api = window.api.cnb
  const [source, setSource] = useState<CnbCredentialStatus['source'] | null>(null)
  const [editing, setEditing] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!api) {
      return
    }
    let active = true
    void api.status().then(
      (status) => {
        if (active) {
          setSource(status.source)
        }
      },
      () => {
        if (active) {
          setSource('none')
          setError(t('cnb.integration.statusError', 'Could not read the saved CNB connection.'))
        }
      }
    )
    return () => {
      active = false
    }
  }, [api, t])

  if (!api) {
    return null
  }

  const connected = source === 'stored' || source === 'environment'
  const statusLabel = connected
    ? t('cnb.integration.connected', 'Connected')
    : t('cnb.integration.notConnected', 'Not connected')

  async function connect(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault()
    if (!api || busy) {
      return
    }
    const token = new FormData(event.currentTarget).get('token')
    if (typeof token !== 'string') {
      return
    }
    setBusy(true)
    setError(null)
    try {
      const result = await api.connect(token)
      if (result.ok) {
        setSource('stored')
        setEditing(false)
      } else {
        setError(
          {
            invalidToken: t('cnb.integration.invalidToken', 'Enter a valid CNB access token.'),
            rejected: t(
              'cnb.integration.rejected',
              'CNB rejected the token. Check its account read permission.'
            ),
            unreachable: t(
              'cnb.integration.unreachable',
              'Could not reach CNB to verify the token.'
            ),
            storageUnavailable: t(
              'cnb.integration.storageUnavailable',
              'Secure storage is unavailable. Use ORCA_CNB_TOKEN or enable the system keyring.'
            )
          }[result.reason]
        )
      }
    } catch {
      setError(t('cnb.integration.connectError', 'Could not connect to CNB.'))
    }
    setBusy(false)
  }

  async function disconnect(): Promise<void> {
    if (!api || busy) {
      return
    }
    setBusy(true)
    setError(null)
    try {
      await api.disconnect()
      setSource((await api.status()).source)
      setEditing(false)
    } catch {
      setError(t('cnb.integration.disconnectError', 'Could not disconnect CNB.'))
    }
    setBusy(false)
  }

  return (
    <IntegrationCardShell
      icon={<GitPullRequest className="mt-0.5 size-4" />}
      name="CNB"
      description={t(
        'cnb.integration.description',
        'Issues, pull requests, and build status for CNB repositories.'
      )}
      checking={source === null}
      statusLabel={statusLabel}
      statusTone={connected ? 'connected' : 'attention'}
      actions={
        source !== null && source !== 'environment' && !editing ? (
          <Button
            size="sm"
            variant={connected ? 'outline' : 'default'}
            onClick={() => setEditing(true)}
          >
            {connected
              ? t('cnb.integration.edit', 'Edit token')
              : t('cnb.integration.connect', 'Connect')}
          </Button>
        ) : null
      }
    >
      {editing || error || source === 'environment' ? (
        <IntegrationCardDetails>
          {source === 'environment' && (
            <p className="text-xs text-muted-foreground">
              {t('cnb.integration.environment', 'Configured through ORCA_CNB_TOKEN or CNB_TOKEN.')}
            </p>
          )}
          {editing && (
            <form onSubmit={(event) => void connect(event)} className="space-y-2">
              <Label htmlFor="cnb-access-token">
                {t('cnb.integration.token', 'CNB access token')}
              </Label>
              <Input
                id="cnb-access-token"
                name="token"
                type="password"
                autoComplete="off"
                autoFocus
                required
                maxLength={2048}
                disabled={busy}
                aria-invalid={Boolean(error)}
              />
              <p className="text-xs text-muted-foreground">
                {t(
                  'cnb.integration.scopes',
                  'Grant read access to account-profile, repo-issue, repo-pr, and repo-notes.'
                )}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                <Button size="sm" type="submit" disabled={busy}>
                  {t('cnb.integration.connect', 'Connect')}
                </Button>
                <Button
                  size="sm"
                  type="button"
                  variant="ghost"
                  disabled={busy}
                  onClick={() => {
                    setEditing(false)
                    setError(null)
                  }}
                >
                  {t('cnb.integration.cancel', 'Cancel')}
                </Button>
                {source === 'stored' && (
                  <Button
                    size="sm"
                    type="button"
                    variant="outline"
                    disabled={busy}
                    onClick={() => void disconnect()}
                  >
                    {t('cnb.integration.disconnect', 'Disconnect')}
                  </Button>
                )}
              </div>
            </form>
          )}
          {error && (
            <p role="alert" className="text-xs text-destructive">
              {error}
            </p>
          )}
        </IntegrationCardDetails>
      ) : null}
    </IntegrationCardShell>
  )
}
