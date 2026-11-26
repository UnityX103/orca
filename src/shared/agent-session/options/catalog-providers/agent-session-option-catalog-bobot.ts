import { agentChoiceCliApply } from '../../../agent-launch/choices/agent-choice-cli-apply'
import type { AgentSessionOptionCatalog } from './agent-session-option-catalog-types'

export const BOBOT_LAUNCH_OPTION_CATALOG: AgentSessionOptionCatalog = {
  supportsWorkerLaunchPreferences: true,
  models: [],
  modelApply: agentChoiceCliApply(
    'bobot',
    [{ kind: 'value', names: ['--model'], lift: 'separate-and-long-equals' }],
    '--model'
  ),
  unknownModelOptions: [
    {
      id: 'effort',
      label: 'Effort',
      category: 'thought_level',
      kind: {
        type: 'select',
        choices: [
          { value: 'low', label: 'Low' },
          { value: 'medium', label: 'Medium' },
          { value: 'high', label: 'High' },
          { value: 'max', label: 'Max' }
        ],
        defaultValue: 'high'
      },
      apply: agentChoiceCliApply(
        'bobot',
        [{ kind: 'value', names: ['--effort'], lift: 'separate-and-long-equals' }],
        '--effort'
      )
    }
  ]
}
