import { describe, expect, it } from 'vitest'
import { DEFINITIONS_BY_ID } from './definitions'
import { findKeybindingConflicts } from './formatting'
import { getDefaultBindings } from './effective'
import { keybindingMatchesAction } from './matching'

// A chat stash chord must never take the editor's own save, or a file save would stash instead.
describe('chat.stashPrompt binding', () => {
  it('defaults to Mod+S on every platform', () => {
    expect(getDefaultBindings(DEFINITIONS_BY_ID.get('chat.stashPrompt')!, 'darwin')).toEqual([
      'Mod+S'
    ])
    expect(getDefaultBindings(DEFINITIONS_BY_ID.get('chat.stashPrompt')!, 'linux')).toEqual([
      'Mod+S'
    ])
    expect(getDefaultBindings(DEFINITIONS_BY_ID.get('chat.stashPrompt')!, 'win32')).toEqual([
      'Mod+S'
    ])
  })

  it('does not conflict with the editor save, whose scope keeps them apart', () => {
    const overlapping = findKeybindingConflicts('darwin', {})
      .filter((conflict) => conflict.actionIds.includes('chat.stashPrompt'))
      .flatMap((conflict) => conflict.actionIds)
    expect(overlapping).not.toContain('editor.save')
  })

  it('matches the direct chord and a user override that replaces it', () => {
    const event = { key: 's', metaKey: true, ctrlKey: false, altKey: false, shiftKey: false }
    expect(
      keybindingMatchesAction('chat.stashPrompt', event, 'darwin', {
        'chat.stashPrompt': ['Mod+Shift+K']
      })
    ).toBe(false)
    expect(
      keybindingMatchesAction(
        'chat.stashPrompt',
        { key: 'k', metaKey: true, ctrlKey: false, altKey: false, shiftKey: true },
        'darwin',
        { 'chat.stashPrompt': ['Mod+Shift+K'] }
      )
    ).toBe(true)
  })
})
