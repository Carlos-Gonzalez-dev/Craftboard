import { computed, type Ref } from 'vue'

/**
 * Predefined hue palette chosen for strong adjacent contrast (>=10 hues).
 * Adjacent colors are well-separated to avoid similar colors appearing next to each other.
 */
export const TAG_HUE_PALETTE: number[] = [
  210, // blue
  0, // red
  120, // green
  300, // magenta
  60, // yellow
  180, // cyan
  330, // pink
  90, // lime
  240, // indigo
  30, // orange
  270, // violet
  150, // teal
]

/**
 * Creates a computed map that assigns hues from the palette to tags based on their
 * alphabetical order in the provided tag list.
 *
 * @param tagList - A reactive ref containing an array of tag strings (sorted alphabetically)
 * @returns A computed Map that maps each tag to its assigned hue value
 */
export function createTagHueMap(tagList: Ref<string[]>) {
  return computed(() => {
    const map = new Map<string, number>()
    const paletteLen = TAG_HUE_PALETTE.length
    tagList.value.forEach((tag, idx) => {
      const hue = TAG_HUE_PALETTE[idx % paletteLen] ?? 220
      map.set(tag, hue)
    })
    return map
  })
}

/**
 * Creates a function that returns CSS custom properties for tag colors.
 * Uses the provided hue map for deterministic colors, with a stable hash fallback.
 *
 * @param hueMap - A computed Map from tag strings to hue values
 * @returns A function that takes a tag and returns CSS custom properties with --tag-hue
 */
export function createGetTagColor(hueMap: Ref<Map<string, number>>) {
  return (tag: string): { '--tag-hue': number } => {
    const hue = hueMap.value.get(tag)
    if (typeof hue === 'number') {
      return { '--tag-hue': hue }
    }
    // Fallback: use a stable hash hue when tag not in mapping
    let hash = 0
    for (let i = 0; i < tag.length; i++) {
      hash = tag.charCodeAt(i) + ((hash << 5) - hash)
    }
    const fallbackHue = Math.abs(hash % 360)
    return { '--tag-hue': fallbackHue }
  }
}
