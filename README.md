<p align="center">
  <a href="https://lazyrequest.fredy.dev">
    <picture>
      <source srcset="https://github.com/user-attachments/assets/aa948a7e-f29d-4263-8159-9f3c315aa505" media="(prefers-color-scheme: dark)">
      <source srcset="https://github.com/user-attachments/assets/aa948a7e-f29d-4263-8159-9f3c315aa505" media="(prefers-color-scheme: light)">
      <img width="598" height="111" alt="og-image" src="https://github.com/user-attachments/assets/aa948a7e-f29d-4263-8159-9f3c315aa505" />
    </picture>
  </a>
</p>

<p align="center">A lightweight minimal API Testing Client CLI tool inspired by VSCode REST Client syntax.</p>


<p align="center">
  <a href="https://www.npmjs.com/package/lazyrequest"><img alt="npm" src="https://img.shields.io/npm/v/lazyrequest?style=flat-square&logo=npm" /></a>
  <a href="https://github.com/FredySandoval/lazyrequest/actions/workflows/release.yml"><img alt="Build status" src="https://img.shields.io/github/actions/workflow/status/FredySandoval/lazyrequest/release.yml?style=flat-square&branch=main&logo=Checkmarx" /></a>
  <a href="https://github.com/FredySandoval/lazyrequest/releases"><img alt="Total Downloads" src="https://img.shields.io/github/downloads/FredySandoval/lazyrequest/total?style=flat-square&logo=GitHub" /></a>
</p>


[![OpenCode Terminal UI](https://github.com/user-attachments/assets/5535b897-c638-45c5-9ebe-f86cbf62972f)](https://lazyrequest.fredy.dev)

---

LAZYREQUEST recursively discovers `.http` and `.rest` files, automatically sends HTTP requests, and compares actual responses against expected responses defined in the templates.

**Why LAZYREQUEST?** If you already use VSCode REST Client, you don't need to learn another API testing tool. LAZYREQUEST uses the same syntax for HTTP requests.

## Features

- **Recursive file discovery** - Automatically finds `.http` and `.rest` files
- **Variable substitution** - Supports `{{variableName}}` placeholders
- **Multiple execution modes** - Inline, single-file, or folder-based
- **Smart response comparison** - JSON-aware comparison with fallback strategies
- **Sensible default assertion** - If no `### HTTP/...` response block is provided, status code must be `200`
- **Configurable timeouts and throttling**
- **Verbose logging** for debugging
- **Bail option** to stop after N failures

## Installation methods:

```sh
npm i -g lazyrequest        # or bun/pnpm/yarn
```

```
git clone --depth 1  https://github.com/FredySandoval/lazyrequest.git
cd lazyrequest
bun build ./src/index.ts --compile --minify --outfile lazyrequest --target bun
```

Or download from releases page **[lazyrequest-v1.0.3](https://github.com/FredySandoval/lazyrequest/releases)**

## Usage

```sh
./lazyrequest [options]
```

### Options

| Option | Description | Default |
|--------|-------------|---------|
| `--http` | HTTP raw text template (inline mode) | - |
| `--httpFile` | Single HTTP template file path | - |
| `--httpFolder` | Folder path to search for `.http`/`.rest` files | Current directory |
| `-t, --timeout` | Request timeout in milliseconds | `5000` |
| `-v, --verbose` | Enable verbose logging | `false` |
| `--bail` / `--bail=<n>` | Stop after 1 failure (`--bail`) or after N failures (`--bail=<n>`) | disabled |
| `--runInBand` | Execute requests sequentially | `false` |
| `--concurrent` | Execute requests concurrently (default strategy) | `true` |
| `--showAfterDone` | Print results after all requests finish | `false` |

### Execution Modes

**Inline Mode:** Pass HTTP template directly via CLI
```sh
./lazyrequest --http "GET https://api.example.com/users"
```

**Single File Mode:** Test a specific HTTP file
```sh
./lazyrequest --httpFile ./api/users.http
```

**Folder Mode (default):** Recursively discover all `.http` and `.rest` files
```sh
./lazyrequest --httpFolder ./api-tests
```

## HTTP Template Files

Create `.http` files to define your requests.

### Template Features

- HTTP method and URL definition
- Custom headers
- Request body
- Expected response for validation
- Block-level and File-level variables
- Comments

### Example Template

#### /template.http - all features supported 
```sh
# =========================================================
# LAZYREQUEST feature showcase template (single file)
# Covers: comments, file vars, scoped vars, recursive vars,
# request headers/body, expected response assertions,
# default 200 assertion, json/exact/partial(wildcard) body matching
# =========================================================

# File-level variables
@scheme = http
@host = localhost
@port = 8080
@baseUrl = {{scheme}}://{{host}}:{{port}}
@json = application/json
@apiToken = demo-token
@userId = 123

###
# 1) Default assertion feature:
# If no expected response block is provided, status must be 200
GET {{baseUrl}}/health HTTP/1.1
Accept: {{json}}

###
# 2) Request + expected response (JSON comparison strategy)
GET {{baseUrl}}/users/{{userId}} HTTP/1.1
Accept: {{json}}
Authorization: Bearer {{apiToken}}

###
# Expected response for previous request
@userUrl = {{baseUrl}}/users/{{userId}}
HTTP/1.1 200 OK
Content-Type: {{json}}
Location: {{userUrl}}

{"id":{{userId}},"url":"{{userUrl}}"}

###
# 3) Scoped/block variable override (applies only in this block)
@baseUrl = http://localhost:8080/scoped
POST {{baseUrl}}/users HTTP/1.1
Content-Type: {{json}}
X-Env: scoped

{
  "name": "John Doe",
  "email": "john@example.com"
}

###
# Expected response for scoped request
HTTP/1.1 201 Created
Content-Type: {{json}}
Location: http://localhost:8080/scoped/users/123

{"ok":true,"id":123}

###
# 4) Scope reset demo: back to file-level baseUrl
GET {{baseUrl}}/health HTTP/1.1
Accept: text/plain

###
# 5) Exact text comparison strategy
GET {{baseUrl}}/plain HTTP/1.1
Accept: text/plain

###
HTTP/1.1 200 OK
Content-Type: text/plain

exact-value

###
# 6) Partial/wildcard comparison strategy
GET {{baseUrl}}/page HTTP/1.1
Accept: text/html

###
HTTP/1.1 200 OK
Content-Type: text/html

<html>*hello*</html>
```

### Response Comparison Strategies

LAZYREQUEST automatically selects the best comparison strategy:

- **JSON Comparison** - Deep structural comparison for `application/json` responses
- **Exact Match** - Character-by-character comparison for text responses
- **Partial Match** - Substring and wildcard matching for HTML/text responses

## Example Workflow

1. Create one or more `.http` or `.rest` files with request and expected response templates
2. Run LAZYREQUEST with appropriate options
3. LAZYREQUEST automatically discovers and parses all HTTP templates
4. Resolves variables and executes requests (`concurrent` by default, or `--runInBand`)
5. Compares actual responses against expected responses
6. Reports results with Bun-style output (`✓` / `✗`), source grouping, and a compact summary

## Request Execution And Output

- Default behavior: `concurrent` + live output, so each result is printed as soon as it finishes.
- `--showAfterDone`: keeps the previous behavior and prints all results only after execution completes.
- `--runInBand`: runs requests sequentially (useful when order matters, `bail` is enabled, or you need per-request delays).
