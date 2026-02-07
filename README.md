# pi Ollama Web Search Extension

Adds two pi extension tools backed by Ollama's hosted web APIs:

- `ollama_web_search` → `POST /api/web_search`
- `ollama_web_fetch` → `POST /api/web_fetch`

Default API host is `https://ollama.com`.

## Requirements

- A free Ollama account
- API key from <https://ollama.com/settings/keys>
- pi installed

## Installation

### Option A: install from GitHub (recommended)

```bash
pi install git:github.com/mcollina/pi-ollama-web-search -l
```

### Option B: clone and install locally

```bash
git clone git@github.com:mcollina/pi-ollama-web-search.git
cd pi-ollama-web-search
pi install . -l
```

After install, run `/reload` in pi (or restart pi).

## Configuration

You can configure the extension in pi settings (supports a custom key per project).

### Project-local config (preferred)

Create `.pi/settings.json` in your project:

```json
{
  "ollamaWebSearch": {
    "apiKey": "ollama_key_for_this_project",
    "baseUrl": "https://ollama.com"
  }
}
```

### Global config

Create or update `~/.pi/agent/settings.json`:

```json
{
  "ollamaWebSearch": {
    "apiKey": "ollama_key_for_all_projects",
    "baseUrl": "https://ollama.com"
  }
}
```

### Environment fallback

If not set in config, the extension falls back to:

- `OLLAMA_API_KEY`
- `OLLAMA_WEB_BASE_URL` (optional)

```bash
export OLLAMA_API_KEY="your_key_here"
export OLLAMA_WEB_BASE_URL="https://ollama.com"
```

### Resolution order

1. `.pi/settings.json` → `ollamaWebSearch`
2. `~/.pi/agent/settings.json` → `ollamaWebSearch`
3. Environment variables

## Usage

Ask pi normally; the model can call:

- `ollama_web_search`
  - `query` (string, required)
  - `max_results` (integer, optional, 1-10)
- `ollama_web_fetch`
  - `url` (string, required)

## Notes

- Output is truncated to pi defaults (50KB / 2000 lines) to protect context window.
- Tool errors are surfaced directly if key/config is missing or request fails.
