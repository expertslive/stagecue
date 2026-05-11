# Contributing to Stagecue

Thanks for your interest in Stagecue. Bug reports, fixes, and small improvements are welcome.

## License of contributions

By submitting a pull request, issue, comment, or any other contribution to this repository, you agree that your contribution is licensed to the project under the same [MIT License](LICENSE) that covers the rest of the codebase. You also confirm that you have the right to license the contribution under those terms (it's your original work, or you have permission from the rights holder).

## How to contribute

1. **Open an issue first** for anything non-trivial. A short discussion saves rework.
2. **Fork the repo** and create a feature branch.
3. **Run the tests** before opening the PR:
   ```bash
   dotnet test
   (cd src/web && npm test -- --run)
   ```
4. **Keep PRs focused.** One logical change per PR; smaller is better.
5. **Follow existing conventions.** See `CLAUDE.md` for the hard architectural constraints (multi-tenant filter, state-machine boundaries, no infra deps in `Domain`, etc.).

## What we're looking for

- Bug fixes with a regression test
- Test coverage for currently untested code paths
- Documentation improvements
- Small UX polish on the operator console and audience views

## What we're cautious about

- Large architectural changes — please discuss in an issue first
- New dependencies — we prefer the .NET 10 / React 19 BCL where it suffices

## Reporting security issues

Please do **not** open a public issue for security vulnerabilities. Email the maintainers privately via a contact listed in the GitHub org profile.
