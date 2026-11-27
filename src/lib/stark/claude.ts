// Calls Claude the same way the AI Sidekick does (/api/ai-chat): same key and model.
const MODEL = 'claude-sonnet-4-6';

type Content = string | ({ type: 'text'; text: string } | { type: 'image'; source: { type: 'base64'; media_type: string; data: string } })[];

export async function askClaude(system: string, content: Content, maxTokens = 3000): Promise<string> {
  const key = process.env.ANTHROPIC_API_KEY;
  if (!key) throw new Error('ANTHROPIC_API_KEY is missing in Vercel');
  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-api-key': key, 'anthropic-version': '2023-06-01' },
    body: JSON.stringify({ model: MODEL, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }),
    cache: 'no-store',
  });
  const json: any = await res.json();
  if (!res.ok) throw new Error(`Claude: ${json?.error?.message || res.status}`);
  return (json.content || []).filter((b: any) => b.type === 'text').map((b: any) => b.text).join('\n');
}

// Claude is asked for JSON only; this strips stray code fences and parses it.
export function parseJson<T>(text: string): T {
  const clean = text.replace(/```json|```/g, '').trim();
  const start = clean.search(/[[{]/);
  if (start < 0) throw new Error('Claude did not return JSON');
  return JSON.parse(clean.slice(start)) as T;
}
