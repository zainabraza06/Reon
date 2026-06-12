import 'dart:io';
import 'dart:typed_data';
import 'package:firebase_core/firebase_core.dart';
import 'package:firebase_messaging/firebase_messaging.dart';
import 'package:flutter/material.dart';
import 'package:flutter_local_notifications/flutter_local_notifications.dart';
import 'package:path_provider/path_provider.dart';
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

  // Set these to suppress foreground notifications while user is viewing a chat
  static String? activeGroupId;
  static String? activeChatId;
  // Set to the logged-in user's ID to suppress echoes of their own messages
  static String? currentUserId;

  // Stored when notification arrives before navigator is ready (cold start)
  static Map<String, dynamic>? _pendingNavigation;

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

    // App launched cold from a notification tap — store and navigate once ready
    final initial = await _fcm.getInitialMessage();
    if (initial != null) _handleNotificationTap(initial);

    // Upload FCM token to backend
    await _uploadToken();
    _fcm.onTokenRefresh.listen(_saveToken);
  }

  Future<void> _onForegroundMessage(RemoteMessage message) async {
    final n = message.notification;
    if (n == null) return;

    // Suppress if user is actively viewing this conversation
    final data = message.data;
    final msgGroupId = data['groupId'] as String?;
    // Backend may use different field names across event types
    final actorId = (data['senderId'] ?? data['actorId'] ?? data['userId']) as String?;

    if (msgGroupId != null && msgGroupId == activeGroupId) return;
    if (msgGroupId == null && actorId != null && actorId == activeChatId) return;

    // Suppress own messages/actions regardless of field name used for sender
    if (actorId != null && actorId == currentUserId) return;

    // Suppress group system events (add/remove/etc.) that the backend sends
    // without a groupId while the user is actively viewing a group chat.
    // These are always triggered by the user's own action so they're redundant.
    final msgType = data['type'] as String?;
    if (activeGroupId != null &&
        msgGroupId == null &&
        msgType != null &&
        msgType.startsWith('group')) return;

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
      payload: _payloadFrom(message.data),
    );
  }

  void _onLocalNotificationTap(NotificationResponse response) {
    final payload = response.payload;
    if (payload == null) return;
    // payload format: "type|id|name"
    final parts = payload.split('|');
    if (parts.length >= 3 && parts[0] == 'group') {
      _scheduleNavigation({'type': 'group', 'groupId': parts[1], 'groupName': parts[2]});
    } else if (parts.length >= 2) {
      // Legacy DM: "senderId|senderName"
      _scheduleNavigation({'type': 'dm', 'senderId': parts[0], 'senderName': parts[1]});
    }
  }

  void _handleNotificationTap(RemoteMessage message) {
    final data = message.data;
    final msgType = data['type'] as String?;

    if (msgType == 'group_message') {
      final groupId = data['groupId'] as String?;
      final groupName = data['groupName'] as String? ?? 'Group';
      if (groupId != null && groupId.isNotEmpty) {
        _scheduleNavigation({'type': 'group', 'groupId': groupId, 'groupName': groupName});
      }
    } else {
      final senderId = data['senderId'] as String?;
      final senderName = data['senderName'] as String? ??
          message.notification?.title ?? 'Chat';
      if (senderId != null && senderId.isNotEmpty) {
        _scheduleNavigation({'type': 'dm', 'senderId': senderId, 'senderName': senderName});
      }
    }
  }

  /// Stores the navigation intent and retries each frame until the navigator is ready.
  static void _scheduleNavigation(Map<String, dynamic> nav) {
    _pendingNavigation = nav;
    _attemptNavigation();
  }

  static void _attemptNavigation() {
    if (_pendingNavigation == null) return;
    final state = navigatorKey.currentState;
    if (state == null) {
      // Navigator not ready yet (cold start) — retry after next frame
      WidgetsBinding.instance.addPostFrameCallback((_) => _attemptNavigation());
      return;
    }
    final nav = _pendingNavigation!;
    _pendingNavigation = null;

    if (nav['type'] == 'group') {
      state.pushNamed('/group-chat', arguments: {
        'groupId': nav['groupId'] as String,
        'groupName': nav['groupName'] as String,
      });
    } else {
      state.pushNamed('/chat', arguments: {
        'userId': nav['senderId'] as String,
        'userName': nav['senderName'] as String,
      });
    }
  }

  String _payloadFrom(Map<String, dynamic> data) {
    final msgType = data['type'] as String?;
    if (msgType == 'group_message') {
      final groupId = data['groupId'] as String? ?? '';
      final groupName = data['groupName'] as String? ?? 'Group';
      return 'group|$groupId|$groupName';
    }
    // DM (legacy format kept for compatibility)
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

  // ── Static helper: save decrypted image bytes to device Pictures ─────────────

  static Future<void> saveImageToDevice(
      BuildContext context, Uint8List bytes, String? originalName) async {
    try {
      Directory dir;
      if (Platform.isAndroid) {
        // Use external storage Pictures folder
        final ext = Directory('/storage/emulated/0/Pictures/Reon');
        await ext.create(recursive: true);
        dir = ext;
      } else {
        dir = await getApplicationDocumentsDirectory();
      }
      final name = originalName ??
          'reon_${DateTime.now().millisecondsSinceEpoch}.jpg';
      final file = File('${dir.path}/$name');
      await file.writeAsBytes(bytes);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Image saved to ${file.path}')),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Save failed: $e')));
      }
    }
  }

  static Future<void> saveFileToDevice(
      BuildContext context, Uint8List bytes, String? fileName) async {
    try {
      final dir = await getDownloadsDirectory() ??
          await getApplicationDocumentsDirectory();
      final name = fileName ??
          'reon_file_${DateTime.now().millisecondsSinceEpoch}.bin';
      final file = File('${dir.path}/$name');
      await file.writeAsBytes(bytes);
      if (context.mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Saved to ${file.path}')),
        );
      }
    } catch (e) {
      if (context.mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Save failed: $e')));
      }
    }
  }
}
