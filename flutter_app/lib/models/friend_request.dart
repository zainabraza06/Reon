import 'user.dart';

class FriendRequest {
  final String id;
  final ReonUser sender;
  final ReonUser receiver;
  final String status;
  final DateTime createdAt;

  const FriendRequest({
    required this.id,
    required this.sender,
    required this.receiver,
    required this.status,
    required this.createdAt,
  });

  factory FriendRequest.fromJson(Map<String, dynamic> j) => FriendRequest(
        id: j['_id'] as String,
        sender: ReonUser.fromJson(j['sender'] as Map<String, dynamic>),
        receiver: ReonUser.fromJson(j['receiver'] as Map<String, dynamic>),
        status: j['status'] as String? ?? 'pending',
        createdAt: DateTime.parse(j['createdAt'] as String),
      );
}
