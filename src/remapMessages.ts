import type { Linter } from "eslint"
import type { ExtractedScript } from "./extract.ts"
import type TransformableString from "./transformableString.ts"

type Fix = NonNullable<Linter.LintMessage["fix"]>

// Only CR and LF, like when scripts are dedented: U+2028 and U+2029 can be in strings
const LINE_BREAK_CHAR_RE = /[\r\n]/
const INNER_LINE_BREAK_RE = /(\r\n|\r|\n)(?=[^\r\n])/g
const TRAILING_LINE_BREAK_RE = /(?:\r\n|\r|\n)$/
const INDENTATION_RE = /^[ \t]+$/
const INDENTATION_OR_EMPTY_RE = /^[ \t]*$/

interface RemapContext {
  // The original text, which the script was extracted from
  html: string
  hasBOM: boolean
  script: ExtractedScript
}

export function remapMessages(
  messages: Linter.LintMessage[],
  context: RemapContext
): Linter.LintMessage[] {
  const newMessages = []

  for (const message of messages) {
    if (remapMessage(message, context)) {
      newMessages.push(message)
    }
  }

  return newMessages
}

function remapMessage(message: Linter.LintMessage, context: RemapContext) {
  const codePart = context.script.code

  if (!message.line || !message.column) {
    // Some messages apply to the whole file instead of a particular code location. In particular:
    // * @typescript-eslint/parser may send messages with no line/column
    // * eslint-plugin-eslint-comments send messages with column=0 to bypass ESLint ignore comments.
    //   See https://github.com/BenoitZugmeyer/eslint-plugin-html/issues/70
    // For now, just include them in the output. In the future, we should make sure those messages
    // are not print twice.
    return true
  }

  const location = codePart.originalLocation({
    line: message.line,
    column: message.column,
  })

  // Ignore messages if they were in transformed code
  if (!location) {
    return false
  }

  // `source` is not set by ESLint anymore, but some formatters may still use it
  Object.assign(message, location, {
    source: codePart.getOriginalLine(location.line),
  })

  if (message.fix && message.fix.range) {
    const fix = remapFix(message.fix, context)
    if (fix) {
      message.fix = fix
    } else {
      delete message.fix
    }
  }

  if (message.suggestions) {
    message.suggestions = message.suggestions.flatMap((suggestion) => {
      const fix = remapFix(suggestion.fix, context)
      return fix ? [{ ...suggestion, fix }] : []
    })
  }

  // Map end location
  if (message.endLine && message.endColumn) {
    const endLocation = codePart.originalLocation({
      line: message.endLine,
      column: message.endColumn,
    })
    if (endLocation) {
      message.endLine = endLocation.line
      message.endColumn = endLocation.column
    }
  }

  return true
}

const remapFix = (
  fix: Fix,
  { html, hasBOM, script }: RemapContext
): Fix | undefined => {
  const { code: codePart, indent } = script
  const [start, end] = fix.range
  const originalStart = codePart.originalIndex(start)
  // Indenting the base line of a script starting on its tag line would only move the base
  // indentation, so the fix would apply again and again
  if (
    originalStart == null ||
    (start === end &&
      originalStart === script.baseLineStart &&
      INDENTATION_RE.test(fix.text))
  ) {
    return
  }

  const virtualText = codePart.toString()
  // Whether the text after the range continues the line of the replacement, or starts a line
  const joinsLines = fix.text
    ? !TRAILING_LINE_BREAK_RE.test(fix.text)
    : start > 0 && !LINE_BREAK_CHAR_RE.test(virtualText[start - 1])
  const originalEnd =
    end > start ? remapRangeEnd(end, codePart, html, joinsLines) : originalStart
  const scriptEnd = codePart.originalIndex(virtualText.length)
  // Only inserted text, which this plugin never adds, has no original index
  if (originalEnd == null || scriptEnd == null) {
    return
  }

  const bomOffset = hasBOM ? -1 : 0
  return {
    ...fix,
    range: [originalStart + bomOffset, originalEnd + bomOffset],
    text: indent
      ? reindent(
          fix.text,
          indent,
          TRAILING_LINE_BREAK_RE.test(fix.text) &&
            isInsideScriptLine(html, originalEnd, scriptEnd)
        )
      : fix.text,
  }
}

/**
 * The range end is exclusive, so it's mapped from the last targeted character. When the next
 * character starts a line that lost its indentation and the fix joins it to the previous line, the
 * indentation is replaced too, so that it doesn't stay in the middle of the line
 */
const remapRangeEnd = (
  end: number,
  codePart: TransformableString,
  html: string,
  joinsLines: boolean
) => {
  const lastCharacter = codePart.originalIndex(end - 1)
  if (lastCharacter == null) {
    return
  }

  const afterLastCharacter = lastCharacter + 1
  if (!joinsLines || end >= codePart.toString().length) {
    return afterLastCharacter
  }

  const nextCharacter = codePart.originalIndex(end)
  return nextCharacter != null &&
    INDENTATION_OR_EMPTY_RE.test(html.slice(afterLastCharacter, nextCharacter))
    ? nextCharacter
    : afterLastCharacter
}

// Lines added by a fix need the indentation that was removed from the script. Empty lines stay
// empty
const reindent = (
  text: string,
  indent: string,
  isFollowedByLineContent: boolean
) => {
  const reindented = text.replace(INNER_LINE_BREAK_RE, `$1${indent}`)
  return isFollowedByLineContent ? reindented + indent : reindented
}

const isInsideScriptLine = (html: string, index: number, scriptEnd: number) =>
  index > 0 &&
  index < scriptEnd &&
  !LINE_BREAK_CHAR_RE.test(html[index - 1]) &&
  !LINE_BREAK_CHAR_RE.test(html[index])
