import json
import re
from pathlib import Path

import yaml

TAG_PATTERN = re.compile(r'(?:^|\s)#([\w/ぁ-んァ-ヶ一-龠]+)')
HEADING_PATTERN = re.compile(r'^#+\s')


def extract_tags_py(body: str) -> list[str]:
    tags: list[str] = []
    seen: set[str] = set()
    for line in body.split('\n'):
        if HEADING_PATTERN.match(line):
            continue
        for m in TAG_PATTERN.finditer(line):
            tag = m.group(1)
            if tag not in seen:
                seen.add(tag)
                tags.append(tag)
    return tags


def build_frontmatter(record: dict, body: str) -> dict:
    return {
        "id": record["id"],
        "title": record["title"],
        "folder": record["folder_name"],
        "seq": record["seq"],
        "tags": extract_tags_py(body),
        "created_at": record["created_at"],
        "updated_at": record["updated_at"],
        "deleted": False,
        "llm_links": [],
    }


def build_folders_json(archive_root: Path) -> list[dict]:
    raw_folders = json.loads((archive_root / "raw" / "folders.json").read_text(encoding="utf-8"))
    return [
        {"folderId": f["folder_id"], "name": f["name"], "color": f["color"], "seq": f["seq"]}
        for f in raw_folders
    ]


def read_body(archive_root: Path, record: dict) -> str:
    # txt_pathは実体参照エスケープが完全復元済みの純粋な本文テキスト(引き継ぎ書3.2節)。
    # md_pathは旧SomCloud側のMarkdown表現で、今回のfrontmatterスキーマとは無関係なので使わない。
    txt_path = archive_root / "export" / record["txt_path"]
    return txt_path.read_text(encoding="utf-8")


def main() -> None:
    archive_root = Path(r"D:\Text\Obsidian\Local_Vault_0\somcloud_archive")
    index_path = archive_root / "export" / "index.jsonl"
    data_root = Path(r"D:\Text\Obsidian\Local_Vault_0\cc-secretary\somnote-data")
    out_root = data_root / "notes"

    tag_counter: dict[str, int] = {}
    count = 0
    with index_path.open(encoding="utf-8") as f:
        for line in f:
            record = json.loads(line)
            body = read_body(archive_root, record)
            fm = build_frontmatter(record, body)
            for t in fm["tags"]:
                tag_counter[t] = tag_counter.get(t, 0) + 1

            folder_dir = out_root / record["folder_name"]
            folder_dir.mkdir(parents=True, exist_ok=True)
            note_path = folder_dir / f"{record['id']}.md"
            content = "---\n" + yaml.safe_dump(fm, allow_unicode=True, sort_keys=False) + "---\n" + body
            note_path.write_text(content, encoding="utf-8")
            count += 1

    folders = build_folders_json(archive_root)
    (data_root / "folders.json").write_text(
        json.dumps(folders, ensure_ascii=False, indent=2), encoding="utf-8"
    )

    print(f"移行完了: {count}件")
    print(f"folders.json書き出し: {len(folders)}フォルダ")
    print("タグ頻度集計(上位20件):")
    for tag, n in sorted(tag_counter.items(), key=lambda x: -x[1])[:20]:
        print(f"  #{tag}: {n}件")


if __name__ == "__main__":
    main()
