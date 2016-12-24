"use strict"

const htmlparser = require("htmlparser2")

function parseIndentDescriptor(indentDescriptor) {
  const match = /^(\+)?(tab|\d+)$/.exec(indentDescriptor)

  if (!match) {
    return { relative: false, spaces: "auto" }
  }

  return {
    relative: match[1] === "+",
    spaces: match[2] === "tab" ? "\t" : Array(Number(match[2]) + 1).join(" "),
  }

}

function iterateScripts(code, options, onScript) {
  let index = 0
  let currentScript = null
  let cdataSize = 0

  const parser = new htmlparser.Parser({

    onopentag (name, attrs) {
      // Test if current tag is a valid <script> tag.
      if (name !== "script") {
        return
      }

      if (attrs.type && !/^(application|text)\/(x-)?(javascript|babel|ecmascript-6|buble)$/i.test(attrs.type)) {
        return
      }

      currentScript = ""
    },

    oncdatastart () {
      cdataSize += 12 // CDATA sections adds a 12 characters overhead (<![CDATA[]]>)
    },

    onclosetag (name) {
      if (name !== "script" || currentScript === null) {
        return
      }

      onScript(code.slice(index, parser.startIndex - currentScript.length - cdataSize), currentScript)

      index = parser.startIndex
      currentScript = null
    },

    ontext (data) {
      if (currentScript === null) {
        return
      }

      currentScript += data
    },

  }, {
    xmlMode: options.xmlMode === true,
  })

  parser.parseComplete(code)
}


function extract(code, options) {

  const indentDescriptor = parseIndentDescriptor(options && options.indent)
  const reportBadIndentation = options && options.reportBadIndent
  const xmlMode = options && options.xmlMode
  let resultCode = ""
  const map = []
  let lineNumber = 1
  const badIndentationLines = []

  iterateScripts(code, {
    xmlMode,
  }, (previousCode, scriptCode) => {

    // Mark that we're inside a <script> a tag and push all new lines
    // in between the last </script> tag and this <script> tag to preserve
    // location information.
    const newLines = previousCode.match(/\r\n|\n|\r/g)
    if (newLines) {
      resultCode += newLines.map((newLine) => {
        return `//eslint-disable-line${newLine}`
      }).join("")
      lineNumber += newLines.length
      map[lineNumber] = previousCode.match(/[^\n\r]*$/)[0].length
    }

    const currentScriptIndent = previousCode.match(/([^\n\r]*)<[^<]*$/)[1]

    let indent
    if (indentDescriptor.spaces === "auto") {
      const indentMatch = /[\n\r]+([ \t]*)/.exec(scriptCode)
      indent = indentMatch ? indentMatch[1] : ""
    }
    else {
      indent = indentDescriptor.spaces
      if (indentDescriptor.relative) {
        indent = currentScriptIndent + indent
      }
    }

    let hadNonEmptyLine = false
    resultCode += scriptCode
      .replace(/(\r\n|\n|\r)([ \t]*)(.*)/g, (_, newLineChar, lineIndent, lineText) => {
        lineNumber += 1

        const isNonEmptyLine = Boolean(lineText)
        const isFirstNonEmptyLine = isNonEmptyLine && !hadNonEmptyLine

        const badIndentation =
          // Be stricter on the first line
          isFirstNonEmptyLine ?
            indent !== lineIndent :
            lineIndent.indexOf(indent) !== 0

        if (badIndentation) {
          // Don't report line if the line is empty
          if (reportBadIndentation && isNonEmptyLine) {
            badIndentationLines.push(lineNumber)
          }
          map[lineNumber] = 0
        }
        else {
          // Dedent code
          lineIndent = lineIndent.slice(indent.length)
          map[lineNumber] = indent.length
        }

        if (isNonEmptyLine) {
          hadNonEmptyLine = true
        }

        return newLineChar + lineIndent + lineText
      })
      .replace(/[ \t]*$/, "")  // Remove spaces on the last line
  })

  return {
    map,
    code: resultCode,
    badIndentationLines,
  }
}

module.exports = extract
