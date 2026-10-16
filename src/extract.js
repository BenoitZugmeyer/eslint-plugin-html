import { Parser } from "htmlparser2"
import TransformableString, {
  indexToLocation,
  lineStarts,
} from "./transformableString.js"

const NO_IGNORE = 0
const IGNORE_NEXT = 1
const IGNORE_UNTIL_ENABLE = 2

const BLANK_LINE_START_RE = /^[ \t]*(?:\r\n|\n|\r)/
const INDENTATION_OR_EMPTY_RE = /^[ \t]*$/

const DIRECTIVE_COMMENTS = new Map([
  ["eslint-disable", IGNORE_UNTIL_ENABLE],
  ["eslint-enable", NO_IGNORE],
  ["eslint-disable-next-script", IGNORE_NEXT],
])

export function extract(html, xmlMode, options) {
  const badIndentationLines = []
  const scripts = []
  let previousHTML = ""
  let htmlLineStarts

  const { chunks, directiveComments } = parseHtml(html, xmlMode, options)

  for (const chunk of chunks) {
    const slice = html.slice(chunk.start, chunk.end)
    if (chunk.type === "html") {
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
      const indent = computeIndent(options.indent, previousHTML, indentSlice)
      const blankTagLineStart = getBlankTagLineStart(indentSlice, chunk)
      let baseLineStart
      for (const action of dedent(indent, indentSlice, blankTagLineStart)) {
        if (action.from !== undefined) {
          transformedCode.replace(
            chunk.start + action.from,
            chunk.start + action.to,
            ""
          )
        }
        if (action.type === "dedent") {
          if (blankTagLineStart === undefined && action.isFirstNonEmptyLine) {
            baseLineStart = chunk.start + action.to
          }
        } else if (action.type === "bad-indent") {
          htmlLineStarts ||= lineStarts(html)
          badIndentationLines.push(
            indexToLocation(chunk.start + action.index, htmlLineStarts).line
          )
        }
      }
      scripts.push({
        code: transformedCode,
        module: chunk.module,
        indent,
        // Where the line that gives its indentation to the script starts, when the code starts on
        // the tag line
        baseLineStart,
      })
    }
  }

  return {
    scripts,
    badIndentationLines,
    directiveComments,
    hasBOM: html.startsWith("\uFEFF"),
  }
}

function parseHtml(html, xmlMode, options) {
  // Ranges of the HTML comments this plugin reacts to
  const directiveComments = []
  if (!html) return { chunks: [], directiveComments }

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
        const ignore = DIRECTIVE_COMMENTS.get(comment.trim())
        if (ignore === undefined) return

        chunks.at(-1).ignore = ignore
        directiveComments.push({
          start: parser.startIndex,
          end: parser.endIndex + 1,
        })
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

  return { chunks, directiveComments }
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

/**
 * Where the content of the tag line starts (after a CDATA start in XML) when it is blank, so it can be
 * left out of the script
 */
function getBlankTagLineStart(slice, chunk) {
  const cdataStart = chunk.cdata.find((cdata) =>
    INDENTATION_OR_EMPTY_RE.test(slice.slice(0, cdata.start - chunk.start))
  )
  const start = cdataStart ? cdataStart.end - chunk.start : 0
  return BLANK_LINE_START_RE.test(slice.slice(start)) ? start : undefined
}

function* dedent(indent, slice, blankTagLineStart) {
  let hadNonEmptyLine = false
  const re = /(\r\n|\n|\r)([ \t]*)(.*)/g
  let lastIndex = 0
  let isTagLineBlank = blankTagLineStart !== undefined

  while (true) {
    const match = re.exec(slice)
    if (!match) break

    // The tag line is not part of the script when it's blank
    const tagLine = isTagLineBlank
      ? { from: blankTagLineStart, to: match.index + match[1].length }
      : {}
    isTagLineBlank = false

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
      yield {
        type: "dedent",
        from: tagLine.from ?? match.index + newLine.length,
        to: lastIndex,
        isFirstNonEmptyLine,
      }
    } else if (isEmptyLine) {
      yield {
        type: "empty",
        ...tagLine,
      }
    } else {
      yield {
        type: "bad-indent",
        index: match.index + newLine.length,
        ...tagLine,
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
