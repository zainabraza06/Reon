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
import 'screens/chat_screen.dart';
import 'screens/group_chat_screen.dart';
import 'screens/login_screen.dart';
import 'screens/signup_screen.dart';
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
        navigatorKey: navigatorKey,
        home: const _Root(),
        onGenerateRoute: (settings) {
          if (settings.name == '/chat') {
            final args = settings.arguments as Map<String, dynamic>?;
            if (args != null) {
              return MaterialPageRoute(
                builder: (_) => ChatScreen(
                  userId: args['userId'] as String,
                  userName: args['userName'] as String? ?? 'Chat',
                ),
              );
            }
          }
          if (settings.name == '/group-chat') {
            final args = settings.arguments as Map<String, dynamic>?;
            if (args != null) {
              return MaterialPageRoute(
                builder: (_) => GroupChatScreen(
                  groupId: args['groupId'] as String,
                  groupName: args['groupName'] as String? ?? 'Group',
                ),
              );
            }
          }
          if (settings.name == '/link-device') {
            return MaterialPageRoute(
                builder: (_) => const LinkDeviceScreen());
          }
          return null;
        },
      );
}

class _Root extends StatefulWidget {
  const _Root({super.key});
  @override
  State<_Root> createState() => _RootState();
}

class _RootState extends State<_Root> {
  bool _showSignup = false;

  @override
  Widget build(BuildContext context) {
    final auth = context.watch<AuthProvider>();
    switch (auth.status) {
      case AuthStatus.unknown:
        return const Scaffold(body: Center(child: CircularProgressIndicator()));
      case AuthStatus.unauthenticated:
        if (_showSignup) {
          return SignupScreen(
            onSwitchToLogin: () => setState(() => _showSignup = false),
          );
        }
        return LoginScreen(
          onSwitchToSignup: () => setState(() => _showSignup = true),
        );
      case AuthStatus.authenticated:
        if (!auth.user!.isOnboarded) return const OnboardingScreen();
        if (auth.needsDeviceLink) return const _DeviceLinkGateScreen();
        return const HomeScreen();
    }
  }
}

/// Shown when the user logs in on a device that has no local private key but
/// the server already has a public key registered. Two recovery paths:
///   1. Scan QR from another linked device (normal linking flow).
///   2. "This is my original device" — regenerate keys (loses old messages).
class _DeviceLinkGateScreen extends StatefulWidget {
  const _DeviceLinkGateScreen();
  @override
  State<_DeviceLinkGateScreen> createState() => _DeviceLinkGateScreenState();
}

class _DeviceLinkGateScreenState extends State<_DeviceLinkGateScreen> {
  bool _resetting = false;

  Future<void> _resetKeys() async {
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (ctx) => AlertDialog(
        title: const Text('Reset Encryption Keys?'),
        content: const Text(
          'This will generate new encryption keys for your account.\n\n'
          'Your previous encrypted messages will no longer be readable, '
          'but you will be able to send and receive new messages normally.\n\n'
          'Only do this if this is truly your original device and you '
          'cannot scan a QR code from another device.',
        ),
        actions: [
          TextButton(
            onPressed: () => Navigator.pop(ctx, false),
            child: const Text('Cancel'),
          ),
          FilledButton(
            style: FilledButton.styleFrom(backgroundColor: Colors.orange),
            onPressed: () => Navigator.pop(ctx, true),
            child: const Text('Reset Keys'),
          ),
        ],
      ),
    );
    if (confirmed != true || !mounted) return;
    setState(() => _resetting = true);
    try {
      await context.read<AuthProvider>().resetKeys();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Failed to reset keys: $e')),
        );
        setState(() => _resetting = false);
      }
    }
  }

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
                'No encryption keys were found on this device. '
                'If you have another linked device, scan its QR code to transfer your keys.',
                textAlign: TextAlign.center,
                style: theme.textTheme.bodyMedium?.copyWith(
                    color: theme.colorScheme.onSurface.withAlpha(160)),
              ),
              const SizedBox(height: 8),
              Text(
                'On your other device: go to Settings → Link New Device.',
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
                onPressed: _resetting
                    ? null
                    : () async {
                        await Navigator.push(
                          context,
                          MaterialPageRoute(
                              builder: (_) => const LinkDeviceScreen()),
                        );
                        if (!context.mounted) return;
                        final hasKeys =
                            await CryptoService.instance.hasKeyPair();
                        if (hasKeys && context.mounted) {
                          context.read<AuthProvider>().clearNeedsDeviceLink();
                        }
                      },
              ),
              const SizedBox(height: 12),
              // Recovery path for users on their original device after reinstall
              OutlinedButton.icon(
                icon: _resetting
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : const Icon(Icons.devices_rounded, size: 18),
                label: Text(_resetting
                    ? 'Resetting…'
                    : 'This is my original device'),
                style: OutlinedButton.styleFrom(
                  minimumSize: const Size.fromHeight(48),
                  foregroundColor: Colors.orange,
                  side: const BorderSide(color: Colors.orange),
                ),
                onPressed: _resetting ? null : _resetKeys,
              ),
              const SizedBox(height: 16),
              TextButton(
                onPressed:
                    _resetting ? null : () => context.read<AuthProvider>().logout(),
                child: const Text('Log Out'),
              ),
            ],
          ),
        ),
      ),
    );
  }
}
