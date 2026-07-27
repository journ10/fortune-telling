#!/usr/bin/env python3
"""通过 GitHub Git Data API 推送（git HTTPS 协议被网络干扰时的备选）。

基于远端 master 最新提交，只上传有变化的 blob，创建新提交并移动 ref。
"""
import base64
import json
import subprocess
import sys
import time
import urllib.request

OWNER_REPO = "journ10/fortune-telling"
BRANCH = "master"
API = "https://api.github.com"
COMMIT_MESSAGE = """feat: 夜室一席空间与熟铜铜钱视觉重构

- 空间: 蒲席/竹钱筒/暖墙灯晕/光尘四件套, 聚光灯接管阴影, 烛光呼吸
- 铜钱: 真钱轮廓扰动, 亮度渐变熟铜上色, 外郭+内郭+字口位移浮雕
- UI: 暗夜案头一纸卦单, 印鉴环 HUD, 纸单结果面板
- 贴图管线: 修复 albedo 灰度化 bug, 彩图 512² 输出, 全部 ≤500KB"""

TOKEN = subprocess.run(["gh", "auth", "token"], capture_output=True, text=True, check=True).stdout.strip()


def api(method, path, payload=None):
    body = json.dumps(payload).encode() if payload is not None else None
    last_err = None
    for attempt in range(5):
        try:
            req = urllib.request.Request(
                f"{API}{path}",
                method=method,
                headers={
                    "Authorization": f"Bearer {TOKEN}",
                    "Accept": "application/vnd.github+json",
                    "X-GitHub-Api-Version": "2022-11-28",
                },
                data=body,
            )
            with urllib.request.urlopen(req, timeout=60) as resp:
                return json.loads(resp.read())
        except Exception as err:  # 网络抖动：SSL EOF / 连接重置，退避重试
            last_err = err
            time.sleep(2 * (attempt + 1))
    raise last_err


def git(*args):
    return subprocess.run(["git", *args], capture_output=True, text=True, check=True).stdout


# 1. 远端 master 头提交与其 tree
ref = api("GET", f"/repos/{OWNER_REPO}/git/ref/heads/{BRANCH}")
base_commit = ref["object"]["sha"]
base_tree = api("GET", f"/repos/{OWNER_REPO}/git/commits/{base_commit}")["tree"]["sha"]
print(f"base commit: {base_commit[:8]}  tree: {base_tree[:8]}")

# 2. 远端 tree 全量 path→sha（分页可能截断，检查 truncated）
remote_tree = api("GET", f"/repos/{OWNER_REPO}/git/trees/{base_tree}?recursive=1")
if remote_tree.get("truncated"):
    sys.exit("remote tree truncated, abort")
remote_shas = {e["path"]: e["sha"] for e in remote_tree["tree"] if e["type"] == "blob"}
print(f"remote files: {len(remote_shas)}")

# 3. 本地文件与模式
entries_raw = git("ls-files", "-s").splitlines()
local_files = []
for line in entries_raw:
    mode, _sha, _stage_path = line.split(None, 2)
    path = _stage_path.split("\t", 1)[1]
    local_files.append((path, mode))
print(f"local files: {len(local_files)}")

# 4. 对比 hash，只上传变化的 blob
tree_entries = []
local_paths = set()
for path, mode in local_files:
    local_paths.add(path)
    local_sha = git("hash-object", path).strip()
    if remote_shas.get(path) == local_sha:
        continue
    with open(path, "rb") as fh:
        content = base64.b64encode(fh.read()).decode()
    blob = api("POST", f"/repos/{OWNER_REPO}/git/blobs", {"content": content, "encoding": "base64"})
    tree_entries.append({"path": path, "mode": mode, "type": "blob", "sha": blob["sha"]})
    print(f"  + {path}")

# 5. 远端有而本地删掉的文件 → sha=null 删除
for path in sorted(set(remote_shas) - local_paths):
    tree_entries.append({"path": path, "mode": "100644", "type": "blob", "sha": None})
    print(f"  - {path}")

if not tree_entries:
    sys.exit("no changes to push")

# 6. 新 tree → 新提交 → 移动 ref
new_tree = api("POST", f"/repos/{OWNER_REPO}/git/trees", {"base_tree": base_tree, "tree": tree_entries})
new_commit = api(
    "POST",
    f"/repos/{OWNER_REPO}/git/commits",
    {"message": COMMIT_MESSAGE, "tree": new_tree["sha"], "parents": [base_commit]},
)
api("PATCH", f"/repos/{OWNER_REPO}/git/refs/heads/{BRANCH}", {"sha": new_commit["sha"]})
print(f"pushed: {new_commit['sha'][:8]} -> {BRANCH} ({len(tree_entries)} changed files)")
