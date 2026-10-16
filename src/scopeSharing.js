import path from "node:path"
import { ConfigCommentParser } from "@eslint/plugin-kit"
import * as eslintScope from "eslint-scope"
import * as espree from "espree"
import * as evk from "eslint-visitor-keys"
import { PACKAGE_META } from "./packageMeta.js"

// Scripts of the files being linted, keyed by the filename given to `preprocess`, which is also the
// dirname of the virtual filename of each script
const fileScripts = new Map()

const SCRIPT_FILENAME_RE = /(?:^|_)part-(\d+)\.m?js$/
const BLOCK_FILENAME_RE = /(\d+)_part-(\d+)\.m?js$/
const EMPTY_GLOBALS = Object.freeze({ declared: [], through: [] })
const commentParser = new ConfigCommentParser()

export const setFileScripts = (filename, scripts) => {
  fileScripts.set(filename, {
    scripts: scripts.map((script) => ({
      ...script,
      globals: undefined,
      parse: undefined,
    })),
    parserOptions: undefined,
    reportedParser: false,
  })
}

export const deleteFileScripts = (filename) => {
  fileScripts.delete(filename)
}

export const getScriptFilename = (index, module) =>
  `part-${index}.${module ? "mjs" : "js"}`

const getScriptContext = (virtualFilename) => {
  if (!virtualFilename) {
    return
  }

  const file = fileScripts.get(path.dirname(virtualFilename))
  const match = SCRIPT_FILENAME_RE.exec(path.basename(virtualFilename))
  const index = match && Number(match[1])
  const script = file && match && file.scripts[index]
  return script && { file, index, script }
}

// Virtual filename of another script of the same file, built from the current one
const getSiblingFilePath = (filePath, index, module) =>
  filePath &&
  filePath.replace(
    BLOCK_FILENAME_RE,
    (_, blockIndex, scriptIndex) =>
      `${Number(blockIndex) - Number(scriptIndex) + index}_${getScriptFilename(index, module)}`
  )

// Mirrors what ESLint does for parsers that don't return a scope manager
const analyzeScope = (ast, parserOptions, visitorKeys) => {
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
    fallback: evk.getKeys,
    jsx: ecmaFeatures.jsx,
  })
}

// ESLint does the same when espree is the configured parser
const normalizeEspreeOptions = (parserOptions) =>
  parserOptions.sourceType === "module" &&
  parserOptions.ecmaFeatures &&
  parserOptions.ecmaFeatures.globalReturn
    ? {
        ...parserOptions,
        ecmaFeatures: { ...parserOptions.ecmaFeatures, globalReturn: false },
      }
    : parserOptions

const parseWithInnerParser = (code, { parser, ...options }) => {
  const parserOptions = parser ? options : normalizeEspreeOptions(options)
  const innerParser = parser || espree
  const result =
    typeof innerParser.parseForESLint === "function"
      ? innerParser.parseForESLint(code, parserOptions)
      : { ast: innerParser.parse(code, parserOptions) }

  return {
    ...result,
    scopeManager:
      result.scopeManager ||
      analyzeScope(result.ast, parserOptions, result.visitorKeys),
  }
}

const getInlineGlobalNames = (ast) =>
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
const getTopLevelScope = ({ globalScope }, ast) => {
  const [firstChildScope] = globalScope.childScopes
  return firstChildScope && firstChildScope.block === ast
    ? firstChildScope
    : globalScope
}

// Must run before any global is added to the scope manager
const collectGlobals = ({ ast, scopeManager }, module) => ({
  declared: module
    ? []
    : [
        ...getTopLevelScope(scopeManager, ast).variables.map(
          (variable) => variable.name
        ),
        ...getInlineGlobalNames(ast),
      ],
  through: scopeManager.globalScope.through.map(
    (reference) => reference.identifier.name
  ),
})

const haveSameOptions = (first, second) =>
  [...new Set([...Object.keys(first), ...Object.keys(second)])].every(
    (key) => key === "filePath" || first[key] === second[key]
  )

/**
 * Parses another script of the same file with the options ESLint gave for the current one, so the
 * parse can be reused when ESLint gets to it
 */
const getScriptGlobals = (file, index, currentScript) => {
  const script = file.scripts[index]
  if (script.globals) {
    return script.globals
  }

  const { parserOptions } = file
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

// Reuses (once) a parse made ahead of time with the same options
const takeEarlyParse = (script, code, options) => {
  const { parse } = script
  script.parse = undefined
  return parse &&
    script.code === code &&
    haveSameOptions(parse.options, options)
    ? parse.result
    : undefined
}

/**
 * Wraps the real parser (`parserOptions.parser`, espree by default). For each script of an HTML file,
 * it declares the global variables coming from the previous classic scripts in the scope manager it
 * returns.
 */
export const parser = {
  meta: { name: `${PACKAGE_META.name}/parser`, version: PACKAGE_META.version },

  parseForESLint(code, options) {
    const context = getScriptContext(options.filePath)
    if (context == null) {
      return parseWithInnerParser(code, options)
    }

    const { file, index, script } = context
    file.parserOptions = options

    const result =
      takeEarlyParse(script, code, options) ||
      parseWithInnerParser(code, options)
    script.globals = collectGlobals(result, script.module)

    const declaredBefore = new Set(
      file.scripts
        .slice(0, index)
        .flatMap(
          (_, previousIndex) =>
            getScriptGlobals(file, previousIndex, script).declared
        )
    )
    const names = [...new Set(script.globals.through)].filter((name) =>
      declaredBefore.has(name)
    )
    if (names.length > 0) {
      result.scopeManager.addGlobals(names)
    }

    return result
  },
}

// By name, in case the plugin is loaded more than once
const isPluginParser = (configuredParser) =>
  configuredParser != null &&
  configuredParser.meta != null &&
  configuredParser.meta.name === parser.meta.name

export const scopeSharingRule = {
  meta: {
    type: "problem",
    docs: {
      description:
        "Mark the global variables of a classic script as used when the next scripts of the same HTML file use them",
      url: "https://github.com/BenoitZugmeyer/eslint-plugin-html#multiple-scripts-tags-in-a-html-file",
    },
    schema: [],
    messages: {
      parserNotUsed:
        "The parser of eslint-plugin-html is not used for this script, so it doesn't see the global variables of the previous scripts. Set it in `languageOptions.parser`, and your parser in `parserOptions.parser`.",
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
    const reportsParserNotUsed =
      !file.reportedParser &&
      !isPluginParser(languageOptions.parser) &&
      file.scripts.slice(0, index).some((previous) => !previous.module)
    if (reportsParserNotUsed) {
      file.reportedParser = true
    }
    const reportParserNotUsed = (node) => {
      if (reportsParserNotUsed) {
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
        new Set(
          file.scripts
            .slice(index + 1)
            .flatMap(
              (_, offset) =>
                getScriptGlobals(file, index + 1 + offset, script).through
            )
        ).forEach((name) => sourceCode.markVariableAsUsed(name, node))
      },
    }
  },
}
