# Connecting the VR app to the CropScan model

## API key: none needed

The API is public. There is no key, token or login, and it accepts requests from any origin (CORS `*`). You only need the URL:

```
https://cropscan-api-ovmb.onrender.com
```

Interactive docs, where you can try every endpoint: https://cropscan-api-ovmb.onrender.com/docs

(A key built into a headset or browser app can be pulled out by anyone who has the app, so it would protect nothing.)

## The three calls you need

### 1. Diagnose a leaf photo

`POST /api/scans`, sent as multipart form data with the image in a field named `file`.

| Query parameter | Required            | Values                                                                                                                                                                                                                   |
| --------------- | ------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `crop`          | no, but recommended | `Apple`, `Bell Pepper`, `Blueberry`, `Cherry`, `Chilli`, `Corn (Maize)`, `Cotton`, `Grape`, `Mango`, `Orange`, `Peach`, `Potato`, `Raspberry`, `Rice`, `Soybean`, `Squash`, `Strawberry`, `Sugarcane`, `Tomato`, `Wheat` |
| `lang`          | no (default `en`)   | `en`, `te`, `hi`, `ta`, `kn`                                                                                                                                                                                             |

Passing `crop` makes the model much more accurate on real field photos. Use it whenever the VR scene knows which plant it is.

```bash
curl -X POST "https://cropscan-api-ovmb.onrender.com/api/scans?crop=Tomato&lang=en" \
  -F "file=@leaf.jpg"
```

Unity (C#):

```csharp
var form = new WWWForm();
form.AddBinaryData("file", jpgBytes, "leaf.jpg", "image/jpeg");
var req = UnityWebRequest.Post(
    "https://cropscan-api-ovmb.onrender.com/api/scans?crop=Tomato", form);
req.timeout = 90;   // see "Cold start" below
yield return req.SendWebRequest();
// req.downloadHandler.text is the JSON below
```

JavaScript / WebXR:

```js
const body = new FormData();
body.append("file", blob, "leaf.jpg");
const res = await fetch(
  "https://cropscan-api-ovmb.onrender.com/api/scans?crop=Tomato",
  { method: "POST", body },
);
const scan = await res.json();
```

Response (shortened):

```json
{
  "id": "6f1c…",
  "status": "ok",
  "disease_id": "Tomato___Late_blight",
  "confidence": 0.996,
  "top3": [{"disease_id": "Tomato___Late_blight", "confidence": 0.996, "name": "Tomato Late Blight"}, …],
  "model_version": "bioclip_vit_b16@v6",
  "gradcam_url": "https://…/gradcam.png",
  "info": { "name": "Tomato Late Blight", "symptoms": "…", "organic": "…", "chemical": "…", "prevention": "…" },
  "has_cycle": true,
  "can_enter_field": true,
  "field_blocked_reason": null
}
```

How to read it:

- `status` is `"ok"` or `"uncertain"`. When it is `"uncertain"`, `disease_id` is `null`: the photo was blurry or blank, not a leaf, or the model wasn't sure. **Ask the user to retake the photo, and don't show a disease.**
- `can_enter_field` tells you whether to open the disease-cycle scene. If it is `false`, show `field_blocked_reason` to the user.
- `looks_like_crop` is set (for example `"Cherry"`) when you passed a `crop` that plainly doesn't match the photo. The scan is then `"uncertain"`. **Offer to rescan with that crop, or with no crop.** Otherwise it is `null`.
- `gradcam_url` is a heatmap image of where the model looked on the leaf. You can show it in VR.

### 2. Get the disease cycle (for the VR scene)

```
GET /api/diseases/{disease_id}/cycle?lang=en
```

Example: `/api/diseases/Tomato___Late_blight/cycle`. It returns the pathogen, how it spreads, and a list of `stages`, each with a label, a description and its temperature, leaf-wetness and humidity conditions. If a disease has no cycle written up yet, `cycle` is `null` (not an error).

14 diseases have a cycle today: Apple scab, black rot and cedar apple rust; Potato early and late blight; and Tomato bacterial spot, early blight, late blight, leaf mold, Septoria leaf spot, spider mites, target spot, yellow leaf curl virus and mosaic virus.

### 3. Disease info and treatment

```
GET /api/diseases/{disease_id}?lang=en
GET /api/diseases          (all 68 classes)
```

## Things that will bite you

- **Cold start.** The server sleeps after about 15 minutes with no requests, and the first request then takes about **45–60 s**. Call `GET /healthz` when the app launches and show a "warming up" message. It returns `"model_loaded": true` once the server is ready.
- **A scan takes about 10 s** even when the server is awake. Show a loading state, and set your HTTP timeout to at least 90 s.
- **Image size:** 10 MB maximum. Send a JPEG; about 1000–1600 px on the long side is plenty.
- **Every scan is stored permanently** (the photo, with location data stripped, plus a record of the result). Don't loop test uploads; use a few real photos.
- **One leaf, filling most of the frame**, gives the best results. Headset passthrough frames haven't been tested yet. Send us a few, and we'll check that accuracy holds.

Contact: the CropScan team, for new crops, cycles or anything that breaks.
