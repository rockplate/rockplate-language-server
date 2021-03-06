/* --------------------------------------------------------------------------------------------
 * Copyright (c) Microsoft Corporation. All rights reserved.
 * Licensed under the MIT License. See License.txt in the project root for license information.
 * ------------------------------------------------------------------------------------------ */

import {
  createConnection,
  TextDocuments,
  //   TextDocument,
  TextDocumentSyncKind,
  ProposedFeatures,
  InitializeParams,
  DidChangeConfigurationNotification,
  CompletionItem,
  Hover,
  HoverParams,
  TextDocumentPositionParams,
} from 'vscode-languageserver';
import { TextDocument } from 'vscode-languageserver-textdocument';
import utils, { SendRequestFunction } from './utils';

export const run = () => {
  // Create a connection for the server. The connection uses Node's IPC as a transport.
  // Also include all preview / proposed LSP features.
  const connection = createConnection(ProposedFeatures.all);

  // Create a simple text document manager. The text document manager
  // supports full document sync only
  const documents: TextDocuments<TextDocument> = new TextDocuments(TextDocument);

  let hasConfigurationCapability: boolean = false;
  let hasWorkspaceFolderCapability: boolean = false;
  let hasDiagnosticRelatedInformationCapability: boolean = false;

  connection.onInitialize((params: InitializeParams) => {
    const capabilities = params.capabilities;

    // Does the client support the `workspace/configuration` request?
    // If not, we will fall back using global settings
    hasConfigurationCapability = !!(capabilities.workspace && !!capabilities.workspace.configuration);
    hasWorkspaceFolderCapability = !!(capabilities.workspace && !!capabilities.workspace.workspaceFolders);
    hasDiagnosticRelatedInformationCapability = !!(
      capabilities.textDocument &&
      capabilities.textDocument.publishDiagnostics &&
      capabilities.textDocument.publishDiagnostics.relatedInformation
    );

    return {
      capabilities: {
        //   textDocumentSync: documents.syncKind,
        textDocumentSync: TextDocumentSyncKind.Full,
        // Tell the client that the server supports code completion
        completionProvider: {
          // tslint:disable-next-line
          triggerCharacters: [' ', '.', '"', "'", '['],
          resolveProvider: true,
        },
        hoverProvider: true,
      },
    };
  });

  connection.onInitialized(() => {
    if (hasConfigurationCapability) {
      // Register for all configuration changes.
      connection.client.register(DidChangeConfigurationNotification.type, undefined);
    }
    if (hasWorkspaceFolderCapability) {
      connection.workspace.onDidChangeWorkspaceFolders((_event) => {
        connection.console.log('Workspace folder change event received.');
      });
    }
  });

  // The example settings
  interface ExampleSettings {
    maxNumberOfProblems: number;
  }

  // The global settings, used when the `workspace/configuration` request is not supported by the client.
  // Please note that this is not the case when using this server with the client provided in this example
  // but could happen with other clients.
  const defaultSettings: ExampleSettings = { maxNumberOfProblems: 1000 };
  let globalSettings: ExampleSettings = defaultSettings;

  // Cache the settings of all open documents
  const documentSettings: Map<string, Thenable<ExampleSettings>> = new Map();

  connection.onDidChangeConfiguration((change) => {
    if (hasConfigurationCapability) {
      // Reset all cached document settings
      documentSettings.clear();
    } else {
      globalSettings = (change.settings.rockplateLanguageServer || defaultSettings) as ExampleSettings;
    }

    // Revalidate all open text documents
    documents.all().forEach(validateTextDocument);
  });

  function getDocumentSettings(resource: string): Thenable<ExampleSettings> {
    if (!hasConfigurationCapability) {
      return Promise.resolve(globalSettings);
    }
    let result = documentSettings.get(resource);
    if (!result) {
      result = connection.workspace.getConfiguration({
        scopeUri: resource,
        section: 'rockplateLanguageServer',
      });
      documentSettings.set(resource, result);
    }
    return result;
  }

  // Only keep settings for open documents
  documents.onDidClose((e) => {
    documentSettings.delete(e.document.uri);
  });

  // The content of a text document has changed. This event is emitted
  // when the text document first opened or when its content has changed.
  documents.onDidChangeContent((change) => {
    validateTextDocument(change.document);
  });

  const sendRequest: SendRequestFunction = (type, params) => {
    return connection.sendRequest(type, params);
  };

  async function validateTextDocument(document: TextDocument): Promise<void> {
    //   let settings = await getDocumentSettings(textDocument.uri);
    const diagnostics = await utils.getDiagnostics(document, hasDiagnosticRelatedInformationCapability, sendRequest);
    // Send the computed diagnostics to VSCode.
    connection.sendDiagnostics({ uri: document.uri, diagnostics });
  }

  connection.onDidChangeWatchedFiles((_change) => {
    // Monitored files have change in VSCode
    connection.console.log('We received a file change event');
  });

  connection.onHover(
    async (params: HoverParams): Promise<Hover | undefined> => {
      const file = params.textDocument.uri;
      const unknown = { contents: [] };
      if (!file) {
        return unknown;
      }
      const document = documents.get(file);
      if (!document) {
        throw new Error('The document should be opened for hover, file: ' + file);
      }

      return utils.getHoverResults(document, params, sendRequest);
    },
  );

  // This handler provides the initial list of the completion items.
  connection.onCompletion(
    async (params: TextDocumentPositionParams): Promise<CompletionItem[]> => {
      const file = params.textDocument.uri;
      if (!file) {
        return [];
      }
      const document = documents.get(file);
      if (!document) {
        throw new Error('The document should be opened for completion, file: ' + file);
      }

      return utils.getCompletionResults(document, params, sendRequest);
    },
  );

  // This handler resolves additional information for the item selected in
  // the completion list.
  connection.onCompletionResolve(
    (item: CompletionItem): CompletionItem => {
      return item;
    },
  );

  /*
  connection.onDidOpenTextDocument((params) => {
    // A text document got opened in VSCode.
    // params.textDocument.uri uniquely identifies the document. For documents store on disk this is a file URI.
    // params.textDocument.text the initial full content of the document.
    connection.console.log(`${params.textDocument.uri} opened.`);
  });
  connection.onDidChangeTextDocument((params) => {
    // The content of a text document did change in VSCode.
    // params.textDocument.uri uniquely identifies the document.
    // params.contentChanges describe the content changes to the document.
    connection.console.log(`${params.textDocument.uri} changed: ${JSON.stringify(params.contentChanges)}`);
  });
  connection.onDidCloseTextDocument((params) => {
    // A text document got closed in VSCode.
    // params.textDocument.uri uniquely identifies the document.
    connection.console.log(`${params.textDocument.uri} closed.`);
  });
  */

  // Make the text document manager listen on the connection
  // for open, change and close text document events
  documents.listen(connection);

  // Listen on the connection
  connection.listen();
};
