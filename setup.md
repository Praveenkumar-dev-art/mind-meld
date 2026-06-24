# Summary

MindMeld deployment guide for Google Cloud Run.
This branch (`cloudrun`) contains all deployment files: `Dockerfile`, `nginx.conf`, `.dockerignore`.

---

## Prerequisites (One-Time Setup)

### 1. Create a Google Cloud Project
- Go to: https://console.cloud.google.com
- Create a new project (e.g., `mindmeld-app`)
- Note your **Project ID**

### 2. Install Google Cloud CLI
- Download from: https://cloud.google.com/sdk/docs/install
- After installing, open a terminal and run:

```powershell
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

### 3. Enable Required APIs
```powershell
gcloud services enable run.googleapis.com cloudbuild.googleapis.com
```

---

## Deploy to Cloud Run

Run this command from the root of this branch (`cloudrun`):

```powershell
gcloud run deploy mindmeld `
  --source . `
  --region asia-south1 `
  --platform managed `
  --allow-unauthenticated `
  --port 8080
```

- `asia-south1` = Mumbai region (closest to India)
- `--allow-unauthenticated` = public access, no login required
- `--source .` = Google Cloud Build runs the Dockerfile automatically

Deployment takes ~3-5 minutes. A live HTTPS URL is returned on success.

---

## Update After Deployment

When you make changes on `main` and want to push them live:

```powershell
git checkout cloudrun
git merge main
git push origin cloudrun
gcloud run deploy mindmeld --source . --region asia-south1 --platform managed --allow-unauthenticated --port 8080
```

---

## API Key Note

This deployment is **BYOK (Bring Your Own Key)** — no API key is baked into the app.
Users enter their own Gemini API key via the key modal when they first visit.
Keys are stored in the user's browser `localStorage` only — never on the server.

---

## Rollback

To roll back to a previous version:
```powershell
gcloud run services list-revisions mindmeld --region asia-south1
gcloud run services update-traffic mindmeld --region asia-south1 --to-revisions=REVISION_ID=100
```
