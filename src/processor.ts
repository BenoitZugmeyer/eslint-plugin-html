import crypto from "node:crypto"
import path from "node:path"
import type { Linter } from "eslint"
import { parseCssSelector } from "./cssSelector.ts"
import { extract } from "./extract.ts"
import { PACKAGE_META } from "./packageMeta.ts"
import { remapMessages } from "./remapMessages.ts"
import {
  deleteFileScripts,
  getScriptFilename,
  setFileScripts,
} from "./scopeSharing.ts"
import { lineStarts as getLineStarts } from "./transformableString.ts"

export interface ScriptRule {
  /**
   * CSS selector matching the tags whose content is a script, like `script[type="text/babel" i]`
   */
  match: string

  /**
   * Whether the matched scripts are modules. Module scripts get an `.mjs` virtual filename and
   * don't share their declarations with other scripts.
   * @default false
   */
  module?: boolean
}

export interface ProcessorOptions {
  /**
   * Report lines that are less indented than the script, as `"warn"` (or `1`), `"error"` (or `2`,
   * `true`), or not (`"off"`, `0`, `false`)
   * @default false
   */
  reportBadIndent?: boolean | "off" | "warn" | "error" | 0 | 1 | 2

  /**
   * Which tags contain scripts, and which of them are modules. The first matching rule wins.
   * @default <script> without `src`, with no `type`, an empty one, or a JavaScript or `module` one
   */
  rules?: readonly ScriptRule[]

  /**
   * Expected indentation of scripts: a number of spaces or `tab`, with a `+` prefix to make it
   * relative to the indentation of the tag. By default, it's the indentation of the first line
   */
  indent?: number | `${"+" | ""}${number}` | `${"+" | ""}tab`

  /**
   * Parse files as XML (CDATA sections are removed from scripts)
   * @default false
   */
  xml?: boolean

  /**
   * Also lint the whole file with the file's own config, without this processor. Use it together
   * with an HTML parser or language, like html-eslint.
   * @default false
   */
  lintMarkup?: boolean
}

interface PreprocessResult extends ReturnType<typeof extract> {
  text: string
}

// Same as eslint-plugin-html v8: no type, an empty type, or
// (application|text)/(x-)?(javascript|babel|ecmascript-6)
const CLASSIC_SCRIPT_TYPES = Object.freeze(
  ["application", "text"].flatMap((prefix) =>
    ["", "x-"].flatMap((variant) =>
      ["javascript", "babel", "ecmascript-6"].map(
        (name) => `${prefix}/${variant}${name}`
      )
    )
  )
)

const DEFAULT_RULES: readonly ScriptRule[] = Object.freeze([
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

// Same values as eslint-plugin-html v8, except `true`, which was `"warn"`
const getBadIndentSeverity = (
  reportBadIndent: ProcessorOptions["reportBadIndent"]
) => {
  switch (reportBadIndent) {
    case undefined:
    case false:
    case 0:
    case "off":
      return 0
    case 1:
    case "warn":
      return 1
    case true:
    case 2:
    case "error":
      return 2
    default:
      throw new Error(
        `Invalid value for reportBadIndent: ${String(reportBadIndent)}, expected one of 0, 1, 2, "off", "warn", "error", true or false`
      )
  }
}

export default function processor({
  reportBadIndent = false,
  rules = DEFAULT_RULES,
  indent,
  xml = false,
  lintMarkup = false,
}: ProcessorOptions = {}): Linter.Processor {
  const preprocessResults = new Map<string, PreprocessResult>()
  const parsedRules = rules.map((rule) => ({
    ...rule,
    match: parseCssSelector(rule.match).match,
  }))
  const badIndentSeverity = getBadIndentSeverity(reportBadIndent)
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
        // Same text and extension as the file: ESLint lints it with the file's own config,
        // including `language`, and without this processor
        ...(lintMarkup ? [{ text, filename: path.basename(filename) }] : []),
        ...scripts.map((script, index) => ({
          text: codes[index],
          filename: getScriptFilename(index, script.module),
        })),
      ]
    },

    postprocess: (messages, filename) => {
      const preprocessResult = preprocessResults.get(filename)
      if (!preprocessResult) {
        return messages.flat()
      }

      const { scripts, badIndentationLines, hasBOM, text } = preprocessResult
      preprocessResults.delete(filename)
      deleteFileScripts(filename)

      const scriptMessages = lintMarkup ? messages.slice(1) : messages
      const badIndentationMessages: Linter.LintMessage[] = badIndentSeverity
        ? badIndentationLines.map((line) => ({
            message: "Bad line indentation.",
            line,
            column: 1,
            ruleId: "(html plugin)",
            severity: badIndentSeverity,
          }))
        : []
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
        ...badIndentationMessages,
      ].sort(
        (first, second) =>
          first.line - second.line || first.column - second.column
      )
    },
  }
}

/**
 * When it lints the markup, ESLint also reads the HTML comments of this plugin as its own
 * directives, and reports them as unused (`--fix` would even empty them). Those messages are
 * dropped
 */
const omitDirectiveCommentMessages = (
  messages: Linter.LintMessage[],
  { directiveComments, hasBOM, text }: PreprocessResult
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

function parseIndent(indent: ProcessorOptions["indent"]) {
  if (indent === undefined) {
    return
  }
  const parsedIndent = /^(\+)?(tab|\d+)$/.exec(String(indent))
  return (
    parsedIndent && {
      relative: parsedIndent[1] === "+",
      spaces:
        parsedIndent[2] === "tab" ? "\t" : " ".repeat(Number(parsedIndent[2])),
    }
  )
}
