# Deploying CropScan (free tier)

Three free accounts, about 15 minutes. The frontend goes on **Vercel**, the API
and its database on **Render**, scan photos in **Cloudflare R2**.

## 1. Photo storage: Cloudflare R2

1. Cloudflare dashboard → **R2** → **Create bucket** → name it `cropscan-media`.
2. R2 → **Manage R2 API Tokens** → **Create API token** → permission
   *Object Read & Write*, scoped to that bucket.
3. Keep three values from the result page: **Access Key ID**, **Secret Access
   Key**, and the **S3 endpoint** (`https://<account-id>.r2.cloudflarestorage.com`).

## 2. API + database: Render

1. Render → **New** → **Blueprint** → choose the `CropScan-XR` repo.
   `render.yaml` creates the API and a free Postgres database.
2. When asked, paste the R2 values:

   | Variable | Value |
   | --- | --- |
   | `S3_ENDPOINT_URL` | the R2 S3 endpoint |
   | `S3_ACCESS_KEY_ID` | the R2 Access Key ID |
   | `S3_SECRET_ACCESS_KEY` | the R2 Secret Access Key |

3. Wait for the deploy, then open `https://<your-api>.onrender.com/healthz`.
   You want `"status":"ok"` and `"model_loaded":true`.

The database tables are created automatically on every start.

## 3. Website: Vercel

1. Vercel → your project → **Settings → Git** → connect `CropScan-XR`
   (or **Add New → Project** to make a fresh one).
2. **Root Directory**: `frontend`. Framework: **Vite**.
3. **Environment Variables**: `VITE_API_URL` = `https://<your-api>.onrender.com`
   (no trailing slash).
4. **Redeploy**. The variable is baked in at build time, so changing it later
   needs another redeploy.

## Good to know

- Free Render services sleep after 15 minutes idle; the first request then
  takes about a minute. Free Render Postgres expires after 30 days unless upgraded.
- The old `crop-disease-detector` Render service and its `/predict` API are
  not used by this version. Delete it once the new site works.
- Payments (Razorpay) and the VR video catalogue are off until their own keys
  and footage are added; scanning, languages and the field simulator work
  without them.
- To ship a new model: run `ml/eval_baseline.py` and `ml/export.py` (see the
  README), commit `services/api/model/`, and Render redeploys.
