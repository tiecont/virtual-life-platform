# Browser CI measurement correction

Quality run 42767086757 at aca14de failed: the combined Lodge interaction plus
four viewport/200-percent captures exceeded 60 seconds; Maid began observing
after movement and recorded zero samples; the scene profile reported p95 400ms.
These failures remain in the immutable VL-016 CI review and diagnostic artifacts.

The Lodge captures now use separate fresh real sessions and tables, each retaining
the 60-second timeout, consent/readiness checks, 44px control, overflow assertion,
screenshot and real leave. The keyboard/delayed-ACK/periodic-sync test still runs.

The shared page observer arms before the click, captures the moving transition,
consecutive rAF timestamps, callback times and connectivity, and returns bounded
timeout diagnostics. Raw results are saved before acceptance assertions. It must
start idle, settle while connected, have more than ten samples and p95 below the
unchanged 100ms limit. CPU4x/network, cache, idle, remount and heap budgets remain.

The recording profile is now `playwright-trace-no-screencast-v1`: retain failure
traces with DOM snapshots and sources, disable trace screencast images, keep the
normal failure screenshot. This is an explicit measurement-profile change.
Prior trace-off diagnostic passed while the original screencast profile failed;
it was only diagnostic, not retroactive acceptance of the old profile. Fresh CI
must qualify the new recording profile at its committed source.

Local base aca14de plus the five correction files passed 22 browser cases:
scene2, Deadline2, Maid4 and Lodge14 across desktop/mobile. The first Maid launch
failed because worker-scoped trace options were inside a describe block; moving
them to file scope fixed configuration and the rerun passed. Its old failure
hash remains in the first facts file; the per-spec log was overwritten by the
rerun and is not asserted to match both hashes. Exact committed-source CI remains
required. This optional browser evidence does not qualify Windows Unity or GPU.

Raw facts are under `artifacts/desktop-first/vl016/single-agent-browser/`:
`facts-scene-performance-deadline-performance-maid-acceptance-lodge-lobby.json`
and `facts-maid-acceptance.json`. The first file preserves the failed launch;
the second records the successful Maid rerun.
