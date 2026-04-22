/**
 * Классификация текстур пропов для режимов слоя «декор» / «деревья» в редакторе.
 */

export function isTreePropTexture(textureKey: string): boolean {
  const k = textureKey.toLowerCase();
  if (k.startsWith("tree")) return true;
  return false;
}

export function isDecorPropTexture(textureKey: string): boolean {
  const k = textureKey.toLowerCase();
  if (k.startsWith("rock") || k.startsWith("bush")) return true;
  return false;
}
