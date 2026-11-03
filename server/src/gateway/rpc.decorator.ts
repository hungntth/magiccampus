// @Rpc('methodName') marks a provider method as a client-callable RPC.
// Handlers receive (session, args[]) and return the result (or throw RpcException).

import 'reflect-metadata';

export const RPC_METHOD_KEY = Symbol('rpc:method');
export const RPC_OPTIONS_KEY = Symbol('rpc:options');

export interface RpcOptions {
  requireAuth?: boolean;
  requireCharacter?: boolean;
  quiet?: boolean;
}

export function Rpc(name: string, options: RpcOptions = {}): MethodDecorator {
  return (target, propertyKey) => {
    Reflect.defineMetadata(RPC_METHOD_KEY, name, target, propertyKey);
    Reflect.defineMetadata(RPC_OPTIONS_KEY, options, target, propertyKey);
  };
}
