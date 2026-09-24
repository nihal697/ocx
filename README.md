# OCX

**The open-source Android client for the [opencode](https://github.com/sst/opencode) AI coding agent.**
AI-assisted coding from your phone — Android, via a direct APK.

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Download APK](https://img.shields.io/badge/Download-APK-green?logo=android)](https://github.com/nihal697/ocx/releases/latest)

> **Fork lineage.** OCX is a fork of [ncend/opencode-mobile](https://github.com/ncend/opencode-mobile)
> (itself forked from `dzianisv/opencode-mobile`). It talks to an [opencode](https://github.com/sst/opencode)
> server you run yourself, using opencode's open HTTP API. OCX is not made by, endorsed by, or affiliated
> with the opencode / Anomaly team, dzianisv, or ncend.

---

**New: tap "Try a Demo" in the app to see the agent fix a real bug — reasoning, a grep, a diff, a permission prompt — in about 30 seconds, no server needed.**

---

## Install (Android)

**Direct signed APK** — download the release and install it manually:
**https://github.com/nihal697/ocx/releases/latest**

> Pick `app-arm64-v8a-release.apk` (all modern phones). Only pre-2017
> 32-bit devices need `app-armeabi-v7a-release.apk`.

> Google Play and F-Droid are not available for OCX. iOS is not available (see [Roadmap](#roadmap)).

---

OCX is a React Native / Expo app that brings the power of the [opencode](https://github.com/sst/opencode) AI coding agent to your phone. Connect to your own self-hosted opencode server over your local network, a Cloudflare Tunnel, ngrok, or Tailscale — and write, review, and ship code from anywhere. The mobile client is **free and open-source** under the MIT license. There is no feature gate, no telemetry you did not opt into, and no ad network.

---

<p align="center">
  <img src="distribution/demo.gif" width="240" alt="OCX demo — connect to your server, browse sessions, and watch the AI agent stream a reply" />
</p>

<sub>Real on-device capture: add a connection, browse sessions, and watch the agent stream a response. Verified end-to-end on an Android emulator against a live opencode server (build com.ocx.app).</sub>

---

## Features

- **Offline demo mode** — tap "Try a Demo" to see a full bug-fix walkthrough (reasoning → grep → diff → permission prompt) with zero setup, right from the empty state
- **Multi-connection** — manage multiple opencode servers (local network, Cloudflare Tunnel, ngrok, or Tailscale)
- **Biometric unlock** — Face ID, Touch ID, or Android fingerprint protects the app and individual message sends
- **Streaming chat** — token-by-token streaming responses directly from your opencode server
- **Diff viewer** — inline side-by-side diffs of every file change the agent makes
- **Tool call approval** — review and approve (or reject) tool calls before the agent executes them
- **Secure credential storage** — server credentials stored in the Android Keystore via `expo-secure-store`
- **Session management** — browse, create, and resume coding sessions

---

## Get OCX

Package: `com.ocx.app` · Android only · current version v0.4.24

| Channel | Status | How |
|---|---|---|
| **Direct APK** | **Live** | [github.com/nihal697/ocx/releases/latest](https://github.com/nihal697/ocx/releases/latest) — `app-arm64-v8a-release.apk` for modern phones, `app-armeabi-v7a-release.apk` for pre-2017 32-bit |
| Google Play | Not available | OCX ships GitHub releases only |
| F-Droid | Not available | OCX ships GitHub releases only |
| Apple App Store / iOS | Not available | See [Roadmap](#roadmap) |

> The supported install channel is the **direct signed APK**, Android only. There is no iOS build.

---

## Quick Start

> Full step-by-step guide with troubleshooting: [docs/USER-GUIDE.md](docs/USER-GUIDE.md).

**Don't have a server yet?** Install the app and tap **Try a Demo** on the Sessions screen first — no setup required. It plays back a scripted bug-fix session through the app's real chat, diff, and permission-approval UI, offline, in about 30 seconds.

**Step 1 — Start opencode on your machine**

```bash
# Install opencode (if you haven't already)
npm install -g opencode-ai

# Run opencode in server mode
OPENCODE_SERVER_PASSWORD=yourpassword opencode serve --hostname 0.0.0.0 --port 4096
```

**Step 2 — Install OCX** via a [direct APK](#install-android) (or build from source — see [CONTRIBUTING.md](CONTRIBUTING.md)).

**Step 3 — Add a connection in the app**

Open the app, tap **Add Connection**, and choose your connection type:

- **Local network** — your machine's LAN IP, e.g. `http://192.168.1.100:4096`
- **Tunnel** — a Cloudflare Tunnel or ngrok URL, e.g. `https://my-opencode.trycloudflare.com`
- **Tailscale** — your machine's Tailscale IP, e.g. `http://100.x.x.x:4096`

Enter the password you set in Step 1, tap **Connect**, and you're in.

---

## How It Works

OCX is a thin client. It speaks the opencode HTTP + SSE API: listing sessions, sending messages, streaming responses, and subscribing to file-change events. All AI model calls are handled by your opencode server — you bring your own API keys (OpenAI, Anthropic, etc.) and the app never touches them. The app never proxies your code or conversation through any third-party server.

```
┌─────────────────────────────────────┐
│                OCX                    │
│  (React Native / Expo, this repo)   │
└──────────────┬──────────────────────┘
               │  HTTP + SSE
               │  (local network / tunnel)
               ▼
┌─────────────────────────────────────┐
│       opencode server               │
│  (github.com/sst/opencode, MIT)     │
│  Running on your laptop / VPS       │
└──────────────┬──────────────────────┘
               │  API calls
               ▼
┌─────────────────────────────────────┐
│   Your AI provider                  │
│  (OpenAI / Anthropic / Gemini / …)  │
│  Your keys, your bill               │
└─────────────────────────────────────┘
```

---

## Project Status

**Current version: v0.4.24**

| Feature | Status |
|---|---|
| Offline demo mode | Stable |
| First-run onboarding clarity | Stable |
| Multi-connection management | Stable |
| Session list + creation | Stable |
| Streaming chat | Stable |
| Diff viewer | Stable |
| Biometric unlock | Stable |
| Tool call approval UI | Stable |
| Sentry crash reporting (opt-in) | Stable |
| Cloudflare / ngrok tunnel wizard | Beta |
| iPad / tablet layout | Planned |
| Offline session history | Planned |

---

## Supporters and Sponsors

> Donations below go to the upstream developers whose work OCX is built on — not to OCX.

OpenCode Mobile is built and maintained by [VIBE TECHNOLOGIES, LLC](https://agentlabs.cc/opencode). GitHub Sponsors help cover Sentry, EAS Build, and CI costs (~$60/month). The opencode Cloud hosted backend (planned, $10/mo) is the long-term revenue model.

If OpenCode Mobile saves you time, consider sponsoring:

**[github.com/sponsors/VibeTechnologies](https://github.com/sponsors/VibeTechnologies)**

| Tier | Price | Perk |
|---|---|---|
| Supporter | $5/mo | Your name in `SUPPORTERS.md` |
| Backer | $15/mo | Name + early access to opencode Cloud beta |
| Business | $50/mo | Logo on [agentlabs.cc/opencode](https://agentlabs.cc/opencode) + quarterly support call |

Questions or OCX support: [nihal697/ocx issues](https://github.com/nihal697/ocx/issues)

---

## Roadmap

Tracked in this repo's [issues](https://github.com/nihal697/ocx/issues).

Near-term priorities:
- GitHub releases (signed APKs, in-app update banner)
- Tunnel setup wizard (Cloudflare / ngrok / Tailscale)
- iPad / tablet layout
- Offline session history cache

---

## Contributing

We welcome bug reports, feature requests, and pull requests. See [CONTRIBUTING.md](CONTRIBUTING.md) for how to set up a dev environment and the contribution process.

---

## Privacy

OCX does not collect personal data. Optional Sentry crash reporting (opt-in, off by default) sends anonymised crash traces to Sentry. No analytics SDKs are bundled. Credentials are stored exclusively on-device in the OS keystore.

Privacy behaviour follows the upstream policy ([dzianisv.github.io/opencode-mobile/privacy](https://dzianisv.github.io/opencode-mobile/privacy/)) — same codebase, same guarantees.

---

## License

MIT — see [LICENSE](LICENSE).

Copyright (c) 2026 VIBE TECHNOLOGIES, LLC

---

## Acknowledgments

- [sst/opencode](https://github.com/sst/opencode) — the AI coding agent this app connects to (MIT)
- [ncend/opencode-mobile](https://github.com/ncend/opencode-mobile) — the fork OCX is directly based on
- [dzianisv/opencode-mobile](https://github.com/dzianisv/opencode-mobile) — the original mobile client
- [Expo](https://expo.dev) — the React Native toolchain powering the app
- Every contributor who filed a bug, opened a PR, or starred the repo
