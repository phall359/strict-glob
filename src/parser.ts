export class GlobSyntaxError extends Error {
  readonly pattern: string

  constructor(message: string, pattern: string) {
    super(`${message} (pattern: ${JSON.stringify(pattern)})`)
    this.name = 'GlobSyntaxError'
    this.pattern = pattern
  }
}

export interface NormalizeOptions {
  lenient: boolean
}

/**
 * Rejects ambiguous or malformed patterns and returns a normalized form
 * ready for translation into a regular expression.
 *
 * In strict mode (the default) anything ambiguous is rejected outright: a
 * glob that quietly compiles to the wrong matcher is a worse failure than
 * one that refuses to compile. Pass { lenient: true } to accept the same
 * kind of sloppy input a shell or fnmatch would, best-effort.
 */
export function normalizePattern(pattern: string, options: NormalizeOptions): string {
  const { lenient } = options

  if (pattern.length === 0) {
    if (lenient) return pattern
    throw new GlobSyntaxError('empty glob pattern', pattern)
  }

  let working = pattern

  if (working.includes('\\')) {
    if (!lenient) {
      throw new GlobSyntaxError(
        'backslashes are not allowed; use forward slashes as the path separator',
        pattern,
      )
    }
    working = working.replace(/\\/g, '/')
  }

  if (/\/\/+/.test(working)) {
    if (!lenient) {
      throw new GlobSyntaxError('repeated path separators ("//")', pattern)
    }
    working = working.replace(/\/\/+/g, '/')
  }

  if (working.length > 1 && working.endsWith('/')) {
    if (!lenient) {
      throw new GlobSyntaxError(
        'trailing slash is ambiguous here; drop it, or match "dir/**" explicitly',
        pattern,
      )
    }
    working = working.slice(0, -1)
  }

  if (working.includes('{') || working.includes('}')) {
    if (!lenient) {
      throw new GlobSyntaxError('brace expansion ("{a,b}") is not supported yet', pattern)
    }
    // left as literal characters; the translator escapes them
  }

  if (hasUnmatchedBracket(working) && !lenient) {
    throw new GlobSyntaxError('unmatched "[" in character class', pattern)
  }

  if (!lenient) {
    for (const segment of working.split('/')) {
      if (segment.includes('**') && segment !== '**') {
        throw new GlobSyntaxError(
          `"**" must occupy a whole path segment, found it inside "${segment}"`,
          pattern,
        )
      }
    }
  }

  return working
}

function hasUnmatchedBracket(pattern: string): boolean {
  let inBracket = false
  for (const ch of pattern) {
    if (ch === '[' && !inBracket) {
      inBracket = true
    } else if (ch === ']' && inBracket) {
      inBracket = false
    }
  }
  return inBracket
}
