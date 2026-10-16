#!/bin/bash

set -euo pipefail

ROOT=$(mktemp -d)

function finish {
  rm -rf "$ROOT"
}

trap finish EXIT

REPO_PATH=$(pwd)
ESLINT_VERSION=${1:-latest}
# The last line is the tarball name, after the output of the build
PACKAGE_PATH=$(realpath "$(npm pack --silent | tail -n 1)")

set -x
cd $ROOT
npm init -y
npm install --save-dev eslint@$ESLINT_VERSION "$PACKAGE_PATH" typescript

cat << EOF > index.html
<script>
console.log(1)
</script>
EOF

# No \`defineConfig\`: it only exists since ESLint 9.22
cat << EOF > eslint.config.mjs
import html, { processor } from "eslint-plugin-html"

/** @type {import("eslint").Linter.Config[]} */
export default [
  ...html.configs.recommended,
  {
    files: ["**/*.html"],
    processor: processor({ reportBadIndent: "warn" }),
  },
  {
    files: ["**/*.js", "**/*.mjs"],
    rules: {
      "no-console": "error",
    },
  },
]
EOF

# ESLint only ships its types since 9.10
if [[ -f node_modules/eslint/lib/types/index.d.ts ]]; then
  npx tsc --checkJs --noEmit ./eslint.config.mjs
fi

npx eslint index.html > actual_output 2>&1 || true

expected_path="$(node -p "path.resolve('index.html')")"

cat << EOF | diff -u actual_output -

$expected_path
  2:1  error  Unexpected console statement  no-console

✖ 1 problem (1 error, 0 warnings)

EOF

echo "All passed"
