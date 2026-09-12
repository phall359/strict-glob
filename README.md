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
| `{a,b}` | either alternative, expanded before the pattern is compiled |

`{a,b}` alternatives can nest (`{a,{b,c}}`) and can appear anywhere in the
pattern, including inside a single path segment (`*.{js,ts}`). A brace
group without a top-level comma, like `{foo}`, isn't a real alternation and
is left as a literal `{foo}`, matching shell behavior. An unmatched `{`
is rejected in strict mode, the same as an unmatched `[`.

```ts
matchGlob('*.{js,ts}', 'index.ts')          // true
matchGlob('{src,lib}/**/*.ts', 'lib/a.ts')  // true
compileGlob('a{b,c')                        // throws: unmatched "{"
```

`CompiledGlob.patterns` holds the normalized pattern(s) after brace
expansion; a pattern with no braces still compiles to a single-element
array.

## Status

Early skeleton. The matcher covers the token table above; nested character
classes and a `.gitignore`-style negation prefix are not implemented yet.
