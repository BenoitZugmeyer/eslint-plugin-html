#!/bin/bash

set -euo pipefail

ROOT=$(mktemp -d)

function finish {
  rm -rf "$ROOT"
}

trap finish EXIT

REPO_PATH=$(pwd)
ESLINT_VERSION=${1:-latest}
PACKAGE_PATH=$(realpath $(npm pack))

set -x
cd $ROOT
npm init -y
npm install --save-dev eslint@$ESLINT_VERSION "$PACKAGE_PATH" typescript

cat << EOF > index.html
<script>
console.log(1)
</script>
EOF

if [[ $ESLINT_VERSION == 4.7 ]]; then
  cat << EOF > .eslintrc.js
module.exports = {
  plugins: ["html"],
  rules: {
    "no-console": "error",
  },
}
EOF

else
  cat << EOF > eslint.config.mjs
import { defineConfig } from "eslint/config"
import html from "eslint-plugin-html";

export default defineConfig([
  {
    files: ["**/*.html"],
    plugins: {
      html,
    },
    rules: {
      "no-console": "error",
    }
  }
]);
EOF

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
