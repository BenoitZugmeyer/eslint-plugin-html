import { Parser } from "htmlparser2"
import TransformableString from "./transformableString.js"

const NO_IGNORE = 0
const IGNORE_NEXT = 1
const IGNORE_UNTIL_ENABLE = 2

export function extract(html, xmlMode, options) {
  const badIndentationLines = []
  const scripts = []
  let lineNumber = 1
  let previousHTML = ""

  const chunks = parseHtml(html, xmlMode, options)

  for (const chunk of chunks) {
    const slice = html.slice(chunk.start, chunk.end)
    if (chunk.type === "html") {
      const match = slice.match(/\r\n|\n|\r/g)
      if (match) lineNumber += match.length
      previousHTML = slice
    } else if (chunk.type === "script") {
      const transformedCode = new TransformableString(html)
      let indentSlice = slice
      for (const cdata of chunk.cdata) {
        transformedCode.replace(cdata.start, cdata.end, "")
        if (cdata.end === chunk.end) {
          indentSlice = html.slice(chunk.start, cdata.start)
        }
      }
      transformedCode.replace(0, chunk.start, "")
      transformedCode.replace(chunk.end, html.length, "")
      for (const action of dedent(
        computeIndent(options.indent, previousHTML, indentSlice),
        indentSlice
      )) {
        lineNumber += 1
        if (action.type === "dedent") {
          transformedCode.replace(
            chunk.start + action.from,
            chunk.start + action.to,
            ""
          )
        } else if (action.type === "bad-indent") {
          badIndentationLines.push(lineNumber)
        }
      }
      scripts.push({
        code: transformedCode,
        module: chunk.module,
      })
    }
  }

  return {
    scripts,
    badIndentationLines,
    hasBOM: html.startsWith("\uFEFF"),
  }
}

function parseHtml(html, xmlMode, options) {
  if (!html) return []

  const chunks = [
    {
      type: "html",
      start: 0,
      ignore: NO_IGNORE,
      end: undefined,
    },
  ]

  const parser = new Parser(
    {
      onopentag(tagName, attributes) {
        const currentChunk = chunks.at(-1)
        if (currentChunk.type !== "html") return

        const node = { tagName, attributes }
        const matchingRule = options.rules.find((rule) => rule.match(node))

        if (!matchingRule) {
          return
        }

        if (currentChunk.ignore === IGNORE_NEXT) {
          currentChunk.ignore = NO_IGNORE
          return
        }

        if (currentChunk.ignore === IGNORE_UNTIL_ENABLE) {
          return
        }

        currentChunk.end = parser.endIndex + 1
        chunks.push({
          type: "script",
          start: parser.endIndex + 1,
          end: undefined,
          module: matchingRule.module,
          tagName,
          cdata: [],
        })
      },

      oncdatastart() {
        const currentChunk = chunks.at(-1)
        if (currentChunk.type === "script") {
          currentChunk.cdata.push(
            {
              start: parser.startIndex,
              end: parser.startIndex + 9,
            },
            {
              start: parser.endIndex - 2,
              end: parser.endIndex + 1,
            }
          )
        }
      },

      onclosetag(name) {
        const currentChunk = chunks.at(-1)
        if (currentChunk.type !== "script") return
        if (currentChunk.tagName !== name) return

        // With Self-Closing tags in XML mode, the parser doesn't move its index after the previous
        // chunk emited. Just ignore those script.
        if (parser.startIndex < currentChunk.start) {
          chunks.pop()
          return
        }

        currentChunk.end = parser.startIndex
        chunks.push({
          type: "html",
          start: parser.startIndex,
          ignore: NO_IGNORE,
          end: undefined,
        })
      },

      oncomment(comment) {
        const currentChunk = chunks.at(-1)
        comment = comment.trim()
        if (comment === "eslint-disable") {
          currentChunk.ignore = IGNORE_UNTIL_ENABLE
        } else if (comment === "eslint-enable") {
          currentChunk.ignore = NO_IGNORE
        } else if (comment === "eslint-disable-next-script") {
          currentChunk.ignore = IGNORE_NEXT
        }
      },

      onend() {
        chunks.at(-1).end = parser.endIndex + 1
      },
    },
    {
      xmlMode: xmlMode === true,
    }
  )

  parser.parseComplete(html)

  return chunks
}

function computeIndent(descriptor, previousHTML, slice) {
  if (!descriptor) {
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
  let lastIndex = 0

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
      isFirstNonEmptyLine
        ? indent !== lineIndent
        : lineIndent.indexOf(indent) !== 0

    if (!badIndentation) {
      lastIndex = match.index + newLine.length + indent.length
      // Remove the first line if it is empty
      const fromIndex = match.index === 0 ? 0 : match.index + newLine.length
      yield {
        type: "dedent",
        from: fromIndex,
        to: lastIndex,
      }
    } else if (isEmptyLine) {
      yield {
        type: "empty",
      }
    } else {
      yield {
        type: "bad-indent",
      }
    }

    if (!isEmptyLine) {
      hadNonEmptyLine = true
    }
  }

  const endSpaces = slice.slice(lastIndex).match(/[ \t]*$/)[0].length
  if (endSpaces) {
    yield {
      type: "dedent",
      from: slice.length - endSpaces,
      to: slice.length,
    }
  }
}
