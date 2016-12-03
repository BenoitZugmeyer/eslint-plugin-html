"use strict"

const path = require("path")
const extract = require("./extract")

const htmlExtensions = [
  ".erb",
  ".handlebars",
  ".hbs",
  ".htm",
  ".html",
  ".mustache",
  ".nunjucks",
  ".php",
  ".tag",
  ".twig",
  ".vue",
  ".we",
]

const xmlExtensions = [
  ".xhtml",
  ".xml",
]

// Disclaimer:
//
// This is not a long term viable solution. ESLint needs to improve its processor API to
// provide access to the configuration before actually preprocess files, but it's not
// planed yet. This solution is quite ugly but shouldn't alter eslint process.
//
// Related github issues:
// https://github.com/eslint/eslint/issues/3422
// https://github.com/eslint/eslint/issues/4153

function findESLintModules() {

  if (!require.cache || Object.keys(require.cache).length === 0) {
    // Jest is replacing the node "require" function, and "require.cache" isn't available here.
    return [require("eslint/lib/eslint")]
  }

  const modules = []
  const needle = path.join("lib", "eslint.js")
  for (const key in require.cache) {
    if (key.indexOf(needle, key.length - needle.length) >= 0) {
      const eslint = require(key)
      if (typeof eslint.verify === "function") {
        modules.push(eslint)
      }
    }
  }

  if (!modules.length) {
    throw new Error("eslint-plugin-html error: It seems that eslint is not loaded. " +
                    "If you think it is a bug, please file a report at " +
                    "https://github.com/BenoitZugmeyer/eslint-plugin-html/issues")
  }

  return modules
}

function createProcessor(defaultXMLMode) {
  let patchedModules = null
  const originalVerifyMethods = new WeakMap()
  let reportBadIndent

  let currentInfos

  function patchModule(module) {
    const originalVerify = module.verify

    function patchedVerify(textOrSourceCode, config, filenameOrOptions, saveState) {
      const indentDescriptor = config.settings && config.settings["html/indent"]
      let xmlMode = config.settings && config.settings["html/xml-mode"]
      reportBadIndent = config.settings && config.settings["html/report-bad-indent"]

      if (typeof xmlMode !== "boolean") {
        xmlMode = defaultXMLMode
      }

      currentInfos = extract(textOrSourceCode, {
        indent: indentDescriptor,
        xmlMode,
      })

      return originalVerify.call(
        this,
        currentInfos.code.toString(),
        config,
        filenameOrOptions,
        saveState
      )
    }

    originalVerifyMethods.set(module, originalVerify)

    module.verify = patchedVerify
  }

  function unpatchModule(module) {
    const originalVerify = originalVerifyMethods.get(module)
    if (originalVerify) {
      module.verify = originalVerify
    }
  }

  return {

    preprocess (content) {
      patchedModules = findESLintModules()
      patchedModules.forEach(patchModule)

      return [content]
    },

    postprocess (messages) {
      patchedModules.forEach(unpatchModule)
      patchedModules = null

      const newMessages = []

      for (const message of messages[0]) {
        const location = currentInfos.code.originalLocation(message)

        // Ignore messages if they were in transformed code
        if (location) {
          Object.assign(message, location)

          // Map fix range
          if (message.fix && message.fix.range) {
            message.fix.range = [
              currentInfos.code.originalIndex(message.fix.range[0]),
              currentInfos.code.originalIndex(message.fix.range[1]),
            ]
          }

          // Map end location
          if (message.endLine && message.endColumn) {
            const endLocation = currentInfos.code.originalLocation({
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
        currentInfos.badIndentationLines.forEach((line) => {
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
    },

  }

}

const htmlProcessor = createProcessor(false)
const xmlProcessor = createProcessor(true)

const processors = {}

htmlExtensions.forEach((ext) => {
  processors[ext] = htmlProcessor
})

xmlExtensions.forEach((ext) => {
  processors[ext] = xmlProcessor
})

exports.processors = processors
