#!/usr/bin/env bash
set -euo pipefail

upstream=https://github.com/stablyai/orca.git
upstream_main=refs/remotes/orca-upstream/main
upstream_release=refs/remotes/orca-upstream/release
private_sha=$(git rev-parse HEAD)

if [[ "$PUBLISH_AFTER_BUILD" == true && "$PLATFORMS" != both ]]; then
  echo '::error::发布必须同时包含 Mac 和 Windows 安装包。'
  exit 1
fi
if [[ "$PUBLISH_AFTER_BUILD" == true ]] &&
  [[ ! "${SORCA_MAC_SIGNING_SHA1:-}" =~ ^[A-F0-9]{40}$ || "${SORCA_MAC_SIGNING_SECRETS_PRESENT:-}" != true ]]; then
  echo '::error::正式发布须配置可持续使用的 macOS 签名证书和对应的 Actions 密钥。未签名验证包可通过仅打包任务构建。'
  exit 1
fi
if [[ -n "$EXPECTED_COMMIT" && "$EXPECTED_COMMIT" != "$private_sha" ]]; then
  echo '::error::自用版分支已前进，指定的构建起点已过期。'
  exit 1
fi

published=$(gh api "repos/$GITHUB_REPOSITORY/releases/latest")
published_tag=$(jq -er '.tag_name' <<< "$published")
published_sha=$(git rev-parse --verify "refs/tags/$published_tag^{commit}")
echo "自用版最新提交：$private_sha"
echo "自用版上次发布：$published_tag ($published_sha)"

find_upstream_package_tag() {
  # shellcheck disable=SC2016
  local filter='
    def installable:
      [.assets[] | select(.state == "uploaded" and .size > 0) | .name] as $assets
      | .draft == false and .prerelease == false
        and (.tag_name | test("^v[0-9]+\\.[0-9]+\\.[0-9]+$"))
        and ($assets | index("orca-macos-arm64.dmg")) != null
        and ($assets | index("orca-windows-setup.exe")) != null;
  '
  local tag page=1 releases
  tag=$(gh api repos/stablyai/orca/releases/latest | jq -r "$filter select(installable) | .tag_name") || return
  while [[ -z "$tag" ]]; do
    releases=$(gh api "repos/stablyai/orca/releases?per_page=100&page=$page") || return
    tag=$(jq -r "$filter first(.[] | select(installable) | .tag_name)" <<< "$releases") || return
    if [[ $(jq 'length' <<< "$releases") -lt 100 ]]; then
      break
    fi
    page=$((page + 1))
  done
  if [[ -z "$tag" ]]; then
    echo '::error::上游没有同时提供 Mac 和 Windows 安装包的正式发布。' >&2
    return 1
  fi
  printf '%s\n' "$tag"
}

if [[ "$SYNC_UPSTREAM" == true ]]; then
  git fetch --no-tags "$upstream" "refs/heads/main:$upstream_main"
  main_gap=$(git rev-list --left-right --count "$private_sha...$upstream_main")
  echo "自用版与上游 main 的独有提交数（自用版、上游）：$main_gap"

  upstream_tag=$(find_upstream_package_tag)
  git fetch --no-tags "$upstream" "+refs/tags/$upstream_tag:$upstream_release"
  upstream_sha=$(git rev-parse --verify "$upstream_release^{commit}")
  release_gap=$(git rev-list --left-right --count "$private_sha...$upstream_sha")
  echo "自用版与上游可打包版本 $upstream_tag 的独有提交数（自用版、上游）：$release_gap"
  if ! git merge-base --is-ancestor "$upstream_sha" HEAD; then
    git config user.name 'github-actions[bot]'
    git config user.email '41898282+github-actions[bot]@users.noreply.github.com'
    if ! git merge --no-ff --no-commit "$upstream_sha"; then
      git rev-parse --verify MERGE_HEAD >/dev/null
    fi
    # Keep the fork's reviewed workflows independent of the source merge.
    git restore --source=HEAD --staged --worktree -- .github/workflows
    if [[ -n "$(git diff --name-only --diff-filter=U)" ]]; then
      git diff --name-only --diff-filter=U
      echo '::error::上游源码发生合并冲突，需处理冲突后重新运行。'
      exit 1
    fi
    git diff --cached --check
    git commit -m "chore: 合并上游 Orca $upstream_tag"
    git push origin HEAD:refs/heads/自用版
  fi
fi

sha=$(git rev-parse HEAD)
echo "最终构建提交：$sha"
read -r mac_asset windows_asset < <(node -p '
  const { macInstaller, windowsInstaller } = require("./config/orca-distribution.cjs")
  macInstaller + " " + windowsInstaller
')
if [[ "$SYNC_UPSTREAM" == true && "$published_sha" == "$sha" ]] &&
  jq -e --arg mac "$mac_asset" --arg win "$windows_asset" \
    --arg signing "${SORCA_MAC_SIGNING_SHA1:-}" '
    [.assets[] | select(.state == "uploaded" and .size > 0) | .name]
    | index($mac) != null and index($win) != null and index("SHA256SUMS.txt") != null
      and ($signing == "" or index("orca-macos-arm64-update.json") != null)
  ' <<< "$published" >/dev/null; then
  echo 'build=false' >> "$GITHUB_OUTPUT"
  echo '自用版与上游稳定版均无待发布变更。'
  exit 0
fi

version=$(node -p '
  const { buildBaseVersion } = require("./config/orca-distribution.cjs")
  const base = buildBaseVersion(require("./package.json").version, process.argv[1].slice(1))
  base + "+build." + process.env.GITHUB_RUN_ID + "." + process.env.GITHUB_RUN_ATTEMPT
' "$published_tag")
mac=$(jq -cn --arg runner "$MAC_RUNNER" --arg asset "$mac_asset" \
  '{platform:"mac",runner:$runner,asset:$asset}')
win=$(jq -cn --arg asset "$windows_asset" \
  '{platform:"windows",runner:"windows-2022",asset:$asset}')
case "$PLATFORMS" in
  mac) matrix="[$mac]" ;;
  windows) matrix="[$win]" ;;
  windows-qa) matrix='[{"platform":"windows-qa","runner":"windows-2022","asset":"win-unpacked"}]' ;;
  both) matrix="[$mac,$win]" ;;
  *) exit 1 ;;
esac
{
  echo 'build=true'
  echo "sha=$sha"
  echo "version=$version"
  echo "matrix=$matrix"
  echo "publish=$PUBLISH_AFTER_BUILD"
} >> "$GITHUB_OUTPUT"
