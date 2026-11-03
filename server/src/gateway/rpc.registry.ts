// Discovers every @Rpc-decorated method on Nest providers and dispatches calls to them.
// Equivalent of the old dispatcher.go: method -> handler map, auth gating, quiet logging.

import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import { DiscoveryService, MetadataScanner } from '@nestjs/core';
import { RPC_METHOD_KEY, RPC_OPTIONS_KEY, type RpcOptions } from './rpc.decorator';
import { RpcException } from './errors';
import type { Session } from './session';

export type RpcHandler = (session: Session, args: unknown[]) => Promise<unknown> | unknown;

interface Registered {
  handler: RpcHandler;
  options: RpcOptions;
  owner: string;
}

@Injectable()
export class RpcRegistry implements OnModuleInit {
  private readonly logger = new Logger(RpcRegistry.name);
  private readonly handlers = new Map<string, Registered>();

  constructor(
    private readonly discovery: DiscoveryService,
    private readonly scanner: MetadataScanner,
  ) {}

  onModuleInit(): void {
    for (const wrapper of this.discovery.getProviders()) {
      const instance = wrapper.instance as Record<string, unknown> | undefined;
      if (!instance || typeof instance !== 'object') continue;
      const proto = Object.getPrototypeOf(instance) as object;
      if (!proto) continue;
      for (const key of this.scanner.getAllMethodNames(proto)) {
        const name = Reflect.getMetadata(RPC_METHOD_KEY, proto, key) as string | undefined;
        if (!name) continue;
        const options = (Reflect.getMetadata(RPC_OPTIONS_KEY, proto, key) as RpcOptions) ?? {};
        const fn = (instance[key] as (...a: unknown[]) => unknown).bind(instance);
        this.register(name, fn as RpcHandler, options, `${wrapper.name}.${key}`);
      }
    }
    this.logger.log(`Registered ${this.handlers.size} RPC methods`);
  }

  register(name: string, handler: RpcHandler, options: RpcOptions, owner: string): void {
    if (this.handlers.has(name)) {
      this.logger.warn(`RPC ${name} re-registered by ${owner} (was ${this.handlers.get(name)?.owner})`);
    }
    this.handlers.set(name, { handler, options, owner });
  }

  has(name: string): boolean {
    return this.handlers.has(name);
  }

  isQuiet(name: string): boolean {
    return this.handlers.get(name)?.options.quiet === true;
  }

  async dispatch(session: Session, name: string, args: unknown[]): Promise<unknown> {
    const entry = this.handlers.get(name);
    if (!entry) throw new RpcException('UNKNOWN_METHOD', `unknown method ${name}`);
    const { options } = entry;
    if ((options.requireAuth || options.requireCharacter) && !session.isAuthenticated) {
      throw RpcException.unauthorized('login required');
    }
    if (options.requireCharacter && !session.hasCharacter) {
      throw RpcException.unauthorized('character not selected');
    }
    return entry.handler(session, args);
  }

  list(): string[] {
    return [...this.handlers.keys()].sort();
  }
}
