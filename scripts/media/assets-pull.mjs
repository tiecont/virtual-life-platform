import {formatCliFailure,pullAssets} from './assets-command.mjs';

try{
  console.log(JSON.stringify(await pullAssets({args:process.argv.slice(2)})));
}catch(error){
  console.error(formatCliFailure('Asset pull',error));
  process.exitCode=1;
}
