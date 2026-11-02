# CI acceptance scope

Owner explicitly requested offline coding; remote creation will follow implementation. M01-05 local acceptance therefore consists of an implemented workflow, successful equivalent local check/E2E commands, and a real failing quality probe demonstrating nonzero failure propagation. No remote or PR is created. Hosted CI, branch protection, required-status configuration and test PR remain NOT_RUN, tracked for the future remote owner. ADR 0002 records this change of scope; it is not a remote success claim.

Workflow job has no continue-on-error or test bypass; subsequent steps use default success conditions. Artifact upload uses always() so failed tests remain reviewable. Production permissions and secrets are absent. Configure required status `Quality / quality` and test it after remote creation. GitHub action refs are version tags; pin to reviewed commit SHAs during M22 supply-chain hardening before public release.
