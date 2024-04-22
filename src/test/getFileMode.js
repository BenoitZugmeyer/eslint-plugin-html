const { test } = require("node:test")
const assert = require("assert")
const getFileMode = require("../getFileMode")

test("undefined if filename is empty", () => {
  assert.strictEqual(
    getFileMode(
      {
        htmlExtensions: [],
        xmlExtensions: [],
      },
      undefined
    ),
    undefined
  )
})

test("'html' if filename matches an HTML extension", () => {
  assert.strictEqual(
    getFileMode(
      {
        htmlExtensions: ["html"],
        xmlExtensions: [],
      },
      "foo.html"
    ),
    "html"
  )
})

test("'html' if filename matches an HTML and an XML extension", () => {
  assert.strictEqual(
    getFileMode(
      {
        htmlExtensions: ["html"],
        xmlExtensions: ["html"],
      },
      "foo.html"
    ),
    "html"
  )
})

test("'xml' if filename matches an XML extension", () => {
  assert.strictEqual(
    getFileMode(
      {
        htmlExtensions: ["html"],
        xmlExtensions: ["xml"],
      },
      "foo.xml"
    ),
    "xml"
  )
})

test("undefined if filename ends with extension without dot", () => {
  assert.strictEqual(
    getFileMode(
      {
        htmlExtensions: [],
        xmlExtensions: ["xml"],
      },
      "fooxml"
    ),
    undefined
  )
})

test("works with extensions starting with a dot", () => {
  assert.strictEqual(
    getFileMode(
      {
        htmlExtensions: [".html"],
        xmlExtensions: [],
      },
      "foo.html"
    ),
    "html"
  )
})

test("works with extensions containgin a dot", () => {
  assert.strictEqual(
    getFileMode(
      {
        htmlExtensions: [".html.in"],
        xmlExtensions: [],
      },
      "foo.html.in"
    ),
    "html"
  )
})
