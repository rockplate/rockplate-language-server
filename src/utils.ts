import {
  Connection,
  TextDocument,
  Diagnostic,
  DiagnosticSeverity,
  HoverParams,
  Range,
  MarkupContent,
  TextDocumentPositionParams,
  CompletionItemKind,
  CompletionItem,
  Hover,
} from 'vscode-languageserver';
import { Linter, Builder, LiteralBlock, IfBlock, RepeatBlock, CommentBlock, Block } from 'rockplate';

export type SendRequestFunction = (
  type: string,
  params: { uri: string; path: string },
) => { text: string } | Promise<{ text: string }>;

export class Utils {
  markupCodeBlock(language: string, code: string) {
    return '```' + language + '\n' + code + '\n```';
  }

  hoverOutput(label: string, value: string, scope: any) {
    const code = typeof scope === 'string' ? scope : JSON.stringify(scope, null, 2);
    const lang = typeof scope === 'string' ? '' : 'json';
    value = value === '' ? '' : '`' + value + '`';
    const out = '### ' + label + ' ' + value + '\n\n' + this.markupCodeBlock(lang, code) + '';
    return out;
  }
  //   getSchemaResolver(connection: Connection, document: { uri: string }) {
  getSchemaResolver(document: { uri: string }, sendRequest: SendRequestFunction) {
    return async (path: string) => {
      const params = { uri: document.uri, path };
      const type = 'textDocument/rockplate-schema';
      try {
        const schemaResult: any = await sendRequest(type, params);
        if (schemaResult && schemaResult.text) {
          return JSON.parse(schemaResult.text);
        }
      } catch (e) {
        // console.log('schema resolve error', e);
        return undefined;
      }
    };
  }

  async getDiagnostics(document: TextDocument, related: boolean, sendRequest: SendRequestFunction) {
    const diagnostics: Diagnostic[] = [];
    const text = document.getText();
    const linter = new Linter(text, this.getSchemaResolver(document, sendRequest));
    await linter.builder.build();
    const result = linter.lint(linter.builder.schema as any, false);
    for (const lint of result.lints) {
      const diagnostic: Diagnostic = {
        // severity: lint.severity === 'warning' ? DiagnosticSeverity.Warning : DiagnosticSeverity.Error,
        severity: DiagnosticSeverity.Error,
        range: {
          start: document.positionAt(lint.offset.begin),
          end: document.positionAt(lint.offset.end),
        },
        message: lint.message,
        source: 'Rockplate',
      };
      if (related) {
        diagnostic.relatedInformation = [
          {
            location: {
              uri: document.uri,
              range: Object.assign({}, diagnostic.range),
            },
            message: 'Expression: ' + lint.expression,
          },
        ];
      }
      diagnostics.push(diagnostic);
    }
    return diagnostics;
  }

  async getHoverResults(
    document: TextDocument,
    params: HoverParams,
    sendRequest: SendRequestFunction,
  ): Promise<Hover | undefined> {
    const unknown = undefined;
    const text = document.getText();
    const offset = document.offsetAt(params.position);
    const builder = new Builder(text, this.getSchemaResolver(document, sendRequest));
    await builder.build();
    const block = builder.getBlockAt(offset);

    let output = '';
    let range = Range.create(params.position, params.position);

    const getOutput = (label: string, value: string, scope: any) => {
      return this.hoverOutput(label, value, scope);
    };

    let textBefore = text.substr(0, offset);
    let textAfter = text.substr(offset);
    textBefore = textBefore.substr(textBefore.lastIndexOf('['));
    textAfter = textAfter.substr(0, textAfter.indexOf(']'));

    range = Range.create(
      document.positionAt(offset - (textBefore.length - 1)),
      document.positionAt(offset + textAfter.length),
    );

    if (block instanceof IfBlock || block instanceof RepeatBlock) {
      const scope: any = block.scope;
      output = getOutput(
        block instanceof IfBlock ? 'if' : 'repeat',
        block.expression
          .replace('[if ', '')
          .replace('[repeat ', '')
          .replace(']', ''),
        {
          [block.key]: block instanceof RepeatBlock ? [scope[block.key][0]] : scope[block.key],
        },
      );
    } else if (block instanceof LiteralBlock) {
      const identifier = textBefore.replace('[', '') + textAfter;
      if (builder.isValidIdentifier(block.identifiers, identifier)) {
        const scope: any = block.scope;
        const parts = identifier.split(' ');
        const variable = { key: parts[0], subkey: parts[1] };
        output = getOutput('identifier', identifier, { [variable.key]: scope[variable.key] });
      } else {
        return unknown;
      }
    } else if (block instanceof CommentBlock) {
      // comment
      output = getOutput('comment', '', block.content.trim());
    } else {
      return unknown;
    }

    return {
      contents: { kind: 'markdown', value: output } as MarkupContent,
      range,
    };
  }

  async getCompletionResults(
    document: TextDocument,
    params: TextDocumentPositionParams,
    sendRequest: SendRequestFunction,
  ) {
    const text = document.getText();
    const offset = document.offsetAt(params.position);
    const builder = new Builder(text, this.getSchemaResolver(document, sendRequest));
    await builder.build();
    const block = builder.getBlockAt(offset);

    if (!(block instanceof LiteralBlock)) {
      return [];
    }

    let textBefore = text.substr(0, offset);
    textBefore = textBefore.substr(textBefore.lastIndexOf('['));

    // console.log('textBefore::', textBefore + '::');

    const results: CompletionItem[] = [];

    if (textBefore === '[end ') {
      results.push({
        label: 'repeat',
        kind: CompletionItemKind.Keyword,
        detail: 'End repeat block',
      });
      results.push({
        label: 'if',
        kind: CompletionItemKind.Keyword,
        detail: 'End if block',
      });
    } else if (textBefore === '[repeat ') {
      for (const array of block.arrays) {
        results.push({
          label: array,
          kind: CompletionItemKind.Variable,
          detail: 'Repeat array "' + array + '"',
        });
      }
    } else if (textBefore.indexOf('[if ') === 0) {
      for (const bl of block.booleans) {
        if (
          textBefore === '[if ' + bl.key + ' is not ' ||
          textBefore === '[if ' + bl.key + ' is ' ||
          textBefore === '[if ' + bl.key + ' are not ' ||
          textBefore === '[if ' + bl.key + ' are '
        ) {
          results.push({
            label: bl.subkey,
            kind: CompletionItemKind.Property,
            detail: 'Boolean Property "' + bl.subkey + '"',
          });
          if (!(textBefore === '[if ' + bl.key + ' is not ' || textBefore === '[if ' + bl.key + ' are not ')) {
            results.push({
              label: 'not ' + bl.subkey,
              kind: CompletionItemKind.Keyword,
              detail: 'Boolean Property "' + bl.subkey + '" (false)',
            });
          }
          continue;
        } else if (textBefore === '[if ' + bl.key + ' ') {
          results.push({
            label: 'is',
            kind: CompletionItemKind.Keyword,
            detail: 'Operator " is "',
          });
          results.push({
            label: 'are',
            kind: CompletionItemKind.Keyword,
            detail: 'Operator " are "',
          });
          continue;
        } else {
          // if (textBefore === '[if ')
          results.push({
            label: bl.key,
            kind: CompletionItemKind.Variable,
            detail: 'Object "' + bl.key + '"',
          });
        }
      }
    } else {
      const addBrackets = textBefore !== '[';
      for (const identifier of block.identifiers) {
        const identifierName = identifier.key + ' ' + identifier.subkey;
        results.push({
          label: (addBrackets ? '[' : '') + identifierName + (addBrackets ? ']' : ''),
          kind: CompletionItemKind.Variable,
          detail: 'Identifier "' + identifierName + '"',
          documentation: 'Object "' + identifier.key + '" Property "' + identifier.subkey + '"',
        });
      }
      results.push({
        label: 'repeat',
        kind: CompletionItemKind.Keyword,
        detail: 'Begin repeat block',
      });
      results.push({
        label: 'if',
        kind: CompletionItemKind.Keyword,
        detail: 'Begin if block',
      });
      results.push({
        label: 'end',
        kind: CompletionItemKind.Keyword,
        detail: 'End if/repeat block',
      });
    }
    return results;
  }
}

export default new Utils();
