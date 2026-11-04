// Pure helpers of the feature store (character_features): state field patching.

export type FeatureState = Record<string, unknown>;

/** `{field: value}` -> `{'state.field': value}`; keys must be plain identifiers (no dots / $). */
export function statePatch(fields: FeatureState): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(fields)) {
    if (!/^[A-Za-z0-9_]+$/.test(k)) throw new Error(`bad feature field name: ${k}`);
    out[`state.${k}`] = v;
  }
  return out;
}
