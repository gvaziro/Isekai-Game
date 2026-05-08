/**
 * Читатель `forestWorldSeed` для шаблона локации леса (`getForestInfiniteTemplateLocation`),
 * без импорта `gameStore` из `locations/index` (избегаем циклического импорта).
 * Регистрируется один раз из `gameStore` после создания стора.
 */
let readForestWorldSeed: () => number = () => 0;

export function registerForestWorldSeedReader(fn: () => number): void {
  readForestWorldSeed = fn;
}

export function getForestWorldSeedForLocationTemplate(): number {
  return readForestWorldSeed() >>> 0;
}
