import crypto from "node:crypto"
import path from "node:path"
import { parseCssSelector } from "./cssSelector.js"
import { extract } from "./extract.js"
import { PACKAGE_META } from "./packageMeta.js"
import { remapMessages } from "./remapMessages.js"
import {
  deleteFileScripts,
  getScriptFilename,
  setFileScripts,
} from "./scopeSharing.js"

// Same as eslint-plugin-html v8: (application|text)/(x-)?(javascript|babel|ecmascript-6)
const CLASSIC_SCRIPT_TYPES = Object.freeze(
  ["application", "text"].flatMap((prefix) =>
    ["", "x-"].flatMap((variant) =>
      ["javascript", "babel", "ecmascript-6"].map(
        (name) => `${prefix}/${variant}${name}`
      )
    )
  )
)

const DEFAULT_RULES = Object.freeze([
  Object.freeze({
    match: [
      "script:not([type]):not([src])",
      ...CLASSIC_SCRIPT_TYPES.map(
        (type) => `script[type="${type}" i]:not([src])`
      ),
    ].join(", "),
    module: false,
  }),
  Object.freeze({ match: 'script[type="module" i]:not([src])', module: true }),
])

const BAD_INDENT_SEVERITIES = Object.freeze({ warn: 1, error: 2 })

export default function ({
  reportBadIndent = false,
  rules = DEFAULT_RULES,
  indent = undefined,
  xml = false,
  lintMarkup = false,
} = {}) {
  const preprocessResults = new Map()
  const parsedRules = rules.map((rule) => ({
    ...rule,
    match: parseCssSelector(rule.match).match,
  }))
  const badIndentSeverity =
    reportBadIndent === true ? 2 : BAD_INDENT_SEVERITIES[reportBadIndent] || 0
  const optionsHash = crypto
    .createHash("sha1")
    .update(JSON.stringify({ reportBadIndent, rules, indent, xml, lintMarkup }))
    .digest("hex")
    .slice(0, 8)

  return {
    meta: {
      name: PACKAGE_META.name,
      // Options are part of the version so that ESLint's cache notices when they change
      version: `${PACKAGE_META.version}+${optionsHash}`,
    },
    supportsAutofix: true,
    preprocess: (text, filename) => {
      const { scripts, badIndentationLines, hasBOM } = extract(text, xml, {
        indent: parseIndent(indent),
        rules: parsedRules,
      })
      preprocessResults.set(filename, { scripts, badIndentationLines, hasBOM })

      const codes = scripts.map((script) => script.code.toString())
      setFileScripts(
        filename,
        scripts.map((script, index) => ({
          code: codes[index],
          module: script.module,
        }))
      )

      return [
        // Same text and extension as the file: ESLint lints it with the file's own config, including
        // `language`, and without this processor
        ...(lintMarkup ? [{ text, filename: path.basename(filename) }] : []),
        ...scripts.map((script, index) => ({
          text: codes[index],
          filename: getScriptFilename(index, script.module),
        })),
      ]
    },

    postprocess: (messages, filename) => {
      const { scripts, badIndentationLines, hasBOM } =
        preprocessResults.get(filename)
      preprocessResults.delete(filename)
      deleteFileScripts(filename)

      const scriptMessages = lintMarkup ? messages.slice(1) : messages
      return [
        ...(lintMarkup ? messages[0] : []),
        ...scriptMessages.flatMap((blockMessages, index) =>
          remapMessages(blockMessages, hasBOM, scripts[index].code)
        ),
        ...(badIndentSeverity
          ? badIndentationLines.map((line) => ({
              message: "Bad line indentation.",
              line,
              column: 1,
              ruleId: "(html plugin)",
              severity: badIndentSeverity,
            }))
          : []),
      ].sort(
        (first, second) =>
          first.line - second.line || first.column - second.column
      )
    },
  }
}

function parseIndent(indent) {
  if (indent === undefined) {
    return
  }
  const parsedIndent = /^(\+)?(tab|\d+)$/.exec(indent)
  return (
    parsedIndent && {
      relative: parsedIndent[1] === "+",
      spaces: parsedIndent[2] === "tab" ? "\t" : " ".repeat(parsedIndent[2]),
    }
  )
}
