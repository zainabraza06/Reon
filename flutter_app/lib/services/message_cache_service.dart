import 'package:hive_flutter/hive_flutter.dart';
import '../models/message.dart';

/// Persists decrypted messages locally using Hive so the chat history
/// is available immediately on next launch (before the network responds).
///
/// Each conversation gets its own box named "chat_<userId>".
/// Only the decrypted plaintext is stored — ciphertext is intentionally omitted.
class MessageCacheService {
  MessageCacheService._();
  static final MessageCacheService instance = MessageCacheService._();

  static const int _maxPerConversation = 200;

  Future<void> init() async {
    // Hive.initFlutter() is called in main.dart before this
  }

  // ── Public API ────────────────────────────────────────────────────────────────

  Future<List<ChatMessage>> load(String conversationUserId) async {
    final box = await _openBox(conversationUserId);
    final raw = box.values.toList();
    raw.sort((a, b) {
      final tA = (a as Map)['sentAt'] as String? ?? '';
      final tB = (b as Map)['sentAt'] as String? ?? '';
      return tA.compareTo(tB);
    });
    return raw
        .map((e) => _fromCache(Map<String, dynamic>.from(e as Map)))
        .toList();
  }

  Future<void> save(
      String conversationUserId, List<ChatMessage> messages) async {
    final box = await _openBox(conversationUserId);
    await box.clear();
    // Keep only the most recent N messages to cap storage
    final recent = messages.length > _maxPerConversation
        ? messages.sublist(messages.length - _maxPerConversation)
        : messages;
    for (final m in recent) {
      await box.put(m.id, _toCache(m));
    }
  }

  Future<void> upsert(String conversationUserId, ChatMessage message) async {
    final box = await _openBox(conversationUserId);
    await box.put(message.id, _toCache(message));

    // Trim if over limit
    if (box.length > _maxPerConversation) {
      final oldest = box.keys.first;
      await box.delete(oldest);
    }
  }

  Future<void> clear(String conversationUserId) async {
    final box = await _openBox(conversationUserId);
    await box.clear();
  }

  Future<void> clearAll() async {
    final boxNames = Hive.isBoxOpen('_chat_index')
        ? (Hive.box('_chat_index').values.cast<String>().toList())
        : <String>[];
    for (final name in boxNames) {
      if (Hive.isBoxOpen(name)) await Hive.box(name).clear();
    }
  }

  // ── Internals ─────────────────────────────────────────────────────────────────

  Future<Box> _openBox(String userId) async {
    final name = 'chat_$userId';
    if (!Hive.isBoxOpen(name)) {
      return await Hive.openBox(name);
    }
    return Hive.box(name);
  }

  Map<String, dynamic> _toCache(ChatMessage m) => {
        'id': m.id,
        'sender': m.sender,
        'receiver': m.receiver,
        'plaintext': m.plaintext,
        'contentType': m.contentType,
        'sentAt': m.sentAt.toIso8601String(),
        'delivered': m.delivered,
        'deliveredAt': m.deliveredAt?.toIso8601String(),
        'read': m.read,
        'readAt': m.readAt?.toIso8601String(),
        'status': m.status,
        'isVoiceMessage': m.isVoiceMessage,
        'tempId': m.tempId,
      };

  ChatMessage _fromCache(Map<String, dynamic> c) => ChatMessage(
        id: c['id'] as String,
        sender: c['sender'] as String,
        receiver: c['receiver'] as String,
        plaintext: c['plaintext'] as String?,
        contentType: c['contentType'] as String? ?? 'text',
        sentAt: DateTime.parse(c['sentAt'] as String),
        delivered: c['delivered'] as bool? ?? false,
        deliveredAt: c['deliveredAt'] != null
            ? DateTime.tryParse(c['deliveredAt'] as String)
            : null,
        read: c['read'] as bool? ?? false,
        readAt: c['readAt'] != null
            ? DateTime.tryParse(c['readAt'] as String)
            : null,
        status: c['status'] as String? ?? 'sent',
        isVoiceMessage: c['isVoiceMessage'] as bool? ?? false,
        tempId: c['tempId'] as String?,
      );
}
