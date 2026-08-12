# Pico Web Mobile

Expo/React Native frontend for Pico-Web. The legacy browser frontend has been replaced by a mobile-first application structure while the existing Pico/Flask workspace remains untouched.

## Included frontend features

- Dashboard and device reachability status
- Script library with search
- Local script creation, editing, tagging and deletion
- Remote script discovery through the existing `/list-files` endpoint
- Remote script execution through the existing Pico `/msg=` endpoint
- Local execution history
- Payload catalogue with tags and descriptions
- Device management and connection settings
- Wi-Fi configuration UI (stored/validated locally; no Pico endpoint is changed)
- Upload UI with an explicit backend capability boundary
- Backend adapter describing available/missing capabilities
- Local identity/authentication boundary without pretending it is server security
- Responsive Expo layout suitable for Android/iOS and web

## Backend boundary

No Pico firmware/backend feature was added. The microcontroller stays minimal for speed. Operations that require new server state or privileged device changes are represented in the UI and adapter, but remain disabled until the corresponding backend endpoint exists.

The current firmware/API supports reachability and execution; the existing Flask service supports script listing and reading. Upload/delete, telemetry/WebSocket, remote authentication and device/Wi-Fi management are intentionally deferred.

## Run

```bash
npm install
npx expo start
```

This branch is intentionally an app-first refactor: the Pico firmware and its bundled Python dependencies remain in `assets/rpi-pico-workspace`.
