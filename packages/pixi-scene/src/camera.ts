export function fitSceneCamera(viewport: { width: number; height: number }, world: { width: number; height: number }) {
  if (![viewport.width, viewport.height, world.width, world.height].every(value => Number.isFinite(value) && value > 0)) throw new Error('INVALID_CAMERA_BOUNDS');
  const scale = Math.min(viewport.width / world.width, viewport.height / world.height);
  return { scale, x: (viewport.width - world.width * scale) / 2, y: (viewport.height - world.height * scale) / 2 };
}
