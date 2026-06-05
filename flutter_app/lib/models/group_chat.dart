import 'user.dart';

class GroupMember {
  final ReonUser user;
  final DateTime joinedAt;
  const GroupMember({required this.user, required this.joinedAt});
  factory GroupMember.fromJson(Map<String, dynamic> j) => GroupMember(
    user: ReonUser.fromJson(j['user'] as Map<String, dynamic>),
    joinedAt: DateTime.parse(j['joinedAt'] as String),
  );
}

class GroupReceiptEntry {
  final ReonUser user;
  final DateTime at;
  const GroupReceiptEntry({required this.user, required this.at});
  factory GroupReceiptEntry.fromJson(Map<String, dynamic> j) => GroupReceiptEntry(
    user: ReonUser.fromJson(j['user'] as Map<String, dynamic>),
    at:   DateTime.parse(j['at'] as String),
  );
}

class GroupChat {
  final String id;
  final String name;
  final String? description;
  final String? avatar;
  final ReonUser creator;
  final List<ReonUser> admins;
  final List<GroupMember> members;
  final String? lastMessageContent;
  final DateTime? lastMessageAt;

  const GroupChat({
    required this.id,
    required this.name,
    this.description,
    this.avatar,
    required this.creator,
    required this.admins,
    required this.members,
    this.lastMessageContent,
    this.lastMessageAt,
  });

  factory GroupChat.fromJson(Map<String, dynamic> j) {
    final lm = j['lastMessage'] as Map<String, dynamic>?;
    return GroupChat(
      id:          j['_id'] as String,
      name:        j['name'] as String,
      description: j['description'] as String?,
      avatar:      j['avatar'] as String?,
      creator:     ReonUser.fromJson(j['creator'] as Map<String, dynamic>),
      admins:      (j['admins'] as List? ?? []).map((a) => ReonUser.fromJson(a as Map<String, dynamic>)).toList(),
      members:     (j['members'] as List? ?? []).map((m) => GroupMember.fromJson(m as Map<String, dynamic>)).toList(),
      lastMessageContent: lm?['content'] as String?,
      lastMessageAt:      lm?['sentAt'] != null ? DateTime.tryParse(lm!['sentAt'] as String) : null,
    );
  }

  int get memberCount => members.length;
}

class GroupMessage {
  final String id;
  final String groupId;
  final ReonUser sender;
  final String? ciphertext;
  final String? plaintext;
  final String? encryptedKey;
  final String contentType;
  final DateTime sentAt;
  final List<Map<String, dynamic>> readBy;     // [{userId, at}]
  final List<Map<String, dynamic>> deliveredTo; // [{userId, at}]

  const GroupMessage({
    required this.id,
    required this.groupId,
    required this.sender,
    this.ciphertext,
    this.plaintext,
    this.encryptedKey,
    this.contentType = 'text',
    required this.sentAt,
    this.readBy = const [],
    this.deliveredTo = const [],
  });

  factory GroupMessage.fromJson(Map<String, dynamic> j) => GroupMessage(
    id:          j['_id'] as String,
    groupId:     j['groupId'] as String? ?? '',
    sender:      ReonUser.fromJson(j['sender'] as Map<String, dynamic>),
    ciphertext:  j['ciphertext'] as String?,
    encryptedKey: j['encryptedKey'] as String?,
    contentType: j['contentType'] as String? ?? 'text',
    sentAt:      DateTime.parse(j['sentAt'] as String),
    readBy:      List<Map<String, dynamic>>.from((j['readBy'] as List? ?? []).map((e) => e as Map<String, dynamic>)),
    deliveredTo: List<Map<String, dynamic>>.from((j['deliveredTo'] as List? ?? []).map((e) => e as Map<String, dynamic>)),
  );

  GroupMessage copyWith({String? plaintext, List<Map<String, dynamic>>? readBy, List<Map<String, dynamic>>? deliveredTo}) => GroupMessage(
    id: id, groupId: groupId, sender: sender, ciphertext: ciphertext,
    encryptedKey: encryptedKey, contentType: contentType, sentAt: sentAt,
    plaintext: plaintext ?? this.plaintext,
    readBy: readBy ?? this.readBy,
    deliveredTo: deliveredTo ?? this.deliveredTo,
  );
}
