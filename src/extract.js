"use strict"

const htmlparser = require("htmlparser2")
const TransformableString = require("./TransformableString")

function parseIndentDescriptor(indentDescriptor) {
  const match = /^(\+)?(tab|\d+)$/.exec(indentDescriptor)

  if (!match) {
    return { relative: false, auto: true }
  }

  return {
    relative: match[1] === "+",
    spaces: match[2] === "tab" ? "\t" : Array(Number(match[2]) + 1).join(" "),
  }

}

function iterateScripts(code, options, onChunk) {
  const xmlMode = options.xmlMode
  let index = 0
  let inScript = false
  let nextType = null
  let nextEnd = null

  function emitChunk(type, end, lastChunk) {
    // Ignore empty chunks
    if (index !== end) {
      // Keep concatenating same type chunks
      if (nextType !== null && nextType !== type) {
        onChunk({
          type: nextType,
          start: index,
          end: nextEnd,
        })
        index = nextEnd
      }

      nextType = type
      nextEnd = end

      if (lastChunk) {
        onChunk({
          type: nextType,
          start: index,
          end: nextEnd,
        })
      }
    }

  }

  const parser = new htmlparser.Parser({

    onopentag (name, attrs) {
      // Test if current tag is a valid <script> tag.
      if (name !== "script") {
        return
      }

      if (attrs.type && !/^(application|text)\/(x-)?(javascript|babel|ecmascript-6)$/i.test(attrs.type)) {
        return
      }

      inScript = true
      emitChunk("html", parser.endIndex + 1)
    },

    oncdatastart () {
      if (inScript) {
        emitChunk("cdata start", parser.startIndex + 9)
        emitChunk("script", parser.endIndex - 2)
        emitChunk("cdata end", parser.endIndex + 1)
      }
    },

    onclosetag (name) {
      if (name !== "script" || !inScript) {
        return
      }

      inScript = false

      const endSpaces = code.slice(index, parser.startIndex).match(/[ \t]*$/)[0].length
      emitChunk("script", parser.startIndex - endSpaces)
    },

    ontext () {
      if (!inScript) {
        return
      }

      emitChunk("script", parser.endIndex + 1)
    },

  }, {
    xmlMode: xmlMode === true,
  })

  parser.parseComplete(code)

  emitChunk("html", parser.endIndex + 1, true)
}

function computeIndent(descriptor, previousHTML, slice) {
  if (descriptor.auto) {
    const indentMatch = /[\n\r]+([ \t]*)/.exec(slice)
    return indentMatch ? indentMatch[1] : ""
  }

  if (descriptor.relative) {
    return previousHTML.match(/([^\n\r]*)<[^<]*$/)[1] + descriptor.spaces
  }

  return descriptor.spaces
}

function* dedent(indent, slice) {
  let hadNonEmptyLine = false
  const re = /(\r\n|\n|\r)([ \t]*)(.*)/g

  while (true) {
    const match = re.exec(slice)
    if (!match) break

    const newLine = match[1]
    const lineIndent = match[2]
    const lineText = match[3]

    const isEmptyLine = !lineText
    const isFirstNonEmptyLine = !isEmptyLine && !hadNonEmptyLine

    const badIndentation =
      // Be stricter on the first line
      isFirstNonEmptyLine ?
        indent !== lineIndent :
        lineIndent.indexOf(indent) !== 0

    if (!badIndentation) {
      yield {
        type: "dedent",
        from: match.index + newLine.length,
        to: match.index + newLine.length + indent.length,
      }
    }
    else if (isEmptyLine) {
      yield {
        type: "empty",
      }
    }
    else {
      yield {
        type: "bad-indent",
      }
    }

    if (!isEmptyLine) {
      hadNonEmptyLine = true
    }
  }
}

function extract(code, options) {
  const indentDescriptor = parseIndentDescriptor(options && options.indent)
  const xmlMode = options && options.xmlMode
  const badIndentationLines = []
  const transformedCode = new TransformableString(code)
  let lineNumber = 1
  let previousHTML = ""
  let placeholderCount = 0

  iterateScripts(code, { xmlMode }, (chunk) => {
    const slice = code.slice(chunk.start, chunk.end)

    if (chunk.type === "html" || chunk.type === "cdata start" || chunk.type === "cdata end") {
      transformedCode.replace(chunk.start, chunk.end, `/* HTML BLOCK ${placeholderCount} */`)
      placeholderCount += 1
      const newLines = slice.match(/\r\n|\n|\r/g)
      lineNumber += newLines ? newLines.length : 0
      if (chunk.type === "html") previousHTML = slice
    }
    else if (chunk.type === "script") {
      for (const action of dedent(computeIndent(indentDescriptor, previousHTML, slice), slice)) {
        lineNumber += 1
        if (action.type === "dedent") {
          transformedCode.replace(chunk.start + action.from, chunk.start + action.to, "")
        } else if (action.type === "bad-indent") {
          badIndentationLines.push(lineNumber)
        }
      }
    }
  })

  return {
    code: transformedCode,
    badIndentationLines,
  }
}

module.exports = extract
