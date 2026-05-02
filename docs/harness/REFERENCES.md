<!--
Purpose: Record external engineering references that shaped this harness so future maintainers can revisit the source ideas.
-->

# References

This harness uses official/primary references as stronger input than forum snippets.

- [Google SRE - Monitoring Distributed Systems](https://sre.google/sre-book/monitoring-distributed-systems/) for latency, traffic, errors, and saturation as operational signals.
- [OpenTelemetry Docs](https://opentelemetry.io/docs/concepts/signals/) for traces, metrics, logs, and signal-based observability structure.
- [GitHub Docs - Protected branches and required status checks](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) for merge gates.
- [GitHub Actions - Store workflow data as artifacts](https://docs.github.com/en/actions/using-workflows/storing-workflow-data-as-artifacts) for evidence artifacts.
- [OpenSSF Scorecard](https://scorecard.dev/) for supply-chain security checks.
- [SLSA](https://slsa.dev/) for provenance and build integrity direction.
- [OWASP ASVS](https://owasp.org/www-project-application-security-verification-standard/) for access control, input validation, logging, and configuration verification.
- [Kubernetes API Conventions](https://github.com/kubernetes/community/blob/master/contributors/devel/sig-architecture/api-conventions.md) for versioned declarative API thinking.
- [Backstage Software Catalog](https://backstage.io/docs/features/software-catalog/descriptor-format/) for ownership/lifecycle metadata patterns.
- [Open Policy Agent](https://www.openpolicyagent.org/docs/latest/) for policy-as-code architecture.
- [Pact Docs](https://docs.pact.io/) for consumer-driven contract testing ideas.
- [Nx Enforce Module Boundaries](https://nx.dev/features/enforce-module-boundaries) for monorepo boundary enforcement patterns.
