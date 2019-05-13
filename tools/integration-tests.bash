#!/bin/bash

set -euo pipefail

ROOT=$(mktemp -d)

function finish {
  rm -rf "$ROOT"
}

trap finish EXIT

REPO_PATH=$(pwd)
ESLINT_VERSION=${ESLINT_VERSION:-latest}

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

cat << EOF | diff -u <(npx eslint --format compact index.html 2>&1) -
$(pwd)/index.html: line 2, col 1, Error - Unexpected console statement. (no-console)

1 problem
EOF

echo "All passed"
