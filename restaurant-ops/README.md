# Purple Haze Operations

Separate Expo customer-free staff application for restaurant order acceptance, kitchen progress, dispatch, and administrative management.

## Run locally

```powershell
npm install
npx expo start
```

Sign in with an existing backend account whose role is `STAFF` or `ADMIN`. Staff see the focused order and delivery workspace. Administrators see an overview plus order, dispatch, menu availability, booking and rider management screens. Admin overview/report data is fetched only for `ADMIN` accounts. Both roles use the existing `admin-orders` Supabase Realtime channel and polling fallback for live operations.

The backend enforces the same boundary: staff can access order operations, dispatch, and the limited rider data needed to assign deliveries. Menu, bookings, reports, rider administration, promotions, settlements and settings require an administrator role. UI visibility is not the security boundary; API routes enforce these permissions.

## Industrial-Grade Order Alerts & Notifications

The app incorporates high-reliability order alerts modeled after leading restaurant POS systems (Zomato/Swiggy/DoorDash/Toast):

### 1. Audio Alarm & Vibration (Foreground)
- **Continuous Looping Alarm**: Plays `order_alert.wav` at max priority while orders await staff acceptance.
- **Urgent Foreground Haptics**: Uses `Vibration.vibrate([0, 800, 300, 800, 300, 1000], true)` so kitchen staff feel repeated pulses even in noisy kitchen environments.
- **Smart Auto-Rearming Snooze**: Silencing the alarm silences only the *current* pending batch. The moment a brand new order arrives, the alarm automatically wakes up, re-arms, rings loudly, and vibrates.
- **Web Autoplay Unlock**: Proactively detects browser autoplay policies on counter dashboards and provides an interactive "Enable Sound" banner to unlock the web audio context.

### 2. Multi-Channel Android Notification Architecture
- **`incoming-orders`** (MAX Importance): Custom `order_alert.wav`, alarm audio stream (`USAGE_ALARM`), DND bypass, lockscreen public visibility, and urgent vibration pattern.
- **`order-updates`** (HIGH Importance): Standard notifications for rider assignments, prep status, and pickups.
- **`booking-alerts`** (HIGH Importance): High-visibility notifications for new table reservations and event enquiries.
- **Local Fallback Dispatcher**: When a new pending order is detected via Realtime or 5-second queue polling, the app immediately dispatches a high-priority local notification as a safety net if background FCM push is delayed.

### 3. Global Floating Urgent Order Bar & Heads-Up Modal
- **Urgent Order Bar**: Floats across every screen and admin tab (Overview, Menu, Bookings, Riders, Delivery) whenever pending orders exist, showing the order count, wait timer for the oldest order, alarm state, and a 1-tap "View & Accept" button.
- **New Order Alert Modal**: Pops up an unmissable order card when a fresh order arrives with items summary, total price, customer details, and 1-tap Accept/Decline.
- **Visual Escalation Tiers**: Orders waiting > 2 minutes display an amber "WAITING" badge; orders waiting > 5 minutes display a pulsing crimson "CRITICAL DELAY" badge.

### 4. Admin Tab Notification Badges & Diagnostics
- **Live Tab Badges**: Real-time counter badges on Admin tabs for pending orders (`Orders [2]`), ready undispatched deliveries (`Delivery [1]`), and pending reservations/enquiries (`Bookings [3]`).
- **Alerts & Diagnostics Sheet**: One-tap tool to test the alarm speaker volume (3s sample ring), test device vibration, send a local test push to verify lockscreen appearance, inspect EAS push token, and review Android battery optimization tips.
- **Offline / Network Loss Defense**: Sticky red warning bar appears immediately if the restaurant Wi-Fi drops, warning staff that live orders cannot be received.
