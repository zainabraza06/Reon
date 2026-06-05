/// Central configuration. Override at build time with --dart-define.
///
/// Development (Android emulator):
///   flutter run --dart-define=API_BASE=http://10.0.2.2:5001/api --dart-define=SOCKET_URL=http://10.0.2.2:5001
///
/// Development (physical device on same LAN, replace with your PC IP):
///   flutter run --dart-define=API_BASE=http://192.168.x.x:5001/api --dart-define=SOCKET_URL=http://192.168.x.x:5001
///
/// Production (default):
///   flutter build apk   (uses the constants below)

const kApiBase   = String.fromEnvironment('API_BASE',   defaultValue: 'https://reon-4g0b.onrender.com/api');
const kSocketUrl = String.fromEnvironment('SOCKET_URL', defaultValue: 'https://reon-4g0b.onrender.com');
