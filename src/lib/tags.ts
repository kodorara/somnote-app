const TAG_PATTERN = /(?:^|\s)#([\w/ぁ-んァ-ヶ一-龠]+)/g
const HEADING_PATTERN = /^#+\s/

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
