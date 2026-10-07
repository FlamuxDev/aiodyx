import { SITE } from '../lib/site';

const bots = ['*', 'GPTBot', 'OAI-SearchBot', 'ChatGPT-User', 'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'PerplexityBot', 'Perplexity-User', 'Google-Extended', 'Applebot-Extended', 'CCBot'];

export const GET = () =>
  new Response(
    [...bots.map((b) => `User-agent: ${b}\nAllow: /\n`), `Sitemap: ${SITE}/sitemap-index.xml`, `# LLM-readable summaries: ${SITE}/llms.txt`, ''].join('\n'),
    { headers: { 'Content-Type': 'text/plain; charset=utf-8' } },
  );
