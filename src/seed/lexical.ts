/** Minimal helpers to build Lexical editor state JSON for seed data and tests. */
type Node = Record<string, unknown>

const text = (value: string, format = 0): Node => ({
  type: 'text',
  text: value,
  format,
  detail: 0,
  mode: 'normal',
  style: '',
  version: 1,
})

const block = (type: string, children: Node[], extra: Node = {}): Node => ({
  type,
  children,
  direction: 'ltr',
  format: '',
  indent: 0,
  version: 1,
  ...extra,
})

export const p = (value: string) => block('paragraph', [text(value)], { textFormat: 0, textStyle: '' })
export const h2 = (value: string) => block('heading', [text(value)], { tag: 'h2' })
export const quote = (value: string) => block('quote', [text(value)])
export const ul = (items: string[]) =>
  block(
    'list',
    items.map((item, i) => block('listitem', [text(item)], { value: i + 1 })),
    { listType: 'bullet', start: 1, tag: 'ul' },
  )
export const embed = (url: string, caption?: string): Node => ({
  type: 'block',
  version: 2,
  format: '',
  fields: { id: Math.random().toString(16).slice(2, 26).padEnd(24, '0'), blockName: '', blockType: 'embed', url, caption },
})

export const doc = (...children: Node[]) => ({
  root: block('root', children),
})
