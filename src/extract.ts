import { Parser } from "htmlparser2"
import type { TagNode } from "./cssSelector.ts"
import TransformableString, {
  indexToLocation,
  lineStarts,
} from "./transformableString.ts"

const NO_IGNORE = 0
const IGNORE_NEXT = 1
const IGNORE_UNTIL_ENABLE = 2

type IgnoreState =
  typeof NO_IGNORE | typeof IGNORE_NEXT | typeof IGNORE_UNTIL_ENABLE

const BLANK_LINE_START_RE = /^[ \t]*(?:\r\n|\n|\r)/
const INDENTATION_OR_EMPTY_RE = /^[ \t]*$/
const TRAILING_SPACES_RE = /[ \t]*$/

const DIRECTIVE_COMMENTS: ReadonlyMap<string, IgnoreState> = new Map([
  ["eslint-disable", IGNORE_UNTIL_ENABLE],
  ["eslint-enable", NO_IGNORE],
  ["eslint-disable-next-script", IGNORE_NEXT],
])

export interface IndentDescriptor {
  relative?: boolean
  spaces: string
}

export interface ExtractOptions {
  indent?: IndentDescriptor | null
  rules: ReadonlyArray<{
    match: (node: TagNode) => unknown
    module?: boolean
  }>
}

export interface ExtractedScript {
  code: TransformableString
  module: boolean
  // The indentation removed from the lines of the script
  indent: string
  // Where the line that gives its indentation to the script starts, when the code starts on the
  // tag line
  baseLineStart: number | undefined
}

interface Range {
  start: number
  end: number
}

interface HtmlChunk {
  type: "html"
  start: number
  end: number | undefined
  ignore: IgnoreState
}

interface ScriptChunk {
  type: "script"
  start: number
  end: number | undefined
  module: boolean
  tagName: string
  cdata: Range[]
}

type Chunk = HtmlChunk | ScriptChunk

interface RemovedRange {
  from: number
  to: number
}

type DedentAction =
  | { type: "dedent"; range: RemovedRange; isFirstNonEmptyLine: boolean }
  | { type: "empty"; range: RemovedRange | undefined }
  | { type: "bad-indent"; range: RemovedRange | undefined; index: number }

export function extract(
  html: string,
  xmlMode: boolean,
  options: ExtractOptions
) {
  const badIndentationLines: number[] = []
  const scripts: ExtractedScript[] = []
  let previousHTML = ""
  let htmlLineStarts: number[] | undefined

  const { chunks, directiveComments } = parseHtml(html, xmlMode, options)

  for (const chunk of chunks) {
    // Every chunk has an end once the parsing is complete
    const { start, end = html.length } = chunk
    const slice = html.slice(start, end)
    if (chunk.type === "html") {
      previousHTML = slice
    } else if (chunk.type === "script") {
      const transformedCode = new TransformableString(html)
      let indentSlice = slice
      for (const cdata of chunk.cdata) {
        transformedCode.replace(cdata.start, cdata.end, "")
        if (cdata.end === end) {
          indentSlice = html.slice(start, cdata.start)
        }
      }
      transformedCode.replace(0, start, "")
      transformedCode.replace(end, html.length, "")
      const indent = computeIndent(options.indent, previousHTML, indentSlice)
      const blankTagLineStart = getBlankTagLineStart(indentSlice, chunk)
      let baseLineStart: number | undefined
      for (const action of dedent(indent, indentSlice, blankTagLineStart)) {
        if (action.range) {
          transformedCode.replace(
            start + action.range.from,
            start + action.range.to,
            ""
          )
        }
        if (action.type === "dedent") {
          if (blankTagLineStart === undefined && action.isFirstNonEmptyLine) {
            baseLineStart = start + action.range.to
          }
        } else if (action.type === "bad-indent") {
          htmlLineStarts ||= lineStarts(html)
          badIndentationLines.push(
            indexToLocation(start + action.index, htmlLineStarts).line
          )
        }
      }
      scripts.push({
        code: transformedCode,
        module: chunk.module,
        indent,
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

function parseHtml(html: string, xmlMode: boolean, options: ExtractOptions) {
  // Ranges of the HTML comments this plugin reacts to
  const directiveComments: Range[] = []
  if (!html) return { chunks: [], directiveComments }

  const chunks: Chunk[] = [
    {
      type: "html",
      start: 0,
      ignore: NO_IGNORE,
      end: undefined,
    },
  ]
  const currentChunk = () => chunks[chunks.length - 1]

  const parser = new Parser(
    {
      onopentag(tagName, attributes) {
        const chunk = currentChunk()
        if (chunk.type !== "html") return

        const node = { tagName, attributes }
        const matchingRule = options.rules.find((rule) => rule.match(node))

        if (!matchingRule) {
          return
        }

        if (chunk.ignore === IGNORE_NEXT) {
          chunk.ignore = NO_IGNORE
          return
        }

        if (chunk.ignore === IGNORE_UNTIL_ENABLE) {
          return
        }

        chunk.end = parser.endIndex + 1
        chunks.push({
          type: "script",
          start: parser.endIndex + 1,
          end: undefined,
          module: matchingRule.module === true,
          tagName,
          cdata: [],
        })
      },

      oncdatastart() {
        const chunk = currentChunk()
        if (chunk.type === "script") {
          chunk.cdata.push(
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
        const chunk = currentChunk()
        if (chunk.type !== "script") return
        if (chunk.tagName !== name) return

        // With Self-Closing tags in XML mode, the parser doesn't move its index after the previous
        // chunk emited. Just ignore those script.
        if (parser.startIndex < chunk.start) {
          chunks.pop()
          return
        }

        chunk.end = parser.startIndex
        chunks.push({
          type: "html",
          start: parser.startIndex,
          ignore: NO_IGNORE,
          end: undefined,
        })
      },

      oncomment(comment) {
        const chunk = currentChunk()
        const ignore = DIRECTIVE_COMMENTS.get(comment.trim())
        if (chunk.type !== "html" || ignore === undefined) return

        chunk.ignore = ignore
        directiveComments.push({
          start: parser.startIndex,
          end: parser.endIndex + 1,
        })
      },

      onend() {
        currentChunk().end = parser.endIndex + 1
      },
    },
    {
      xmlMode: xmlMode === true,
    }
  )

  parser.parseComplete(html)

  return { chunks, directiveComments }
}

function computeIndent(
  descriptor: IndentDescriptor | null | undefined,
  previousHTML: string,
  slice: string
) {
  if (!descriptor) {
    const indentMatch = /[\n\r]+([ \t]*)/.exec(slice)
    return indentMatch ? indentMatch[1] : ""
  }

  if (descriptor.relative) {
    // The previous HTML ends with the opening tag of the script
    return (
      (/([^\n\r]*)<[^<]*$/.exec(previousHTML)?.[1] || "") + descriptor.spaces
    )
  }

  return descriptor.spaces
}

/**
 * Where the content of the tag line starts (after a CDATA start in XML) when it is blank, so it can be
 * left out of the script
 */
function getBlankTagLineStart(slice: string, chunk: ScriptChunk) {
  const cdataStart = chunk.cdata.find((cdata) =>
    INDENTATION_OR_EMPTY_RE.test(slice.slice(0, cdata.start - chunk.start))
  )
  const start = cdataStart ? cdataStart.end - chunk.start : 0
  return BLANK_LINE_START_RE.test(slice.slice(start)) ? start : undefined
}

function* dedent(
  indent: string,
  slice: string,
  blankTagLineStart: number | undefined
): Generator<DedentAction> {
  let hadNonEmptyLine = false
  const re = /(\r\n|\n|\r)([ \t]*)(.*)/g
  let lastIndex = 0
  let isFirstLine = true

  while (true) {
    const match = re.exec(slice)
    if (!match) break

    // The tag line is not part of the script when it's blank
    const tagLine =
      isFirstLine && blankTagLineStart !== undefined
        ? { from: blankTagLineStart, to: match.index + match[1].length }
        : undefined
    isFirstLine = false

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
        range: {
          from: tagLine ? tagLine.from : match.index + newLine.length,
          to: lastIndex,
        },
        isFirstNonEmptyLine,
      }
    } else if (isEmptyLine) {
      yield {
        type: "empty",
        range: tagLine,
      }
    } else {
      yield {
        type: "bad-indent",
        range: tagLine,
        index: match.index + newLine.length,
      }
    }

    if (!isEmptyLine) {
      hadNonEmptyLine = true
    }
  }

  const tail = slice.slice(lastIndex)
  const endSpaces = tail.length - tail.search(TRAILING_SPACES_RE)
  if (endSpaces) {
    yield {
      type: "dedent",
      range: {
        from: slice.length - endSpaces,
        to: slice.length,
      },
      isFirstNonEmptyLine: false,
    }
  }
}
