import type { ESLint, Linter, Rule } from "eslint"

export interface ScriptRule {
  /**
   * CSS selector matching the tags whose content is a script, like `script[type="text/babel" i]`
   */
  match: string

  /**
   * Whether the matched scripts are modules. Module scripts get an `.mjs` virtual filename and don't
   * share their declarations with other scripts.
   * @default false
   */
  module?: boolean
}

export interface ProcessorOptions {
  /**
   * Report lines that are less indented than the script (`true` is the same as `"error"`)
   * @default false
   */
  reportBadIndent?: boolean | "warn" | "error"

  /**
   * Which tags contain scripts, and which of them are modules. The first matching rule wins.
   * @default <script> without `src`, with no `type` or a JavaScript or `module` type
   */
  rules?: readonly ScriptRule[]

  /**
   * Expected indentation of scripts: a number of spaces or `tab`, with a `+` prefix to make it
   * relative to the indentation of the tag. By default, it's the indentation of the first line.
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

export declare const processor: (options?: ProcessorOptions) => Linter.Processor

/**
 * Parser for scripts extracted by the processor. It wraps `parserOptions.parser` (espree by
 * default) to share global variables between the scripts of a file.
 */
export declare const parser: Linter.Parser

declare const plugin: ESLint.Plugin & {
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
}

export default plugin
