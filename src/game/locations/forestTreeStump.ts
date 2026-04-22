/**
 * Текстура «пня» после рубки — соответствует листам в nature-decor-map.json.
 */
export function forestStumpTextureKey(fullTreeTexture: string): string {
  switch (fullTreeTexture) {
    case "tree2":
      return "tree_chopped_fir";
    case "tree3":
      return "tree_chopped_grand_fir";
    default:
      return "tree_chopped_pine";
  }
}
