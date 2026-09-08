# strict-glob

A glob pattern matcher for TypeScript that refuses to guess.

Most glob libraries accept almost anything and silently interpret it some
way: a trailing slash gets dropped, a stray `[` gets treated as a literal
character, `a**b` quietly becomes `a*b`. That's convenient until the pattern
came from a config file or a user, and the "reasonable" interpretation isn't
the one anybody meant. A pattern that matches the wrong files is worse than
one that fails to compile.

`strict-glob` validates the pattern before compiling it. By default it
throws a `GlobSyntaxError` on anything ambiguous. If you want the permissive
behavior anyway, pass `lenient: true` and get it explicitly, instead of by
accident.

## Install

No dependencies, nothing to install beyond the package itself. Copy `src/`
into your project or build it with `tsc` (any recent TypeScript will do).

## Usage

```ts
import { compileGlob, matchGlob, GlobSyntaxError } from './src/index.js'

matchGlob('src/**/*.ts', 'src/lib/parser.ts') // true
matchGlob('src/**/*.ts', 'src/lib/parser.js') // false

// Compile once, test many paths.
const readme = compileGlob('*.md')
readme.test('README.md') // true
readme.test('docs/README.md') // false, "*" doesn't cross "/"
```

### Strict by default

```ts
try {
  compileGlob('build/') // trailing slash: which directory boundary did you mean?
} catch (err) {
  if (err instanceof GlobSyntaxError) {
    console.error(err.message)
    // GlobSyntaxError: trailing slash is ambiguous here, drop it, or match
    // "dir/**" explicitly (pattern: "build/")
  }
}

compileGlob('a**b')      // throws: "**" must occupy a whole path segment
compileGlob('src\\lib')  // throws: backslashes are not allowed
compileGlob('a[bc')      // throws: unmatched "[" in character class
```

### Opting into lenient mode

```ts
compileGlob('build/', { lenient: true })  // matches like "build"
compileGlob('a**b', { lenient: true })    // matches like "a*b"
compileGlob('src\\lib', { lenient: true }) // "\" treated as "/"
```

Lenient mode never throws for the constructs above; it degrades to the
closest sane interpretation instead. It still can't do anything useful with
input that has no reasonable meaning at all (an empty pattern still matches
nothing).

## Pattern syntax

| Token   | Meaning                                                |
|---------|---------------------------------------------------------|
| `*`     | any run of characters, not crossing a `/`               |
| `**`    | any run of characters, including `/` (own segment only) |
| `?`     | exactly one character, not `/`                          |
| `[abc]` | one of `a`, `b`, or `c`                                  |
| `[!abc]`| any character except `a`, `b`, or `c`                    |

Brace expansion (`{a,b}`) isn't implemented yet; see the roadmap in the repo
history. In strict mode a pattern containing `{` or `}` is rejected rather
than silently treated as a literal, so code written against this version
won't change meaning once expansion lands.

## Status

Early skeleton. The matcher covers the token table above; nested character
classes, brace expansion, and a `.gitignore`-style negation prefix are not
implemented yet.
