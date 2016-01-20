"use strict";

var htmlparser = require("htmlparser2");

function parseIndentDescriptor(indentDescriptor) {
  var match = /^(\+)?(tab|\d+)$/.exec(indentDescriptor);

  if (!match) {
    return { relative: false, spaces: "auto" };
  }

  return {
    relative: match[1] === "+",
    spaces: match[2] === "tab" ? "\t" : Array(Number(match[2]) + 1).join(" "),
  };

}

function iterateScripts(code, onScript) {
  var index = 0;
  var currentScript = null;

  var parser = new htmlparser.Parser({

    onopentag: function (name, attrs) {
      // Test if current tag is a valid <script> tag.
      if (name !== "script") {
        return;
      }

      if (attrs.type && !/text\/(javascript|babel)/i.test(attrs.type)) {
        return;
      }

      currentScript = "";
    },

    onclosetag: function (name) {
      if (name !== "script" || currentScript === null) {
        return;
      }

      onScript(code.slice(index, parser.startIndex - currentScript.length), currentScript);

      index = parser.startIndex;
      currentScript = null;
    },

    ontext: function (data) {
      if (currentScript === null) {
        return;
      }

      currentScript += data;
    },

  });

  parser.parseComplete(code);
}


function extract(code, rawIndentDescriptor) {

  var indentDescriptor = parseIndentDescriptor(rawIndentDescriptor);
  var resultCode = "";
  var map = [];
  var lineNumber = 1;
  var badIndentationLines = [];

  iterateScripts(code, function (previousCode, scriptCode) {

    // Mark that we're inside a <script> a tag and push all new lines
    // in between the last </script> tag and this <script> tag to preserve
    // location information.
    var newLines = previousCode.match(/\n\r|\n|\r/g);
    if (newLines) {
      resultCode += newLines.map(function (newLine) {
        return "//eslint-disable-line spaced-comment" + newLine
      }).join("");
      lineNumber += newLines.length;
      map[lineNumber] = previousCode.match(/[^\n\r]*$/)[0].length;
    }

    var currentScriptIndent = previousCode.match(/([^\n\r]*)<[^<]*$/)[1];

    var indent;
    if (indentDescriptor.spaces === "auto") {
      indent = /^[\n\r]*([ \t]*)/.exec(scriptCode)[1];
    }
    else {
      indent = indentDescriptor.spaces;
      if (indentDescriptor.relative) {
        indent = currentScriptIndent + indent;
      }
    }

    resultCode += scriptCode
      .replace(/([\n\r])(.*)/g, function (_, newLineChar, line) {
        lineNumber += 1;

        if (line.indexOf(indent) === 0) {
          // Dedent code
          line = line.slice(indent.length);
          map[lineNumber] = indent.length;
        }
        else {
          // Don't report line if the line is empty
          if (/\S/.test(line)) {
            badIndentationLines.push(lineNumber);
          }
          map[lineNumber] = 0;
        }

        return newLineChar + line;
      })
      .replace(/[ \t]*$/, "");  // Remove spaces on the last line
  });

  return {
    map: map,
    code: resultCode,
    badIndentationLines: badIndentationLines,
  };
}

module.exports = extract;
