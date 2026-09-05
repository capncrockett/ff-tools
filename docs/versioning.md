# Versioning and branches

The root `package.json` version is canonical. The tracker remains 0.1.0 during this unreleased MVP work.

Use `feat/<scope>` for feature work, `fix/<scope>` for focused fixes, and `release/MAJOR.MINOR.PATCH` when the user requests a release. Apply semantic versioning to published behavior: patch for compatible fixes, minor for compatible functionality, major for breaking contracts.

Commit or publish only when asked. Before a requested release, run the required verification, inspect branch/remote/PR state, and write a description of the final behavior and validation. Preserve review access and report pending checks accurately.
