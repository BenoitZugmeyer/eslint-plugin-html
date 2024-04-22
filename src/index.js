"use strict"

const path = require("path")
const { createVerifyPatch } = require("./verifyPatch")
const {
  createVerifyWithFlatConfigPatch,
} = require("./verifyWithFlatConfigPatch")
const pluginReference = require("./pluginReference")

module.exports = pluginReference

const LINTER_ISPATCHED_PROPERTY_NAME =
  "__eslint-plugin-html-verify-function-is-patched"

// Disclaimer:
//
// This is not a long term viable solution. ESLint needs to improve its processor API to
// provide access to the configuration before actually preprocess files, but it's not
// planed yet. This solution is quite ugly but shouldn't alter eslint process.
//
// Related github issues:
// https://github.com/eslint/eslint/issues/3422
// https://github.com/eslint/eslint/issues/4153

const needles = [
  path.join("lib", "linter", "linter.js"), // ESLint 6+
  path.join("lib", "linter.js"), // ESLint 5-
]

iterateESLintModules(patch)

function getLinterFromModule(moduleExports) {
  return moduleExports.Linter
    ? moduleExports.Linter // ESLint 6+
    : moduleExports // ESLint 5-
}

function getModuleFromRequire() {
  return getLinterFromModule(require("eslint/lib/linter"))
}

function getModuleFromCache(key) {
  if (!needles.some((needle) => key.endsWith(needle))) return

  const module = require.cache[key]
  if (!module || !module.exports) return

  const Linter = getLinterFromModule(module.exports)
  if (
    typeof Linter === "function" &&
    typeof Linter.prototype.verify === "function"
  ) {
    return Linter
  }
}

function iterateESLintModules(fn) {
  if (!require.cache || Object.keys(require.cache).length === 0) {
    // Jest is replacing the node "require" function, and "require.cache" isn't available here.
    fn(getModuleFromRequire())
    return
  }

  let found = false

  for (const key in require.cache) {
    const Linter = getModuleFromCache(key)
    if (Linter) {
      fn(Linter)
      found = true
    }
  }

  if (!found) {
    console.warn(
      `⚠ eslint-plugin-html warning: ESLint is not loaded, HTML files will fail to lint. If you don't intend to lint HTML files, you can safely ignore this warning. If you think this is a bug, please file a report at https://github.com/BenoitZugmeyer/eslint-plugin-html/issues`
    )
  }
}

function patch(Linter) {
  // ignore if verify function is already been patched sometime before
  if (Linter[LINTER_ISPATCHED_PROPERTY_NAME] === true) {
    return
  }
  Linter[LINTER_ISPATCHED_PROPERTY_NAME] = true

  const verifyMethodName = Linter.prototype._verifyWithoutProcessors
    ? "_verifyWithoutProcessors" // ESLint 6+
    : "verify" // ESLint 5-
  const verify = Linter.prototype[verifyMethodName]
  Linter.prototype[verifyMethodName] = createVerifyPatch(verify)

  const verifyWithFlatConfig =
    Linter.prototype._verifyWithFlatConfigArrayAndWithoutProcessors
  Linter.prototype._verifyWithFlatConfigArrayAndWithoutProcessors =
    createVerifyWithFlatConfigPatch(verifyWithFlatConfig)
}
