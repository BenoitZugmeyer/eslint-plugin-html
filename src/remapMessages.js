const LINE_BREAK_CHAR_RE = /[\r\n]/
const INNER_LINE_BREAK_RE = /(\r\n|\r|\n)(?=[^\r\n])/g
const TRAILING_LINE_BREAK_RE = /(?:\r\n|\r|\n)$/

// `context`: the original `html` and its `hasBOM`, and the `script` (its `code` and removed `indent`)
export function remapMessages(messages, context) {
  const newMessages = []

  for (const message of messages) {
    if (remapMessage(message, context)) {
      newMessages.push(message)
    }
  }

  return newMessages
}

function remapMessage(message, context) {
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

  Object.assign(message, location)
  message.source = codePart.getOriginalLine(location.line)

  if (message.fix && message.fix.range) {
    message.fix = remapFix(message.fix, context)
  }

  if (message.suggestions) {
    message.suggestions = message.suggestions.map((suggestion) => ({
      ...suggestion,
      fix: remapFix(suggestion.fix, context),
    }))
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

const remapFix = (fix, { html, hasBOM, script }) => {
  const { code: codePart, indent } = script
  const [start, end] = fix.range
  const originalStart = codePart.originalIndex(start)
  // The range end is exclusive, meaning it should replace all characters with indexes from start
  // to end - 1. We have to get the original index of the last targeted character. Insertions
  // (empty ranges) keep an empty range.
  const originalEnd =
    end > start ? codePart.originalIndex(end - 1) + 1 : originalStart
  const bomOffset = hasBOM ? -1 : 0

  return {
    ...fix,
    range: [originalStart + bomOffset, originalEnd + bomOffset],
    text: indent
      ? reindent(
          fix.text,
          indent,
          TRAILING_LINE_BREAK_RE.test(fix.text) &&
            isInsideScriptLine(
              html,
              originalEnd,
              codePart.originalIndex(codePart.toString().length)
            )
        )
      : fix.text,
  }
}

// Lines added by a fix need the indentation that was removed from the script. Empty lines stay empty.
const reindent = (text, indent, isFollowedByLineContent) => {
  const reindented = text.replace(INNER_LINE_BREAK_RE, `$1${indent}`)
  return isFollowedByLineContent ? reindented + indent : reindented
}

const isInsideScriptLine = (html, index, scriptEnd) =>
  index > 0 &&
  index < scriptEnd &&
  !LINE_BREAK_CHAR_RE.test(html[index - 1]) &&
  !LINE_BREAK_CHAR_RE.test(html[index])
