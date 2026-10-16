import path from "node:path"
import { ConfigCommentParser } from "@eslint/plugin-kit"
import type { AST, Linter, Rule, Scope } from "eslint"
import * as eslintScope from "eslint-scope"
import * as evk from "eslint-visitor-keys"
import * as espree from "espree"
import type { Program } from "estree"
import { PACKAGE_META } from "./packageMeta.ts"

// What ESLint gives to parsers, plus the parser this one wraps
interface ParseOptions extends Linter.ParserOptions {
  parser?: Linter.Parser
}

interface ParseResult extends Linter.ESLintParseResult {
  scopeManager: Scope.ScopeManager
}

interface ScriptGlobals {
  declared: readonly string[]
  through: readonly string[]
}

interface FileScript {
  code: string
  module: boolean
  globals: ScriptGlobals | undefined
  // A parse made ahead of time, to reuse when ESLint gets to the script
  parse: { options: ParseOptions; result: ParseResult } | undefined
}

interface FileState {
  scripts: FileScript[]
  parserOptions: ParseOptions | undefined
  reportedParserNotUsed: boolean
}

// Scripts of the files being linted, keyed by the filename given to `preprocess`, which is also the
// dirname of the virtual filename of each script
const fileScripts = new Map<string, FileState>()

const SCRIPT_FILENAME_RE = /(?:^|_)part-(\d+)\.m?js$/
const BLOCK_FILENAME_RE = /(\d+)_part-(\d+)\.m?js$/
const EMPTY_GLOBALS: ScriptGlobals = Object.freeze({
  declared: [],
  through: [],
})
const commentParser = new ConfigCommentParser()

export const setFileScripts = (
  filename: string,
  scripts: ReadonlyArray<{ code: string; module: boolean }>
) => {
  fileScripts.set(filename, {
    scripts: scripts.map((script) => ({
      ...script,
      globals: undefined,
      parse: undefined,
    })),
    parserOptions: undefined,
    reportedParserNotUsed: false,
  })
}

export const deleteFileScripts = (filename: string) => {
  fileScripts.delete(filename)
}

export const getScriptFilename = (index: number, module: boolean) =>
  `part-${index}.${module ? "mjs" : "js"}`

const getScriptContext = (virtualFilename: string | undefined) => {
  if (!virtualFilename) {
    return
  }

  const file = fileScripts.get(path.dirname(virtualFilename))
  const match = SCRIPT_FILENAME_RE.exec(path.basename(virtualFilename))
  if (!file || !match) {
    return
  }

  const index = Number(match[1])
  const script = file.scripts[index]
  return script && { file, index, script }
}

// Virtual filename of another script of the same file, built from the current one
const getSiblingFilePath = (
  filePath: string | undefined,
  index: number,
  module: boolean
) =>
  filePath &&
  filePath.replace(
    BLOCK_FILENAME_RE,
    (_, blockIndex: string, scriptIndex: string) =>
      `${Number(blockIndex) - Number(scriptIndex) + index}_${getScriptFilename(index, module)}`
  )

const isProgram = (ast: unknown): ast is AST.Program =>
  typeof ast === "object" &&
  ast != null &&
  "type" in ast &&
  ast.type === "Program"

// Mirrors what ESLint does for parsers that don't return a scope manager
const analyzeScope = (
  ast: AST.Program,
  parserOptions: Linter.ParserOptions,
  visitorKeys: Linter.ESLintParseResult["visitorKeys"]
) => {
  const ecmaFeatures = parserOptions.ecmaFeatures || {}
  return eslintScope.analyze(ast, {
    ignoreEval: true,
    nodejsScope: ecmaFeatures.globalReturn,
    impliedStrict: ecmaFeatures.impliedStrict,
    ecmaVersion:
      typeof parserOptions.ecmaVersion === "number"
        ? parserOptions.ecmaVersion
        : 6,
    sourceType: parserOptions.sourceType || "script",
    childVisitorKeys: visitorKeys || evk.KEYS,
    fallback: (node) => [...evk.getKeys(node)],
    jsx: ecmaFeatures.jsx,
  })
}

// ESLint does the same when espree is the configured parser
const normalizeEspreeOptions = (
  parserOptions: Linter.ParserOptions
): Linter.ParserOptions =>
  parserOptions.sourceType === "module" &&
  parserOptions.ecmaFeatures &&
  parserOptions.ecmaFeatures.globalReturn
    ? {
        ...parserOptions,
        ecmaFeatures: { ...parserOptions.ecmaFeatures, globalReturn: false },
      }
    : parserOptions

const callParser = (
  parser: Linter.Parser | undefined,
  code: string,
  parserOptions: Linter.ParserOptions
) => {
  if (!parser) {
    return { ast: espree.parse(code, normalizeEspreeOptions(parserOptions)) }
  }
  return "parseForESLint" in parser
    ? parser.parseForESLint(code, parserOptions)
    : { ast: parser.parse(code, parserOptions) }
}

const parseWithInnerParser = (
  code: string,
  { parser, ...parserOptions }: ParseOptions
) => {
  const { ast, scopeManager, ...result } = callParser(
    parser,
    code,
    parserOptions
  )
  if (!isProgram(ast)) {
    throw new Error(`The parser of ${PACKAGE_META.name} needs an ESTree parser`)
  }

  return {
    ...result,
    ast,
    scopeManager: isScopeManager(scopeManager)
      ? scopeManager
      : analyzeScope(ast, parserOptions, result.visitorKeys),
  }
}

const isScopeManager = (value: unknown): value is Scope.ScopeManager =>
  typeof value === "object" && value != null && "globalScope" in value

const getInlineGlobalNames = (ast: AST.Program) =>
  (ast.comments || [])
    .filter((comment) => comment.type === "Block")
    .flatMap((comment) => {
      const directive = commentParser.parseDirective(comment.value)
      return directive &&
        (directive.label === "global" || directive.label === "globals")
        ? Object.keys(commentParser.parseStringConfig(directive.value))
        : []
    })

// The scope of top-level declarations: the global scope, or the module / CommonJS one
const getTopLevelScope = (globalScope: Scope.Scope, ast: AST.Program) => {
  const [firstChildScope] = globalScope.childScopes
  return firstChildScope && firstChildScope.block === ast
    ? firstChildScope
    : globalScope
}

// Must run before any global is added to the scope manager
const collectGlobals = (
  { ast, scopeManager }: ParseResult,
  module: boolean
) => {
  const { globalScope } = scopeManager
  if (!globalScope) {
    return EMPTY_GLOBALS
  }

  return {
    declared: module
      ? []
      : [
          ...getTopLevelScope(globalScope, ast).variables.map(
            (variable) => variable.name
          ),
          ...getInlineGlobalNames(ast),
        ],
    through: globalScope.through.map((reference) => reference.identifier.name),
  }
}

const haveSameOptions = (first: ParseOptions, second: ParseOptions) =>
  [...new Set([...Object.keys(first), ...Object.keys(second)])].every(
    (key) => key === "filePath" || first[key] === second[key]
  )

/**
 * Parses another script of the same file with the options ESLint gave for the current one, so the
 * parse can be reused when ESLint gets to it
 */
const getScriptGlobals = (
  file: FileState,
  index: number,
  currentScript: FileScript
) => {
  const script = file.scripts[index]
  if (script.globals) {
    return script.globals
  }

  const parserOptions = file.parserOptions || {}
  const options =
    script.module === currentScript.module
      ? parserOptions
      : {
          ...parserOptions,
          sourceType: script.module ? "module" : "script",
        }
  try {
    const result = parseWithInnerParser(script.code, {
      ...options,
      filePath: getSiblingFilePath(
        parserOptions.filePath,
        index,
        script.module
      ),
    })
    script.globals = collectGlobals(result, script.module)
    script.parse = { options, result }
  } catch {
    // ESLint reports the parsing error when it lints this script
    script.globals = EMPTY_GLOBALS
  }

  return script.globals
}

// Names declared or used by the scripts from `start` to `end`, parsed if needed
const collectScriptNames = (
  file: FileState,
  start: number,
  end: number,
  currentScript: FileScript,
  kind: keyof ScriptGlobals
) =>
  new Set(
    file.scripts
      .slice(start, end)
      .flatMap(
        (_, offset) =>
          getScriptGlobals(file, start + offset, currentScript)[kind]
      )
  )

// Reuses (once) a parse made ahead of time with the same options
const takeEarlyParse = (
  script: FileScript,
  code: string,
  options: ParseOptions
) => {
  const { parse } = script
  script.parse = undefined
  return parse &&
    script.code === code &&
    haveSameOptions(parse.options, options)
    ? parse.result
    : undefined
}

/**
 * Parser for scripts extracted by the processor. It wraps `parserOptions.parser` (espree by
 * default), and declares the global variables coming from the previous classic scripts of the same
 * HTML file in the scope manager it returns
 */
export const parser = {
  meta: { name: `${PACKAGE_META.name}/parser`, version: PACKAGE_META.version },

  parseForESLint(code: string, options: ParseOptions = {}) {
    const context = getScriptContext(options.filePath)
    if (context == null) {
      return parseWithInnerParser(code, options)
    }

    const { file, index, script } = context
    file.parserOptions = options

    const result =
      takeEarlyParse(script, code, options) ||
      parseWithInnerParser(code, options)
    const globals = collectGlobals(result, script.module)
    script.globals = globals

    const declaredBefore = collectScriptNames(
      file,
      0,
      index,
      script,
      "declared"
    )
    const names = [...new Set(globals.through)].filter((name) =>
      declaredBefore.has(name)
    )
    // Scope managers of parsers made for older ESLint versions may not have it
    if (
      names.length > 0 &&
      typeof result.scopeManager.addGlobals === "function"
    ) {
      result.scopeManager.addGlobals(names)
    }

    return result
  },
}

// By name, in case the plugin is loaded more than once
const isPluginParser = (configuredParser: Linter.Parser | undefined) =>
  configuredParser?.meta?.name === parser.meta.name

export const scopeSharingRule: Rule.RuleModule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Mark the global variables of a classic script as used when the next scripts of the same HTML file use them",
      url: "https://github.com/BenoitZugmeyer/eslint-plugin-html#multiple-scripts-tags-in-a-html-file",
    },
    schema: [],
    messages: {
      parserNotUsed: `The parser of ${PACKAGE_META.name} is not used for this script, so it doesn't see the global variables of the previous scripts. Set it in \`languageOptions.parser\`, and your parser in \`parserOptions.parser\`.`,
    },
  },

  create(context) {
    const scriptContext = getScriptContext(context.filename)
    if (scriptContext == null) {
      return {}
    }

    const { file, index, script } = scriptContext
    const { languageOptions, sourceCode } = context
    // Once per file, for the first script that could use globals of previous scripts
    const shouldReportParserNotUsed =
      !file.reportedParserNotUsed &&
      !isPluginParser(languageOptions.parser) &&
      file.scripts.slice(0, index).some((previous) => !previous.module)
    if (shouldReportParserNotUsed) {
      file.reportedParserNotUsed = true
    }
    const reportParserNotUsed = (node: Program) => {
      if (shouldReportParserNotUsed) {
        context.report({ node, messageId: "parserNotUsed" })
      }
    }
    if (script.module) {
      return { Program: reportParserNotUsed }
    }

    // When another parser is configured, the next scripts are still shared
    file.parserOptions ||= {
      ...languageOptions.parserOptions,
      ecmaVersion: languageOptions.ecmaVersion,
      sourceType: languageOptions.sourceType,
      parser: languageOptions.parser,
    }

    return {
      Program(node) {
        reportParserNotUsed(node)
        collectScriptNames(
          file,
          index + 1,
          file.scripts.length,
          script,
          "through"
        ).forEach((name) => sourceCode.markVariableAsUsed(name, node))
      },
    }
  },
}
