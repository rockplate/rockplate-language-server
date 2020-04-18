[![MIT License](https://img.shields.io/github/license/rockplate/rockplate-language-server)](https://github.com/rockplate/rockplate-language-server/blob/master/LICENSE)
[![Build Status](https://travis-ci.com/rockplate/rockplate-language-server.png?branch=master)](https://travis-ci.com/rockplate/rockplate-language-server)
[![codecov.io Code Coverage](https://img.shields.io/codecov/c/github/rockplate/rockplate-language-server.svg?maxAge=2592000)](https://codecov.io/github/rockplate/rockplate-language-server?branch=master)
[![dependencies Status](https://david-dm.org/rockplate/rockplate-language-server/status.svg)](https://david-dm.org/rockplate/rockplate-language-server)
[![devDependencies Status](https://david-dm.org/rockplate/rockplate-language-server/dev-status.svg)](https://david-dm.org/rockplate/rockplate-language-server?type=dev)
[![HitCount](https://hits.dwyl.com/rockplate/rockplate-language-server.svg)](https://hits.dwyl.com/rockplate/rockplate-language-server)

# Rockplate Language Server

[Language Server Protocol (LSP)](https://microsoft.github.io/language-server-protocol/) implementation for Rockplate language which is used by [Rockplate VSCode Extension](https://github.com/rockplate/rockplate-vscode)

## Usage

Refer to [Rockplate VSCode](https://github.com/rockplate/rockplate-vscode) for example usage

```
npm install rockplate-language-server
```

```javascript
// run-server.js

const rockplateServer = require('rockplate-language-server');
// for non minified version: require('rockplate-language-server/dist/rockplate-language-server')

rockplateServer.run();
```

```
node run-server.js
```
