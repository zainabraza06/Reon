import 'user.dart';

class RecommendedUser extends ReonUser {
  final int? mutualFriendsCount;
  final bool friendRequestSent;
  final bool friendRequestReceived;

  const RecommendedUser({
    required super.id,
    required super.fullName,
    required super.email,
    super.username,
    super.profilePic,
    super.bio,
    super.location,
    super.nativeLanguage,
    super.isOnboarded,
    super.isOnline,
    this.mutualFriendsCount,
    this.friendRequestSent = false,
    this.friendRequestReceived = false,
  });

  factory RecommendedUser.fromJson(Map<String, dynamic> j) => RecommendedUser(
        id: j['_id'] as String,
        fullName: j['fullName'] as String,
        email: j['email'] as String? ?? '',
        username: j['username'] as String?,
        profilePic: j['profilePic'] as String?,
        bio: j['bio'] as String?,
        location: j['location'] as String?,
        nativeLanguage: j['nativeLanguage'] as String?,
        isOnboarded: j['isOnboarded'] as bool? ?? false,
        isOnline: j['isOnline'] as bool? ?? false,
        mutualFriendsCount: j['mutualFriendsCount'] as int?,
        friendRequestSent: j['friendRequestSent'] as bool? ?? false,
        friendRequestReceived: j['friendRequestReceived'] as bool? ?? false,
      );

  RecommendedUser copyWithFlags(
          {bool? friendRequestSent, bool? friendRequestReceived}) =>
      RecommendedUser(
        id: id,
        fullName: fullName,
        email: email,
        username: username,
        profilePic: profilePic,
        bio: bio,
        location: location,
        nativeLanguage: nativeLanguage,
        isOnboarded: isOnboarded,
        isOnline: isOnline,
        mutualFriendsCount: mutualFriendsCount,
        friendRequestSent: friendRequestSent ?? this.friendRequestSent,
        friendRequestReceived:
            friendRequestReceived ?? this.friendRequestReceived,
      );
}
