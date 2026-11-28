# DeepSeek Harness adapter

The adapter generates DeepSeek Harness presets from the canonical specialist
definitions in `.codex/agents/`. Its lead and specialist presets reference the
shared workflow and checkpoint CLIs. The lead owns backlog edits and checkpoint
writes. Specialists report results to the lead, and the preset generator
disables their workflow-driven delegation.

Generate or check the preset overlay after a role definition changes.

```sh
node config/harness/deepseek/build-role-presets.mjs
node config/harness/deepseek/build-role-presets.mjs --check
```

Use an existing local DeepSeek Harness profile with the required plugins and
inspect the composed configuration before starting a session.

```sh
dsh --profile <profile> --patch config/harness/deepseek/roles.patch.yml --dump-config
```

Restart DeepSeek Harness to use a changed preset. Configure the provider,
credential and model through the local profile. Select a preset using the
profile's preset configuration. The generator reports the canonical reasoning
effort for review. Set model reasoning effort in the profile where supported.

The optional overlays under `profiles/` select native function calling,
programmatic tool calling (PTC), or PTC with a workspace-write sandbox policy
and permission preset. Apply an overlay with a second `--patch` argument.
Verify the host backend's file, process and network enforcement with synthetic
fixtures before using untrusted input. PTC governs how the model calls tools.
Host permission and sandbox configuration govern the resulting access.
