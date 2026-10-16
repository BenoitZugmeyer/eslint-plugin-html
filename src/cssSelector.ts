import { type AstSelector, createParser } from "css-selector-parser"

export interface TagNode {
  tagName: string
  attributes: Record<string, string>
}

export function parseCssSelector(selector: string) {
  const parse = createParser({
    syntax: {
      tag: true,
      ids: true,
      classNames: true,
      attributes: {
        operators: ["=", "~=", "|=", "^=", "$=", "*="],
        caseSensitivityModifiers: ["i", "s"],
      },
      pseudoClasses: {
        definitions: { Selector: ["not"] },
      },
    },
  })

  const astSelector = parse(selector)
  return {
    match(node: TagNode) {
      return matchSelector(astSelector, node)
    },
  }
}

function matchSelector(selector: AstSelector, node: TagNode): boolean {
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
            item.value?.type === "String" ? item.value.value : undefined,
            node,
            item.caseSensitivityModifier === "i"
          )
        case "PseudoClass":
          // Only `:not()` with a selector is enabled
          if (item.argument?.type !== "Selector") {
            throw new Error(`Unsupported pseudo-class ${item.name}`)
          }
          return !matchSelector(item.argument, node)
        default:
          throw new Error(`Unsupported type ${item.type}`)
      }
    })
  })
}

function matchAttribute(
  name: string,
  operator: string | undefined,
  rawValue: string | undefined,
  node: TagNode,
  caseInsensitive = false
) {
  if (!Object.hasOwn(node.attributes, name)) return false
  if (operator === undefined) return true

  // The value always comes with an operator
  const value = normalizeCase(rawValue || "", caseInsensitive)
  const actualValue = normalizeCase(node.attributes[name], caseInsensitive)
  switch (operator) {
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

const normalizeCase = (text: string, caseInsensitive: boolean) =>
  caseInsensitive ? text.toLowerCase() : text
