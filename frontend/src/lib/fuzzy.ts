/** Tiny subsequence fuzzy scorer; higher is better, null means no match. */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase()
  const t = text.toLowerCase()
  if (!q) return 0
  if (t.startsWith(q)) return 1000 - t.length
  const idx = t.indexOf(q)
  if (idx >= 0) return 500 - idx
  let ti = 0
  let score = 0
  for (const ch of q) {
    const found = t.indexOf(ch, ti)
    if (found < 0) return null
    score -= found - ti
    ti = found + 1
  }
  return score
}

export function fuzzyFilter<T>(items: T[], query: string, text: (item: T) => string): T[] {
  return items
    .map((item) => ({ item, score: fuzzyScore(query, text(item)) }))
    .filter((r): r is { item: T; score: number } => r.score !== null)
    .toSorted((a, b) => b.score - a.score)
    .map((r) => r.item)
}
