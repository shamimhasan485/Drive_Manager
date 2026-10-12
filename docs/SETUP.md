# Server setup guide

From nothing to Drive Manager running at `https://<name>.duckdns.org`, with your Google Drives connected.
It takes about an hour the first time. Every step happens in a web browser or a terminal on the server.

## 1. Get a server (Oracle Cloud Always Free)

1. Sign up at https://www.oracle.com/cloud/free/. A card is needed for identity checks; Always Free resources are not charged.
2. In the console: **Compute → Instances → Create instance**.
   - Image: **Canonical Ubuntu 24.04**.
   - Shape: **Ampere (VM.Standard.A1.Flex)**, 2 OCPUs and 12 GB RAM is plenty (all within Always Free).
     If Oracle says "out of capacity", try another availability domain or try again later.
   - Networking: keep "Assign a public IPv4 address" on.
   - SSH keys: let Oracle generate a key pair and **download the private key**.
3. Make the IP permanent: **Networking → Reserved public IPs → Reserve**, then attach it to the instance's VNIC.
4. Open the web ports: on the instance's subnet, **Security List → Add ingress rules** for TCP **80** and **443** from `0.0.0.0/0`.
5. Connect: `ssh -i <downloaded-key> ubuntu@<public-ip>`
6. Oracle's Ubuntu image also blocks ports in its own firewall. Open them on the server:
   ```bash
   sudo iptables -I INPUT 6 -p tcp --dport 80 -j ACCEPT
   sudo iptables -I INPUT 6 -p tcp --dport 443 -j ACCEPT
   sudo netfilter-persistent save
   ```

*Any other Ubuntu VM (Hetzner, DigitalOcean, ...) works the same from step 2 onward; just skip the Oracle firewall bits.*

## 2. Get a free hostname (DuckDNS)

1. Go to https://www.duckdns.org and sign in (Google or GitHub).
2. Add a subdomain, e.g. `shamim-files`, and set **current ip** to the server's public IP.
3. Your address is now `https://shamim-files.duckdns.org` (HTTPS comes in step 5).

## 3. Install Docker on the server

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER && newgrp docker
```

## 4. Create the Google OAuth app

1. Open https://console.cloud.google.com, create a project called **Drive Manager**.
2. **APIs & Services → Library**: enable **Google Drive API**.
3. **APIs & Services → OAuth consent screen** (Google Auth Platform):
   - User type **External**, app name **Drive Manager**, your email as support and developer contact.
   - Scopes: add `.../auth/drive`, `openid`, `email`.
   - Audience / test users: add your own Google accounts and your family's.
4. **Credentials → Create credentials → OAuth client ID**:
   - Type **Web application**.
   - Authorized redirect URI: `https://shamim-files.duckdns.org/api/accounts/oauth/gdrive/callback`
   - Copy the **Client ID** and **Client secret**. Keep them private; they go only into the server's `.env`.
5. While the app is in **Testing**, Google sign-ins expire every 7 days. Once everything works, click
   **Publish app** on the consent screen. Google will show an "unverified app" warning when you connect a
   Drive; click *Advanced → Go to Drive Manager*. That is expected for a private family app.

## 5. Deploy Drive Manager

```bash
git clone https://github.com/shamimhasan485/Drive_Manager.git
cd Drive_Manager
cp .env.example .env
docker run --rm python:3.13-slim python -c "import os,base64;print(base64.urlsafe_b64encode(os.urandom(32)).decode().rstrip('='))"
nano .env
```

In `.env` set:

```
DM_SECRET_KEY=<the value printed above>
DM_PUBLIC_URL=https://shamim-files.duckdns.org
DM_COOKIE_SECURE=true
DM_GOOGLE_CLIENT_ID=<from step 4>
DM_GOOGLE_CLIENT_SECRET=<from step 4>
```

Back up `DM_SECRET_KEY` somewhere safe: without it, connected accounts must be reconnected.

Put your hostname in `deploy/Caddyfile` (replace `files.example.com`), then start everything:

```bash
cd deploy
docker compose up -d --build
docker compose logs -f app     # Ctrl+C to stop watching
```

Open `https://shamim-files.duckdns.org`, create your owner account, then **Connect account → Google Drive**.
Repeat for each Google account you want to add.

## 6. Updating later

```bash
cd ~/Drive_Manager && git pull && cd deploy && docker compose up -d --build
```

## Troubleshooting

| Symptom | Fix |
|---|---|
| Browser can't reach the site | Check the Oracle security list and the `iptables` step; `curl -I http://<ip>` from your PC should answer |
| HTTPS certificate error | DuckDNS must point at the server's current IP; see `docker compose logs caddy` |
| Google says `redirect_uri_mismatch` | The redirect URI in Google Cloud must match `DM_PUBLIC_URL` exactly, including `https` |
| Google Drive option is greyed out | `DM_GOOGLE_CLIENT_ID` is missing from `.env`; restart with `docker compose up -d` |
