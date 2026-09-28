# 📷 Connecting a camera in your field to FARM-IQ

A camera sits in the field, takes a photo on a timer, and sends it to your FARM-IQ
account. You open the app and see your field — from anywhere.

```
   camera in the field  ──▶  FARM-IQ backend (Render)  ──▶  your phone
   ESP32-CAM / Pi /                                        (Photos, AI reading,
   old phone / IP cam                                       timelapse)
```

Nothing else is needed — no port forwarding, no static IP, no SIM router tricks.
The camera only needs **internet and your camera key**.

---

## Step 1 — Create the camera in the app

1. Open FARM-IQ → **Camera** → **Field cameras** tab → **Add a camera**.
2. Give it a name and the field it watches, choose how often it should shoot, and Save.
3. FARM-IQ shows you three things — copy them to your device:

| What | Looks like |
|---|---|
| **Camera id** | `3f1c8b7e-…-…` (a UUID) |
| **Camera key** | `fqcam_1f2e3d…` (keep this secret, like a password) |
| **Upload address** | `https://farmiq-api-y3sj.onrender.com/api/cameras/<id>/upload` |

4. Press **Test connection** — if the key is right you will see
   *"Camera key accepted — ready to send photos."*

The camera **key is not your login**. It can only add photos to that one camera.
If a key ever leaks, press **Get a new key**: the old one stops working instantly.

---

## Step 2 — Pick your device

### 🅰️ Easiest: an old phone you already own (₹0)

1. On that phone, open **https://farmiq-flax.vercel.app**, log in, open
   **Camera → Field cameras → the camera → Start camera mode**.
2. Choose how often to shoot (e.g. every 30 min) and press **Start**.
3. Keep the phone **plugged into power** and **the screen on** (the page asks the
   browser to keep the screen awake). Put it in a plastic box facing the field.

Good for: testing the whole idea today, or a shaded spot with a power point.

> The browser pauses uploads if the screen locks or the tab is put to sleep, so a
> phone is best for short-term or daytime monitoring. For 24×7 without babysitting,
> use an ESP32-CAM or a Raspberry Pi below.

---

### 🅱️ ESP32-CAM (about ₹300-500, best for 24×7)

**Hardware:** ESP32-CAM module + a 5V 2A adapter (or a small solar+battery setup).
**Software:** Arduino IDE with the ESP32 board package.

Create a new sketch, paste this, fill in the 5 lines at the top, and upload:

```cpp
// FARM-IQ field camera — ESP32-CAM
#include "esp_camera.h"
#include <WiFi.h>
#include <HTTPClient.h>

// ──── fill these in ────
const char* WIFI_SSID  = "YOUR_WIFI";
const char* WIFI_PASS  = "YOUR_WIFI_PASSWORD";
const char* CAMERA_ID  = "paste-camera-id-here";
const char* CAMERA_KEY = "fqcam_paste_camera_key_here";
const char* SERVER     = "https://farmiq-api-y3sj.onrender.com";
const int   INTERVAL_MINUTES = 30;   // how often to send a photo
// ───────────────────────

// AI-CAM (ESP32-CAM) pin map
#define PWDN_GPIO_NUM 32
#define RESET_GPIO_NUM -1
#define XCLK_GPIO_NUM 0
#define SIOD_GPIO_NUM 26
#define SIOC_GPIO_NUM 27
#define Y9_GPIO_NUM 35
#define Y8_GPIO_NUM 34
#define Y7_GPIO_NUM 39
#define Y6_GPIO_NUM 36
#define Y5_GPIO_NUM 21
#define Y4_GPIO_NUM 19
#define Y3_GPIO_NUM 18
#define Y2_GPIO_NUM 5
#define VSYNC_GPIO_NUM 25
#define HREF_GPIO_NUM 23
#define PCLK_GPIO_NUM 22

const char B64[] = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

String base64(const uint8_t* data, size_t len) {
  String out;
  out.reserve(((len + 2) / 3) * 4 + 4);
  for (size_t i = 0; i < len; i += 3) {
    uint32_t n = data[i] << 16;
    if (i + 1 < len) n |= data[i + 1] << 8;
    if (i + 2 < len) n |= data[i + 2];
    out += B64[(n >> 18) & 63];
    out += B64[(n >> 12) & 63];
    out += (i + 1 < len) ? B64[(n >> 6) & 63] : '=';
    out += (i + 2 < len) ? B64[n & 63]        : '=';
  }
  return out;
}

bool sendPhoto() {
  camera_fb_t* fb = esp_camera_fb_get();
  if (!fb) { Serial.println("capture failed"); return false; }

  String payload = "{\"image\":\"data:image/jpeg;base64,";
  payload += base64(fb->buf, fb->len);
  payload += "\",\"battery\":\"mains\"}";
  esp_camera_fb_return(fb);

  HTTPClient http;
  String url = String(SERVER) + "/api/cameras/" + CAMERA_ID + "/upload";
  http.begin(url);
  http.setTimeout(30000);
  http.addHeader("Content-Type", "application/json");
  http.addHeader("x-camera-key", CAMERA_KEY);
  int code = http.POST(payload);
  Serial.printf("upload → %d\n", code);
  http.end();
  return code == 201;
}

void setup() {
  Serial.begin(115200);
  camera_config_t config = {};
  config.ledc_channel = LEDC_CHANNEL_0;  config.ledc_timer = LEDC_TIMER_0;
  config.pin_d0 = Y2_GPIO_NUM;  config.pin_d1 = Y3_GPIO_NUM;
  config.pin_d2 = Y4_GPIO_NUM;  config.pin_d3 = Y5_GPIO_NUM;
  config.pin_d4 = Y6_GPIO_NUM;  config.pin_d5 = Y7_GPIO_NUM;
  config.pin_d6 = Y8_GPIO_NUM;  config.pin_d7 = Y9_GPIO_NUM;
  config.pin_xclk = XCLK_GPIO_NUM;  config.pin_pclk = PCLK_GPIO_NUM;
  config.pin_vsync = VSYNC_GPIO_NUM; config.pin_href = HREF_GPIO_NUM;
  config.pin_sccb_sda = SIOD_GPIO_NUM; config.pin_sccb_scl = SIOC_GPIO_NUM;
  config.pin_pwdn = PWDN_GPIO_NUM;  config.pin_reset = RESET_GPIO_NUM;
  config.xclk_freq_hz = 20000000;
  config.pixel_format = PIXFORMAT_JPEG;
  config.frame_size = FRAMESIZE_VGA;     // 640x480 — small uploads, clear enough
  config.jpeg_quality = 12;
  config.fb_count = 1;
  if (esp_camera_init(&config) != ESP_OK) { Serial.println("camera init failed"); return; }

  WiFi.begin(WIFI_SSID, WIFI_PASS);
  Serial.print("wifi");
  while (WiFi.status() != WL_CONNECTED) { delay(500); Serial.print("."); }
  Serial.println(" connected");
}

void loop() {
  if (WiFi.status() != WL_CONNECTED) {
    WiFi.reconnect(); delay(5000); return;
  }
  sendPhoto();
  delay((uint32_t)INTERVAL_MINUTES * 60UL * 1000UL);
}
```

Prefer a wider view? Change `FRAMESIZE_VGA` to `FRAMESIZE_SVGA`. If you get memory
errors, use `FRAMESIZE_QVGA` (320×240) — the AI can still read the field with it and
uploads get much smaller.

---

### 🅲 Raspberry Pi / any Linux box with a webcam

```bash
sudo apt install fswebcam python3-requests
```

Save as `farmiq_camera.py`, fill in the top three values, then run it with cron:

```python
#!/usr/bin/env python3
import base64, json, subprocess, time, requests

CAMERA_ID  = "paste-camera-id-here"
CAMERA_KEY = "fqcam_paste_camera_key_here"
SERVER     = "https://farmiq-api-y3sj.onrender.com"
PHOTO      = "/tmp/field.jpg"

subprocess.run(["fswebcam", "-r", "1280x720", "--jpeg", "80", "-S", "10", PHOTO], check=True)
with open(PHOTO, "rb") as f:
    image = "data:image/jpeg;base64," + base64.b64encode(f.read()).decode()

r = requests.post(
    f"{SERVER}/api/cameras/{CAMERA_ID}/upload",
    headers={"x-camera-key": CAMERA_KEY, "Content-Type": "application/json"},
    json={"image": image, "battery": "mains", "captured_at": time.strftime("%Y-%m-%dT%H:%M:%SZ")},
    timeout=60,
)
print(r.status_code, r.text[:200])
```

Every 30 minutes, add this to `crontab -e`:

```cron
*/30 * * * * /usr/bin/python3 /home/pi/farmiq_camera.py >> /home/pi/farmiq_camera.log 2>&1
```

---

### 🅳 Any camera that can run a command (IP cameras, NVR scripts)

```bash
#!/bin/sh
# fill these in, then schedule it (cron / Task Scheduler / the camera's own timer)
ID="paste-camera-id-here"
KEY="fqcam_paste_camera_key_here"
API="https://farmiq-api-y3sj.onrender.com"
SNAP="/tmp/field.jpg"
BODY="/tmp/body.json"

curl -s --max-time 20 "http://admin:pass@192.168.1.50/snapshot.cgi" -o "$SNAP"

# Build the JSON body in a file — a real photo is far too big for a command line
printf '{"image":"data:image/jpeg;base64,' > "$BODY"
base64 -w0 "$SNAP" >> "$BODY"
printf '"}' >> "$BODY"

curl -s --max-time 60 -X POST "$API/api/cameras/$ID/upload" \
  -H "Content-Type: application/json" \
  -H "x-camera-key: $KEY" \
  --data-binary @"$BODY"
```

> On macOS use `base64 -i "$SNAP"` (no `-w0`) — everything else is the same.
> Never inline the base64 in the command itself (`-d "…$(base64 …)"`): photos over
> ~100 KB overflow the shell's argument limit.

Add `?analyse=1` to the upload URL and the AI will read **every** photo automatically
(that is the same as ticking *"Ask the AI to look at every photo automatically"* in the app).

---

## Handy to know

| Thing | Detail |
|---|---|
| **Photo size** | Keep each photo under ~3 MB. 640×480 to 1280×720 is plenty for the AI |
| **How many are kept** | The newest **120** photos per camera; older ones are deleted automatically. Change with `CAMERA_MAX_PHOTOS` on the backend |
| **Interval** | Anything from 5 minutes to 12 hours. 30 minutes is a good start |
| **Night photos** | Fine — they arrive, and the AI will say the picture is too dark instead of guessing |
| **AI reading** | Either tick the auto-analyse box, or open any photo in the app and press **AI reading** |
| **Timelapse** | Open a camera's photos and press ▶ to watch the crop grow day by day |
| **Internet drop** | The camera simply retries on its next cycle. Photos you already have stay safe |
| **Power** | ESP32-CAM and a phone both work on a small solar panel + power bank |

## If something does not work

| Symptom | Fix |
|---|---|
| `401 Camera key is wrong` | Copy the key again from the app (no spaces). Press **Get a new key** if unsure |
| `400 Send the photo as a data URL` | The base64 must include the prefix `data:image/jpeg;base64,` |
| `400 Photo is too large` | Use a smaller resolution or lower JPEG quality |
| App shows **"No recent photos"** | The camera has not sent anything for a while — check its power and WiFi |
| Camera shows in app but nothing arrives | Press **Test connection** in the app first, then check the serial log / script output |
| `503 AI` | The AI provider was busy; photos are still saved, press AI reading again in a minute |
