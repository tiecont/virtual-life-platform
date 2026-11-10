const target = process.argv[2];
if (target === '--target=api') await import('./check-image.mjs');
else if (target === '--target=web') await import('./check-web-image.mjs');
else if (target === '--target=admin') await import('./check-admin-image.mjs');
else throw Error('Expected --target=api, --target=web or --target=admin');
