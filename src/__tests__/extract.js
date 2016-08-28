/*eslint-env es6*/
/*eslint no-sparse-arrays: 0*/

"use strict"
const extract = require("../extract")

function dedent(str) {
  if (str[0] === "\n") str = str.slice(1)

  const indent = str.match(/([\t ]*)\S/)
  if (indent) {
    str = str.replace(new RegExp(`^${indent[1]}`, "mg"), "")
  }

  // Remove the last empty line
  str = str.replace(/(\r\n|\r|\n)[\t ]*$/, "")

  return str
}

function placeholder(n) {
  return `/* HTML BLOCK ${n} */`
}

function test(params) {
  const infos = extract(
    dedent(params.input),
    params.indent,
    params.xmlMode,
    params.isJavaScriptMIMEType
  )
  expect(infos.code.toString()).toBe(dedent(params.output))
  expect(infos.badIndentationLines).toEqual(params.badIndentationLines || [])
}

it("extract simple javascript", () => {
  test({
    input: `
      some html
      <script>var foo = 1;</script>
      other
    `,
    output: `
      ${placeholder(0)}var foo = 1;${placeholder(1)}
    `,
  })
})

it("extract indented javascript", () => {
  test({
    input: `
      some html
      <script>
        var foo = 1;
      </script>
      other
    `,
    output: `
      ${placeholder(0)}
      var foo = 1;
      ${placeholder(1)}
    `,
  })
})

it("extract javascript with first line next to the script tag", () => {
  test({
    input: `
      some html
      <script>var foo = 1;
        var baz = 1;
      </script>
      other
    `,
    output: `
      ${placeholder(0)}var foo = 1;
      var baz = 1;
      ${placeholder(1)}
    `,
  })
})

it("extract javascript with last line next to the script tag", () => {
  test({
    input: `
      some html
      <script>
        var foo = 1;
        var baz = 1;</script>
      other
    `,
    output: `
      ${placeholder(0)}
      var foo = 1;
      var baz = 1;${placeholder(1)}
    `,
  })
})

it("extract multiple script tags", () => {
  test({
    input: `
      some html
      <script>
        var foo = 1;
      </script>
      other
      <script>
        var bar = 1;
      </script>
    `,
    output: `
      ${placeholder(0)}
      var foo = 1;
      ${placeholder(1)}
      var bar = 1;
      ${placeholder(2)}
    `,
  })
})

it("trim last line spaces", () => {
  test({
    input: `
      some html
        <script>
          var foo = 1;
        </script>
      other
    `,
    output: `
      ${placeholder(0)}
      var foo = 1;
      ${placeholder(1)}
    `,
  })
})

it("extract script containing 'lower than' characters correctly (#1)", () => {
  test({
    input: `
      <script>
        if (a < b) { doit(); }
      </script>
    `,
    output: `
      ${placeholder(0)}
      if (a < b) { doit(); }
      ${placeholder(1)}
    `,
  })
})


it("extract empty script tag (#7)", () => {
  test({
    input: `
      <script></script>
    `,
    output: `${placeholder(0)}${placeholder(1)}`,
  })
})

const prefixes = ["text/",
                "text/x-",
                "application/",
                "application/x-"]

const types = ["javascript", "babel"]

for (const prefix of prefixes) {
  for (const type of types) {
    const tag = `${prefix}${type}`

    it(`extracts a script tag with type=${tag}`, () => {
      test({
        input: `
          some html
          <script type="${tag}">var foo = 1;</script>
          other
        `,
        output: `
          ${placeholder(0)}var foo = 1;${placeholder(1)}
        `,
      })
    })
  }
}

it("collects bad indentations", () => {
  test({
    input: `
      <script>
        a;
      a;
       a;
      </script>
    `,
    output: `
      ${placeholder(0)}
      a;
      a;
       a;
      ${placeholder(1)}
    `,
    badIndentationLines: [ 3, 4 ],
  })
})

describe("indent option", () => {
  it("absolute indent with spaces", () => {
    test({
      input: `
        <head>
          <script>
            a;
          a;
        a;
          </script>
        </head>
      `,
      indent: {
        spaces: "  ",
      },
      output: `
        ${placeholder(0)}
            a;
        a;
        a;
        ${placeholder(1)}
      `,
      badIndentationLines: [ 3, 5 ],
    })
  })

  it("relative indent with spaces", () => {
    test({
      input: `
        <head>
          <script>
            a;
          a;
        a;
          </script>
        </head>
      `,
      indent: {
        spaces: "  ",
        relative: true,
      },
      output: `
        ${placeholder(0)}
        a;
          a;
        a;
        ${placeholder(1)}
      `,
      badIndentationLines: [ 4, 5 ],
    })
  })

  it("absolute indent with tabs", () => {
    test({
      input: `
        <head>
        \t<script>
        \t\ta;
        \ta;
        a;
        \t</script>
        </head>
      `,
      indent: {
        spaces: "\t",
      },
      output: `
        ${placeholder(0)}
        \t\ta;
        a;
        a;
        ${placeholder(1)}
      `,
      badIndentationLines: [ 3, 5 ],
    })
  })

  it("relative indent with tabs", () => {
    test({
      input: `
        <head>
        \t<script>
        \t\ta;
        \ta;
        a;
        \t</script>
        </head>
      `,
      indent: {
        spaces: "\t",
        relative: true,
      },
      output: `
        ${placeholder(0)}
        a;
        \ta;
        a;
        ${placeholder(1)}
      `,
      badIndentationLines: [ 4, 5 ],
    })
  })
})

it("works with crlf new lines", () => {
  test({
    input: "<p>\r\n</p>\r\n<script>\r\n  foo;\r\nbar;\r\n    baz;\r\n</script>\r\n",
    output: `${placeholder(0)}\r\nfoo;\r\nbar;\r\n  baz;\r\n${placeholder(1)}`,
    badIndentationLines: [ 5 ],
  })
})

it("works with CDATA", () => {
  test({
    input: `
    <script>
      a;
      <![CDATA[
      b;
      ]]>
      c;
    </script>`,
    xmlMode: true,
    output: `
      ${placeholder(0)}
      a;
      ${placeholder(1)}
      b;
      ${placeholder(2)}
      c;
      ${placeholder(3)}
    `,
  })
})

it("handles the isJavaScriptMIMEType option", () => {
  test({
    input: `
    <script>
      a
    </script>

    <script type="foo/bar">
      b
    </script>

    <script type="foo/baz">
      c
    </script>
    `,
    isJavaScriptMIMEType(type) { return type === "foo/bar" },
    output: `
    ${placeholder(0)}
    a
    ${placeholder(1)}
    b
    ${placeholder(2)}
    `,
  })
})
