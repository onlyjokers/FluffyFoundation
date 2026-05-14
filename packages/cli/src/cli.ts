/**
 * Purpose: Parse and execute live semantic graph commands for the ShuGu Manager CLI.
 */

import { ManagerSDK } from '@shugu/sdk-manager';
import type { SemanticCommandPayload, SemanticResultMessage } from '@shugu/protocol';

type ParsedGraphCommand = {
  action: 'semantic';
  requestId: string;
  command: SemanticCommandPayload;
  dryRun?: boolean;
};

type CliSdk = {
  connect(): void;
  disconnect(): void;
  sendSemanticCommand(input: {
    target: { mode: 'manager' };
    command: SemanticCommandPayload;
    requestId: string;
    dryRun: boolean;
  }): void;
  onSemanticResult(handler: (message: SemanticResultMessage) => void): () => void;
};

export type CliRunnerOptions = {
  createSdk?: () => CliSdk;
  writeStdout?: (text: string) => void;
  writeStderr?: (text: string) => void;
  timeoutMs?: number;
};

const defaultServerUrl = 'http://localhost:3001';

function readFlag(args: string[], name: string): string | undefined {
  const index = args.indexOf(name);
  if (index < 0) return undefined;
  return args[index + 1];
}

function hasFlag(args: string[], name: string): boolean {
  return args.includes(name);
}

function requireFlag(args: string[], name: string): string {
  const value = readFlag(args, name);
  if (!value) throw new Error(`${name} is required`);
  return value;
}

function parseNumber(value: string | undefined, fallback: number): number {
  if (value === undefined) return fallback;
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) throw new Error(`Expected number, got ${value}`);
  return parsed;
}

function parseEndpoint(value: string): { nodeId: string; portId: string } {
  const [nodeId, portId] = value.split('.');
  if (!nodeId || !portId) throw new Error(`Endpoint must use node.port format: ${value}`);
  return { nodeId, portId };
}

function parseValue(value: string): unknown {
  const numeric = Number(value);
  if (value.trim() !== '' && Number.isFinite(numeric)) return numeric;
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export function parseGraphCommand(args: string[]): ParsedGraphCommand {
  if (args[0] !== 'graph') throw new Error('Only graph commands are supported');
  const subcommand = args[1];
  const dryRun = hasFlag(args, '--dry-run');

  switch (subcommand) {
    case 'snapshot':
      return {
        action: 'semantic',
        requestId: 'graph-snapshot',
        command: {
          type: 'proposal.create',
          proposal: { id: 'graph-snapshot', title: 'Graph snapshot', commands: [] },
        },
        ...(dryRun ? { dryRun } : {}),
      };
    case 'add-node': {
      const type = requireFlag(args, '--type');
      const id = requireFlag(args, '--id');
      return {
        action: 'semantic',
        requestId: `add-node:${id}`,
        command: {
          type: 'node.add',
          node: {
            id,
            type,
            position: {
              x: parseNumber(readFlag(args, '--x'), 0),
              y: parseNumber(readFlag(args, '--y'), 0),
            },
            config: {},
            inputValues: {},
            outputValues: {},
          },
        },
        ...(dryRun ? { dryRun } : {}),
      };
    }
    case 'connect': {
      const from = requireFlag(args, '--from');
      const to = requireFlag(args, '--to');
      const source = parseEndpoint(from);
      const target = parseEndpoint(to);
      return {
        action: 'semantic',
        requestId: `connect:${from}->${to}`,
        command: {
          type: 'node.connect',
          connection: {
            id: `conn:${from}->${to}`,
            sourceNodeId: source.nodeId,
            sourcePortId: source.portId,
            targetNodeId: target.nodeId,
            targetPortId: target.portId,
          },
        },
        ...(dryRun ? { dryRun } : {}),
      };
    }
    case 'set-param': {
      const nodeId = requireFlag(args, '--node');
      const param = requireFlag(args, '--param');
      const value = parseValue(requireFlag(args, '--value'));
      return {
        action: 'semantic',
        requestId: `set-param:${nodeId}.${param}`,
        command: { type: 'node.params.update', nodeId, params: { [param]: value } },
        ...(dryRun ? { dryRun } : {}),
      };
    }
    case 'deploy': {
      const partition = requireFlag(args, '--partition');
      return {
        action: 'semantic',
        requestId: `deploy:${partition}`,
        command: {
          type: 'partition.deploy',
          partitionId: partition,
          nodeIds: readFlag(args, '--nodes')?.split(',').filter(Boolean) ?? [],
          targetPlatform: 'client',
        },
        ...(dryRun ? { dryRun } : {}),
      };
    }
    default:
      throw new Error(`Unsupported graph command: ${subcommand ?? ''}`);
  }
}

export function createCliRunner(options: CliRunnerOptions = {}) {
  const writeStdout = options.writeStdout ?? ((text: string) => process.stdout.write(text));
  const writeStderr = options.writeStderr ?? ((text: string) => process.stderr.write(text));
  const timeoutMs = options.timeoutMs ?? 5_000;

  return async (args: string[]): Promise<number> => {
    try {
      const parsed = parseGraphCommand(args);
      if (parsed.dryRun) {
        writeStdout(`${JSON.stringify({ ok: true, dryRun: true, command: parsed.command, requestId: parsed.requestId })}\n`);
        return 0;
      }

      const sdk =
        options.createSdk?.() ??
        new ManagerSDK({
          serverUrl: process.env.SHUGU_SERVER_URL ?? defaultServerUrl,
          managerKey: process.env.SHUGU_MANAGER_KEY,
          commandEnvelope: {
            actor: process.env.SHUGU_CLI_ACTOR ?? 'shugu-cli',
            role: 'manager',
            scopeGroupId: process.env.SHUGU_SCOPE_GROUP_ID ?? 'cli',
          },
        });

      const result = await new Promise<SemanticResultMessage>((resolve, reject) => {
        const timeout = setTimeout(() => reject(new Error(`Timed out waiting for ${parsed.requestId}`)), timeoutMs);
        const unsubscribe = sdk.onSemanticResult((message) => {
          if (message.requestId !== parsed.requestId) return;
          clearTimeout(timeout);
          unsubscribe();
          resolve(message);
        });
        sdk.connect();
        sdk.sendSemanticCommand({
          command: parsed.command,
          requestId: parsed.requestId,
          target: { mode: 'manager' },
          dryRun: false,
        });
      });

      sdk.disconnect();
      writeStdout(`${JSON.stringify(result)}\n`);
      return result.ok ? 0 : 1;
    } catch (error) {
      writeStderr(`${JSON.stringify({ ok: false, error: error instanceof Error ? error.message : String(error) })}\n`);
      return 1;
    }
  };
}

export async function runCli(args: string[] = process.argv.slice(2)): Promise<number> {
  return createCliRunner()(args);
}
