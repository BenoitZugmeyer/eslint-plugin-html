import type { ESLint, Linter, Rule } from "eslint"
import { PACKAGE_META } from "./packageMeta.ts"
import processor from "./processor.ts"
import { parser, scopeSharingRule } from "./scopeSharing.ts"

export type { ProcessorOptions, ScriptRule } from "./processor.ts"

interface Plugin extends ESLint.Plugin {
  processors: {
    html: Linter.Processor
    xml: Linter.Processor
  }
  rules: {
    "scope-sharing": Rule.RuleModule
  }
  configs: {
    recommended: Linter.Config[]
  }
  parser: typeof parser
  processor: typeof processor
}

const HTML_FILES = Object.freeze(["**/*.html", "**/*.htm"])
const XHTML_FILES = Object.freeze(["**/*.xhtml"])
const MARKUP_FILES = Object.freeze([...HTML_FILES, ...XHTML_FILES])

const toScriptFiles = (extension: string) =>
  MARKUP_FILES.map((glob) => `${glob}/*.${extension}`)

const plugin: Plugin = {
  meta: {
    ...PACKAGE_META,
    namespace: "html",
  },
  processors: {
    html: processor(),
    xml: processor({ xml: true }),
  },
  rules: {
    "scope-sharing": scopeSharingRule,
  },
  configs: {
    recommended: [],
  },
  // Also here for CommonJS, where `require()` returns the plugin
  parser,
  processor,
}

plugin.configs.recommended = [
  {
    name: "html/recommended/html",
    files: [...HTML_FILES],
    plugins: { html: plugin },
    processor: "html/html",
  },
  {
    name: "html/recommended/xhtml",
    files: [...XHTML_FILES],
    plugins: { html: plugin },
    processor: "html/xml",
  },
  {
    name: "html/recommended/scripts",
    files: [...toScriptFiles("js"), ...toScriptFiles("mjs")],
    plugins: { html: plugin },
    languageOptions: { parser },
    rules: { "html/scope-sharing": "error" },
  },
  {
    name: "html/recommended/classic-scripts",
    files: toScriptFiles("js"),
    languageOptions: { sourceType: "script" },
  },
]

export { parser, processor }

export default plugin
