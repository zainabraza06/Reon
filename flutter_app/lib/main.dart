import 'package:firebase_core/firebase_core.dart';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:hive_flutter/hive_flutter.dart';
import 'package:provider/provider.dart';
import 'theme/app_theme.dart';
import 'services/api_service.dart';
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
        return const HomeScreen();
    }
  }
}
