#!/usr/bin/env bash
# 线上原型页 vs 仓库锚点 逐字节比对
# 用法: check-live-anchors.sh <repo-dir> [base-url]
# 退出码: 0 全一致 / 1 有差异 / 2 取件失败
set -uo pipefail

REPO="${1:-.}"
BASE="${2:-https://cds.242500.xyz/prototype}"
FILES=(index.html display.html screen.html console.html)
TMP="$(mktemp -d)"
trap 'rm -rf "$TMP"' EXIT

fail=0
err=0
printf '%-14s %-10s %-12s %-40s %s\n' FILE BYTES EXPECTED_BLOB RESULT
for f in "${FILES[@]}"; do
  code=$(curl -sS -m 30 -H 'Accept: */*' -o "$TMP/$f" -w '%{http_code}' "$BASE/$f" 2>/dev/null) || code=000
  if [ "$code" != "200" ]; then
    printf '%-14s %-10s %-12s %-40s HTTP %s\n' "$f" - - - "$code"
    err=1; continue
  fi
  want=$(git -C "$REPO" rev-parse "HEAD:prototype/$f" 2>/dev/null || echo MISSING)
  got=$(git hash-object "$TMP/$f")
  bytes=$(wc -c < "$TMP/$f")
  if [ "$want" = "$got" ]; then
    printf '%-14s %-10s %-12s %-40s EXACT\n' "$f" "$bytes" "${want:0:12}" ok
  else
    # 剥 Cloudflare Web Analytics beacon（形如 <script ... data-cf-beacon ...></script>）后重比
    python3 - "$TMP/$f" "$TMP/$f.stripped" <<'PY' 2>/dev/null || cp "$TMP/$f" "$TMP/$f.stripped"
import re,sys
d=open(sys.argv[1],'rb').read()
d=re.sub(rb'\s*<script[^>]*data-cf-beacon[^>]*>.*?</script>',b'',d,flags=re.S)
open(sys.argv[2],'wb').write(d)
PY
    got2=$(git hash-object "$TMP/$f.stripped")
    if [ "$want" = "$got2" ]; then
      printf '%-14s %-10s %-12s %-40s EXACT(beacon-stripped, +%sB)\n' \
        "$f" "$bytes" "${want:0:12}" ok "$((bytes - $(wc -c < "$TMP/$f.stripped")))"
    else
      printf '%-14s %-10s %-12s %-40s DIFF\n' "$f" "$bytes" "${want:0:12}" "got ${got:0:12}"
      fail=1
    fi
  fi
done

if [ "$err" = 1 ]; then echo "RESULT: FETCH-FAILED"; exit 2; fi
if [ "$fail" = 1 ]; then echo "RESULT: DRIFT"; exit 1; fi
echo "RESULT: ALL-EXACT"
