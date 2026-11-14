# Purple Haze Restro & Garden — Customer App

A fresh Expo + React Native customer app for the existing Purple Haze Restro & Garden website and API. Android and iOS share one codebase and use Expo Router.

## Start locally

```powershell
npm install
Copy-Item .env.example .env
npm run web
# or: npx expo start
# then press a for Android / scan the QR code in Expo Go
```

Set `EXPO_PUBLIC_API_URL` in `.env` only when using a non-production API. The default is the restaurant API at `https://purplehaze-nine.vercel.app/api/v1`. The web preview stores session tokens in browser localStorage so sign-in can be tried locally; native Android/iOS builds keep tokens in SecureStore. Do not use browser storage for production credentials. Expo Go is sufficient for basic native UI work; native push notifications and production payment return handling need a configured development build.

## Customer flows in this app

- Branded home, dynamic menu categories/search/dishes and dish details sourced from the API
- Cart customizations, server-calculated checkout totals, delivery/pickup, cash, eSewa and Khalti initiation
- Account registration/login, secure token storage and refresh rotation
- Order history, guest order tracking, status history, delivery location link and pickup OTP when returned by the API
- Table reservation requests and event enquiries using API enums, venue details and backend request IDs
- Menu cache invalidation from the existing Supabase Realtime menu channel, with REST fallback

Prices, availability, payment status, order status, reservation status and event booking status are server-owned. Reservation/event success means the request was received; the restaurant must confirm it.

## Project structure

- `src/app/` — Expo Router routes and screens
- `src/services/api.ts` — typed API client and authentication refresh
- `src/services/realtime.ts` — authenticated menu updates
- `src/stores/` — session and cart state
- `src/theme/tokens.ts` — website-matched design tokens
- `AUDIT.md` — source backend contract notes
- `DEVELOPMENT_PROGRESS.md` — implementation and follow-up status
- `restaurant-ops/` — separate restaurant staff order console app

## Restaurant operations app

The staff client is a separate Expo app with staff-only login, a live and polling order queue, accept/decline actions and kitchen status updates. Run it from its own directory:

```powershell
cd restaurant-ops
npm install
npx expo start
```

The staff app is linked to the EAS project `@bistacreation/purplehaze-operations` and includes internal Android APK profiles. Remote push also needs Android FCM credentials in EAS, notification permission and a native development build. The app rings in the foreground while pending orders remain unacknowledged. See `restaurant-ops/README.md` for build and alert setup.

## Commands

```powershell
npm run lint
npm run typecheck
npx expo-doctor
```

Do not put backend secrets, Supabase service role keys, payment secrets or signing credentials in this mobile repository. Only public API configuration belongs in `EXPO_PUBLIC_*` variables.


