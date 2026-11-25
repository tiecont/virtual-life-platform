#!/usr/bin/env node
// PTC runtime isolation probe.
//
// Answers, with measurements rather than assumptions, what model-written program
// code can actually reach. Run it two ways and compare:
//
//   node config/harness/deepseek/ptc-probe.mjs                # native baseline
//   run_code: const {probe}=await import('./config/harness/deepseek/ptc-probe.mjs');
//             console.log(await probe({context:'ptc'}))          # PTC runtime
//
// It records only names, counts and booleans. It never reads file *content* and
// never prints an environment value, so its output is safe to put in a transcript.

/** Environment variable names that would indicate credential exposure. */
const SECRET_NAME = /KEY|TOKEN|SECRET|PASS|CRED|AUTH|COOKIE/i;

async function attempt(work) {
  try {
    return { ok: true, value: await work() };
  } catch (error) {
    return { ok: false, error: String(error?.code ?? error?.message ?? error) };
  }
}

/**
 * @param {{context?: 'native'|'ptc', network?: boolean}} options
 */
export async function probe(options = {}) {
  const context = options.context ?? 'native';
  const facts = { context, measuredAt: new Date().toISOString(), node: process.version, cwd: process.cwd() };

  // 1. Environment. The PTC runtime replaces process.env with an empty dictionary
  //    for program code; this is the one isolation property it provides by itself.
  const envNames = Object.keys(process.env ?? {});
  facts.environment = {
    variableCount: envNames.length,
    secretLikeNames: envNames.filter(name => SECRET_NAME.test(name)),
    // Names only, never values.
    sampleNames: envNames.slice(0, 5),
  };

  // 2. child_process — arbitrary host process creation.
  facts.childProcess = await attempt(async () => {
    const cp = await import('node:child_process');
    return typeof cp.execFileSync === 'function' && typeof cp.spawn === 'function';
  });

  // 3. Filesystem reach outside the workspace. stat() only: no content is read.
  facts.filesystem = await attempt(async () => {
    const fs = await import('node:fs');
    const statOnly = path => {
      try {
        const stat = fs.statSync(path);
        return { path, reachable: true, size: stat.size };
      } catch (error) {
        return { path, reachable: false, error: error.code };
      }
    };
    let rootEntries = null;
    try {
      rootEntries = fs.readdirSync('/').length;
    } catch (error) {
      rootEntries = 'DENIED:' + error.code;
    }
    return {
      rootEntries,
      credentialStore: statOnly(process.env.HOME ? process.env.HOME + '/.dsh' : '/home/tiecont/.dsh'),
      workspaceOutsideCite: statOnly('/etc/hostname'),
    };
  });

  // 4. Outbound network. TCP connect only, no payload, short timeout.
  if (options.network !== false) {
    facts.network = await attempt(
      () =>
        new Promise(resolveProbe => {
          import('node:net').then(({ connect }) => {
            const socket = connect(443, '1.1.1.1');
            socket.setTimeout(2000);
            const finish = outcome => {
              socket.destroy();
              resolveProbe(outcome);
            };
            socket.on('connect', () => finish('CONNECTED'));
            socket.on('timeout', () => finish('TIMEOUT'));
            socket.on('error', error => finish('ERROR:' + error.code));
          });
        }),
    );
  }

  // 5. Heap ceiling — the runtime's stated memory boundary.
  facts.heap = await attempt(async () => {
    const v8 = await import('node:v8');
    return { limitMb: Math.round(v8.getHeapStatistics().heap_size_limit / (1024 * 1024)) };
  });

  facts.assessment = assess(facts);
  return facts;
}

/**
 * Turn facts into an explicit posture statement. The important distinction: the
 * PTC runtime scrubs the environment and caps the heap, but it does not confine
 * filesystem, network or child processes. Those follow the OS sandbox policy.
 */
function assess(facts) {
  const envScrubbed = facts.environment.variableCount === 0;
  const processCreation = facts.childProcess.ok && facts.childProcess.value === true;
  const fsReachable = Boolean(facts.filesystem.ok && facts.filesystem.value?.rootEntries !== undefined);
  const netReachable = facts.network?.ok && ['CONNECTED', 'TIMEOUT'].includes(String(facts.network.value));
  return {
    environmentScrubbed: envScrubbed,
    processCreationReachable: processCreation,
    filesystemReachable: fsReachable,
    networkReachable: netReachable,
    heapLimitMb: facts.heap.ok ? facts.heap.value.limitMb : null,
    verdict:
      'PTC is a context-efficiency and protocol boundary, not a security sandbox. ' +
      'Filesystem, network and process access are bounded only by the OS sandbox policy ' +
      'selected for the session, so untrusted programs belong under read-only or workspace-write.',
  };
}

// CLI entry: the native baseline.
if (process.argv[1] && process.argv[1].endsWith('ptc-probe.mjs')) {
  const network = !process.argv.includes('--no-net');
  probe({ context: 'native', network })
    .then(facts => {
      console.log(JSON.stringify(facts, null, 2));
    })
    .catch(error => {
      console.error('ptc-probe failed: ' + String(error.message));
      process.exitCode = 1;
    });
}
