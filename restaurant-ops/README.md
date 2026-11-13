# Purple Haze Operations

Separate Expo customer-free staff application for restaurant order acceptance and kitchen progress.

## Run locally

```powershell
npm install
npx expo start
```

Sign in with an existing backend account whose role is `STAFF` or `ADMIN`. Staff see the focused order and delivery workspace. Administrators see an overview plus order, dispatch, menu availability, booking and rider management screens. Admin overview/report data is fetched only for `ADMIN` accounts. Both roles use the existing `admin-orders` Supabase Realtime channel and polling fallback for live operations.

The backend enforces the same boundary: staff can access order operations, dispatch, and the limited rider data needed to assign deliveries. Menu, bookings, reports, rider administration, promotions, settlements and settings require an administrator role. UI visibility is not the security boundary; API routes enforce these permissions.

## Order alerts

- A short custom alert tone loops in the foreground while pending orders remain; staff can silence it or accept/decline orders.
- Android creates a high-importance `incoming-orders` channel with vibration and the bundled tone.
- Backend staff push messages target only tokens linked to `STAFF` or `ADMIN` accounts and use the bundled alert tone.
- Remote push token registration requires the linked EAS project, notification permission, Android FCM credentials in EAS, and a native development build. Expo Go/web preview still allows staff UI and the live queue, but not dependable remote push.
- iOS Critical Alerts are not configured. Standard OS notification settings, Focus, mute and device state can limit alert sound. No push service can prove an order was heard; the queue remains the source of truth.

The Android app is registered in Firebase project `purple-haze-cfeb7` as `Purple Haze Staff Operations`; its public client config is `google-services.json`. The EAS project is linked as `@bistacreation/purplehaze-operations`. Android APK profiles are available with `eas build --profile development --platform android` (dev client) and `eas build --profile preview --platform android` (internal APK). Configure Android FCM v1 credentials in the EAS project before expecting remote push delivery. Configure `EXPO_PUBLIC_API_URL` only when using a non-production backend.
