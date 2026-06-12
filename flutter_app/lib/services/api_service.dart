import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import 'package:flutter/foundation.dart' show kIsWeb;
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import '../config.dart';
import '../models/user.dart';
import '../models/message.dart';
import '../models/chat_list_item.dart';
import '../models/friend_request.dart';
import '../models/group_chat.dart';
import '../models/notification.dart';
import '../models/recommended_user.dart';

class ApiException implements Exception {
  final String message;
  final int? statusCode;
  const ApiException(this.message, [this.statusCode]);
  @override
  String toString() => message;
}

class ApiService {
  ApiService._();
  static final ApiService instance = ApiService._();

  late final Dio _dio;
  final _cookieJar = CookieJar();
  String? _bearerToken;
  static const _storage = FlutterSecureStorage();
  static const _kToken = 'reon_bearer_token';

  void init() {
    _dio = Dio(BaseOptions(
      baseUrl: kApiBase,
      connectTimeout:
          const Duration(seconds: 90), // Render free tier cold-start
      receiveTimeout: const Duration(seconds: 120),
      headers: {'Content-Type': 'application/json'},
      validateStatus: (_) => true,
      extra: kIsWeb ? {'withCredentials': true} : {},
    ));
    if (!kIsWeb) {
      _dio.interceptors.add(CookieManager(_cookieJar));
    }
    // On web, cookies with Secure flag can't be sent to http://localhost.
    // Inject the JWT as a Bearer header instead.
    _dio.interceptors.add(InterceptorsWrapper(
      onRequest: (opts, handler) {
        if (kIsWeb && _bearerToken != null) {
          opts.headers['Authorization'] = 'Bearer $_bearerToken';
        }
        handler.next(opts);
      },
    ));
  }

  /// Load a previously persisted token (call before checkAuth on app start).
  Future<void> loadSavedToken() async {
    if (!kIsWeb) return;
    _bearerToken = await _storage.read(key: _kToken);
  }

  void _storeToken(Map<String, dynamic> res) {
    if (kIsWeb) {
      final t = res['token'] as String?;
      if (t != null) {
        _bearerToken = t;
        _storage.write(key: _kToken, value: t);
      }
    }
  }

  void clearToken() {
    _bearerToken = null;
    if (kIsWeb) _storage.delete(key: _kToken);
  }

  Future<Map<String, dynamic>> _req(String method, String path,
      {dynamic body, Map<String, String>? headers}) async {
    final opts = Options(method: method, headers: headers);
    final res = await _dio.request(path, data: body, options: opts);
    if (res.statusCode != null &&
        res.statusCode! >= 200 &&
        res.statusCode! < 300) {
      return res.data is Map
          ? Map<String, dynamic>.from(res.data as Map)
          : {'data': res.data};
    }
    final data = res.data is Map ? res.data as Map : null;
    final msg = data?['message'] as String? ??
        (data?['errors'] as List?)?.firstOrNull?['msg'] as String? ??
        'Request failed';
    throw ApiException(msg, res.statusCode);
  }

  Future<Map<String, dynamic>> _get(String path) => _req('GET', path);
  Future<Map<String, dynamic>> _post(String path, {dynamic body}) =>
      _req('POST', path, body: body);
  Future<Map<String, dynamic>> _put(String path, {dynamic body}) =>
      _req('PUT', path, body: body);
  Future<Map<String, dynamic>> _del(String path) => _req('DELETE', path);
  Future<Map<String, dynamic>> _patch(String path) => _req('PATCH', path);

  // ── Auth ──────────────────────────────────────────────────────────────────────

  Future<ReonUser> login(String email, String password) async {
    final res = await _post('/auth/login',
        body: {'email': email, 'password': password});
    _storeToken(res);
    return ReonUser.fromJson(res['user'] as Map<String, dynamic>);
  }

  Future<void> signup(String fullName, String email, String password) async {
    await _post('/auth/signup',
        body: {'fullName': fullName, 'email': email, 'password': password});
  }

  Future<ReonUser> loginWithGoogle(String idToken) async {
    final res = await _post('/auth/google-mobile', body: {'idToken': idToken});
    _storeToken(res);
    return ReonUser.fromJson(res['user'] as Map<String, dynamic>);
  }

  Future<ReonUser> me() async {
    final res = await _get('/auth/me');
    return ReonUser.fromJson(res['user'] as Map<String, dynamic>);
  }

  Future<void> logout() async {
    await _post('/auth/logout');
    clearToken();
  }

  Future<ReonUser> onboard(
      {required String username,
      required String nativeLanguage,
      String? bio,
      String? location,
      String? imagePath}) async {
    late Response res;
    if (imagePath != null) {
      final form = FormData.fromMap({
        'username': username,
        'nativeLanguage': nativeLanguage,
        if (bio != null && bio.isNotEmpty) 'bio': bio,
        if (location != null && location.isNotEmpty) 'location': location,
        'profilePic': await MultipartFile.fromFile(imagePath),
      });
      res = await _dio.post('/auth/onboard', data: form);
    } else {
      res = await _dio.post('/auth/onboard',
          data: {
            'username': username,
            'nativeLanguage': nativeLanguage,
            if (bio != null && bio.isNotEmpty) 'bio': bio,
            if (location != null && location.isNotEmpty) 'location': location,
          },
          options: Options(headers: {'Content-Type': 'application/json'}));
    }
    if (res.statusCode != null &&
        res.statusCode! >= 200 &&
        res.statusCode! < 300) {
      return ReonUser.fromJson(
          (res.data as Map)['user'] as Map<String, dynamic>);
    }
    throw ApiException(
        (res.data as Map?)?['message'] as String? ?? 'Onboarding failed',
        res.statusCode);
  }

  // ── Keys ──────────────────────────────────────────────────────────────────────

  Future<void> uploadPublicKey(
      Map<String, dynamic> publicKeyJwk, String userId) async {
    await _post('/keys/uploadPublicKey',
        body: {'publicKey': publicKeyJwk, 'userId': userId});
  }

  Future<Map<String, dynamic>> getPublicKey(String userId) async {
    final res = await _get('/keys/publicKey/$userId');
    return res['publicKey'] as Map<String, dynamic>;
  }

  Future<String?> tryGetPublicKey(String userId) async {
    try {
      final k = await getPublicKey(userId);
      return jsonEncode(k);
    } catch (_) {
      return null;
    }
  }

  // ── Messages ──────────────────────────────────────────────────────────────────

  Future<List<ChatListItem>> getSidebarChats() async {
    final res = await _get('/messages/sidebar/list');
    final list = res['chats'] as List? ?? [];
    return list
        .map((c) => ChatListItem.fromJson(c as Map<String, dynamic>))
        .toList();
  }

  Future<({List<ChatMessage> messages, bool hasMore})> getMessages(
      String receiverId,
      {int limit = 50, String? before}) async {
    var path = '/messages/$receiverId?limit=$limit';
    if (before != null) path += '&before=${Uri.encodeQueryComponent(before)}';
    final res = await _get(path);
    final list = (res['data'] ?? res['messages']) as List? ?? [];
    final hasMore = res['hasMore'] as bool? ?? (list.length >= limit);
    return (
      messages: list
          .map((m) => ChatMessage.fromJson(m as Map<String, dynamic>))
          .toList(),
      hasMore: hasMore,
    );
  }

  Future<ChatMessage> sendMessage(FormData formData) async {
    final res = await _dio.post('/messages/send',
        data: formData,
        options: Options(headers: {'Content-Type': 'multipart/form-data'}));
    if (res.statusCode != null &&
        res.statusCode! >= 200 &&
        res.statusCode! < 300) {
      final data = res.data as Map;
      return ChatMessage.fromJson(
          (data['data'] ?? data) as Map<String, dynamic>);
    }
    throw ApiException(
        (res.data as Map?)?['message'] as String? ?? 'Send failed',
        res.statusCode);
  }

  Future<void> markChatRead(String userId) =>
      _put('/messages/chat/read/$userId');

  /// Downloads raw (encrypted) bytes for a media file.
  /// [url] is the relative path returned by the server, e.g. /api/messages/media/abc
  Future<Uint8List> downloadMedia(String url) async {
    final fullUrl =
        url.startsWith('http') ? url : '${kApiBase.replaceAll(RegExp(r'/api$'), '')}$url';
    final res = await _dio.get<List<int>>(fullUrl,
        options: Options(responseType: ResponseType.bytes));
    if (res.statusCode == 200 && res.data != null) {
      return Uint8List.fromList(res.data!);
    }
    throw ApiException('Media download failed', res.statusCode);
  }

  Future<Map<String, dynamic>> getMessageInfo(String messageId) =>
      _get('/messages/$messageId/info');

  // ── Friends ───────────────────────────────────────────────────────────────────

  Future<List<ReonUser>> getFriends() async {
    final res = await _get('/users/friends');
    final list = res['friends'] as List? ?? [];
    return list
        .map((u) => ReonUser.fromJson(u as Map<String, dynamic>))
        .toList();
  }

  Future<List<FriendRequest>> getReceivedRequests() async {
    final res = await _get('/users/friend-requests/received');
    final list = res['requests'] as List? ?? [];
    return list
        .map((r) => FriendRequest.fromJson(r as Map<String, dynamic>))
        .toList();
  }

  Future<List<FriendRequest>> getSentRequests() async {
    final res = await _get('/users/friend-requests/sent');
    final list = res['requests'] as List? ?? [];
    return list
        .map((r) => FriendRequest.fromJson(r as Map<String, dynamic>))
        .toList();
  }

  Future<int> getPendingCount() async {
    final res = await _get('/users/friend-request/pending-count');
    return (res['pendingCount'] ?? res['count'] ?? 0) as int;
  }

  Future<void> sendFriendRequest(String userId) =>
      _post('/users/friend-request/$userId');
  Future<void> acceptFriendRequest(String requestId) =>
      _post('/users/friend-request/$requestId/accept');
  Future<void> rejectFriendRequest(String requestId) =>
      _del('/users/friend-request/$requestId');
  Future<void> withdrawFriendRequest(String requestId) =>
      _post('/users/friend-request/$requestId/withdraw');
  Future<void> removeFriend(String userId) => _patch('/users/friends/$userId');

  Future<List<ReonUser>> searchUsers(String query) async {
    final res =
        await _get('/messages/search?q=${Uri.encodeQueryComponent(query)}');
    final list = res['users'] as List? ?? [];
    return list
        .map((u) => ReonUser.fromJson(u as Map<String, dynamic>))
        .toList();
  }

  // ── Groups ────────────────────────────────────────────────────────────────────

  Future<List<GroupChat>> getGroups() async {
    final res = await _get('/groups');
    final list = res['groups'] as List? ?? [];
    return list
        .map((g) => GroupChat.fromJson(g as Map<String, dynamic>))
        .toList();
  }

  Future<GroupChat> getGroup(String id) async {
    final res = await _get('/groups/$id');
    return GroupChat.fromJson(res['group'] as Map<String, dynamic>);
  }

  Future<GroupChat> createGroup(
      {required String name,
      String? description,
      required List<String> memberIds}) async {
    final res = await _post('/groups', body: {
      'name': name,
      'description': description ?? '',
      'memberIds': memberIds
    });
    return GroupChat.fromJson(res['group'] as Map<String, dynamic>);
  }

  Future<({List<GroupMessage> messages, bool hasMore})> getGroupMessages(
      String groupId,
      {int limit = 50, String? before}) async {
    var path = '/groups/$groupId/messages?limit=$limit';
    if (before != null) path += '&before=${Uri.encodeQueryComponent(before)}';
    final res = await _get(path);
    final list = res['messages'] as List? ?? [];
    final hasMore = res['hasMore'] as bool? ?? (list.length >= limit);
    return (
      messages: list
          .map((m) => GroupMessage.fromJson(m as Map<String, dynamic>))
          .toList(),
      hasMore: hasMore,
    );
  }

  Future<GroupMessage> sendGroupMessage(
      String groupId, FormData formData) async {
    final res = await _dio.post('/groups/$groupId/messages',
        data: formData,
        options: Options(headers: {'Content-Type': 'multipart/form-data'}));
    if (res.statusCode != null &&
        res.statusCode! >= 200 &&
        res.statusCode! < 300) {
      return GroupMessage.fromJson(
          (res.data as Map)['message'] as Map<String, dynamic>);
    }
    throw ApiException(
        (res.data as Map?)?['message'] as String? ?? 'Send failed',
        res.statusCode);
  }

  Future<void> markGroupRead(String groupId) => _put('/groups/$groupId/read');

  Future<GroupChat> updateGroup(String groupId,
          {required String name, required String description}) async {
    final res = await _put('/groups/$groupId',
        body: {'name': name, 'description': description});
    return GroupChat.fromJson(res['group'] as Map<String, dynamic>);
  }

  Future<GroupChat> addGroupMembers(
      String groupId, List<String> memberIds) async {
    final res =
        await _post('/groups/$groupId/members', body: {'memberIds': memberIds});
    return GroupChat.fromJson(res['group'] as Map<String, dynamic>);
  }

  Future<void> removeGroupMember(String groupId, String memberId) =>
      _del('/groups/$groupId/members/$memberId');

  Future<GroupChat> toggleGroupAdmin(String groupId, String memberId) async {
    final res = await _patch('/groups/$groupId/admins/$memberId');
    return GroupChat.fromJson(res['group'] as Map<String, dynamic>);
  }

  Future<GroupChat> updateGroupAvatar(
      String groupId, String imagePath) async {
    final form = FormData.fromMap({
      'avatar': await MultipartFile.fromFile(imagePath),
    });
    final res = await _dio.patch('/groups/$groupId/avatar', data: form);
    if (res.statusCode != null &&
        res.statusCode! >= 200 &&
        res.statusCode! < 300) {
      final data = res.data is Map
          ? Map<String, dynamic>.from(res.data as Map)
          : <String, dynamic>{};
      return GroupChat.fromJson(data['group'] as Map<String, dynamic>);
    }
    final data = res.data is Map ? res.data as Map : null;
    throw ApiException(
        data?['message'] as String? ?? 'Avatar update failed', res.statusCode);
  }

  Future<void> deleteGroup(String groupId) => _del('/groups/$groupId');

  Future<Map<String, dynamic>> getGroupMessageInfo(String messageId) =>
      _get('/groups/messages/$messageId/info');

  // ── Recommendations ───────────────────────────────────────────────────────────

  Future<({List<RecommendedUser> users, int total})> getRecommendations({
    String search = '',
    int page = 1,
    int limit = 12,
  }) async {
    var path = '/users/recommendation?page=$page&limit=$limit';
    if (search.isNotEmpty) {
      path += '&search=${Uri.encodeQueryComponent(search)}';
    }
    final res = await _get(path);
    final list = res['recommended'] as List? ?? [];
    return (
      users: list
          .map((u) => RecommendedUser.fromJson(u as Map<String, dynamic>))
          .toList(),
      total: (res['total'] as int?) ?? list.length,
    );
  }

  // ── Notifications ─────────────────────────────────────────────────────────────

  Future<List<AppNotification>> getNotifications() async {
    final res = await _get('/notifications');
    final list = res['notifications'] as List? ?? [];
    return list
        .map((n) => AppNotification.fromJson(n as Map<String, dynamic>))
        .toList();
  }

  Future<AppNotification> createNotification({
    required String type,
    required String title,
    required String body,
    String? avatar,
    String? link,
  }) async {
    final res = await _post('/notifications', body: {
      'type': type,
      'title': title,
      'body': body,
      if (avatar != null) 'avatar': avatar,
      if (link != null) 'link': link,
    });
    return AppNotification.fromJson(res['notification'] as Map<String, dynamic>);
  }

  Future<void> markNotificationRead(String id) =>
      _patch('/notifications/$id/read');
  Future<void> markAllNotificationsRead() => _patch('/notifications/read-all');
  Future<void> deleteNotification(String id) => _del('/notifications/$id');
  Future<void> clearNotifications() => _del('/notifications');

  // ── Settings ──────────────────────────────────────────────────────────────────

  Future<ReonUser> updateProfile({
    required String fullName,
    String? bio,
    String? location,
    String? imagePath,
  }) async {
    final form = FormData.fromMap({
      'fullName': fullName,
      if (bio != null) 'bio': bio,
      if (location != null) 'location': location,
      if (imagePath != null)
        'profilePic': await MultipartFile.fromFile(imagePath),
    });
    final res = await _dio.put('/settings/profile', data: form);
    if (res.statusCode != null &&
        res.statusCode! >= 200 &&
        res.statusCode! < 300) {
      return ReonUser.fromJson(
          (res.data as Map)['user'] as Map<String, dynamic>);
    }
    throw ApiException(
        (res.data as Map?)?['message'] as String? ?? 'Update failed',
        res.statusCode);
  }

  Future<void> changePassword(
      {required String currentPassword, required String newPassword}) async {
    await _put('/settings/change-password', body: {
      'currentPassword': currentPassword,
      'newPassword': newPassword,
    });
  }

  Future<void> updateFcmToken(String token) =>
      _put('/settings/fcm-token', body: {'fcmToken': token});

  Future<ReonUser> updatePrivacy(
      {bool? showLastSeen, bool? showActiveStatus}) async {
    final res = await _req('PATCH', '/settings/privacy', body: {
      if (showLastSeen != null) 'showLastSeen': showLastSeen,
      if (showActiveStatus != null) 'showActiveStatus': showActiveStatus,
    });
    return ReonUser.fromJson(res['user'] as Map<String, dynamic>);
  }

  // ── Device linking ────────────────────────────────────────────────────────────

  Future<String> createLinkSession(Map<String, dynamic> ecdhPublicKey) async {
    final res = await _post('/keys/link-session/create',
        body: {'ecdhPublicKey': ecdhPublicKey});
    return res['sessionId'] as String;
  }

  Future<Map<String, dynamic>> claimLinkSession(
      String sessionId, Map<String, dynamic> ecdhPublicKey) async {
    final res = await _req('PUT', '/keys/link-session/$sessionId/claim',
        body: {'ecdhPublicKey': ecdhPublicKey});
    return res['ecdhPublicKey_A'] as Map<String, dynamic>;
  }

  Future<void> transferLinkKey(
      String sessionId, String encryptedPrivateKey, String iv) async {
    await _req('PUT', '/keys/link-session/$sessionId/transfer', body: {
      'encryptedPrivateKey': encryptedPrivateKey,
      'iv': iv,
    });
  }

  Future<({String status, String? encryptedPrivateKey, String? iv})>
      getLinkSession(String sessionId) async {
    final res = await _get('/keys/link-session/$sessionId');
    return (
      status: res['status'] as String,
      encryptedPrivateKey: res['encryptedPrivateKey'] as String?,
      iv: res['iv'] as String?,
    );
  }
}
