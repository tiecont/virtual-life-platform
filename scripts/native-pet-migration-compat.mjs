import assert from 'node:assert/strict';
import {readFile,writeFile} from 'node:fs/promises';

// Disposable fixture only. Keep the historical expansion policy intact.
export async function nativePetExpansionPolicy(previousFile,output,manifest){
 const prefix=JSON.parse(await readFile(previousFile));
 assert.equal(prefix.maximumDatabaseMigrations,54);
 for(const {name,checksum} of prefix.migrations)assert.equal(manifest[name],checksum);
 const name='0055_native_pet_lifecycle.sql';
 const checksum='5b96c815dd9ddcb6fdc05ddab7d9c2b78b6497b87b8b2c909c19a03c36db8907';
 assert.equal(manifest[name],checksum);
 assert.equal(Object.keys(manifest).length,55);
 const policy={...prefix,maximumDatabaseMigrations:55,reviewRef:'evidence:privacy/native-pet-offline-expand-fixture',
  migrations:[...prefix.migrations,{name,checksum}]};
 await writeFile(output,JSON.stringify(policy),{mode:0o600});
 return policy;
}
