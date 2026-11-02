import { randomBytes } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
const password = randomBytes(24).toString('base64url');
const contents = `POSTGRES_USER=virtual_city\nPOSTGRES_DB=virtual_city_dev\nPOSTGRES_PASSWORD=${password}\nDATABASE_URL=postgresql://virtual_city:${password}@127.0.0.1:55452/virtual_city_dev\nHOST=127.0.0.1\nPORT=4300\nWEB_ORIGIN=http://127.0.0.1:3300\nAPI_INTERNAL_URL=http://127.0.0.1:4300\n`;
try {
  await writeFile('.env', contents, { flag: 'wx', mode: 0o600 });
  console.log('Created ignored .env with a generated local-only password. Never reuse it for production.');
} catch (error) {
  if (error.code === 'EEXIST') console.error('.env already exists; leaving it unchanged.');
  else console.error('Could not create local environment file.');
  process.exitCode = 1;
}
