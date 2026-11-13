import {spawnSync} from 'node:child_process';

// Standalone adapter proof only. Unity Editor import and player execution are separate checks.
const sdk = process.env.DOTNET ?? 'dotnet';
const environment = {...process.env, DOTNET_CLI_TELEMETRY_OPTOUT: '1', DOTNET_SKIP_FIRST_TIME_EXPERIENCE: '1'};
function run(args) {
  const result = spawnSync(sdk, args, {env: environment, stdio: 'inherit'});
  if (result.error || result.status !== 0) throw Error('C# validation command failed');
}
const version = spawnSync(sdk, ['--version'], {env: environment, encoding: 'utf8'});
if (version.status !== 0 || version.stdout.trim() !== '8.0.428') throw Error('Set DOTNET to .NET SDK 8.0.428');
for (const project of ['UnityCompatible', 'NativeClient']) {
  const path = `tests/native-csharp/${project}.csproj`;
  run(['restore', path, '--locked-mode']);
  run(['build', path, '--no-restore', '--configuration', 'Release']);
}
run(['restore', 'tests/native-csharp/UnitySyntax.csproj', '--locked-mode']);
run(['build', 'tests/native-csharp/UnitySyntax.csproj', '--no-restore', '--configuration', 'Release']);
run(['artifacts/csharp/syntax/Release/net8.0/UnitySyntax.dll']);
run(['artifacts/csharp/bin/Release/net8.0/NativeClient.dll']);
