/**
 * Minimal Markdown renderer for agent speeches — headings, bold/italic/code,
 * lists, blockquotes, tables and horizontal rules. No dependencies: it covers
 * exactly the subset the tribunal agents produce, and degrades gracefully on
 * partially-typed text (unclosed markers render as plain text).
 */
import { createElement, type ReactNode } from 'react'

const INLINE = /(\*\*[^*]+\*\*|\*[^*\s][^*\n]*\*|`[^`]+`)/g
// Unescape markdown escape sequences (e.g. "\[Exhibit A\]" -> "[Exhibit A]") before
// parsing bold/italic/code. Limited to punctuation that cannot be mistaken for an
// INLINE marker once unescaped. \, `, *, _, {, } are intentionally excluded: unescaping
// them here would let the recovered character be re-interpreted by INLINE as a new
// formatting marker (e.g. "\*foo\*" -> "*foo*" -> italic), which would require
// restructuring INLINE matching (e.g. placeholder-masking) to handle safely.
const ESCAPE = /\\([[\]()#+\-.!])/g

const inline = (text: string): ReactNode[] => {
  text = text.replace(ESCAPE, '$1')
  const out: ReactNode[] = []
  let last = 0
  let key = 0
  for (const m of text.matchAll(INLINE)) {
    const idx = m.index ?? 0
    if (idx > last) out.push(text.slice(last, idx))
    const tok = m[0]
    if (tok.startsWith('**')) out.push(<strong key={key++}>{tok.slice(2, -2)}</strong>)
    else if (tok.startsWith('`')) out.push(<code key={key++}>{tok.slice(1, -1)}</code>)
    else out.push(<em key={key++}>{tok.slice(1, -1)}</em>)
    last = idx + tok.length
  }
  if (last < text.length) out.push(text.slice(last))
  return out
}

const HEADING = /^(#{1,4})\s+(.*)$/
const LIST_ITEM = /^(?:[-*•]|\d{1,2}[.)])\s+(.*)$/
const ORDERED = /^\d/
const RULE = /^(?:-{3,}|\*{3,}|_{3,})$/
const CELL_SEP = /^:?-{2,}:?$/

export function Markdown({ text }: { text: string }) {
  const lines = text.split('\n')
  const blocks: ReactNode[] = []
  let para: string[] = []
  let quote: string[] = []
  let list: { ordered: boolean; items: string[] } | null = null
  let rows: string[][] | null = null
  let key = 0

  const flushPara = () => {
    if (para.length) {
      blocks.push(
        <p key={key++}>
          {para.map((l, i) => (
            <span key={i}>
              {i > 0 && <br />}
              {inline(l)}
            </span>
          ))}
        </p>,
      )
      para = []
    }
  }
  const flushQuote = () => {
    if (quote.length) {
      blocks.push(<blockquote key={key++}>{inline(quote.join(' '))}</blockquote>)
      quote = []
    }
  }
  const flushList = () => {
    if (list) {
      const items = list.items.map((it, i) => <li key={i}>{inline(it)}</li>)
      blocks.push(list.ordered ? <ol key={key++}>{items}</ol> : <ul key={key++}>{items}</ul>)
      list = null
    }
  }
  const flushTable = () => {
    if (rows?.length) {
      const [head, ...body] = rows
      blocks.push(
        <table key={key++}>
          <thead>
            <tr>
              {head.map((c, i) => (
                <th key={i}>{inline(c)}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {body.map((r, i) => (
              <tr key={i}>
                {r.map((c, j) => (
                  <td key={j}>{inline(c)}</td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>,
      )
    }
    rows = null
  }
  const flushAll = () => {
    flushPara()
    flushQuote()
    flushList()
    flushTable()
  }

  for (let idx = 0; idx < lines.length; idx++) {
    const raw = lines[idx]
    const line = raw.trim()
    if (!line) {
      if (list?.ordered) {
        let next = idx + 1
        while (next < lines.length && !lines[next].trim()) next++
        const nextLine = next < lines.length ? lines[next].trim() : ''
        if (nextLine && LIST_ITEM.test(nextLine) && ORDERED.test(nextLine)) continue
      }
      flushAll()
      continue
    }

    if (line.startsWith('|')) {
      flushPara()
      flushQuote()
      flushList()
      const cells = line
        .replace(/^\|/, '')
        .replace(/\|$/, '')
        .split('|')
        .map((c) => c.trim())
      if (!cells.every((c) => CELL_SEP.test(c))) (rows ??= []).push(cells)
      continue
    }
    flushTable()

    if (RULE.test(line)) {
      flushAll()
      blocks.push(<hr key={key++} />)
      continue
    }

    const heading = HEADING.exec(line)
    if (heading) {
      flushAll()
      blocks.push(createElement(`h${Math.min(heading[1].length + 2, 6)}`, { key: key++ }, ...inline(heading[2])))
      continue
    }

    if (line.startsWith('>')) {
      flushPara()
      flushList()
      quote.push(line.replace(/^>\s?/, ''))
      continue
    }
    flushQuote()

    const item = LIST_ITEM.exec(line)
    if (item) {
      flushPara()
      if (!list) list = { ordered: ORDERED.test(line), items: [] }
      list.items.push(item[1])
      continue
    }
    flushList()

    para.push(line)
  }
  flushAll()

  return <div className="md">{blocks}</div>
}