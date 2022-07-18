#!/bin/bash

set -euo pipefail

ROOT=$(mktemp -d)

function finish {
  rm -rf "$ROOT"
}

trap finish EXIT

REPO_PATH=$(pwd)
ESLINT_VERSION=${1:-latest}

set -x
cd $ROOT
npm init -y
npm install --save-dev eslint@$ESLINT_VERSION
ln -s $REPO_PATH node_modules/eslint-plugin-html

cat << EOF > index.html
<script>
console.log(1)
</script>
EOF

cat << EOF > .eslintrc.js
module.exports = {
  plugins: ["html"],
  rules: {
    "no-console": "error",
  },
}
EOF

npx eslint --format compact index.html > actual_output 2>&1 || true

expected_path="$(node -p "path.resolve('index.html')")"

cat << EOF | diff -u actual_output -
$expected_path: line 2, col 1, Error - Unexpected console statement. (no-console)

1 problem
EOF

echo "All passed"
