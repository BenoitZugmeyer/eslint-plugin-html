/*eslint-env es6*/
"use strict";
var assert = require("assert");
var extract = require("../src/extract");

var htmlLine = "//eslint-disable-line spaced-comment";

function dedent(str) {
  if (str[0] === "\n") str = str.slice(1);

  const indent = str.match(/([\t ]*)\S/);
  if (indent) {
    str = str.replace(new RegExp("^" + indent[1], "mg"), "");
  }

  // Remove the last empty line
  str = str.replace(/(\n)[\t ]*$/, "");

  return str;
}

function makeTest(fn, description, params) {
  fn(description, function () {
    var infos = extract(dedent(params.input));
    assert.equal(infos.code, dedent(params.output));
    assert.deepEqual(infos.map, params.map);
  });
}

describe("extract", function () {
  makeTest(it, "extract simple javascript", {
    input: `
      some html
      <script>var foo = 1;</script>
      other
    `,
    output: `
      ${htmlLine}
      var foo = 1;
    `,
    map: [ { line: 2, column: 0 } ],
  });

  makeTest(it, "extract indented javascript", {
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
    map: [ { line: 4, column: 2 } ],
  });

  makeTest(it, "extract javascript with first line next to the script tag", {
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
    map: [ { line: 4, column: 0 } ],
  });

  makeTest(it, "extract javascript with last line next to the script tag", {
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
    map: [ { line: 4, column: 2 } ],
  });

  makeTest(it, "extract multiple script tags", {
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
    map: [ { line: 4, column: 2 },
           { line: 8, column: 2 } ],
  });

  makeTest(it, "trim last line spaces", {
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
    map: [ { line: 4, column: 4 } ],
  });

  makeTest(it, "extract script containing 'lower than' characters correctly (#1)", {
    input: `
      <script>
        if (a < b) { doit(); }
      </script>
    `,
    output: `

      if (a < b) { doit(); }

    `,
    map: [ { line: 3, column: 2 } ],
  });


  makeTest(it, "extract empty script tag (#7)", {
    input: `
      <script></script>
    `,
    output: "",
    map: [ ],
  });

  makeTest(it, "extracts a script tag with type=text/babel", {
    input: `
      some html
      <script type="text/babel">var foo = 1;</script>
      other
    `,
    output: `
      ${htmlLine}
      var foo = 1;
    `,
    map: [ { line: 2, column: 0 } ],
  });
});
