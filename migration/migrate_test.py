import json

from migrate import build_folders_json, build_frontmatter, extract_tags_py


def test_build_frontmatter_preserves_timestamps_and_fields():
    record = {
        "id": "55fcd732150ba0a752c9151d",
        "title": "黙っていて、察してもらおうなんて虫がいい。",
        "folder_name": "前ノート",
        "seq": 0,
        "created_at": "2015-09-19T10:10:35+09:00",
        "updated_at": "2015-09-19T10:10:35+09:00",
    }
    body = "本文です #哲学"
    fm = build_frontmatter(record, body)
    assert fm["id"] == "55fcd732150ba0a752c9151d"
    assert fm["title"] == record["title"]
    assert fm["folder"] == "前ノート"
    assert fm["seq"] == 0
    assert fm["created_at"] == "2015-09-19T10:10:35+09:00"
    assert fm["updated_at"] == "2015-09-19T10:10:35+09:00"
    assert fm["deleted"] is False
    assert fm["llm_links"] == []
    assert fm["tags"] == ["哲学"]


def test_extract_tags_py_excludes_heading():
    assert extract_tags_py("# 見出し\n本文 #日記") == ["日記"]


def test_extract_tags_py_extracts_multiple_and_dedupes():
    assert extract_tags_py("#哲学 について #哲学 再び") == ["哲学"]


def test_build_folders_json_maps_raw_folder_fields(tmp_path):
    archive_root = tmp_path
    (archive_root / "raw").mkdir()
    (archive_root / "raw" / "folders.json").write_text(
        json.dumps([{"folder_id": "abc", "name": "前ノート", "color": "#50bebe", "seq": 0}]),
        encoding="utf-8",
    )
    folders = build_folders_json(archive_root)
    assert folders == [{"folderId": "abc", "name": "前ノート", "color": "#50bebe", "seq": 0}]
