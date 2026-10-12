from push_bulk import collect_files


def test_collect_files_returns_relative_paths(tmp_path):
    (tmp_path / "notes" / "仕事").mkdir(parents=True)
    (tmp_path / "notes" / "仕事" / "a.md").write_text("x", encoding="utf-8")
    (tmp_path / "folders.json").write_text("[]", encoding="utf-8")

    files = collect_files(tmp_path)
    rel_paths = sorted(str(p).replace("\\", "/") for p in files)
    assert "notes/仕事/a.md" in rel_paths
    assert "folders.json" in rel_paths


def test_collect_files_excludes_git_internals(tmp_path):
    (tmp_path / ".git" / "objects").mkdir(parents=True)
    (tmp_path / ".git" / "objects" / "abc123").write_text("binary-ish", encoding="utf-8")
    (tmp_path / ".git" / "config").write_text("[core]", encoding="utf-8")
    (tmp_path / "folders.json").write_text("[]", encoding="utf-8")

    files = collect_files(tmp_path)
    rel_paths = [str(p).replace("\\", "/") for p in files]
    assert rel_paths == ["folders.json"]
