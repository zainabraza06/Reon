class ReonUser {
  final String id;
  final String fullName;
  final String email;
  final String? username;
  final String? profilePic;
  final String? bio;
  final String? location;
  final bool isOnboarded;
  final bool isOnline;

  const ReonUser({
    required this.id,
    required this.fullName,
    required this.email,
    this.username,
    this.profilePic,
    this.bio,
    this.location,
    this.isOnboarded = false,
    this.isOnline = false,
  });

  factory ReonUser.fromJson(Map<String, dynamic> j) => ReonUser(
    id:          j['_id'] as String,
    fullName:    j['fullName'] as String,
    email:       j['email'] as String? ?? '',
    username:    j['username'] as String?,
    profilePic:  j['profilePic'] as String?,
    bio:         j['bio'] as String?,
    location:    j['location'] as String?,
    isOnboarded: j['isOnboarded'] as bool? ?? false,
    isOnline:    j['isOnline'] as bool? ?? false,
  );

  ReonUser copyWith({bool? isOnline}) => ReonUser(
    id: id, fullName: fullName, email: email, username: username,
    profilePic: profilePic, bio: bio, location: location,
    isOnboarded: isOnboarded,
    isOnline: isOnline ?? this.isOnline,
  );

  String get displayName => username != null ? '@$username' : email;
}
