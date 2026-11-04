// GM gate for dev/GM RPCs (`@Rpc(..., { requireGm: true })`): allowed for accounts with gmLevel > 0, or for everyone when the
// server runs with DEV_COMMANDS enabled (local development). Pure so it can be unit-tested without a socket.

export interface GmGateInput {
  requireGm?: boolean;
  gmLevel: number;
  devCommands: boolean;
}

export function gmAllowed(input: GmGateInput): boolean {
  if (!input.requireGm) return true;
  return input.devCommands || input.gmLevel > 0;
}

/** Truthy env flag: "1", "true", "yes" (case-insensitive). */
export function envFlag(value: string | undefined): boolean {
  return value !== undefined && ['1', 'true', 'yes'].includes(value.trim().toLowerCase());
}
