const target = process.argv[2];
if (target === '--target=api') await import('./check-image.mjs');
else if (target === '--target=web') await import('./check-web-image.mjs');
else throw Error('Expected --target=api or --target=web');
