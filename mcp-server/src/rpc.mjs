/**
 * Minimal MCP stdio transport — JSON-RPC 2.0 over newline-delimited stdin/stdout.
 * Zero dependencies on purpose: `node index.mjs` must work on a fresh machine
 * with nothing but Node installed.
 */
import { createInterface } from 'node:readline';

const PROTOCOL_VERSIONS = ['2025-06-18', '2025-03-26', '2024-11-05'];

export function serve({ name, version, tools, instructions }) {
  const byName = new Map(tools.map((t) => [t.name, t]));
  const out = (msg) => process.stdout.write(JSON.stringify(msg) + '\n');
  const log = (...a) => process.stderr.write(a.join(' ') + '\n');

  const reply = (id, result) => out({ jsonrpc: '2.0', id, result });
  const fail = (id, code, message, data) =>
    out({ jsonrpc: '2.0', id, error: { code, message, ...(data ? { data } : {}) } });

  const handlers = {
    initialize(params) {
      const wanted = params?.protocolVersion;
      return {
        protocolVersion: PROTOCOL_VERSIONS.includes(wanted) ? wanted : PROTOCOL_VERSIONS[0],
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name, version },
        ...(instructions ? { instructions } : {}),
      };
    },
    ping: () => ({}),
    'tools/list': () => ({
      tools: tools.map((t) => ({
        name: t.name,
        description: t.description,
        inputSchema: t.inputSchema,
      })),
    }),
    async 'tools/call'(params) {
      const tool = byName.get(params?.name);
      if (!tool) {
        return {
          isError: true,
          content: [{ type: 'text', text: `Neznámy nástroj: ${params?.name}` }],
        };
      }
      try {
        const result = await tool.handler(params.arguments ?? {});
        const text = typeof result === 'string' ? result : JSON.stringify(result, null, 2);
        return { content: [{ type: 'text', text }] };
      } catch (err) {
        log(`[${tool.name}] ${err?.stack ?? err}`);
        return {
          isError: true,
          content: [{ type: 'text', text: `Chyba v ${tool.name}: ${err?.message ?? err}` }],
        };
      }
    },
  };

  const rl = createInterface({ input: process.stdin, crlfDelay: Infinity });
  rl.on('line', async (line) => {
    const trimmed = line.trim();
    if (!trimmed) return;
    let msg;
    try {
      msg = JSON.parse(trimmed);
    } catch {
      return fail(null, -32700, 'Parse error');
    }
    // Notifications carry no id and expect no response.
    if (msg.id === undefined) return;
    const handler = handlers[msg.method];
    if (!handler) return fail(msg.id, -32601, `Method not found: ${msg.method}`);
    try {
      reply(msg.id, await handler(msg.params));
    } catch (err) {
      fail(msg.id, -32603, err?.message ?? 'Internal error');
    }
  });

  rl.on('close', () => process.exit(0));
  log(`${name} v${version} beží na stdio — ${tools.length} nástrojov.`);
}
