import { join } from 'node:path'
import { requireLegacyAgentSessionAccountHome } from '../../shared/agent-session/lifecycle/accounts/agent-session-account-home'
import {
  catalogListingDirectory,
  envWithPathRelativeTo
} from '../../shared/shell/command-resolution/node-cli-command-resolution'
import { readClaudeControlResponses } from '../claude/sdk-transport/claude-control-responses'
import {
  claudeDiscoveryArgs,
  claudeDiscoveryOptions
} from '../claude/structured/launch/claude-discovery-options'
import { wireClaudeModels } from '../claude/structured/launch/claude-structured-catalog-listing'
import {
  isCompleteClaudeModelListing,
  listedModels
} from '../claude/structured/launch/claude-structured-model-catalog'
import { readClaudeSettingsApplied } from '../claude/structured/launch/claude-structured-session-options'
import {
  assertStructuredAgentResolutionCurrent,
  resolveAgainAfterRefreshOnMissingProgram,
  type StructuredAgentResolutionOperation
} from '../native-chat/agent-launch/structured-agent-command-resolution'
import type {
  AgentModelCatalogDiscovery,
  AgentModelCatalogLookup,
  AgentModelCatalogProbe
} from '../native-chat/agent-model-catalog/agent-model-catalog-discovery'
import { agentModelCatalogInputStamp } from '../native-chat/agent-model-catalog/agent-model-catalog-input-stamp'
import {
  AgentModelCatalogProbeError,
  runAgentModelCatalogListing
} from '../native-chat/agent-model-catalog/agent-model-catalog-probe-runner'
import { AgentModelCatalogUnavailableError } from '../native-chat/agent-model-catalog/agent-model-catalog-unavailable'
import type {
  StructuredAgentChatProgram,
  StructuredAgentModelCatalogContext
} from '../runtime/agent-session/installation/structured-agent-runtime-registration-types'
import { bobotEnvironment } from './bobot-environment'
import { listBobotDirectApiModels } from './bobot-model-endpoint'

const controlInput = ['initialize', 'get_settings']
  .map(
    (id) =>
      `${JSON.stringify({ type: 'control_request', request_id: id, request: { subtype: id } })}\n`
  )
  .join('')

export function bobotModelCatalogDiscovery(
  { deps, environment }: StructuredAgentModelCatalogContext,
  resolveProgram: StructuredAgentChatProgram['resolve']
): AgentModelCatalogDiscovery {
  const resolve = async (
    account: Parameters<AgentModelCatalogProbe>[0],
    cwd?: string,
    lookup: AgentModelCatalogLookup = 'recover',
    operation?: StructuredAgentResolutionOperation,
    launchDirectory = cwd
  ) => {
    const home = requireLegacyAgentSessionAccountHome(account).path
    const overlay = deps.resolveAgentLaunchEnv?.('bobot') ?? {}
    const settings = deps.resolveAgentCommandSettings?.() ?? {}
    const { command, prefixArgs, env } = await resolveAgainAfterRefreshOnMissingProgram(
      async () => {
        const env = bobotEnvironment(
          await environment.resolveBaseEnvironment(lookup !== 'recover'),
          overlay,
          home
        )
        return resolveProgram(env, settings)
      },
      lookup === 'recover' ? environment.refreshAfterMissingProgram : undefined,
      { env: (result) => result.env, ...(launchDirectory ? { cwd: () => launchDirectory } : {}) },
      operation
    )
    const discovery = claudeDiscoveryOptions({
      configuredArgs: cwd ? await deps.resolveLaunchArgs('bobot') : []
    })
    const listIn = catalogListingDirectory(
      command,
      [...prefixArgs, ...claudeDiscoveryArgs(discovery)],
      cwd,
      launchDirectory
    )
    const args = [
      ...prefixArgs,
      '--print',
      '--verbose',
      '--input-format',
      'stream-json',
      '--output-format',
      'stream-json',
      ...claudeDiscoveryArgs({ ...discovery, settingSources: ['user'] }),
      '--strict-mcp-config'
    ]
    const listingEnv = launchDirectory ? envWithPathRelativeTo(env, launchDirectory) : env
    const inputStamp = await agentModelCatalogInputStamp({
      command,
      prefixArgs,
      cwd: listIn ?? process.cwd(),
      env: listingEnv,
      configFiles: [join(home, 'settings.json')]
    })
    return {
      inputStamp,
      identity: { command, args, cwd: listIn, overlay: Object.entries(overlay).sort() },
      run: async (signal?: AbortSignal, runOperation = operation) => {
        assertStructuredAgentResolutionCurrent(runOperation)
        const output = await runAgentModelCatalogListing(
          { command, args, ...(listIn ? { cwd: listIn } : {}), stdin: controlInput },
          { site: 'bobot-model-catalog-probe', inheritedEnv: listingEnv, signal }
        ).catch((error: unknown) => {
          if (error instanceof AgentModelCatalogProbeError && error.executableMissing) {
            throw new AgentModelCatalogUnavailableError({ reason: 'cliMissing' })
          }
          throw error
        })
        const replies = readClaudeControlResponses(output)
        const initialization = replies.get('initialize')
        const settings = replies.get('get_settings')
        const direct = await listBobotDirectApiModels(listingEnv, settings, signal)
        assertStructuredAgentResolutionCurrent(runOperation)
        const models = direct ?? wireClaudeModels(listedModels(initialization))
        if (models.length === 0) {
          throw new Error('BoBot listed no models')
        }
        const configured = readClaudeSettingsApplied(settings)
        return {
          models,
          origin: 'probe' as const,
          complete: direct !== null || isCompleteClaudeModelListing(initialization),
          ...(configured?.model &&
          models.some(
            (row) => row.id === configured.model || row.resolvedModel === configured.model
          )
            ? { configured }
            : {})
        }
      }
    }
  }

  const probe: AgentModelCatalogProbe = Object.assign(
    async (
      home: Parameters<AgentModelCatalogProbe>[0],
      options?: Parameters<AgentModelCatalogProbe>[1]
    ) =>
      (
        await resolve(home, options?.cwd ?? options?.workspacePath, 'recover', options?.operation)
      ).run(options?.signal, options?.operation),
    {
      resolve,
      resolveLegacy: (
        home: Parameters<AgentModelCatalogProbe>[0],
        operation?: StructuredAgentResolutionOperation,
        lookup?: AgentModelCatalogLookup
      ) => resolve(home, undefined, lookup, operation)
    }
  )
  return { kind: 'probe', listingNamesConfiguredModel: true, probe }
}
