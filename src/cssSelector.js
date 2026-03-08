import { createParser } from "css-selector-parser"

export function parseCssSelector(selector) {
  const parse = createParser({
    syntax: {
      tag: true,
      ids: true,
      classNames: true,
      attributes: {
        operators: ["=", "~=", "|=", "^=", "$=", "*="],
      },
      pseudoClasses: {
        definitions: { Selector: ["not"] },
      },
    },
  })

  const astSelector = parse(selector)
  return {
    match(node) {
      return matchSelector(astSelector, node)
    },
  }
}

function matchSelector(selector, node) {
  return selector.rules.some((rule) => {
    return rule.items.every((item) => {
      switch (item.type) {
        case "TagName":
          return node.tagName === item.name
        case "WildcardTag":
          return true
        case "Id":
          return matchAttribute("id", "=", item.name, node)
        case "ClassName":
          return matchAttribute("class", "~=", item.name, node)
        case "Attribute":
          return matchAttribute(
            item.name,
            item.operator,
            item.value?.value,
            node
          )
        case "PseudoClass":
          return !matchSelector(item.argument, node)
        default:
          throw new Error(`Unsupported type ${item.type}`)
      }
    })
  })
}

function matchAttribute(name, operator, value, node) {
  if (!Object.hasOwn(node.attributes, name)) return false
  const actualValue = node.attributes[name]
  switch (operator) {
    case undefined:
      return true
    case "=":
      return value === actualValue
    case "~=":
      return !!actualValue.match(/\S+/g)?.includes(value)
    case "|=":
      return value === actualValue || actualValue.startsWith(`${value}-`)
    case "^=":
      return actualValue.startsWith(value)
    case "$=":
      return actualValue.endsWith(value)
    case "*=":
      return actualValue.includes(value)
    default:
      throw new Error(`Unsupported operator ${operator}`)
  }
}
