"use strict"

const path = require("path")
const extract = require("./extract")
const oneLine = require("./utils").oneLine
const getSettings = require("./settings").getSettings

const BOM = "\uFEFF"
const GET_SCOPE_RULE_NAME = "__eslint-plugin-html-get-scope"

// Disclaimer:
//
// This is not a long term viable solution. ESLint needs to improve its processor API to
// provide access to the configuration before actually preprocess files, but it's not
// planed yet. This solution is quite ugly but shouldn't alter eslint process.
//
// Related github issues:
// https://github.com/eslint/eslint/issues/3422
// https://github.com/eslint/eslint/issues/4153

const needle = path.join("lib", "linter.js")

iterateESLintModules(patch)

function getModuleFromRequire() {
  return require("eslint/lib/linter")
}

function getModuleFromCache(key) {
  if (!key.endsWith(needle)) return

  const module = require.cache[key]
  if (!module || !module.exports) return

  const Linter = module.exports
  if (typeof Linter.prototype.verify !== "function") return

  return Linter
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
    throw new Error(
      oneLine`
        eslint-plugin-html error: It seems that eslint is not loaded.
        If you think it is a bug, please file a report at
        https://github.com/BenoitZugmeyer/eslint-plugin-html/issues
      `
    )
  }
}

function patch(Linter) {
  const verify = Linter.prototype.verify
  Linter.prototype.verify = function(
    textOrSourceCode,
    config,
    filenameOrOptions,
    saveState
  ) {
    const localVerify = code =>
      verify.call(this, code, config, filenameOrOptions, saveState)

    let messages
    const filename =
      typeof filenameOrOptions === "object"
        ? filenameOrOptions.filename
        : filenameOrOptions
    const extension = path.extname(filename || "")

    const pluginSettings = getSettings(config.settings || {})
    const isHTML = pluginSettings.htmlExtensions.indexOf(extension) >= 0
    const isXML =
      !isHTML && pluginSettings.xmlExtensions.indexOf(extension) >= 0

    if (typeof textOrSourceCode === "string" && (isHTML || isXML)) {
      messages = []

      const pushMessages = (localMessages, code) => {
        messages.push.apply(
          messages,
          remapMessages(localMessages, textOrSourceCode.startsWith(BOM), code)
        )
      }

      const currentInfos = extract(
        textOrSourceCode,
        pluginSettings.indent,
        isXML,
        pluginSettings.isJavaScriptMIMEType
      )

      if (pluginSettings.reportBadIndent) {
        currentInfos.badIndentationLines.forEach(line => {
          messages.push({
            message: "Bad line indentation.",
            line,
            column: 1,
            ruleId: "(html plugin)",
            severity: pluginSettings.reportBadIndent,
          })
        })
      }

      if (
        config.parserOptions &&
        config.parserOptions.sourceType === "module"
      ) {
        for (const code of currentInfos.code) {
          pushMessages(localVerify(String(code)), code)
        }
      } else {
        verifyWithSharedScopes.call(
          this,
          localVerify,
          config,
          currentInfos,
          pushMessages
        )
      }

      messages.sort((ma, mb) => {
        return ma.line - mb.line || ma.column - mb.column
      })
    } else {
      messages = localVerify(textOrSourceCode)
    }

    return messages
  }
}

function verifyWithSharedScopes(
  localVerify,
  config,
  currentInfos,
  pushMessages
) {
  // First pass: collect needed globals and declared globals for each script tags.
  const firstPassValues = []
  const originalRules = config.rules
  config.rules = { [GET_SCOPE_RULE_NAME]: "error" }

  for (const code of currentInfos.code) {
    this.rules.define(GET_SCOPE_RULE_NAME, context => {
      return {
        Program() {
          firstPassValues.push({
            code,
            sourceCode: context.getSourceCode(),
            neededGlobals: context
              .getScope()
              .through.map(node => node.identifier.name),
            declaredGlobals: context
              .getScope()
              .variables.map(variable => variable.name),
          })
        },
      }
    })

    pushMessages(localVerify(String(code)), code)
  }

  config.rules = originalRules

  // Second pass: for each script tags, add "globals" and "exported" comments then run eslint
  for (let i = 0; i < firstPassValues.length; i += 1) {
    const values = firstPassValues[i]

    declareVariables(
      values.sourceCode,
      "globals",
      firstPassValues
        .slice(0, i)
        .map(previousValues =>
          previousValues.declaredGlobals.filter(
            name => values.neededGlobals.indexOf(name) >= 0
          )
        )
    )

    declareVariables(
      values.sourceCode,
      "exported",
      firstPassValues
        .slice(i + 1)
        .map(nextValues =>
          nextValues.neededGlobals.filter(
            name => values.declaredGlobals.indexOf(name) >= 0
          )
        )
    )

    pushMessages(localVerify(values.sourceCode), values.code)
  }
}

function declareVariables(sourceCode, type, vars) {
  const uniqVars = new Set(vars.reduce((splat, vars) => splat.concat(vars), []))
  if (!uniqVars.size) return

  const joined = Array.from(uniqVars)
    .map(name => `${name}: true`)
    .join(", ")

  sourceCode.ast.comments.push({
    value: `${type} ${joined}`,
    loc: { start: 0, end: 0 },
    range: [0, 0],
    type: "Block",
  })
}

function remapMessages(messages, hasBOM, code) {
  const newMessages = []
  const bomOffset = hasBOM ? -1 : 0

  for (const message of messages) {
    const location = code.originalLocation({
      line: message.line,
      // eslint-plugin-eslint-comments is raising message with column=0 to bypass ESLint ignore
      // comments. Since messages are already ignored at this time, just reset the column to a valid
      // number. See https://github.com/BenoitZugmeyer/eslint-plugin-html/issues/70
      column: message.column || 1,
    })

    // Ignore messages if they were in transformed code
    if (location) {
      Object.assign(message, location)
      message.source = code.getOriginalLine(location.line)

      // Map fix range
      if (message.fix && message.fix.range) {
        message.fix.range = [
          code.originalIndex(message.fix.range[0]) + bomOffset,
          // The range end is exclusive, meaning it should replace all characters  with indexes from
          // start to end - 1. We have to get the original index of the last targeted character.
          code.originalIndex(message.fix.range[1] - 1) + 1 + bomOffset,
        ]
      }

      // Map end location
      if (message.endLine && message.endColumn) {
        const endLocation = code.originalLocation({
          line: message.endLine,
          column: message.endColumn,
        })
        if (endLocation) {
          message.endLine = endLocation.line
          message.endColumn = endLocation.column
        }
      }

      newMessages.push(message)
    }
  }

  return newMessages
}
