// RPC error type: handlers throw this to return a structured error to the client.

import { ErrorCodes, type RpcError } from '@mc/shared';

export class RpcException extends Error {
  constructor(
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }

  toWire(): RpcError {
    return { code: this.code, msg: this.message };
  }

  static invalidArgs(msg = 'invalid arguments'): RpcException {
    return new RpcException(ErrorCodes.INVALID_ARGS, msg);
  }

  static unauthorized(msg = 'unauthorized'): RpcException {
    return new RpcException(ErrorCodes.UNAUTHORIZED, msg);
  }

  static notFound(msg = 'not found'): RpcException {
    return new RpcException(ErrorCodes.NOT_FOUND, msg);
  }

  static alreadyExists(msg = 'already exists'): RpcException {
    return new RpcException(ErrorCodes.ALREADY_EXISTS, msg);
  }

  static forbidden(msg = 'forbidden'): RpcException {
    return new RpcException(ErrorCodes.FORBIDDEN, msg);
  }
}
