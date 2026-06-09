import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import '../services/api_service.dart';

// Global key so notification taps can push routes without a BuildContext
final navigatorKey = GlobalKey<NavigatorState>();

// Top-level handler required by FCM for background messages
@pragma('vm:entry-point')
Future<void> _firebaseMessagingBackgroundHandler(RemoteMessage message) async {
  await Firebase.initializeApp();
}

class NotificationService {
  NotificationService._();
  static final NotificationService instance = NotificationService._();

  final _fcm = FirebaseMessaging.instance;
  final _local = FlutterLocalNotificationsPlugin();

  static const _channelId = 'reon_messages';
  static const _channelName = 'Messages';

  Future<void> init() async {
    FirebaseMessaging.onBackgroundMessage(_firebaseMessagingBackgroundHandler);

    // Request permission (iOS + Android 13+)
    await _fcm.requestPermission(alert: true, badge: true, sound: true);

    // Local notifications plugin setup
    const android = AndroidInitializationSettings('@mipmap/ic_launcher');
    const ios = DarwinInitializationSettings();
    await _local.initialize(
      const InitializationSettings(android: android, iOS: ios),
      onDidReceiveNotificationResponse: _onLocalNotificationTap,
    );

    // Android high-importance channel
    const channel = AndroidNotificationChannel(
      _channelId,
      _channelName,
      importance: Importance.high,
      enableVibration: true,
    );
    await _local
        .resolvePlatformSpecificImplementation<
            AndroidFlutterLocalNotificationsPlugin>()
        ?.createNotificationChannel(channel);

    // Foreground message: show a local notification
    FirebaseMessaging.onMessage.listen(_onForegroundMessage);

    // App opened by tapping a notification while in background
    FirebaseMessaging.onMessageOpenedApp.listen(_handleNotificationTap);

    // App launched cold from a notification
    final initial = await _fcm.getInitialMessage();
    if (initial != null) _handleNotificationTap(initial);

    // Upload FCM token to backend
    await _uploadToken();
    _fcm.onTokenRefresh.listen(_saveToken);
  }

  Future<void> _onForegroundMessage(RemoteMessage message) async {
    final n = message.notification;
    if (n == null) return;
    await _local.show(
      message.hashCode,
      n.title,
      n.body,
      NotificationDetails(
        android: const AndroidNotificationDetails(
          _channelId,
          _channelName,
          importance: Importance.high,
          priority: Priority.high,
        ),
        iOS: const DarwinNotificationDetails(),
      ),
      // Embed FCM data so local-notification tap can also route
      payload: _payloadFrom(message.data),
    );
  }

  void _onLocalNotificationTap(NotificationResponse response) {
    final payload = response.payload;
    if (payload == null) return;
    // payload format: "senderId|senderName"
    final parts = payload.split('|');
    if (parts.length >= 2) {
      _navigateToChat(senderId: parts[0], senderName: parts[1]);
    }
  }

  void _handleNotificationTap(RemoteMessage message) {
    final data = message.data;
    final senderId = data['senderId'] as String?;
    final senderName = data['senderName'] as String? ??
        message.notification?.title ?? 'Chat';
    if (senderId != null && senderId.isNotEmpty) {
      _navigateToChat(senderId: senderId, senderName: senderName);
    }
  }

  void _navigateToChat(
      {required String senderId, required String senderName}) {
    // Defer until the navigator is ready (e.g. on cold start)
    WidgetsBinding.instance.addPostFrameCallback((_) {
      navigatorKey.currentState?.pushNamed(
        '/chat',
        arguments: {'userId': senderId, 'userName': senderName},
      );
    });
  }

  String _payloadFrom(Map<String, dynamic> data) {
    final id = data['senderId'] as String? ?? '';
    final name = data['senderName'] as String? ?? 'Chat';
    return '$id|$name';
  }

  Future<void> _uploadToken() async {
    final token = await _fcm.getToken();
    if (token != null) await _saveToken(token);
  }

  Future<void> _saveToken(String token) async {
    try {
      await ApiService.instance.updateFcmToken(token);
    } catch (_) {}
  }

  Future<void> deleteToken() async {
    await _fcm.deleteToken();
  }
}
