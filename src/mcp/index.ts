import { McpServer } from '@modelcontextprotocol/server';
import { serveStdio } from '@modelcontextprotocol/server/stdio';

import { registerTools } from './tools.ts';

serveStdio(() => {
  const server = new McpServer({ name: 'biogenesis', version: '1.0.0' });
  registerTools(server);
  return server;
});
