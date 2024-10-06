import * as espree from "espree"
import * as eslintScope from "eslint-scope"
import { extract } from "./extract.js"
import { remapMessages } from "./remapMessages.js"
import { parseCssSelector } from "./cssSelector.js"

export function createHtmlProcessor({
  reportBadIndent = false,
  rules = [
    {
      match: 'script[type="text/javascript" i], script:not([type])',
      type: "classic",
    },
    {
      match: 'script[type="module" i]',
      type: "module",
    },
  ],
  indent = undefined,
  xml = false,
  lintHtml = false,
} = {}) {
  const preprocessResults = new Map()
  return {
    supportsAutofix: true,
    preprocess: (text, filename) => {
      const { scripts, badIndentationLines, hasBOM } = extract(text, xml, {
        indent: parseIndent(indent),
        getScriptType: prepareGetScriptType(rules),
      })
      preprocessResults.set(filename, { scripts, badIndentationLines, hasBOM })
      shareScopes(scripts)

      const codeBlocks = scripts.map((script, index) => ({
        text: script.code.toString(),
        filename: `part-${index}.js`,
      }))
      if (lintHtml) {
        codeBlocks.push({ text, filename })
      }
      return codeBlocks
    },

    postprocess: (messagesByCodeBlock, filename) => {
      const { scripts, badIndentationLines, hasBOM } =
        preprocessResults.get(filename)
      preprocessResults.delete(filename)

      messagesByCodeBlock = messagesByCodeBlock.map((messages, fileIndex) => {
        if (lintHtml && fileIndex === messagesByCodeBlock.length - 1) {
          return messages
        }
        return remapMessages(messages, hasBOM, scripts[fileIndex].code)
      })

      if (reportBadIndent) {
        messagesByCodeBlock.push(
          ...badIndentationLines.map((line) => ({
            message: "Bad line indentation.",
            line,
            column: 1,
            ruleId: "(html plugin)",
            severity: "error",
          }))
        )
      }

      return messagesByCodeBlock
        .flat()
        .sort((a, b) => a.line - b.line || a.column - b.column)
    },
  }
}

function prepareGetScriptType(rules) {
  const parsedRules = rules.map((rule) => ({
    type: rule.type,
    selector: parseCssSelector(rule.match),
  }))
  return (node) => {
    for (const { type, selector } of parsedRules) {
      if (selector.match(node)) return type ?? "classic"
    }
  }
}

function shareScopes(scripts) {
  if (scripts.length <= 1) return
  const isSharedScope = true
  const scopes = scripts.map((script, index) => {
    const ecmaVersion = "latest"
    const sourceType = script.module ? "module" : "script"
    let ast
    try {
      ast = espree.parse(script.code.toString(), { ecmaVersion, sourceType })
    } catch (error) {
      const { line, column } = script.code.originalLocation({
        line: error.lineNumber,
        column: error.column,
      })
      const wrappedError = new Error(
        `Failed to parse script (${index + 1}): ${error}`
      )
      wrappedError.lineNumber = line
      wrappedError.column = column
      throw wrappedError
    }
    const scope = eslintScope.analyze(ast, {
      ecmaVersion: 2026,
      jsx: true, // TODO add a test?
      sourceType,
    })
    return {
      declaredGlobals: isSharedScope
        ? new Set(scope.globalScope.variables.map((v) => v.name))
        : new Set(),
      referencedGlobals: new Set(
        scope.globalScope.through.map((ref) => ref.identifier.name)
      ),
    }
  })

  for (let i = 0; i < scopes.length; i += 1) {
    const global = intersection(
      scopes[i].referencedGlobals,
      mergeSets(
        scopes.slice(0, i).map(({ declaredGlobals }) => declaredGlobals)
      )
    )
    const exported = intersection(
      scopes[i].declaredGlobals,
      mergeSets(
        scopes.slice(i + 1).map(({ referencedGlobals }) => referencedGlobals)
      )
    )
    let line = ""
    if (global.size) line += `/* global ${Array.from(global).join(", ")} */`
    if (exported.size)
      line += `/* exported ${Array.from(exported).join(", ")} */`
    line += "\n"
    scripts[i].code.replace(0, 0, line)
  }
}

function mergeSets(sets) {
  const result = new Set()
  for (const set of sets) {
    for (const item of set) result.add(item)
  }

  return result
}

function intersection(a, b) {
  const result = new Set()
  for (const item of a) {
    if (b.has(item)) result.add(item)
  }
  return result
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
