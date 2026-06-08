class MediaFile {
  final String url;
  final String? downloadUrl;
  final String type; // image | video | audio | document
  final String? fileName;
  final String? originalName;
  final int? fileSize;
  final String? encryptedKey;
  final String? encryptionIV;

  const MediaFile({
    required this.url,
    this.downloadUrl,
    required this.type,
    this.fileName,
    this.originalName,
    this.fileSize,
    this.encryptedKey,
    this.encryptionIV,
  });

  factory MediaFile.fromJson(Map<String, dynamic> j) => MediaFile(
        url: j['url'] as String,
        downloadUrl: j['downloadUrl'] as String?,
        type: j['type'] as String? ?? 'document',
        fileName: j['fileName'] as String?,
        originalName: j['originalName'] as String?,
        fileSize: j['fileSize'] as int?,
        encryptedKey: j['encryptedKey'] as String?,
        encryptionIV: j['encryptionIV'] as String?,
      );
}

class ChatMessage {
  final String id;
  final String sender;
  final String receiver;
  final String? ciphertext;
  final String? plaintext; // decrypted on device
  final String? encryptedKey;
  final String contentType; // text | image | audio | video | document
  final List<MediaFile> media;
  final DateTime sentAt;
  final bool delivered;
  final DateTime? deliveredAt;
  final bool read;
  final DateTime? readAt;
  final String status; // sent | delivered | read | sending | failed
  final bool isVoiceMessage;
  final String? tempId; // client-side only for optimistic UI

  const ChatMessage({
    required this.id,
    required this.sender,
    required this.receiver,
    this.ciphertext,
    this.plaintext,
    this.encryptedKey,
    this.contentType = 'text',
    this.media = const [],
    required this.sentAt,
    this.delivered = false,
    this.deliveredAt,
    this.read = false,
    this.readAt,
    this.status = 'sent',
    this.isVoiceMessage = false,
    this.tempId,
  });

  factory ChatMessage.fromJson(Map<String, dynamic> j) => ChatMessage(
        id: j['_id'] as String,
        sender: j['sender'] is Map
            ? (j['sender'] as Map)['_id'] as String
            : j['sender'] as String,
        receiver: j['receiver'] is Map
            ? (j['receiver'] as Map)['_id'] as String
            : j['receiver'] as String,
        ciphertext: j['ciphertext'] as String?,
        encryptedKey: j['encryptedKey'] as String?,
        contentType: j['contentType'] as String? ?? 'text',
        media: (j['media'] as List? ?? [])
            .map((m) => MediaFile.fromJson(m as Map<String, dynamic>))
            .toList(),
        sentAt: DateTime.parse(j['sentAt'] as String),
        delivered: j['delivered'] as bool? ?? false,
        deliveredAt: j['deliveredAt'] != null
            ? DateTime.tryParse(j['deliveredAt'] as String)
            : null,
        read: j['read'] as bool? ?? false,
        readAt: j['readAt'] != null
            ? DateTime.tryParse(j['readAt'] as String)
            : null,
        status: j['status'] as String? ?? 'sent',
        isVoiceMessage: j['isVoiceMessage'] as bool? ?? false,
      );

  ChatMessage copyWith(
          {String? plaintext,
          String? status,
          bool? delivered,
          DateTime? deliveredAt,
          bool? read,
          DateTime? readAt}) =>
      ChatMessage(
        id: id,
        sender: sender,
        receiver: receiver,
        ciphertext: ciphertext,
        encryptedKey: encryptedKey,
        contentType: contentType,
        media: media,
        sentAt: sentAt,
        isVoiceMessage: isVoiceMessage,
        tempId: tempId,
        plaintext: plaintext ?? this.plaintext,
        status: status ?? this.status,
        delivered: delivered ?? this.delivered,
        deliveredAt: deliveredAt ?? this.deliveredAt,
        read: read ?? this.read,
        readAt: readAt ?? this.readAt,
      );

  bool get isSending => status == 'sending';
  bool get isFailed => status == 'failed';
}
