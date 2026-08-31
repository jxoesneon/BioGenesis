import { McpServer } from '@modelcontextprotocol/server';
import { z } from 'zod';
import fs from 'node:fs/promises';
import { type Dirent } from 'node:fs';
import path from 'node:path';
import { spawn, type SpawnOptions } from 'node:child_process';

import { isExcluded, PROJECT_ROOT, toProjectPath } from './paths.ts';

const MAX_FILE_BYTES = 1_000_000;
const MAX_SEARCH_RESULTS = 100;
const MAX_LIST_ENTRIES = 500;
const DEFAULT_TIMEOUT_MS = 30_000;
const MAX_TIMEOUT_MS = 300_000;

const text = (value: string) => ({ type: 'text' as const, text: value });
const error = (message: string) => ({ isError: true as const, content: [text(message)] });

const ReadFileSchema = z.object({
  path: z.string().describe('Project-relative or absolute file path'),
  offset: z.number().int().min(1).optional().describe('1-based starting line (optional)'),
  limit: z.number().int().min(1).max(1000).optional().describe('Max lines to return (optional)'),
});

const WriteFileSchema = z.object({
  path: z.string().describe('Project-relative or absolute file path'),
  content: z.string().describe('Full content to write'),
});

const ReplaceInFileSchema = z.object({
  path: z.string().describe('Project-relative or absolute file path'),
  old_string: z.string().describe('Exact substring to replace'),
  new_string: z.string().describe('Replacement substring'),
});

const ListDirectorySchema = z.object({
  path: z.string().optional().describe('Directory path (default: project root)'),
  recursive: z.boolean().optional().describe('List recursively (default: false)'),
});

const SearchCodeSchema = z.object({
  query: z.string().min(1).describe('Regex pattern to search for'),
  path: z.string().optional().describe('Subdirectory to search (default: project root)'),
  caseInsensitive: z.boolean().optional().describe('Case-insensitive search (default: true)'),
  maxResults: z.number().int().min(1).max(500).optional().describe('Max matches to return (default: 50)'),
});

const ExecCommandSchema = z.object({
  command: z.string().min(1).describe('Executable or command name'),
  args: z.array(z.string()).optional().describe('Arguments'),
  cwd: z.string().optional().describe('Working directory (default: project root)'),
  timeout: z.number().int().min(1000).max(MAX_TIMEOUT_MS).optional().describe('Timeout in ms (default: 30000)'),
});

const BuildCheckSchema = z.object({});
const GitStatusSchema = z.object({});
const ProjectSummarySchema = z.object({});

async function readTextFile(filePath: string, lineOffset?: number, lineLimit?: number): Promise<string> {
  const stats = await fs.stat(filePath).catch(() => null);
  if (!stats || !stats.isFile()) throw new Error(`Not a file: ${filePath}`);
  if (stats.size > MAX_FILE_BYTES) throw new Error(`File exceeds ${MAX_FILE_BYTES} bytes: ${filePath}`);

  const raw = await fs.readFile(filePath);
  if (raw.includes(0)) throw new Error(`Binary file cannot be read as text: ${filePath}`);

  let source = raw.toString('utf-8');
  if (lineOffset !== undefined || lineLimit !== undefined) {
    const start = Math.max((lineOffset ?? 1) - 1, 0);
    const lines = source.split(/\r?\n/);
    const end = lineLimit !== undefined ? Math.min(start + lineLimit, lines.length) : lines.length;
    const slice = lines.slice(start, end);
    const prefix = start > 0 ? `... (lines 1-${start} omitted) ...\n` : '';
    source = prefix + slice.join('\n');
  }
  return source;
}

async function* walkFiles(
  dir: string,
  maxDepth: number,
  currentDepth = 0,
): AsyncGenerator<string> {
  if (currentDepth > maxDepth) return;
  const entries: Dirent[] = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (isExcluded(fullPath)) continue;
    if (entry.isDirectory()) {
      if (currentDepth < maxDepth) {
        yield* walkFiles(fullPath, maxDepth, currentDepth + 1);
      }
    } else if (entry.isFile()) {
      yield fullPath;
    }
  }
}

async function collectFiles(root: string, maxDepth: number): Promise<string[]> {
  const files: string[] = [];
  for await (const f of walkFiles(root, maxDepth)) {
    files.push(f);
    if (files.length >= MAX_LIST_ENTRIES) break;
  }
  return files;
}

function runCommand(
  command: string,
  args: string[],
  cwd: string,
  timeoutMs: number,
): Promise<{ stdout: string; stderr: string; exitCode: number }> {
  return new Promise((resolve, reject) => {
    const options: SpawnOptions = { cwd, shell: false };
    const child = spawn(command, args, options);
    let stdout = '';
    let stderr = '';
    const timer = setTimeout(() => child.kill('SIGTERM'), timeoutMs);

    child.stdout?.setEncoding('utf-8');
    child.stderr?.setEncoding('utf-8');
    child.stdout?.on('data', (d) => {
      stdout += d;
    });
    child.stderr?.on('data', (d) => {
      stderr += d;
    });
    child.on('error', (err) => {
      clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve({ stdout, stderr, exitCode: code ?? 0 });
    });
  });
}

function jsonResult(value: unknown) {
  return { content: [text(JSON.stringify(value, null, 2))] };
}

export function registerTools(server: McpServer): void {
  server.registerTool(
    'biogenesis_read_file',
    { description: 'Read a project file as text.', inputSchema: ReadFileSchema },
    async (args: z.infer<typeof ReadFileSchema>) => {
      try {
        const filePath = toProjectPath(args.path);
        const result = await readTextFile(filePath, args.offset, args.limit);
        return { content: [text(result)] };
      } catch (err) {
        return error(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    'biogenesis_write_file',
    { description: 'Create or overwrite a project file.', inputSchema: WriteFileSchema },
    async (args: z.infer<typeof WriteFileSchema>) => {
      try {
        const filePath = toProjectPath(args.path);
        const dir = path.dirname(filePath);
        if (isExcluded(dir) || isExcluded(filePath)) {
          throw new Error(`Writing to excluded path is not allowed: ${args.path}`);
        }
        await fs.mkdir(dir, { recursive: true });
        await fs.writeFile(filePath, args.content, 'utf-8');
        return { content: [text(`Wrote ${filePath}`)] };
      } catch (err) {
        return error(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    'biogenesis_replace_in_file',
    {
      description: 'Apply an exact string replacement in a project file.',
      inputSchema: ReplaceInFileSchema,
    },
    async (args: z.infer<typeof ReplaceInFileSchema>) => {
      try {
        const filePath = toProjectPath(args.path);
        const source = await fs.readFile(filePath, 'utf-8');
        const matches = source.split(args.old_string).length - 1;
        if (matches === 0) throw new Error(`old_string not found in ${args.path}`);
        if (matches > 1) throw new Error(`old_string is not unique in ${args.path} (${matches} matches)`);
        const updated = source.replace(args.old_string, args.new_string);
        await fs.writeFile(filePath, updated, 'utf-8');
        return { content: [text(`Replaced 1 occurrence in ${filePath}`)] };
      } catch (err) {
        return error(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    'biogenesis_list_directory',
    {
      description: 'List files and directories within the project.',
      inputSchema: ListDirectorySchema,
    },
    async (args: z.infer<typeof ListDirectorySchema>) => {
      try {
        const dir = args.path ? toProjectPath(args.path) : PROJECT_ROOT;
        const stats = await fs.stat(dir).catch(() => null);
        if (!stats || !stats.isDirectory()) throw new Error(`Not a directory: ${args.path ?? '.'}`);

        if (args.recursive) {
          const files = await collectFiles(dir, 20);
          return jsonResult({ root: dir, count: files.length, files: files.map((p) => path.relative(PROJECT_ROOT, p)) });
        }

        const entries: Dirent[] = await fs.readdir(dir, { withFileTypes: true }).catch(() => []);
        const list = entries
          .filter((e) => !isExcluded(path.join(dir, e.name)))
          .map((e) => ({ name: e.name, type: e.isDirectory() ? 'directory' : 'file' }))
          .sort((a, b) => (a.type === b.type ? a.name.localeCompare(b.name) : a.type.localeCompare(b.type)));
        return jsonResult({ path: path.relative(PROJECT_ROOT, dir), entries: list });
      } catch (err) {
        return error(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    'biogenesis_search_code',
    {
      description: 'Search the project source code with a regex.',
      inputSchema: SearchCodeSchema,
    },
    async (args: z.infer<typeof SearchCodeSchema>) => {
      try {
        const root = args.path ? toProjectPath(args.path) : PROJECT_ROOT;
        const flags = args.caseInsensitive !== false ? 'i' : '';
        const regex = new RegExp(args.query, flags);
        const maxResults = args.maxResults ?? 50;
        const files = await collectFiles(root, 20);
        const results: { file: string; line: number; text: string }[] = [];

        for (const file of files) {
          if (results.length >= maxResults) break;
          const stats = await fs.stat(file).catch(() => null);
          if (!stats || stats.size > MAX_FILE_BYTES) continue;
          const raw = await fs.readFile(file).catch(() => null);
          if (!raw || raw.includes(0)) continue;
          const lines = raw.toString('utf-8').split(/\r?\n/);
          for (let i = 0; i < lines.length; i++) {
            if (regex.test(lines[i])) {
              results.push({
                file: path.relative(PROJECT_ROOT, file),
                line: i + 1,
                text: lines[i].slice(0, 240),
              });
              if (results.length >= maxResults) break;
            }
          }
        }
        return jsonResult({ query: args.query, count: results.length, results });
      } catch (err) {
        return error(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    'biogenesis_exec_command',
    {
      description: 'Run a command in the project directory.',
      inputSchema: ExecCommandSchema,
    },
    async (args: z.infer<typeof ExecCommandSchema>) => {
      try {
        const cwd = args.cwd ? toProjectPath(args.cwd) : PROJECT_ROOT;
        const command = args.command;
        const commandArgs = args.args ?? [];
        const timeout = args.timeout ?? DEFAULT_TIMEOUT_MS;
        const result = await runCommand(command, commandArgs, cwd, timeout);
        return jsonResult({ command, args: commandArgs, cwd: path.relative(PROJECT_ROOT, cwd), ...result });
      } catch (err) {
        return error(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    'biogenesis_build_check',
    {
      description: 'Run the project type-check gate (tsc --noEmit).',
      inputSchema: BuildCheckSchema,
    },
    async () => {
      try {
        const result = await runCommand('npx', ['tsc', '--noEmit'], PROJECT_ROOT, 120000);
        if (result.exitCode !== 0) {
          return { isError: true, content: [text(result.stdout + result.stderr)] };
        }
        return { content: [text('tsc --noEmit passed')] };
      } catch (err) {
        return error(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    'biogenesis_git_status',
    {
      description: 'Show current git branch and working tree status.',
      inputSchema: GitStatusSchema,
    },
    async () => {
      try {
        const [status, branch] = await Promise.all([
          runCommand('git', ['status', '--short'], PROJECT_ROOT, 10000),
          runCommand('git', ['branch', '--show-current'], PROJECT_ROOT, 10000),
        ]);
        return jsonResult({
          branch: branch.stdout.trim(),
          exitCode: status.exitCode,
          status: status.stdout,
          stderr: status.stderr,
        });
      } catch (err) {
        return error(err instanceof Error ? err.message : String(err));
      }
    },
  );

  server.registerTool(
    'biogenesis_project_summary',
    {
      description: 'Return a concise summary of the BioGenesis project.',
      inputSchema: ProjectSummarySchema,
    },
    async () => ({
      content: [text(`BioGenesis is a TypeScript + React 19 + Vite 6 + Tailwind 4 + Three.js living-ship editor.
Project root: ${PROJECT_ROOT}
Key docs: LORE.md, ORGAN_SYSTEMS.md, AGENTS.md
Key code: src/components/Canvas3D.tsx, src/utils/proceduralPipeline.ts, src/utils/organBlending.ts
Build gate: npm run lint (tsc --noEmit)`)],
    }),
  );
}
