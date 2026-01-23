import { it, describe } from "node:test"
import assert from "node:assert/strict"

import { parseCssSelector } from "../cssSelector.js"

describe("cssSelector", () => {
  it("matches tag", () => {
    assert(parseCssSelector("div").match({ tagName: "div", attributes: {} }))
    assert(parseCssSelector("*").match({ tagName: "div", attributes: {} }))
  })

  it("matches .class", () => {
    assert(
      parseCssSelector(".foo").match({
        tagName: "div",
        attributes: { class: "foo" },
      })
    )
    assert(
      parseCssSelector(".foo").match({
        tagName: "div",
        attributes: { class: "foo bar" },
      })
    )
    assert(
      parseCssSelector(".foo.bar").match({
        tagName: "div",
        attributes: { class: "foo bar" },
      })
    )
    assert(
      !parseCssSelector(".foo.bar").match({
        tagName: "div",
        attributes: { class: "foo" },
      })
    )
    assert(
      !parseCssSelector(".foo").match({
        tagName: "div",
        attributes: { class: "bar" },
      })
    )
    assert(
      !parseCssSelector(".foo").match({
        tagName: "div",
        attributes: { class: "" },
      })
    )
    assert(
      !parseCssSelector(".foo").match({
        tagName: "div",
        attributes: {},
      })
    )
  })

  it("matches [attribute]", () => {
    assert(
      parseCssSelector("[type]").match({
        tagName: "div",
        attributes: { type: "module" },
      })
    )
    assert(
      !parseCssSelector("[type]").match({
        tagName: "div",
        attributes: {},
      })
    )
    assert(
      parseCssSelector("[type=module]").match({
        tagName: "div",
        attributes: { type: "module" },
      })
    )
    assert(
      !parseCssSelector("[type=module]").match({
        tagName: "div",
        attributes: {},
      })
    )
    assert(
      parseCssSelector("[type^=mod]").match({
        tagName: "div",
        attributes: { type: "module" },
      })
    )
    assert(
      parseCssSelector("[type$=ule]").match({
        tagName: "div",
        attributes: { type: "module" },
      })
    )
    assert(
      parseCssSelector("[type*=du]").match({
        tagName: "div",
        attributes: { type: "module" },
      })
    )
    assert(
      parseCssSelector("[type|=fr]").match({
        tagName: "div",
        attributes: { type: "fr" },
      })
    )
    assert(
      parseCssSelector("[type|=fr]").match({
        tagName: "div",
        attributes: { type: "fr-FR" },
      })
    )
    assert(
      !parseCssSelector("[type|=fr]").match({
        tagName: "div",
        attributes: { type: "xxx-fr" },
      })
    )
  })

  it("matches #id", () => {
    assert(
      parseCssSelector("#foo").match({
        tagName: "div",
        attributes: { id: "foo" },
      })
    )
    assert(
      !parseCssSelector("#bar").match({
        tagName: "div",
        attributes: { id: "foo" },
      })
    )
  })

  it("matches :not", () => {
    assert(
      parseCssSelector(":not(a)").match({ tagName: "div", attributes: {} })
    )
    assert(
      !parseCssSelector(":not(div)").match({ tagName: "div", attributes: {} })
    )
  })
})
