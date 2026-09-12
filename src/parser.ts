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

/**
 * Expands "{a,b}" alternation into the set of concrete patterns it stands
 * for, e.g. "a{b,c}d" -> ["abd", "acd"]. Runs before normalizePattern so
 * that every other check (trailing slash, "**" placement, ...) sees the
 * same concrete strings a caller would have written by hand.
 *
 * A "[...]" character class is treated as opaque: braces and commas inside
 * one don't participate in expansion, matching how brackets work everywhere
 * else in the pattern language.
 */
export function expandBraces(pattern: string, options: NormalizeOptions): string[] {
  const { lenient } = options
  const open = findBraceOutsideBracket(pattern)
  if (open === -1) return [pattern]

  const close = findMatchingBrace(pattern, open)
  if (close === -1) {
    if (!lenient) {
      throw new GlobSyntaxError('unmatched "{" in brace expansion', pattern)
    }
    // Stray "{" with no partner: leave it as a literal character and keep
    // scanning the rest of the pattern for real brace groups.
    const prefix = pattern.slice(0, open + 1)
    return expandBraces(pattern.slice(open + 1), options).map((rest) => prefix + rest)
  }

  const prefix = pattern.slice(0, open)
  const body = pattern.slice(open + 1, close)
  const suffix = pattern.slice(close + 1)
  const branches = splitTopLevelCommas(body)
  const suffixExpansions = expandBraces(suffix, options)

  if (branches.length < 2) {
    // No top-level comma, so this isn't a real alternation (matches shell
    // behavior): keep the braces as literal characters.
    return suffixExpansions.map((rest) => `${prefix}{${body}}${rest}`)
  }

  const results: string[] = []
  for (const branch of branches) {
    for (const expandedBranch of expandBraces(branch, options)) {
      for (const rest of suffixExpansions) {
        results.push(prefix + expandedBranch + rest)
      }
    }
  }
  return results
}

function findBraceOutsideBracket(pattern: string): number {
  let inBracket = false
  for (let i = 0; i < pattern.length; i++) {
    const ch = pattern[i]
    if (ch === '[' && !inBracket) {
      inBracket = true
    } else if (ch === ']' && inBracket) {
      inBracket = false
    } else if (ch === '{' && !inBracket) {
      return i
    }
  }
  return -1
}

function findMatchingBrace(pattern: string, openIndex: number): number {
  let depth = 0
  let inBracket = false
  for (let i = openIndex; i < pattern.length; i++) {
    const ch = pattern[i]
    if (ch === '[' && !inBracket) {
      inBracket = true
    } else if (ch === ']' && inBracket) {
      inBracket = false
    } else if (inBracket) {
      continue
    } else if (ch === '{') {
      depth++
    } else if (ch === '}') {
      depth--
      if (depth === 0) return i
    }
  }
  return -1
}

function splitTopLevelCommas(body: string): string[] {
  const parts: string[] = []
  let depth = 0
  let inBracket = false
  let start = 0
  for (let i = 0; i < body.length; i++) {
    const ch = body[i]
    if (ch === '[' && !inBracket) {
      inBracket = true
    } else if (ch === ']' && inBracket) {
      inBracket = false
    } else if (inBracket) {
      continue
    } else if (ch === '{') {
      depth++
    } else if (ch === '}') {
      depth--
    } else if (ch === ',' && depth === 0) {
      parts.push(body.slice(start, i))
      start = i + 1
    }
  }
  parts.push(body.slice(start))
  return parts
}
