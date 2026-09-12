import { expandBraces, normalizePattern } from './parser.js'

export { GlobSyntaxError } from './parser.js'

export interface GlobOptions {
  /**
   * Accept ambiguous or malformed patterns instead of throwing, and do
   * the closest reasonable thing instead. Off by default.
   */
  lenient?: boolean
}

export interface CompiledGlob {
  /**
   * The pattern(s) after brace expansion and normalization. There's more
   * than one entry when the input used "{a,b}" alternation; each may also
   * differ from the input in lenient mode.
   */
  readonly patterns: readonly string[]
  readonly regExp: RegExp
  test(path: string): boolean
}

export function compileGlob(pattern: string, options: GlobOptions = {}): CompiledGlob {
  const lenient = options.lenient ?? false
  const patterns = expandBraces(pattern, { lenient }).map((variant) =>
    normalizePattern(variant, { lenient }),
  )
  const regExp = toRegExp(patterns)
  return {
    patterns,
    regExp,
    test(path: string): boolean {
      return regExp.test(path)
    },
  }
}

export function matchGlob(pattern: string, path: string, options: GlobOptions = {}): boolean {
  return compileGlob(pattern, options).test(path)
}

// Escapes regex metacharacters that aren't already meaningful in a glob.
// "[", "]", "*" and "?" are handled separately by translateSegment.
const REGEXP_SPECIALS = /[.+^${}()|\\]/g

function toRegExp(patterns: string[]): RegExp {
  const alternatives = patterns.map(toRegExpSource)
  return new RegExp(`^(?:${alternatives.join('|')})$`)
}

function toRegExpSource(pattern: string): string {
  const segments = pattern.split('/')
  const parts: string[] = []

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i] as string
    const isLast = i === segments.length - 1

    if (segment === '**') {
      if (isLast) {
        parts.push('.*')
      } else {
        // "**/" swallows zero or more whole segments, slash included,
        // so the loop below must not also emit a literal separator.
        parts.push('(?:.*/)?')
        continue
      }
    } else {
      parts.push(translateSegment(segment))
    }

    if (!isLast) parts.push('/')
  }

  return parts.join('')
}

function translateSegment(segment: string): string {
  let out = ''
  for (let i = 0; i < segment.length; i++) {
    const ch = segment[i] as string
    if (ch === '*') {
      out += '[^/]*'
    } else if (ch === '?') {
      out += '[^/]'
    } else if (ch === '[') {
      const close = segment.indexOf(']', i + 1)
      if (close === -1) {
        // stray "[" with no matching "]": only reachable in lenient mode,
        // since normalizePattern rejects this in strict mode
        out += '\\['
      } else {
        let body = segment.slice(i + 1, close)
        if (body.startsWith('!')) body = '^' + body.slice(1)
        out += `[${body}]`
        i = close
      }
    } else {
      out += ch.replace(REGEXP_SPECIALS, '\\$&')
    }
  }
  return out
}
