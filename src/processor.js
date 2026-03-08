import * as espree from "espree"
import * as eslintScope from "eslint-scope"
import { extract } from "./extract.js"
import { remapMessages } from "./remapMessages.js"
import { parseCssSelector } from "./cssSelector.js"

export default function ({
  reportBadIndent = false,
  rules = [
    {
      match: 'script[type="text/javascript"], script:not([type])',
      module: false,
    },
    {
      match: 'script[type="module"]',
      module: true,
    },
  ],
  indent = undefined,
  xml = false,
} = {}) {
  const preprocessResults = new Map()
  const parsedRules = rules.map((rule) => ({
    ...rule,
    match: parseCssSelector(rule.match).match,
  }))
  return {
    supportsAutofix: true,
    preprocess: (text, filename) => {
      const { scripts, badIndentationLines, hasBOM } = extract(text, xml, {
        indent: parseIndent(indent),
        rules: parsedRules,
      })
      preprocessResults.set(filename, { scripts, badIndentationLines, hasBOM })
      shareScopes(scripts)
      return scripts.map((script, index) => ({
        text: script.code.toString(),
        filename: `part-${index}.js`,
      }))
    },

    postprocess: (messages, filename) => {
      const { scripts, badIndentationLines, hasBOM } =
        preprocessResults.get(filename)
      preprocessResults.delete(filename)

      messages = messages.map((messages, fileIndex) => {
        return remapMessages(messages, hasBOM, scripts[fileIndex].code)
      })

      if (reportBadIndent) {
        messages.push(
          ...badIndentationLines.map((line) => ({
            message: "Bad line indentation.",
            line,
            column: 1,
            ruleId: "(html plugin)",
            severity: "error",
          }))
        )
      }

      return messages.flat()
    },
  }
}

function shareScopes(scripts) {
  if (scripts.length <= 1) return
  const isSharedScope = true
  const scopes = scripts.map((script) => {
    const ecmaVersion = "latest"
    const sourceType = script.module ? "module" : "script"
    let ast
    try {
      ast = espree.parse(script.code.toString(), { ecmaVersion, sourceType })
    } catch (error) {
      // TODO report error
      throw new Error("TODO", { cause: error })
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
