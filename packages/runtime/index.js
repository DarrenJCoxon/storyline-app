// @storyline/runtime barrel — re-exports the most commonly used members
// for static-import callers. The package's main consumers are dynamic
// importers (extension's compile-runner, doctor, manuscript ops; the
// CLI bin/storyline.js) — they go directly to subpath modules via the
// `./*` and `./*.js` exports in package.json.
//
// This barrel exists so static-import callers (`import { ... } from
// '@storyline/runtime'`) work for the small set of helpers that are
// stable enough to warrant a stable surface. Everything else stays
// reachable via subpath import.

export { runDoctor, formatDoctorReport } from './doctor.js'
