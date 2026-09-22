# OCX — User Guide

OCX lets you run AI coding sessions from your Android phone against an
[opencode](https://github.com/sst/opencode) server running on your own computer.
Your code never goes through our servers — there are no OCX servers. The app
talks directly to your machine.

## What you need

- An Android phone (Android 8 or newer)
- A computer (Windows, Mac, or Linux) on the same Wi-Fi — or reachable via
  Tailscale / a tunnel (see step 3)
- [Node.js](https://nodejs.org/) 20 or newer on the computer
  (check with `node --version`)
- An API key from at least one AI provider (Anthropic, OpenAI, or Google) —
  the agent needs a model to think with; see step 2
- About 15 minutes

## Step 1 — Install the app

1. On your phone, open **https://github.com/nihal697/ocx/releases/latest**
2. Download the APK for your phone: `app-arm64-v8a-release.apk` fits all
   modern phones; only pre-2017 32-bit devices need `app-armeabi-v7a-release.apk`
3. Open it — Android will ask you to allow installs from your browser/file
   manager. Allow it once, then install
4. To update later, repeat these steps — OCX shows a banner in the app when a
   newer version is available

## Step 2 — Start the server on your computer

Open a terminal on your computer and run:

```bash
# Install opencode (once only)
npm install -g opencode-ai

# Give opencode a model to use (once only — pick the line for your provider)
export ANTHROPIC_API_KEY=sk-ant-...
# export OPENAI_API_KEY=sk-...
# export GOOGLE_GENERATIVE_AI_API_KEY=...

# Start it in server mode (every time you want to use OCX)
OPENCODE_SERVER_PASSWORD=pick-a-password opencode serve --hostname 0.0.0.0 --port 4096
```

Leave that terminal running. Notes:

- The model key must be set **before** starting the server, in the same
  terminal. Without it the agent can't reply. More providers and options:
  [opencode.ai/docs](https://opencode.ai/docs).
- Pick a strong server password — anyone with it can run commands on your
  computer through the agent.

## Step 3 — Connect the app to your computer

1. Open OCX and tap **Add Connection**
2. Enter the address of your computer:
   - **Same Wi-Fi:** your computer's LAN IP, e.g. `http://192.168.1.100:4096`.
     Find it with one of these on your computer:
     - Windows: `ipconfig` → look for `IPv4 Address`
     - Mac: `ipconfig getifaddr en0`
     - Linux: `hostname -I` (first address)
   - **Tailscale:** your computer's Tailscale IP, e.g. `http://100.x.x.x:4096`
   - **Away from home:** a Cloudflare Tunnel or ngrok URL,
     e.g. `https://my-ocx.trycloudflare.com`
3. Enter the password from step 2 and tap **Connect**

No server handy? Tap **Try a Demo** on the Sessions screen — a scripted
30-second walkthrough with no setup required.

## Step 4 — Start coding

1. Tap **New Session**
2. Type what you want, e.g. *"add a login button to the homepage"*
3. When the agent wants to run a command or edit a file, approve or reject it
4. Review each change in the diff viewer before continuing

## Troubleshooting

| Problem | Fix |
|---|---|
| App can't reach the server | Check the computer and phone are on the same Wi-Fi; check the server terminal is still running; check the IP and port |
| Wrong password / 401 / 403 | The password must exactly match `OPENCODE_SERVER_PASSWORD`; retype it in the connection settings |
| Reply never arrives / agent says no model | The server was started without a model key — stop it (Ctrl+C), `export` the key as in step 2, and start it again |
| Keyboard covers the typing box | Rotate or scroll — the view should follow the input; report it in [issues](https://github.com/nihal697/ocx/issues) with your phone model |
| Voice input shows an error when you stop talking | Known cosmetic issue fixed in v0.4.16+ — update the app |

Still stuck? Open an issue at
[github.com/nihal697/ocx/issues](https://github.com/nihal697/ocx/issues) with
your phone model, app version (Settings), and what the server terminal shows.
