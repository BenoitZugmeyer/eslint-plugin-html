import { PACKAGE_META } from "./packageMeta.js"
import processor from "./processor.js"
import { parser, scopeSharingRule } from "./scopeSharing.js"

const HTML_FILES = Object.freeze(["**/*.html", "**/*.htm"])
const XHTML_FILES = Object.freeze(["**/*.xhtml"])
const MARKUP_FILES = Object.freeze([...HTML_FILES, ...XHTML_FILES])

const toScriptFiles = (extension) =>
  MARKUP_FILES.map((glob) => `${glob}/*.${extension}`)

const plugin = {
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
  configs: {},
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
