// @storyline/runtime is plain JavaScript, no per-module type
// declarations. TypeScript callers go through these wildcard
// declarations so import paths resolve and the imported namespace is
// typed `any` — same type-fidelity we had when consumers used
// `await import(path.join(...))` against extension/lib/.
//
// CB-01b. The proper fix is porting runtime to TypeScript, but that's
// out of scope for the lib-extraction step itself.
//
// TypeScript's `declare module 'foo/*'` wildcard only matches a single
// path segment, so nested subpaths need their own line. The dynamic
// importers in extension/src/compile/compile-runner.ts and
// extension/src/extension.ts cover the surface — keep this in sync if
// new dynamic imports are added.

declare module '@storyline/runtime' {
  const m: Record<string, unknown>
  export = m
}

// Top-level files: @storyline/runtime/<file>.js
declare module '@storyline/runtime/doctor.js' {
  const m: Record<string, unknown>
  export = m
}

// Two-level subpaths under each lib subdir.
declare module '@storyline/runtime/manuscript/notes.js' {
  const m: Record<string, unknown>
  export = m
}
declare module '@storyline/runtime/manuscript/snapshot.js' {
  const m: Record<string, unknown>
  export = m
}
declare module '@storyline/runtime/manuscript/compare.js' {
  const m: Record<string, unknown>
  export = m
}

declare module '@storyline/runtime/compile/assembler.js' {
  const m: Record<string, unknown>
  export = m
}
declare module '@storyline/runtime/compile/front-matter-generator.js' {
  const m: Record<string, unknown>
  export = m
}
declare module '@storyline/runtime/compile/preflight.js' {
  const m: Record<string, unknown>
  export = m
}
declare module '@storyline/runtime/compile/markdown-to-html.js' {
  const m: Record<string, unknown>
  export = m
}
declare module '@storyline/runtime/compile/book-style.js' {
  const m: Record<string, unknown>
  export = m
}
declare module '@storyline/runtime/compile/epub.js' {
  const m: Record<string, unknown>
  export = m
}
declare module '@storyline/runtime/compile/print-pdf.js' {
  const m: Record<string, unknown>
  export = m
}
declare module '@storyline/runtime/compile/distribution.js' {
  const m: Record<string, unknown>
  export = m
}
