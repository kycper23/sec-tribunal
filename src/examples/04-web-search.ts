/**
 * 04 — Web search, run by OpenRouter.
 *
 * Server tools are tools the model can call that OpenRouter executes for you:
 * web search, web fetch, image generation, a sandboxed shell, subagents. You
 * declare them; the model decides when. Nothing to host.
 *
 *   pnpm search "what did OpenRouter ship this week"
 */
import { DEFAULT_MODEL, openrouterFetch } from '../lib/openrouter.js'

const question = process.argv.slice(2).join(' ') || 'What is the latest news about Robinhood Chain?'

const res = await openrouterFetch('/chat/completions', {
  method: 'POST',
  body: JSON.stringify({
    model: DEFAULT_MODEL,
    messages: [{ role: 'user', content: `${question} Cite sources.` }],
    tools: [{ type: 'openrouter:web_search', parameters: { max_uses: 3 } }],
    max_tool_calls: 5,
  }),
})

if (!res.ok) throw new Error(`${res.status} ${await res.text()}`)
const body = (await res.json()) as {
  choices: Array<{ message: { content: string | null } }>
  usage?: { server_tool_use?: Record<string, number> }
}

console.log(body.choices[0].message.content)
if (body.usage?.server_tool_use) console.log('\nserver tools used:', body.usage.server_tool_use)
