// Parse assistant visual directives as markdown blocks so fences, quotes and lists retain their grammar.

import type { Node, Paragraph, Root, RootContent } from 'mdast'
import type { Extension as FromMarkdownExtension } from 'mdast-util-from-markdown'
import type {
  Code,
  Construct,
  Effects,
  Extension as MicromarkExtension,
  State,
  TokenizeContext
} from 'micromark-util-types'
import type { Processor, PluggableList } from 'unified'
import {
  NATIVE_CHAT_CODEX_VISUAL_MAX_LINE_LENGTH,
  NATIVE_CHAT_VISUAL_DIRECTIVE_MAX_LINE_LENGTH,
  NATIVE_CHAT_VISUAL_MAX_PER_MESSAGE,
  parseNativeChatVisualDirectiveLine
} from '../../../../../../shared/native-chat/visuals/native-chat-visual-directive'
import { nativeChatBotDirectiveCardOf } from '../../../../../../shared/native-chat/bot-cards/native-chat-bot-card-kind'

const TOKEN_TYPE = 'nativeChatVisual'
const COLON = 58
// Codex's reference opens with U+E200, a private-use character no real prose line starts with.
const CODEX_REFERENCE_OPEN = 0xe200
const HORIZONTAL_TAB = -2
const VIRTUAL_SPACE = -1

// Hast properties the placeholder carries through sanitize to the React component.
const NONCE_PROPERTY = 'dataOrcaVisual'
const FILE_PROPERTY = 'dataOrcaVisualFile'
const TITLE_PROPERTY = 'dataOrcaVisualTitle'
const HOOK_PROPERTY = 'dataOrcaVisualHook'
const PATH_PROPERTY = 'dataOrcaVisualPath'
const WIDE_PROPERTY = 'dataOrcaVisualWide'
export const NATIVE_CHAT_VISUAL_PLACEHOLDER_PROPERTIES = [
  NONCE_PROPERTY,
  FILE_PROPERTY,
  TITLE_PROPERTY,
  HOOK_PROPERTY,
  PATH_PROPERTY,
  WIDE_PROPERTY
] as const

type ParsedDirectiveLine =
  | { file: string; title: string | null; path: string | null; wide: boolean; hookId: null }
  | { hookId: string }

function parseDirectiveLine(line: string): ParsedDirectiveLine | null {
  const visual = parseNativeChatVisualDirectiveLine(line)
  if (visual) {
    return { ...visual, hookId: null }
  }
  const card = nativeChatBotDirectiveCardOf(line)
  if (!card) {
    return null
  }
  switch (card.kind) {
    case 'webhook':
      return { hookId: card.value.hookId }
  }
}

export type NativeChatVisualNode = Node & {
  type: 'nativeChatVisual'
  file: string
  title: string | null
  /** Set for a Codex reference, whose file is a label and path the real target. */
  path: string | null
  /** The reference asked for the wide surface. */
  wide: boolean
  /** Set for a webhook card line, whose file and title stay empty. */
  hookId: string | null
  /** The line as written, for a directive shown as text instead. */
  source: string
  data?: { hName?: string; hProperties?: Record<string, string> }
}

declare module 'mdast' {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- declaration merging needs an interface.
  interface RootContentMap {
    nativeChatVisual: NativeChatVisualNode
  }
}

declare module 'micromark-util-types' {
  // oxlint-disable-next-line typescript/consistent-type-definitions -- declaration merging needs an interface.
  interface TokenTypeMap {
    nativeChatVisual: 'nativeChatVisual'
  }
}

function tokenizeVisualLine(maxLength: number): Construct['tokenize'] {
  return function tokenize(this: TokenizeContext, effects: Effects, ok: State, nok: State): State {
    let line = ''
    const inside: State = (code: Code) => {
      // EOF, or a line ending (the negative codes below the tab/virtual-space codes).
      if (code === null || code < HORIZONTAL_TAB) {
        effects.exit(TOKEN_TYPE)
        return parseDirectiveLine(line) ? ok(code) : nok(code)
      }
      if (line.length >= maxLength) {
        return nok(code)
      }
      if (code !== VIRTUAL_SPACE) {
        line += code === HORIZONTAL_TAB ? '\t' : String.fromCharCode(code)
      }
      effects.consume(code)
      return inside
    }
    return (code) => {
      effects.enter(TOKEN_TYPE)
      return inside(code)
    }
  }
}

const visualLineConstruct: Construct = {
  name: TOKEN_TYPE,
  tokenize: tokenizeVisualLine(NATIVE_CHAT_VISUAL_DIRECTIVE_MAX_LINE_LENGTH)
}
const codexVisualLineConstruct: Construct = {
  name: TOKEN_TYPE,
  tokenize: tokenizeVisualLine(NATIVE_CHAT_CODEX_VISUAL_MAX_LINE_LENGTH)
}

const visualMicromarkExtension: MicromarkExtension = {
  flow: { [COLON]: visualLineConstruct, [CODEX_REFERENCE_OPEN]: codexVisualLineConstruct }
}

const visualFromMarkdown: FromMarkdownExtension = {
  enter: {
    [TOKEN_TYPE](token) {
      this.enter(
        {
          type: 'nativeChatVisual',
          file: '',
          title: null,
          path: null,
          wide: false,
          hookId: null,
          source: ''
        },
        token
      )
    }
  },
  exit: {
    [TOKEN_TYPE](token) {
      const node = this.stack.at(-1)
      const source = this.sliceSerialize(token)
      const directive = parseDirectiveLine(source)
      if (node?.type === 'nativeChatVisual' && directive) {
        if (directive.hookId === null) {
          node.file = directive.file
          node.title = directive.title
          node.path = directive.path
          node.wide = directive.wide
        } else {
          node.hookId = directive.hookId
        }
        node.source = source
      }
      this.exit(token)
    }
  }
}

function literalParagraph(node: NativeChatVisualNode): Paragraph {
  return { type: 'paragraph', children: [{ type: 'text', value: node.source }] }
}

type ChildList = { children: RootContent[] }

function hasChildren(node: RootContent): node is RootContent & ChildList {
  return 'children' in node && Array.isArray(node.children)
}

/** Mount only standalone top-level directives within the per-message cap; render nested/excess directives as authored text. */
function placeVisuals(
  parent: ChildList,
  isRoot: boolean,
  nonce: string,
  mounted: { count: number }
): void {
  parent.children = parent.children.map((child) => {
    if (child.type === 'nativeChatVisual') {
      if (!isRoot || mounted.count >= NATIVE_CHAT_VISUAL_MAX_PER_MESSAGE) {
        return literalParagraph(child)
      }
      mounted.count += 1
      child.data = {
        hName: 'div',
        hProperties: {
          [NONCE_PROPERTY]: nonce,
          ...(child.hookId
            ? { [HOOK_PROPERTY]: child.hookId }
            : {
                [FILE_PROPERTY]: child.file,
                ...(child.title ? { [TITLE_PROPERTY]: child.title } : {}),
                ...(child.path ? { [PATH_PROPERTY]: child.path } : {}),
                ...(child.wide ? { [WIDE_PROPERTY]: 'true' } : {})
              })
        }
      }
      return child
    }
    if (hasChildren(child)) {
      placeVisuals(child, false, nonce, mounted)
    }
    return child
  })
}

/** Use an unguessable per-message nonce so reply HTML cannot forge mountable placeholders. */
export function remarkNativeChatVisuals(this: Processor, nonce: string): (tree: Root) => void {
  const data = this.data()
  data.micromarkExtensions = [...(data.micromarkExtensions ?? []), visualMicromarkExtension]
  data.fromMarkdownExtensions = [...(data.fromMarkdownExtensions ?? []), visualFromMarkdown]
  return (tree) => placeVisuals(tree, true, nonce, { count: 0 })
}

export function nativeChatVisualRemarkPlugins(nonce: string): PluggableList {
  return [[remarkNativeChatVisuals, nonce]]
}
