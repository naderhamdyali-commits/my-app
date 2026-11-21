DeptDB Mobile - initial mobile companion prototype

1. This mobile prototype connects to the existing DeptDB desktop server. Start DeptDB on the PC as the database server.
2. Find the PC IPv4 address (e.g. 192.168.1.10) and use http://IP:4455 in the mobile app.
3. The existing desktop backend currently does not enable cross-origin requests (CORS). Before mobile-web/Capacitor connectivity, patch main.js to allow CORS requests and handle OPTIONS requests. See CORS-PATCH.txt.
4. Build Android APK:
   npm install
   npx cap add android
   npx cap sync android
   npx cap open android
   In Android Studio build APK.

This is a first prototype: record add/edit/delete and login are included; file attachments, import, reports and admin configuration are not yet implemented in this mobile interface.
