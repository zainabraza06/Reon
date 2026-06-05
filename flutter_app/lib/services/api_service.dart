import 'dart:convert';
import 'package:dio/dio.dart';
import 'package:cookie_jar/cookie_jar.dart';
import 'package:dio_cookie_manager/dio_cookie_manager.dart';
import '../config.dart';
import '../models/user.dart';
import '../models/message.dart';
import '../models/chat_list_item.dart';
import '../models/friend_request.dart';
import '../models/group_chat.dart';

class ApiException implements Exception {
  final String message;
  final int? statusCode;
  const ApiException(this.message, [this.statusCode]);
  @override String toString() => message;
}

class ApiService {
  ApiService._();
  static final ApiService instance = ApiService._();

  late final Dio _dio;
  final _cookieJar = CookieJar();

  void init() {
    _dio = Dio(BaseOptions(
      baseUrl: kApiBase,
      connectTimeout: const Duration(seconds: 15),
      receiveTimeout: const Duration(seconds: 30),
      headers: {'Content-Type': 'application/json'},
      validateStatus: (_) => true, // handle errors manually
    ));
    _dio.interceptors.add(CookieManager(_cookieJar));
  }

  Future<Map<String, dynamic>> _req(String method, String path, {dynamic body, Map<String, String>? headers}) async {
    final opts = Options(method: method, headers: headers);
    final res = await _dio.request(path, data: body, options: opts);
    if (res.statusCode != null && res.statusCode! >= 200 && res.statusCode! < 300) {
      return res.data is Map ? Map<String, dynamic>.from(res.data as Map) : {'data': res.data};
    }
    final msg = (res.data is Map ? (res.data as Map)['message'] : null) as String? ?? 'Request failed';
    throw ApiException(msg, res.statusCode);
  }

  Future<Map<String, dynamic>> _get(String path)                => _req('GET', path);
  Future<Map<String, dynamic>> _post(String path, {dynamic body}) => _req('POST', path, body: body);
  Future<Map<String, dynamic>> _put(String path, {dynamic body})  => _req('PUT', path, body: body);
  Future<Map<String, dynamic>> _del(String path)                  => _req('DELETE', path);
  Future<Map<String, dynamic>> _patch(String path)                => _req('PATCH', path);

  // ── Auth ──────────────────────────────────────────────────────────────────────

  Future<ReonUser> login(String email, String password) async {
    final res = await _post('/auth/login', body: {'email': email, 'password': password});
    return ReonUser.fromJson(res['user'] as Map<String, dynamic>);
  }

  Future<void> signup(String fullName, String email, String password) async {
    await _post('/auth/signup', body: {'fullName': fullName, 'email': email, 'password': password});
  }

  Future<ReonUser> me() async {
    final res = await _get('/auth/me');
    return ReonUser.fromJson(res['user'] as Map<String, dynamic>);
  }

  Future<void> logout() => _post('/auth/logout');

  Future<void> onboard({required String username, required String nativeLanguage, String? bio, String? location}) async {
    await _post('/auth/onboard', body: {
      'username': username,
      'nativeLanguage': nativeLanguage,
      if (bio != null) 'bio': bio,
      if (location != null) 'location': location,
    });
  }

  // ── Keys ──────────────────────────────────────────────────────────────────────

  Future<void> uploadPublicKey(Map<String, dynamic> publicKeyJwk, String userId) async {
    await _post('/keys/uploadPublicKey', body: {'publicKey': publicKeyJwk, 'userId': userId});
  }

  Future<Map<String, dynamic>> getPublicKey(String userId) async {
    final res = await _get('/keys/publicKey/$userId');
    return res['publicKey'] as Map<String, dynamic>;
  }

  Future<String?> tryGetPublicKey(String userId) async {
    try {
      final k = await getPublicKey(userId);
      return jsonEncode(k);
    } catch (_) { return null; }
  }

  // ── Messages ──────────────────────────────────────────────────────────────────

  Future<List<ChatListItem>> getSidebarChats() async {
    final res = await _get('/messages/sidebar/list');
    final list = res['chats'] as List? ?? [];
    return list.map((c) => ChatListItem.fromJson(c as Map<String, dynamic>)).toList();
  }

  Future<List<ChatMessage>> getMessages(String receiverId, {int limit = 50, String? before}) async {
    var path = '/messages/$receiverId?limit=$limit';
    if (before != null) path += '&before=${Uri.encodeQueryComponent(before)}';
    final res = await _get(path);
    final list = (res['data'] ?? res['messages']) as List? ?? [];
    return list.map((m) => ChatMessage.fromJson(m as Map<String, dynamic>)).toList();
  }

  Future<ChatMessage> sendMessage(FormData formData) async {
    final res = await _dio.post('/messages/send', data: formData,
        options: Options(headers: {'Content-Type': 'multipart/form-data'}));
    if (res.statusCode != null && res.statusCode! >= 200 && res.statusCode! < 300) {
      final data = res.data as Map;
      return ChatMessage.fromJson((data['data'] ?? data) as Map<String, dynamic>);
    }
    throw ApiException((res.data as Map?)?['message'] as String? ?? 'Send failed', res.statusCode);
  }

  Future<void> markChatRead(String userId) => _put('/messages/chat/read/$userId');

  Future<Map<String, dynamic>> getMessageInfo(String messageId) => _get('/messages/$messageId/info');

  // ── Friends ───────────────────────────────────────────────────────────────────

  Future<List<ReonUser>> getFriends() async {
    final res = await _get('/users/friends');
    final list = res['friends'] as List? ?? [];
    return list.map((u) => ReonUser.fromJson(u as Map<String, dynamic>)).toList();
  }

  Future<List<FriendRequest>> getReceivedRequests() async {
    final res = await _get('/users/friend-requests/received');
    final list = res['requests'] as List? ?? [];
    return list.map((r) => FriendRequest.fromJson(r as Map<String, dynamic>)).toList();
  }

  Future<List<FriendRequest>> getSentRequests() async {
    final res = await _get('/users/friend-requests/sent');
    final list = res['requests'] as List? ?? [];
    return list.map((r) => FriendRequest.fromJson(r as Map<String, dynamic>)).toList();
  }

  Future<int> getPendingCount() async {
    final res = await _get('/users/friend-request/pending-count');
    return (res['pendingCount'] ?? res['count'] ?? 0) as int;
  }

  Future<void> sendFriendRequest(String userId)     => _post('/users/friend-request/$userId');
  Future<void> acceptFriendRequest(String requestId) => _post('/users/friend-request/$requestId/accept');
  Future<void> rejectFriendRequest(String requestId) => _del('/users/friend-request/$requestId');
  Future<void> withdrawFriendRequest(String requestId) => _post('/users/friend-request/$requestId/withdraw');
  Future<void> removeFriend(String userId)           => _patch('/users/friends/$userId');

  Future<List<ReonUser>> searchUsers(String query) async {
    final res = await _get('/messages/search?q=${Uri.encodeQueryComponent(query)}');
    final list = res['users'] as List? ?? [];
    return list.map((u) => ReonUser.fromJson(u as Map<String, dynamic>)).toList();
  }

  // ── Groups ────────────────────────────────────────────────────────────────────

  Future<List<GroupChat>> getGroups() async {
    final res = await _get('/groups');
    final list = res['groups'] as List? ?? [];
    return list.map((g) => GroupChat.fromJson(g as Map<String, dynamic>)).toList();
  }

  Future<GroupChat> getGroup(String id) async {
    final res = await _get('/groups/$id');
    return GroupChat.fromJson(res['group'] as Map<String, dynamic>);
  }

  Future<GroupChat> createGroup({required String name, String? description, required List<String> memberIds}) async {
    final res = await _post('/groups', body: {'name': name, 'description': description ?? '', 'memberIds': memberIds});
    return GroupChat.fromJson(res['group'] as Map<String, dynamic>);
  }

  Future<List<GroupMessage>> getGroupMessages(String groupId, {int limit = 50, String? before}) async {
    var path = '/groups/$groupId/messages?limit=$limit';
    if (before != null) path += '&before=${Uri.encodeQueryComponent(before)}';
    final res = await _get(path);
    final list = res['messages'] as List? ?? [];
    return list.map((m) => GroupMessage.fromJson(m as Map<String, dynamic>)).toList();
  }

  Future<GroupMessage> sendGroupMessage(String groupId, FormData formData) async {
    final res = await _dio.post('/groups/$groupId/messages', data: formData,
        options: Options(headers: {'Content-Type': 'multipart/form-data'}));
    if (res.statusCode != null && res.statusCode! >= 200 && res.statusCode! < 300) {
      return GroupMessage.fromJson((res.data as Map)['message'] as Map<String, dynamic>);
    }
    throw ApiException((res.data as Map?)?['message'] as String? ?? 'Send failed', res.statusCode);
  }

  Future<void> markGroupRead(String groupId) => _put('/groups/$groupId/read');

  Future<Map<String, dynamic>> getGroupMessageInfo(String messageId) =>
      _get('/groups/messages/$messageId/info');
}
