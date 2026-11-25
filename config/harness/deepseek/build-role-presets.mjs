#!/usr/bin/env node
// DeepSeek-native specialist presets, generated from the canonical role contract.
//
// The canonical role catalog for this repository lives in .codex/agents/*.toml and
// is owned by the shared-core integration owner. This script does NOT restate those
// roles: it reads them and emits DeepSeek Harness agent-preset rows, so the role
// name, description and developer instructions have exactly one source of truth.
//
//   node config/harness/deepseek/build-role-presets.mjs           # write the overlay
//   node config/harness/deepseek/build-role-presets.mjs --check    # verify in sync
//
// Output: config/harness/deepseek/roles.patch.yml (a DSH --patch overlay).

import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(HERE, '..', '..', '..');
const ROLE_DIR = join(REPO_ROOT, '.codex', 'agents');
const OUT_FILE = join(HERE, 'roles.patch.yml');

const CTO_PRESET_ID = 'aetheria-cto';
const ROLE_ORDER_BASE = 10;

/** Minimal TOML reader for the flat key/value subset the role files use. */
function parseRoleToml(text) {
  const fields = {};
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const line = lines[i];
    const basic = line.match(/^([a-z_]+)\s*=\s*"((?:[^"\\]|\\.)*)"\s*$/);
    if (basic) {
      fields[basic[1]] = basic[2].replace(/\\n/g, '\n').replace(/\\"/g, '"');
      continue;
    }
    // Multi-line basic string: key = """
    const multi = line.match(/^([a-z_]+)\s*=\s*"""\s*$/);
    if (multi) {
      const body = [];
      i += 1;
      while (i < lines.length && lines[i].trim() !== '"""') {
        body.push(lines[i]);
        i += 1;
      }
      fields[multi[1]] = body.join('\n').trim();
    }
  }
  return fields;
}

/** Map the canonical reasoning effort onto a DeepSeek provider effort. */
function toReasoningEffort(effort) {
  switch (String(effort ?? '').toLowerCase()) {
    case 'high':
    case 'xhigh':
      return 'high';
    case 'medium':
      return 'medium';
    case 'low':
    case 'minimal':
      return 'low';
    default:
      return 'medium';
  }
}

// The functional tool set a specialist needs. Mirrors the shipped `standard` preset
// (dsh-web-app 0.2.0-rc.2) rather than inventing a new composition.
function basePlugins(personaInstructions, { delegating = false } = {}) {
  return [
    {
      id: 'persona',
      name: '@deepseek-ai/dsh-persona',
      config: {
        prefix: 'You are an Aetheria engineering specialist powered by the {{model}} model.',
        suffix: personaInstructions + '\n\nYour working directory is {{cwd}}.',
      },
    },
    { id: 'agent-instructions', name: '@deepseek-ai/dsh-agent-instructions', config: { maxBytes: 65536 } },
    { id: 'tool-bash', name: '@deepseek-ai/dsh-tool-bash' },
    { id: 'tool-fs', name: '@deepseek-ai/dsh-tool-fs' },
    { id: 'tool-fs-search', name: '@deepseek-ai/dsh-tool-fs-search', config: { sampleOverCapGlobResults: false } },
    { id: 'tool-jobs', name: '@deepseek-ai/dsh-tool-jobs' },
    { id: 'skill-filesystem', name: '@deepseek-ai/dsh-skill-filesystem' },
    { id: 'tool-skill', name: '@deepseek-ai/dsh-tool-skill' },
    { id: 'command-goal', name: '@deepseek-ai/dsh-command-goal' },
    { id: 'tool-goal', name: '@deepseek-ai/dsh-tool-goal' },
    {
      id: 'planning',
      name: 'cordis:group',
      group: true,
      isolate: { planMode: true },
      config: [{ id: 'plan-mode', name: '@deepseek-ai/dsh-plan-mode' }],
    },
    {
      id: 'compaction',
      name: 'cordis:group',
      group: true,
      isolate: { compaction: true, toolResultPruner: true },
      config: [
        { id: 'compaction-basic', name: '@deepseek-ai/dsh-compaction-basic' },
        { id: 'command-compact', name: '@deepseek-ai/dsh-command-compact' },
        {
          id: 'tool-result-pruner',
          name: '@deepseek-ai/dsh-compaction-tool-result-pruner',
          config: { thresholdChars: 8192, headChars: 4096, tailChars: 1024 },
        },
      ],
    },
    {
      id: 'delegation',
      name: 'cordis:group',
      group: true,
      isolate: { workflowEngine: true },
      config: [
        { id: 'tool-subagent-control', name: '@deepseek-ai/dsh-tool-subagent-control' },
        { id: 'tool-subagent-list-agents', name: '@deepseek-ai/dsh-tool-subagent-control/list-agents' },
        // Specialists do not delegate: bounded depth one, lead-only fan-out.
        { id: 'tool-subagent', name: '@deepseek-ai/dsh-tool-subagent', disabled: true },
        { id: 'tool-subagent-fork', name: '@deepseek-ai/dsh-tool-subagent', disabled: true },
        // Fan-out engine. Disabling tool-subagent_fork alone does NOT remove the
        // delegation CAPABILITY: tool-workflow runs a JavaScript workflow that can call
        // agent(prompt). Found by independent security review; both must be off or the
        // lead-only delegation control bounds nothing.
        { id: 'workflow-ptc', name: '@deepseek-ai/dsh-workflow-ptc', config: { provider: 'spawn' }, disabled: !delegating },
        { id: 'tool-workflow', name: '@deepseek-ai/dsh-tool-workflow', disabled: !delegating },
      ],
    },
    { id: 'tool-ask-user', name: '@deepseek-ai/dsh-tool-ask-user', disabled: true },
    { id: 'tool-todo', name: '@deepseek-ai/dsh-tool-todo', config: { allowParallelInProgress: false } },
    { id: 'tool-web', name: '@deepseek-ai/dsh-tool-web', config: { fetch: true, searchTimeoutMs: 60000 } },
    { id: 'present', name: '@deepseek-ai/dsh-tool-present' },
  ];
}

const CTO_INSTRUCTIONS = [
  'You are the DeepSeek CTO for Aetheria. You own decomposition, delegation, integration and final acceptance.',
  '',
  'Use the canonical shared core. Never restate shared workflow or state logic: call',
  '`node scripts/engineering-harness/workflow.mjs` (search / describe / run / evidence) and',
  '`node scripts/engineering-harness/state.mjs` (init / update / show / recover).',
  '',
  'Decompose into dependency-aware tasks with disjoint write scopes. Delegate only',
  'independent work, at most the configured concurrency, and only to specialists that',
  'match the role. The lead integrates and alone edits the backlog. Send integrated',
  'source to an independent reviewer before accepting. Report task ids, exact revision,',
  'actual checks with real outcomes, evidence references and blockers.',
].join('\n');

function build() {
  const roleFiles = readdirSync(ROLE_DIR)
    .filter(name => name.endsWith('.toml'))
    .sort();
  if (roleFiles.length === 0) throw new Error(`No role definitions found in ${ROLE_DIR}`);

  const presets = [];
  const roles = [];

  // CTO / root orchestration is configured separately from the specialists.
  presets.push({
    id: `preset-${CTO_PRESET_ID}`,
    name: '@deepseek-ai/dsh-agent-preset',
    config: { id: CTO_PRESET_ID, order: 5, plugins: basePlugins(CTO_INSTRUCTIONS, { delegating: true }) },
  });
  roles.push({ preset: CTO_PRESET_ID, source: '(built in)', effort: 'high', delegating: true });

  let order = ROLE_ORDER_BASE;
  for (const file of roleFiles) {
    const role = parseRoleToml(readFileSync(join(ROLE_DIR, file), 'utf8'));
    if (!role.name) throw new Error(`${file} has no name`);
    if (!role.developer_instructions) throw new Error(`${file} has no developer_instructions`);
    const presetId = `aetheria-${role.name.replace(/_/g, '-')}`;
    const instructions = [
      role.description ? `Role: ${role.description}` : '',
      '',
      role.developer_instructions,
      '',
      'Canonical contract: .codex/agents/' + file + '. Do not restate or extend it.',
      'Use node scripts/engineering-harness/workflow.mjs to discover and run bounded checks,',
      'and report the handoff fields: summary, revision, files, checks, limitations.',
    ]
      .filter(Boolean)
      .join('\n');
    presets.push({
      id: `preset-${presetId}`,
      name: '@deepseek-ai/dsh-agent-preset',
      config: { id: presetId, order: order++, plugins: basePlugins(instructions) },
    });
    roles.push({
      preset: presetId,
      role: role.name,
      source: '.codex/agents/' + file,
      effort: toReasoningEffort(role.model_reasoning_effort),
      delegating: false,
    });
  }

  const header = [
    '# GENERATED FILE — do not edit by hand.',
    '# Source of truth: .codex/agents/*.toml (canonical role contract, shared-core owner).',
    '# Regenerate: node config/harness/deepseek/build-role-presets.mjs',
    '# Apply:      dsh --profile <name> --patch config/harness/deepseek/roles.patch.yml',
    '#',
    '# Specialists have delegation disabled (bounded depth 1, lead-only fan-out) and',
    '# ask_user disabled (they report to the lead, they do not interview the human).',
    '# Changing agent presets requires a harness restart; presets are fixed per agent',
    '# at composition time.',
    '',
  ].join('\n');

  // DSH patch semantics: a top-level array element *patches* a row by id, so a NEW
  // row must appear under `insert:`. Emitting the bare array silently fails with
  // "entry ... not found" for every row and installs nothing (verified). Each row is
  // compact JSON, which is valid YAML flow content for the insert list.
  const body = '- insert:\n' + presets.map(preset => '  - ' + JSON.stringify(preset)).join('\n');
  return { text: header + body + '\n', roles, presets };
}

const check = process.argv.includes('--check');
const { text, roles } = build();
if (check) {
  let current = '';
  try {
    current = readFileSync(OUT_FILE, 'utf8');
  } catch {
    current = '';
  }
  if (current !== text) {
    console.error('roles.patch.yml is out of date; run the generator without --check');
    process.exitCode = 1;
  } else {
    console.log(JSON.stringify({ result: 'IN_SYNC', presets: roles.length }, null, 2));
  }
} else {
  writeFileSync(OUT_FILE, text);
  console.log(JSON.stringify({ result: 'WROTE', file: OUT_FILE, presets: roles.length, roles }, null, 2));
}
