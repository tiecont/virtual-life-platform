import {formatCliFailure,pushAssets} from './assets-command.mjs';

try{
  console.log(JSON.stringify(await pushAssets({args:process.argv.slice(2)})));
}catch(error){
  console.error(formatCliFailure('Asset push',error));
  process.exitCode=1;
}
