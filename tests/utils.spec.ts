import utils, { SendRequestFunction } from '../src/utils';
import {
  TextDocument,
  DiagnosticSeverity,
  CompletionItemKind,
  Range,
  MarkupContent,
  Hover,
} from 'vscode-languageserver';
import { Builder, Linter } from 'rockplate';

const sendRequest: SendRequestFunction = (type, params) => {
  return Promise.resolve({
    text: JSON.stringify({
      user: {
        nickname: 'Rocky',
      },
    }),
  });
};

describe('Rockplate Language Server', () => {
  it('is fine', () => {
    expect(3 + 8).toBe(11);
  });

  test('getSchemaResolver 1', async () => {
    const document = { uri: 'hello.rpl' };
    const text = '{ "schema": "./hello.json" }Hello [user nickname]!';
    const builder = new Builder(
      text,
      utils.getSchemaResolver(document, (type, params) => {
        return Promise.resolve({
          text: JSON.stringify({
            user: {
              nickname: 'Rocky',
            },
          }),
        });
      }),
    );
    await builder.build();
    expect(builder.blocks.length).toBe(1);
    const block = builder.blocks[0];
    expect(block.outerContent).toBe('Hello [user nickname]!');
    expect(block.scope).toBeDefined();
    expect(block.scope.user.nickname).toBe('Rocky');
  });

  test('getSchemaResolver 2', async () => {
    const document = { uri: 'another.rpl' };
    const text = '{ "schema": "../schema/another.json" }Another template';
    const builder = new Builder(
      text,
      utils.getSchemaResolver(document, (type, params) => {
        return {
          text: JSON.stringify({
            another: {
              param: 'Yes, Another',
            },
          }),
        };
      }),
    );
    await builder.build();
    expect(builder.blocks.length).toBe(1);
    const block = builder.blocks[0];
    expect(block.outerContent).toBe('Another template');
    expect(block.scope).toBeDefined();
    expect(block.scope.another.param).toBe('Yes, Another');
  });

  for (const index of [1, 2]) {
    test('getSchemaResolver invalid ' + index, async () => {
      const document = { uri: 'invalid.rpl' };
      const text = '{ "schema": "../schema/invalid.json" }invalid template';
      const builder = new Builder(
        text,
        utils.getSchemaResolver(document, (type, params) => {
          return index === 1
            ? ('invalid' as any)
            : {
                text: 'just invalid',
              };
        }),
      );
      await builder.build();
      expect(builder.blocks.length).toBe(1);
      const block = builder.blocks[0];
      expect(block.outerContent).toBe('invalid template');
      expect(block.scope).toBeUndefined();
    });
  }

  test('getDiagnostics', async () => {
    const document: TextDocument = TextDocument.create('hello.rpl', 'rockplate', 1, 'Hello World');
    expect(document.getText()).toBe('Hello World');
    const diagnostics = await utils.getDiagnostics(document, true, (type, params) => {
      return { text: '' };
    });
    expect(diagnostics.length).toBe(0);
  });

  for (const related of [true, false]) {
    test('getDiagnostics 2 (related: ' + related + ')', async () => {
      const document: TextDocument = TextDocument.create(
        'another.rpl',
        'rockplate',
        1,
        `{ "schema": "../another.json" }
Programming Languages
[repeat languages]
  [language name]
  [language popularity]
[end repeat]
    `,
      );
      // expect(document.getText()).toBe('Hello World');
      const diagnostics = await utils.getDiagnostics(document, related, (type, params) => {
        return {
          text: JSON.stringify({
            languages: [
              {
                language: {
                  name: 'TypeScript',
                },
              },
            ],
          }),
        };
      });
      expect(diagnostics.length).toBe(1);
      const diagnostic = diagnostics[0];
      expect(diagnostic.severity).toBe(DiagnosticSeverity.Error);
      expect(diagnostic.message).toBe('Unavailable: Property "popularity" on Object "language"');
      expect(diagnostic.range.start.line).toBe(4);
      expect(diagnostic.range.start.character).toBe('  [language '.length);
      expect(diagnostic.range.end.line).toBe(4);
      expect(diagnostic.range.end.character).toBe(diagnostic.range.start.character + 'popularity'.length);
      if (related) {
        expect(diagnostic.relatedInformation).toBeDefined();
      } else {
        expect(diagnostic.relatedInformation).toBeUndefined();
      }
      if (diagnostic.relatedInformation) {
        expect(diagnostic.relatedInformation[0].message).toBe('Expression: [language popularity]');
      }
    });
  }

  (() => {
    const document: TextDocument = TextDocument.create(
      'another.rpl',
      'rockplate',
      1,
      `{ "schema": "../another.json" }
Programming Languages
[repeat languages]
  [language name]
  [language popularity]
[end repeat]
[unfinished
[end unfinished
[repeat unfinished
[if rockplate are not unfinished
[if rockplate are unfinished
[if rockplate is not unfinished
[if rockplate is unfinished
[if rockplate unfinished
[if unfinished
      `,
    );

    const text = document.getText();

    type Expected = { label: string; kind: number; detail: string; documentation?: string };

    const expectedBeginRepeat: Expected = {
      label: 'repeat',
      kind: CompletionItemKind.Keyword,
      detail: 'Begin repeat block',
    };

    const expectedBeginIf: Expected = {
      label: 'if',
      kind: CompletionItemKind.Keyword,
      detail: 'Begin if block',
    };

    const expectedEnd: Expected = {
      label: 'end',
      kind: CompletionItemKind.Keyword,
      detail: 'End if/repeat block',
    };

    const rockplateVariable: Expected = {
      label: '[rockplate favorite]',
      kind: CompletionItemKind.Variable,
      detail: 'Identifier "rockplate favorite"',
      documentation: 'Object "rockplate" Property "favorite"',
    };

    const rockplateVariableInner: Expected = Object.assign({}, rockplateVariable);
    rockplateVariableInner.label = rockplateVariableInner.label.replace('[', '').replace(']', '');

    const favoriteProperty: Expected = {
      label: 'favorite',
      kind: CompletionItemKind.Property,
      detail: 'Boolean Property "' + 'favorite' + '"',
    };

    const notFavoriteProperty: Expected = {
      label: 'not favorite',
      kind: CompletionItemKind.Keyword,
      detail: 'Boolean Property "' + 'favorite' + '" (false)',
    };

    const tests: {
      name?: string;
      offset: number;
      expected: Expected[];
    }[] = [
      {
        offset: text.indexOf('Languages'),
        expected: [rockplateVariable, expectedBeginRepeat, expectedBeginIf, expectedEnd],
      },
      {
        offset: text.indexOf('[language name]'),
        expected: [
          rockplateVariable,
          {
            label: '[language name]',
            kind: CompletionItemKind.Variable,
            detail: 'Identifier "language name"',
            documentation: 'Object "language" Property "name"',
          },
          expectedBeginRepeat,
          expectedBeginIf,
          expectedEnd,
        ],
      },
      {
        offset: text.indexOf('[unfinished') + '['.length,
        expected: [rockplateVariableInner, expectedBeginRepeat, expectedBeginIf, expectedEnd],
      },
      {
        offset: text.indexOf('[repeat languages]') + '[repeat '.length,
        expected: [],
      },
      {
        offset: text.indexOf('[end unfinished') + '[end '.length,
        expected: [
          {
            label: 'repeat',
            kind: CompletionItemKind.Keyword,
            detail: 'End repeat block',
          },
          {
            label: 'if',
            kind: CompletionItemKind.Keyword,
            detail: 'End if block',
          },
        ],
      },
      {
        offset: text.indexOf('[repeat unfinished') + '[repeat '.length,
        expected: [
          {
            label: 'languages',
            kind: CompletionItemKind.Variable,
            detail: 'Repeat array "' + 'languages' + '"',
          },
        ],
      },
      {
        offset: text.indexOf('[if unfinished') + '[if '.length,
        expected: [
          {
            label: 'rockplate',
            kind: CompletionItemKind.Variable,
            detail: 'Object "' + 'rockplate' + '"',
          },
        ],
      },
      {
        name: 'if: is not',
        offset: text.indexOf('[if rockplate is not unfinished') + '[if rockplate is not '.length,
        expected: [favoriteProperty],
      },
      {
        name: 'if: is',
        offset: text.indexOf('[if rockplate is unfinished') + '[if rockplate is '.length,
        expected: [favoriteProperty, notFavoriteProperty],
      },
      {
        name: 'if: are not',
        offset: text.indexOf('[if rockplate are not unfinished') + '[if rockplate are not '.length,
        expected: [favoriteProperty],
      },
      {
        name: 'if: are',
        offset: text.indexOf('[if rockplate are unfinished') + '[if rockplate are '.length,
        expected: [favoriteProperty, notFavoriteProperty],
      },
      {
        name: 'if: before operator',
        offset: text.indexOf('[if rockplate unfinished') + '[if rockplate '.length,
        expected: [
          {
            label: 'is',
            kind: CompletionItemKind.Keyword,
            detail: 'Operator " is "',
          },
          {
            label: 'are',
            kind: CompletionItemKind.Keyword,
            detail: 'Operator " are "',
          },
        ],
      },
    ];

    // const outsideParams = { textDocument: document, position: { line: 1, character: 0 } };
    // const withinRepeatParams = { textDocument: document, position: { line: 3, character: 0 } };

    let index = 0;
    for (const expectedTest of tests) {
      index++;
      test('getCompletionResults Expected ' + (expectedTest.name ? expectedTest.name : index), async () => {
        const params = {
          textDocument: document,
          // position: { line: expectedTest.position[0], character: expectedTest.position[1] },
          position: document.positionAt(expectedTest.offset),
        };
        const items = await utils.getCompletionResults(document, params, (type, prms) => {
          return {
            text: JSON.stringify({
              languages: [
                {
                  language: {
                    name: 'TypeScript',
                  },
                },
              ],
              rockplate: {
                favorite: true,
              },
            }),
          };
        });
        expect(items.length).toBe(expectedTest.expected.length);
        let i = 0;
        for (const expected of expectedTest.expected) {
          expect(items[i].label).toBe(expected.label);
          expect(items[i].kind).toBe(expected.kind);
          expect(items[i].detail).toBe(expected.detail);
          if (expected.documentation) {
            expect(items[i].documentation).toBe(expected.documentation);
          }
          i++;
        }
      });
    }
  })();

  (() => {
    const document: TextDocument = TextDocument.create(
      'another.rpl',
      'rockplate',
      1,
      `{ "schema": "../another.json" }
Programming Languages
[repeat languages]
  [language name] [-- comment here --]
  [language popularity]
[end repeat]
[if rockplate is favorite]
 YEAH!
[end if]
    `,
    );

    const text = document.getText();

    const getOutput = (label: string, value: string, scope: any) => {
      return utils.hoverOutput(label, value, scope);
    };

    type Expected = { output: string; range: string | number[] };
    const tests: {
      name?: string;
      offset: number;
      expected?: Expected;
    }[] = [
      {
        offset: text.indexOf('Languages'),
        expected: undefined,
      },
      {
        offset: text.indexOf('[language name]') + '[language'.length,
        expected: {
          output: getOutput('identifier', 'language name', { language: { name: 'TypeScript' } }),
          // range: [text.indexOf('[language name]') + 1, text.indexOf('[language name]') + '[language name'.length],
          range: '[language name]',
        },
      },
      {
        offset: text.indexOf('[repeat languages]') + '[repeat '.length,
        expected: {
          output: getOutput('repeat', 'languages', {
            languages: [{ language: { name: 'TypeScript' } }],
          }),
          range: '[repeat languages]',
        },
      },
      {
        offset: text.indexOf('[if rockplate is favorite]') + '[if '.length,
        expected: {
          output: getOutput('if', 'rockplate is favorite', {
            rockplate: { favorite: true },
          }),
          range: '[if rockplate is favorite]',
        },
      },
      {
        offset: text.indexOf('[-- comment here --]') + '[-- comment '.length,
        expected: {
          output: getOutput('comment', '', 'comment here'),
          range: '[-- comment here --]',
        },
      },
      {
        offset: text.indexOf('YEAH!') + 'YE'.length,
        // expected: {
        //   output: getOutput('comment', '', 'comment here'),
        //   range: '[-- comment here --]',
        // },
        expected: undefined,
      },
    ];

    // const outsideParams = { textDocument: document, position: { line: 1, character: 0 } };
    // const withinRepeatParams = { textDocument: document, position: { line: 3, character: 0 } };

    let index = 0;
    for (const expectedTest of tests) {
      index++;
      test('getHoverResults Expected ' + (expectedTest.name ? expectedTest.name : index), async () => {
        const params = {
          textDocument: document,
          // position: document.positionAt(text.indexOf('[repeat ') + '[repeat '.length),
          position: document.positionAt(expectedTest.offset),
        };

        // expect(document.getText()).toBe('Hello World');
        const hoverResult = await utils.getHoverResults(document, params, (type, prms) => {
          return {
            text: JSON.stringify({
              languages: [
                {
                  language: {
                    name: 'TypeScript',
                  },
                },
              ],
              rockplate: {
                favorite: true,
              },
            }),
          };
        });
        if (!expectedTest.expected) {
          expect(hoverResult).toBeUndefined();
        } else {
          const range: Range = (hoverResult as Hover).range as Range;
          const output: string = ((hoverResult as Hover).contents as MarkupContent).value;
          let expectedRange: Range;
          if (typeof expectedTest.expected.range === 'string') {
            expectedRange = {
              start: document.positionAt(text.indexOf(expectedTest.expected.range) + 1),
              end: document.positionAt(
                text.indexOf(expectedTest.expected.range) + expectedTest.expected.range.length - 1,
              ),
            };
          } else {
            expectedRange = {
              start: document.positionAt(expectedTest.expected.range[0]),
              end: document.positionAt(expectedTest.expected.range[0]),
            };
          }
          expect(range.start.line).toBe(expectedRange.start.line);
          expect(range.start.character).toBe(expectedRange.start.character);
          expect(range.end.line).toBe(expectedRange.end.line);
          expect(range.end.character).toBe(expectedRange.end.character);
          expect(output).toBe(expectedTest.expected.output);
        }
      });
    }
  })();
});
