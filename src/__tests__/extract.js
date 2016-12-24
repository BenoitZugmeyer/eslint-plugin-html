/*eslint-env es6*/
/*eslint no-sparse-arrays: 0*/

"use strict"
const extract = require("../extract")

const htmlLine = "//eslint-disable-line"

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

function test(params) {
  const infos = extract(dedent(params.input), {
    indent: params.indent,
    reportBadIndent: true,
    xmlMode: params.xmlMode,
  })
  expect(infos.code).toBe(dedent(params.output))
  expect(infos.map).toEqual(params.map)
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
      ${htmlLine}
      var foo = 1;
    `,
    map: [ , , 8 ],
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
      ${htmlLine}

      var foo = 1;

    `,
    map: [ , , 8, 2, 0 ],
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
      ${htmlLine}
      var foo = 1;
      var baz = 1;

    `,
    map: [ , , 8, 2, 0 ],
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
      ${htmlLine}

      var foo = 1;
      var baz = 1;
    `,
    map: [ , , 8, 2, 2 ],
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
      ${htmlLine}

      var foo = 1;
      ${htmlLine}
      ${htmlLine}

      var bar = 1;

    `,
    map: [ , , 8, 2, 0, , 8, 2, 0 ],
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
      ${htmlLine}

      var foo = 1;

    `,
    map: [ , , 10, 4, 0 ],
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

      if (a < b) { doit(); }

    `,
    map: [ , , 2, 0 ],
  })
})


it("extract empty script tag (#7)", () => {
  test({
    input: `
      <script></script>
    `,
    output: "",
    map: [ ],
  })
})

const prefixes = ["text/",
                "text/x-",
                "application/",
                "application/x-"]

const types = ["javascript", "babel", "buble"]

for (const prefix of prefixes) {
  for (const type of types) {
    const tag = `${prefix}${type}`
    const column = 16 + tag.length

    it(`extracts a script tag with type=${tag}`, () => {
      test({
        input: `
          some html
          <script type="${tag}">var foo = 1;</script>
          other
        `,
        output: `
          ${htmlLine}
          var foo = 1;
        `,
        map: [ , , column ],
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

      a;
      a;
       a;

    `,
    map: [ , , 2, 0, 0, 0 ],
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
      indent: "2",
      output: `
        ${htmlLine}

            a;
        a;
        a;

      `,
      map: [ , , 10, 0, 2, 0, 2 ],
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
      indent: "+2",
      output: `
        ${htmlLine}

        a;
          a;
        a;

      `,
      map: [ , , 10, 4, 0, 0, 0 ],
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
      indent: "tab",
      output: `
        ${htmlLine}

        \t\ta;
        a;
        a;

      `,
      map: [ , , 9, 0, 1, 0, 1 ],
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
      indent: "+tab",
      output: `
        ${htmlLine}

        a;
        \ta;
        a;

      `,
      map: [ , , 9, 2, 0, 0, 0 ],
      badIndentationLines: [ 4, 5 ],
    })
  })
})

it("works with crlf new lines", () => {
  test({
    input: "<p>\r\n</p>\r\n<script>\r\n  foo;\r\nbar;\r\n    baz;\r\n</script>\r\n",
    output: `${htmlLine}\r\n${htmlLine}\r\n\r\nfoo;\r\nbar;\r\n  baz;\r\n\r\n`,
    map: [ , , , 8, 2, 0, 2, 0 ],
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

      a;

      b;

      c;

    `,
    map: [ , , 2, 2, 2, 2, 2, 0 ],
  })
})
