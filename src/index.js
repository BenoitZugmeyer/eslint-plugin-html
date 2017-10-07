"use strict"

const path = require("path")
const extract = require("./extract")
const oneLine = require("./utils").oneLine
const getSettings = require("./settings").getSettings

const BOM = "\uFEFF"

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
      const currentInfos = extract(
        textOrSourceCode,
        pluginSettings.indent,
        isXML,
        pluginSettings.isJavaScriptMIMEType
      )

      messages = []

      currentInfos.code.forEach(code => {
        messages.push.apply(
          messages,
          remapMessages(
            localVerify(String(code)),
            textOrSourceCode.startsWith(BOM),
            code,
            pluginSettings.reportBadIndent,
            currentInfos.badIndentationLines
          )
        )
      })
    } else {
      messages = localVerify(textOrSourceCode)
    }

    return messages
  }
}

function remapMessages(
  messages,
  hasBOM,
  code,
  reportBadIndent,
  badIndentationLines
) {
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

  if (reportBadIndent) {
    badIndentationLines.forEach(line => {
      newMessages.push({
        message: "Bad line indentation.",
        line,
        column: 1,
        ruleId: "(html plugin)",
        severity: reportBadIndent === true ? 2 : reportBadIndent,
      })
    })
  }

  newMessages.sort((ma, mb) => {
    return ma.line - mb.line || ma.column - mb.column
  })

  return newMessages
}
