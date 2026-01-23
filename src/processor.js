import * as espree from "espree"
import * as eslintScope from "eslint-scope"
import { extract } from "./extract.js"
import { remapMessages } from "./remapMessages.js"

export default function ({
  reportBadIndent = false,
  ignoreTagsWithoutType = false,
  javaScriptMIMETypes = [
    /^(application|text)\/(x-)?(javascript|babel|ecmascript-6)$/i,
    /^module$/i,
  ],
  indent = undefined,
  xml = false,
} = {}) {
  const preprocessResults = new Map()
  return {
    supportsAutofix: true,
    preprocess: (text, filename) => {
      const { code, badIndentationLines, hasBOM } = extract(text, xml, {
        indent: parseIndent(indent),
        ignoreTagsWithoutType,
        isJavaScriptMIMEType: parseJavaScriptMIMETypes(javaScriptMIMETypes),
      })
      preprocessResults.set(filename, { code, badIndentationLines, hasBOM })
      shareScopes(code)
      return code.map((part, index) => ({
        text: part.toString(),
        filename: `part-${index}.js`,
      }))
    },

    postprocess: (messages, filename) => {
      const { code, badIndentationLines, hasBOM } =
        preprocessResults.get(filename)
      preprocessResults.delete(filename)

      messages = messages.map((messages, fileIndex) => {
        return remapMessages(messages, hasBOM, code[fileIndex])
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

function shareScopes(parts) {
  if (parts.length <= 1) return
  const isSharedScope = false
  const scopes = parts.map((part) => {
    const ecmaVersion = "latest"
    let ast
    try {
      ast = espree.parse(part.toString(), { ecmaVersion })
    } catch (error) {
      console.log(error)
      // TODO report error
      throw new Error("TODO")
    }
    const scope = eslintScope.analyze(ast, {
      ecmaVersion,
      jsx: true, // TODO add a test?
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
    parts[i].replace(0, 0, line)
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

function parseJavaScriptMIMETypes(rawJavaScriptMIMETypes) {
  const javaScriptMIMETypes = Array.isArray(rawJavaScriptMIMETypes)
    ? rawJavaScriptMIMETypes
    : [rawJavaScriptMIMETypes]

  return function isJavaScriptMIMEType(type) {
    return javaScriptMIMETypes.some((o) =>
      typeof o === "string" ? type === o : o.test(type)
    )
  }
}
