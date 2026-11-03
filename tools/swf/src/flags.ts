// Go-style flag parsing (-name value, -name=value, --name value, bare -bool) so the command lines
// from the old Go tools keep working. Parsing stops at the first positional argument or "--".

type FlagValue = string | number | boolean;

export function parseFlags<T extends Record<string, FlagValue>>(
  defaults: T,
  usage: string,
  argv = process.argv.slice(2),
): { flags: T; args: string[] } {
  const flags: Record<string, FlagValue> = { ...defaults };
  let i = 0;
  for (; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--') {
      i++;
      break;
    }
    if (!a.startsWith('-') || a === '-') break;
    const body = a.replace(/^--?/, '');
    const eq = body.indexOf('=');
    const name = eq < 0 ? body : body.slice(0, eq);
    if (name === 'h' || name === 'help') {
      console.log(usage);
      process.exit(0);
    }
    if (!(name in defaults)) fail(`flag provided but not defined: -${name}`, usage);
    const kind = typeof defaults[name];
    let value: string;
    if (eq >= 0) value = body.slice(eq + 1);
    else if (kind === 'boolean') value = 'true';
    else if (i + 1 < argv.length) value = argv[++i];
    else fail(`flag needs an argument: -${name}`, usage);
    if (kind === 'boolean') {
      if (value !== 'true' && value !== 'false') fail(`invalid boolean value ${JSON.stringify(value)} for -${name}`, usage);
      flags[name] = value === 'true';
    } else if (kind === 'number') {
      const n = Number(value);
      if (!Number.isInteger(n)) fail(`invalid value ${JSON.stringify(value)} for -${name}`, usage);
      flags[name] = n;
    } else {
      flags[name] = value;
    }
  }
  return { flags: flags as T, args: argv.slice(i) };
}

function fail(msg: string, usage: string): never {
  console.error(msg);
  console.error(usage);
  process.exit(2);
}

// Old Flash client asset cache: md5-named blobs.
export const DEFAULT_CACHE = 'D:\\mcgame\\frontend\\s\\res';

export const MD5_RE = /^[a-f0-9]{32}$/;
