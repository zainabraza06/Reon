import 'dart:convert';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter/foundation.dart';
import '../models/message.dart';
import '../models/user.dart';
import '../services/api_service.dart';
import '../services/socket_service.dart';
import '../services/crypto_service.dart';
import '../services/message_cache_service.dart';

class ChatProvider extends ChangeNotifier {
  final String recipientId;
  final String recipientName;
  final String? recipientAvatar;

  ChatProvider({
    required this.recipientId,
    required this.recipientName,
    this.recipientAvatar,
  });

  List<ChatMessage> _messages = [];
  ReonUser? _recipient;
  Map<String, dynamic>? _recipientPubJwk;

  bool _loading = true;
  bool _hasMore = true;
  bool _isTyping = false;
  bool _isOnline = false;
  bool _sending = false;
  bool _uploading = false;

  // Stored callback refs so off() can actually remove them
  late final EventCallback _onNewMsgCb;
  late final EventCallback _onReadCb;

  List<ChatMessage> get messages => _messages;
  ReonUser? get recipient => _recipient;
  bool get loading => _loading;
  bool get hasMore => _hasMore;
  bool get isTyping => _isTyping;
  bool get isOnline => _isOnline;
  bool get sending => _sending;
  bool get uploading => _uploading;
  bool get canEncrypt => _recipientPubJwk != null;

  // ── Initialise ───────────────────────────────────────────────────────────────

  Future<void> init(String myId) async {
    await Future.wait([
      loadMessages(myId),
      _loadRecipient(),
    ]);
    _subscribeSocket(myId);
  }

  // ── Load ─────────────────────────────────────────────────────────────────────

  Future<void> loadMessages(String myId, {String? before}) async {
    if (!_hasMore && before != null) return;

    if (before == null) {
      final cached = await MessageCacheService.instance.load(recipientId);
      if (cached.isNotEmpty) {
        _messages = cached;
        _loading = false;
        notifyListeners();
      }
    }

    _loading = true;
    notifyListeners();

    try {
      final raw =
          await ApiService.instance.getMessages(recipientId, before: before);
      final decrypted = await Future.wait(raw.map((m) => _decrypt(m)));
      _messages = before != null ? [...decrypted, ..._messages] : decrypted;
      _hasMore = raw.length == 50;
      if (before == null) {
        await MessageCacheService.instance.save(recipientId, _messages);
      }
    } catch (_) {}

    _loading = false;
    notifyListeners();

    await ApiService.instance.markChatRead(recipientId).catchError((_) {});
  }

  Future<void> _loadRecipient() async {
    try {
      final friends = await ApiService.instance.getFriends();
      _recipient = friends.firstWhere(
        (f) => f.id == recipientId,
        orElse: () =>
            ReonUser(id: recipientId, fullName: recipientName, email: ''),
      );
    } catch (_) {
      _recipient =
          ReonUser(id: recipientId, fullName: recipientName, email: '');
    }

    try {
      final jwkStr = await ApiService.instance.tryGetPublicKey(recipientId);
      if (jwkStr != null) {
        _recipientPubJwk = jsonDecode(jwkStr) as Map<String, dynamic>;
      }
    } catch (_) {}

    notifyListeners();
  }

  // ── Send text ─────────────────────────────────────────────────────────────────

  Future<void> sendMessage(String text, String myId) async {
    if (text.isEmpty || _sending) return;
    _sending = true;

    final tempId = 'temp_${DateTime.now().millisecondsSinceEpoch}';
    final optimistic = ChatMessage(
      id: tempId,
      sender: myId,
      receiver: recipientId,
      plaintext: text,
      contentType: 'text',
      sentAt: DateTime.now(),
      status: 'sending',
    );

    _messages.add(optimistic);
    _sending = false;
    notifyListeners();

    try {
      if (_recipientPubJwk == null) throw Exception('Recipient key not available');

      final enc =
          await CryptoService.instance.encryptText(text, _recipientPubJwk!);
      final payload = jsonEncode({
        'sender': myId,
        'receiver': recipientId,
        'contentType': 'text',
        'ciphertext': enc.ciphertext,
        'encryptedKey': enc.encryptedKey,
        'senderEncryptedKey': enc.senderEncryptedKey,
      });

      final sent = await ApiService.instance
          .sendMessage(FormData.fromMap({'data': payload}));
      final dec = await _decrypt(sent.copyWith(plaintext: text));

      _messages = [for (final m in _messages) m.id == tempId ? dec : m];
      await MessageCacheService.instance.upsert(recipientId, dec);
    } catch (_) {
      _messages = [
        for (final m in _messages)
          if (m.id == tempId)
            ChatMessage(
              id: tempId,
              sender: myId,
              receiver: recipientId,
              plaintext: text,
              contentType: 'text',
              sentAt: optimistic.sentAt,
              status: 'failed',
            )
          else
            m
      ];
    }
    notifyListeners();
  }

  // ── Send media / voice ────────────────────────────────────────────────────────

  Future<void> sendMediaMessage(
    Uint8List fileBytes,
    String contentType,
    String myId, {
    String? fileName,
    bool isVoiceMessage = false,
  }) async {
    if (_uploading) return;
    if (_recipientPubJwk == null) return;

    _uploading = true;
    final tempId = 'temp_${DateTime.now().millisecondsSinceEpoch}';

    final optimistic = ChatMessage(
      id: tempId,
      sender: myId,
      receiver: recipientId,
      contentType: contentType,
      sentAt: DateTime.now(),
      status: 'sending',
      isVoiceMessage: isVoiceMessage,
    );
    _messages.add(optimistic);
    notifyListeners();

    try {
      final enc = await CryptoService.instance
          .encryptMedia(fileBytes, _recipientPubJwk!);

      final metadata = jsonEncode({
        'sender': myId,
        'receiver': recipientId,
        'contentType': contentType,
        'ciphertext': '',
        'encryptedKey': '',
        'senderEncryptedKey': '',
        'isVoiceMessage': isVoiceMessage,
      });

      final form = FormData.fromMap({
        'data': metadata,
        'file': MultipartFile.fromBytes(
          enc.encryptedBytes,
          filename: fileName ?? '$contentType.bin',
          contentType: DioMediaType.parse(_mimeFor(contentType, fileName)),
        ),
        'mediaType': contentType,
        'mediaEncryptedKey': enc.encryptedKey,
        'mediaSenderEncryptedKey': enc.senderEncryptedKey,
        'encryptionIV': enc.iv,
        if (isVoiceMessage) 'isVoiceMessage': 'true',
      });

      final sent = await ApiService.instance.sendMessage(form);
      _messages = [for (final m in _messages) m.id == tempId ? sent : m];
      await MessageCacheService.instance.upsert(recipientId, sent);
    } catch (_) {
      _messages = [
        for (final m in _messages)
          if (m.id == tempId)
            ChatMessage(
              id: tempId,
              sender: myId,
              receiver: recipientId,
              contentType: contentType,
              sentAt: optimistic.sentAt,
              status: 'failed',
              isVoiceMessage: isVoiceMessage,
            )
          else
            m
      ];
    }

    _uploading = false;
    notifyListeners();
  }

  String _mimeFor(String contentType, String? fileName) {
    if (contentType == 'image') {
      final ext = fileName?.split('.').last.toLowerCase();
      if (ext == 'png') return 'image/png';
      if (ext == 'gif') return 'image/gif';
      if (ext == 'webp') return 'image/webp';
      return 'image/jpeg';
    }
    if (contentType == 'video') return 'video/mp4';
    if (contentType == 'audio') return 'audio/aac';
    return 'application/octet-stream';
  }

  // ── Typing ───────────────────────────────────────────────────────────────────

  void handleTyping(bool typing, String myId) {
    SocketService.instance.emit(
      typing ? 'start-typing' : 'stop-typing',
      {'senderId': myId, 'receiverId': recipientId, 'isTyping': typing},
    );
  }

  // ── Socket ───────────────────────────────────────────────────────────────────

  void _subscribeSocket(String myId) {
    // Store closures so unsubscribeSocket can remove the exact same references
    _onNewMsgCb = (d) => _onNewMsg(d, myId);
    _onReadCb = (d) => _onRead(d, myId);

    final s = SocketService.instance;
    s.on('new-message', _onNewMsgCb);
    s.on('message-sent', _onMsgSent);
    s.on('message-delivered', _onDelivered);
    s.on('messages-delivered-batch', _onDeliveredBatch);
    s.on('message-read', _onReadCb);
    s.on('user-typing', _onTyping);
    s.on('user-status-changed', _onStatus);
  }

  void unsubscribeSocket() {
    final s = SocketService.instance;
    s.off('new-message', _onNewMsgCb);
    s.off('message-sent', _onMsgSent);
    s.off('message-delivered', _onDelivered);
    s.off('messages-delivered-batch', _onDeliveredBatch);
    s.off('message-read', _onReadCb);
    s.off('user-typing', _onTyping);
    s.off('user-status-changed', _onStatus);
  }

  void _onNewMsg(dynamic d, String myId) async {
    final m = d as Map?;
    if (m == null) return;
    final msg = ChatMessage.fromJson(Map<String, dynamic>.from(m));
    if (msg.sender != recipientId && msg.receiver != recipientId) return;
    if (_messages.any((e) => e.id == msg.id)) return;

    final dec = await _decrypt(msg);
    _messages.add(dec);
    await MessageCacheService.instance.upsert(recipientId, dec);
    notifyListeners();

    SocketService.instance
        .emit('message-read', {'messageId': msg.id, 'senderId': msg.sender});
    ApiService.instance.markChatRead(recipientId).catchError((_) {});
  }

  void _onMsgSent(dynamic d) {
    final m = d as Map?;
    if (m == null) return;
    final id = m['_id'] as String?;
    if (id == null) return;
    final status = m['status'] as String? ?? 'sent';
    _messages = [
      for (final msg in _messages)
        msg.id == id ? msg.copyWith(status: status) : msg
    ];
    notifyListeners();
  }

  void _onDelivered(dynamic d) {
    final m = d as Map?;
    if (m == null) return;
    final mid = m['messageId'] as String?;
    if (mid == null) return;
    final at = m['deliveredAt'] as String?;
    _messages = [
      for (final msg in _messages)
        msg.id == mid
            ? msg.copyWith(
                status: 'delivered',
                delivered: true,
                deliveredAt: at != null ? DateTime.tryParse(at) : null)
            : msg
    ];
    notifyListeners();
  }

  void _onDeliveredBatch(dynamic d) {
    final m = d as Map?;
    if (m == null) return;
    final list = m['messages'] as List? ?? [];
    final ids = {
      for (final e in list) (e as Map)['messageId'] as String? ?? ''
    };
    _messages = [
      for (final msg in _messages)
        ids.contains(msg.id)
            ? msg.copyWith(status: 'delivered', delivered: true)
            : msg
    ];
    notifyListeners();
  }

  void _onRead(dynamic d, String myId) {
    final m = d as Map?;
    if (m == null) return;
    final mid = m['messageId'] as String?;
    if (mid == null) return;
    final target = _messages.firstWhere((e) => e.id == mid,
        orElse: () => _messages.isNotEmpty
            ? _messages.first
            : ChatMessage(
                id: '', sender: '', receiver: '', sentAt: DateTime.now()));
    if (target.id.isEmpty) return;
    final cutoff = target.sentAt;
    _messages = [
      for (final msg in _messages)
        msg.sender == myId && !msg.sentAt.isAfter(cutoff)
            ? msg.copyWith(status: 'read', read: true)
            : msg
    ];
    notifyListeners();
  }

  void _onTyping(dynamic d) {
    final m = d as Map?;
    if (m == null) return;
    if ((m['senderId'] as String?) != recipientId) return;
    _isTyping = m['isTyping'] as bool? ?? false;
    notifyListeners();
  }

  void _onStatus(dynamic d) {
    final m = d as Map?;
    if (m == null) return;
    if ((m['userId'] as String?) != recipientId) return;
    _isOnline = m['isOnline'] as bool? ?? false;
    notifyListeners();
  }

  // ── Helpers ──────────────────────────────────────────────────────────────────

  Future<ChatMessage> _decrypt(ChatMessage m) async {
    if (m.ciphertext == null || m.encryptedKey == null) return m;
    final plain = await CryptoService.instance
        .decryptText(m.ciphertext!, m.encryptedKey!);
    return m.copyWith(plaintext: plain ?? '[decryption failed]');
  }

  @override
  void dispose() {
    unsubscribeSocket();
    super.dispose();
  }
}
