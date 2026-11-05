// help.xml converter (M9 phase G): nesting depth, entity decoding, the htmlText reduction on a fixture snippet.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { flashHtmlToSafe, parseHelpXml, unescapeXml } from './convert';

const data = (html: string): string => html.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

test('entities', () => {
  assert.equal(unescapeXml('&lt;B&gt; &amp;amp; &#65;'), '<B> &amp; A');
});

test('htmlText reduction keeps b / colour, drops TEXTFORMAT and unknown tags, escapes text', () => {
  const flash = '<TEXTFORMAT LEADING="2"><P ALIGN="LEFT"><FONT FACE="Verdana" COLOR="#CC3300"><B>Tiêu đề</B></FONT></P></TEXTFORMAT>'
    + '<P><FONT SIZE="12">a &lt; b <IMG SRC="x">c</FONT></P>';
  assert.equal(flashHtmlToSafe(flash), '<span style="color:#cc3300"><b>Tiêu đề</b></span><br>a &lt; b c');
});

test('nested nodes get their depth', () => {
  const xml = `<root><nodes><node id="01" label="A" data="${data('<P>x</P>')}"><node id="0101" label="B &amp; C" data=""/></node>`
    + '<node id="02" label="D" data=""></node></nodes></root>';
  const nodes = parseHelpXml(xml);
  assert.deepEqual(nodes.map((n) => [n.id, n.label, n.depth]), [['01', 'A', 0], ['0101', 'B & C', 1], ['02', 'D', 0]]);
  assert.equal(nodes[0].html, 'x');
});
