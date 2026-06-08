import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:provider/provider.dart';
import 'theme/app_theme.dart';
import 'services/api_service.dart';
import 'services/crypto_service.dart';
import 'services/notification_service.dart';
import 'services/message_cache_service.dart';
import 'providers/auth_provider.dart';
import 'screens/login_screen.dart';
import 'screens/onboarding_screen.dart';
import 'screens/home_screen.dart';
import 'screens/link_device_screen.dart';

Future<void> main() async {
  WidgetsFlutterBinding.ensureInitialized();

  // Hive local database
  await Hive.initFlutter();
  await MessageCacheService.instance.init();

  // Firebase (FCM) — safe to call even without google-services.json in dev
  try {
    await Firebase.initializeApp();
    await NotificationService.instance.init();
  } catch (_) {
    // Firebase not configured — push notifications disabled
  }

  ApiService.instance.init();

  SystemChrome.setSystemUIOverlayStyle(const SystemUiOverlayStyle(
    statusBarColor: Colors.transparent,
    statusBarIconBrightness: Brightness.light,
  ));

  runApp(
    ChangeNotifierProvider(
      create: (_) => AuthProvider()..checkAuth(),
      child: const ReonApp(),
    ),
  );
}

class ReonApp extends StatelessWidget {
  const ReonApp({super.key});

  @override
  Widget build(BuildContext context) => MaterialApp(
        title: 'Reon',
        debugShowCheckedModeBanner: false,
        theme: AppTheme.light,
        darkTheme: AppTheme.dark,
        themeMode: ThemeMode.system,
        home: const _Root(),
        routes: {
          '/link-device': (_) => const LinkDeviceScreen(),
        },
      );
}

class _Root extends StatelessWidget {
  const _Root();

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    switch (auth.status) {
      case AuthStatus.unknown:
        return const Scaffold(body: Center(child: CircularProgressIndicator()));
      case AuthStatus.unauthenticated:
        return const LoginScreen();
      case AuthStatus.authenticated:
        if (!auth.user!.isOnboarded) return const OnboardingScreen();
        if (auth.needsDeviceLink) return const _DeviceLinkGateScreen();
        return const HomeScreen();
    }
  }
}

/// Shown when the user logs in on a device that hasn't been linked yet.
/// Their encryption keys live on another device and must be transferred
/// via the QR-code flow before they can read encrypted messages.
class _DeviceLinkGateScreen extends StatelessWidget {
  const _DeviceLinkGateScreen();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Scaffold(
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(horizontal: 32, vertical: 24),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.lock_rounded, size: 72, color: Colors.teal),
              const SizedBox(height: 24),
              Text(
                'Link This Device',
                style: theme.textTheme.headlineSmall
                    ?.copyWith(fontWeight: FontWeight.bold),
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: 16),
              Text(
                'Your encryption keys are stored on your original device. '
                'To read your encrypted messages here, scan the QR code from your other device.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurface.withAlpha(160)),
              ),
              const SizedBox(height: 8),
              Text(
                'On your original device: go to Settings → Link New Device.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodySmall?.copyWith(
                    color: theme.colorScheme.onSurface.withAlpha(120)),
              ),
              const SizedBox(height: 36),
              FilledButton.icon(
                icon: const Icon(Icons.qr_code_scanner_rounded),
                label: const Text('Scan QR Code to Link'),
                style: FilledButton.styleFrom(
                  minimumSize: const Size.fromHeight(48),
                ),
                onPressed: () async {
                  await Navigator.push(
                    context,
                    MaterialPageRoute(builder: (_) => const LinkDeviceScreen()),
                  );
                  if (!context.mounted) return;
                  // If keys are now present, linking succeeded — clear the gate
                  final hasKeys = await CryptoService.instance.hasKeyPair();
                  if (hasKeys && context.mounted) {
                    context.read<AuthProvider>().clearNeedsDeviceLink();
                  }
                },
              ),
              const SizedBox(height: 16),
              TextButton(
                onPressed: () => context.read<AuthProvider>().logout(),
                child: const Text('Log Out'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
