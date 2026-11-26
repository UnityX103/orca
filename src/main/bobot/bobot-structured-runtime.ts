import { join } from 'node:path'
import {
  agentSessionAccountHome,
  requireLegacyAgentSessionAccountHome
} from '../../shared/agent-session/lifecycle/accounts/agent-session-account-home'
import { isNativeLocalLocation } from '../../shared/execution-host/execution-host'
import { applyStructuredAgentWorkspaceTrust } from '../agent-launch/trust/agent-workspace-trust-spawn'
import { claudeSessionIdForOrcaSession } from '../claude/structured/lifecycle/claude-structured-session-id'
import {
  agentSessionProviderHandleRoot,
  claudeProviderHandleLeafUuid
} from '../../shared/agent-session/lifecycle/provider-handles/agent-session-provider-handle-encoding'
import { claudeBotSessionOptions } from '../claude/structured/launch/claude-bot-session-options'
import { claudeDiscoveryOptions } from '../claude/structured/launch/claude-discovery-options'
import { claudeStructuredPermissionOptions } from '../claude/structured/launch/claude-structured-permission-options'
import {
  CLAUDE_STRUCTURED_BASE_OPTIONS,
  type ClaudeStructuredLaunch
} from '../claude/structured/launch/claude-structured-launch-resolution'
import { activeProviderContext } from '../../shared/agent-session/conversation-context/agent-session-provider-context'
import { resolveSessionFilePath } from '../native-chat/session-file-resolver'
import { resolveAgainAfterRefreshOnMissingProgram } from '../native-chat/agent-launch/structured-agent-command-resolution'
import type { DirectoryAccountAgentDefinition } from '../native-chat/agent-session-wire/providers/structured-agent-definition'
import type { StructuredAgentLaunchPartResolver } from '../runtime/agent-session/launch/structured-agent-launch-composition'
import type {
  StructuredAgentChatProgram,
  StructuredAgentRuntimeMetadata
} from '../runtime/agent-session/installation/structured-agent-runtime-registration-types'
import { bobotConfigHome, bobotEnvironment } from './bobot-environment'

export const BOBOT_STRUCTURED_AGENT: DirectoryAccountAgentDefinition = {
  agent: 'bobot',
  handleTransport: 'bobot-stream-json',
  accountHomeVariable: 'BOBOT_CONFIG_DIR',
  needsJournalBeforeAcquisition: true,
  instructionsEachStart: false,
  capabilities: {
    rewind: false,
    compact: false,
    threadGoal: false,
    contextUsage: true,
    imagePrompts: true,
    steering: 'inject',
    approvalEnforcement: 'provider'
  },
  restingOptions: {
    acceptsKey: (key) => key === 'model' || key === 'effort',
    fallbackModels: () => null,
    effortDefaultsToModel: true
  }
}

export const BOBOT_STRUCTURED_RUNTIME_METADATA: Omit<
  StructuredAgentRuntimeMetadata,
  'chatProgram' | 'modelCatalog'
> = {
  definition: BOBOT_STRUCTURED_AGENT,
  supportsLocation: (location) => isNativeLocalLocation(location),
  transcriptImport: null,
  sessionHistory: {
    rowAgents: [],
    rowSessionId: ({ handle }) => handle.nativeId,
    parseResumeArgs: () => null
  },
  resolveAccountHome: async ({ launchEnv, location, purpose, workspacePath }, services) => {
    const env = bobotEnvironment(await services.hostLaunchEnvironment('bobot'), launchEnv)
    const home = bobotConfigHome(env)
    if (purpose === 'launch' && workspacePath) {
      await applyStructuredAgentWorkspaceTrust({
        preset: 'bobot',
        workspacePath: await workspacePath(),
        launchEnv: { ...env, BOBOT_CONFIG_DIR: env.BOBOT_CONFIG_DIR },
        settings: services.workspaceTrustSettings(),
        repoDecision: services.workspaceTrustRepoDecision(location)
      })
    }
    return agentSessionAccountHome(BOBOT_STRUCTURED_AGENT, home)
  }
}

export function bobotStructuredLaunchPart(deps: {
  resolveProgram: StructuredAgentChatProgram['resolve']
  resolveLaunchArgs: () => Promise<string[]> | string[]
  attachmentDirectory: string
}): StructuredAgentLaunchPartResolver<ClaudeStructuredLaunch> {
  return async (basis, identity) => {
    const home = requireLegacyAgentSessionAccountHome(basis.record.accountHome).path
    const cwd = await basis.launchDirectory()
    const { command, prefixArgs, configuredProgram, env } =
      await resolveAgainAfterRefreshOnMissingProgram(
        async () => {
          const env = bobotEnvironment(await basis.baseEnvironment(), basis.launchEnv(), home)
          return deps.resolveProgram(env, basis.commandSettings())
        },
        basis.refreshAfterMissingProgram,
        { env: (result) => result.env, cwd: () => cwd }
      )
    const active = activeProviderContext(basis.record)
    const head = active.head?.handle ?? null
    if (
      head &&
      (!identity.providerHandle ||
        agentSessionProviderHandleRoot(identity.providerHandle) !==
          agentSessionProviderHandleRoot(head))
    ) {
      throw new Error('BoBot durable resume identity changed before spawn')
    }
    const { pendingClear } = active
    const providerSessionId =
      head?.nativeId ??
      claudeSessionIdForOrcaSession(
        basis.record.sessionId,
        pendingClear ? basis.record.providerContextBoundary?.operationId : undefined
      )
    const leaf = head ? claudeProviderHandleLeafUuid(head) : null
    const resumesTranscript =
      leaf !== null ||
      ((head !== null || pendingClear) &&
        (await resolveSessionFilePath('claude', providerSessionId, {
          claudeProjectsDir: join(home, 'projects'),
          cwd
        })) !== null)
    const discovery = claudeDiscoveryOptions({
      configuredArgs: await deps.resolveLaunchArgs(),
      attachmentDirectory: deps.attachmentDirectory
    })
    const permission = claudeStructuredPermissionOptions(basis.permissionMode ?? 'ask')
    return {
      launch: {
        pathToClaudeCodeExecutable: command,
        prefixArgs,
        ...(configuredProgram ? { configuredProgram } : {}),
        options: {
          ...CLAUDE_STRUCTURED_BASE_OPTIONS,
          ...discovery,
          ...permission,
          ...(await claudeBotSessionOptions(basis, [], await basis.toolServers(), {
            mcpConfig: false
          })),
          extraArgs: {
            ...discovery.extraArgs,
            ...CLAUDE_STRUCTURED_BASE_OPTIONS.extraArgs,
            ...permission.extraArgs
          },
          ...(resumesTranscript ? { resume: providerSessionId } : { sessionId: providerSessionId })
        },
        claudeConfigDir: home,
        providerSessionId,
        resumeLeafUuid: resumesTranscript ? leaf : null,
        resumesTranscript,
        cliFlag: async (flag) => (flag.option === '--effort' ? 'supported' : 'unknown'),
        continuesChain: head?.nativeId === providerSessionId
      },
      env,
      inheritedEnvToDelete: env.BOBOT_CONFIG_DIR === undefined ? ['BOBOT_CONFIG_DIR'] : [],
      cliRuntimeCommand: command
    }
  }
}
