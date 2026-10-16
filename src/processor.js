import crypto from "node:crypto"
import path from "node:path"
import { parseCssSelector } from "./cssSelector.js"
import { extract } from "./extract.js"
import { PACKAGE_META } from "./packageMeta.js"
import { remapMessages } from "./remapMessages.js"
import { lineStarts as getLineStarts } from "./transformableString.js"
import {
  deleteFileScripts,
  getScriptFilename,
  setFileScripts,
} from "./scopeSharing.js"

// Same as eslint-plugin-html v8: no type, an empty type, or (application|text)/(x-)?(javascript|babel|ecmascript-6)
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
      'script[type=""]:not([src])',
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
      const extractResult = extract(text, xml, {
        indent: parseIndent(indent),
        rules: parsedRules,
      })
      const { scripts } = extractResult
      preprocessResults.set(filename, { ...extractResult, text })

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
      const preprocessResult = preprocessResults.get(filename)
      const { scripts, badIndentationLines, hasBOM, text } = preprocessResult
      preprocessResults.delete(filename)
      deleteFileScripts(filename)

      const scriptMessages = lintMarkup ? messages.slice(1) : messages
      return [
        ...(lintMarkup
          ? omitDirectiveCommentMessages(messages[0], preprocessResult)
          : []),
        ...scriptMessages.flatMap((blockMessages, index) =>
          remapMessages(blockMessages, {
            html: text,
            hasBOM,
            script: scripts[index],
          })
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

/**
 * When it lints the markup, ESLint also reads the HTML comments of this plugin as its own directives,
 * and reports them as unused (`--fix` would even empty them). Those messages are dropped.
 */
const omitDirectiveCommentMessages = (
  messages,
  { directiveComments, hasBOM, text }
) => {
  if (directiveComments.length === 0) {
    return messages
  }

  const lineStarts = getLineStarts(text)
  return messages.filter((message) => {
    if (message.ruleId != null || !message.line || !message.column) {
      return true
    }

    // ESLint's columns don't count the BOM
    const index =
      lineStarts[message.line - 1] +
      message.column -
      1 +
      (hasBOM && message.line === 1 ? 1 : 0)
    return !directiveComments.some(
      (comment) => index >= comment.start && index < comment.end
    )
  })
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
