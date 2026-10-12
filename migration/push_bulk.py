import base64
import os
from pathlib import Path

import requests

GITHUB_API = "https://api.github.com"


def collect_files(root: Path) -> list[Path]:
    # .git/ 等のドット始まりディレクトリ(somnote-data自身をgit init済み)を
    # 絶対に含めない。これを漏らすと.gitの内部オブジェクトまでblob化されてpushされる。
    return [
        p.relative_to(root) for p in root.rglob("*")
        if p.is_file() and not any(part.startswith(".") for part in p.relative_to(root).parts)
    ]


def push_all(owner: str, repo: str, token: str, root: Path, branch: str = "main") -> None:
    headers = {"Authorization": f"Bearer {token}", "Accept": "application/vnd.github+json"}

    ref = requests.get(f"{GITHUB_API}/repos/{owner}/{repo}/git/ref/heads/{branch}", headers=headers).json()
    base_commit_sha = ref["object"]["sha"]

    tree_entries = []
    for rel_path in collect_files(root):
        content = (root / rel_path).read_bytes()
        b64 = base64.b64encode(content).decode("ascii")
        blob = requests.post(
            f"{GITHUB_API}/repos/{owner}/{repo}/git/blobs",
            headers=headers, json={"content": b64, "encoding": "base64"}
        ).json()
        tree_entries.append({
            "path": str(rel_path).replace("\\", "/"),
            "mode": "100644",
            "type": "blob",
            "sha": blob["sha"]
        })

    tree = requests.post(
        f"{GITHUB_API}/repos/{owner}/{repo}/git/trees",
        headers=headers, json={"tree": tree_entries}
    ).json()

    commit = requests.post(
        f"{GITHUB_API}/repos/{owner}/{repo}/git/commits",
        headers=headers,
        json={"message": "feat: migrate 5386 notes from SomCloud archive",
              "tree": tree["sha"], "parents": [base_commit_sha]}
    ).json()

    requests.patch(
        f"{GITHUB_API}/repos/{owner}/{repo}/git/refs/heads/{branch}",
        headers=headers, json={"sha": commit["sha"]}
    )


if __name__ == "__main__":
    token = os.environ["GITHUB_TOKEN"]
    owner = os.environ["GITHUB_OWNER"]
    push_all(owner, "somnote-data", token,
             Path(r"D:\Text\Obsidian\Local_Vault_0\cc-secretary\somnote-data"))
