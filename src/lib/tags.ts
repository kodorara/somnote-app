const TAG_PATTERN = /(?:^|\s)#([\w/ぁ-んァ-ヶ一-龠]+)/g
const HEADING_PATTERN = /^#+\s/
const TAG_ONLY_LINE_PATTERN = /^(?:\s*#[\w/ぁ-んァ-ヶ一-龠]+)+\s*$/

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function extractTags(body: string): string[] {
  const lines = body.split('\n')
  const tags = new Set<string>()
  for (const line of lines) {
    if (HEADING_PATTERN.test(line)) continue
    const pattern = new RegExp(TAG_PATTERN)
    let match: RegExpExecArray | null
    while ((match = pattern.exec(line)) !== null) {
      tags.add(match[1])
    }
  }
  return Array.from(tags)
}

export function toggleTagInBody(body: string, rawTag: string): string {
  const tag = rawTag.replace(/^#+/, '').trim()
  if (!tag) return body

  const currentTags = extractTags(body)
  if (currentTags.includes(tag)) {
    const escaped = escapeRegExp(tag)
    const tokenRegex = new RegExp(`(^|\\s)#${escaped}(?=\\s|$)`, 'g')
    const lines = body.split('\n')
    const nextLines: string[] = []
    for (const line of lines) {
      if (HEADING_PATTERN.test(line)) {
        nextLines.push(line)
        continue
      }
      const hadContent = line.trim().length > 0
      const updated = line.replace(tokenRegex, '').replace(/\s{2,}/g, ' ').trimEnd()
      const cleaned = updated.replace(/^\s+/, (leading) => (updated.trim().length === 0 ? '' : leading))
      if (hadContent && cleaned.trim().length === 0) {
        // タグのみの行から最後のタグが消えた場合は行自体を除去する
        continue
      }
      nextLines.push(cleaned.replace(/^ +(?=[^\s])/, (m) => (line.startsWith(' ') ? m : '')))
    }
    return nextLines.join('\n').replace(/\n+$/, (m) => (body.endsWith('\n') ? '\n' : m.slice(1)))
  }

  // 未付与の場合は末尾に付与する
  if (body.trim().length === 0) {
    return `#${tag}`
  }
  const lines = body.split('\n')
  // 末尾の非空行を探す
  let lastNonEmptyIdx = -1
  for (let i = lines.length - 1; i >= 0; i--) {
    if (lines[i].trim().length > 0) {
      lastNonEmptyIdx = i
      break
    }
  }
  if (lastNonEmptyIdx >= 0 && TAG_ONLY_LINE_PATTERN.test(lines[lastNonEmptyIdx])) {
    lines[lastNonEmptyIdx] = `${lines[lastNonEmptyIdx].trimEnd()} #${tag}`
    return lines.join('\n')
  }
  return body.endsWith('\n') ? `${body}#${tag}` : `${body}\n#${tag}`
}
