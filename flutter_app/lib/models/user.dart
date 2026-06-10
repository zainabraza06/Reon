class PrivacySettings {
  final bool showLastSeen;
  final bool showActiveStatus;

  const PrivacySettings(
      {this.showLastSeen = true, this.showActiveStatus = true});

  factory PrivacySettings.fromJson(Map<String, dynamic>? j) => PrivacySettings(
        showLastSeen: j?['showLastSeen'] as bool? ?? true,
        showActiveStatus: j?['showActiveStatus'] as bool? ?? true,
      );
}

class ReonUser {
  final String id;
  final String fullName;
  final String email;
  final String? username;
  final String? profilePic;
  final String? bio;
  final String? location;
  final String? nativeLanguage;
  final bool isOnboarded;
  final bool isOnline;
  final bool hasPassword;
  final PrivacySettings privacySettings;
  final DateTime? lastSeen;

  const ReonUser({
    required this.id,
    required this.fullName,
    required this.email,
    this.username,
    this.profilePic,
    this.bio,
    this.location,
    this.nativeLanguage,
    this.isOnboarded = false,
    this.isOnline = false,
    this.hasPassword = true,
    this.privacySettings = const PrivacySettings(),
    this.lastSeen,
  });

  factory ReonUser.fromJson(Map<String, dynamic> j) => ReonUser(
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
        hasPassword: j['hasPassword'] as bool? ?? true,
        privacySettings: PrivacySettings.fromJson(
            j['privacySettings'] as Map<String, dynamic>?),
        lastSeen: j['lastSeen'] != null
            ? DateTime.tryParse(j['lastSeen'] as String)
            : null,
      );

  ReonUser copyWith({
    bool? isOnline,
    String? fullName,
    String? bio,
    String? location,
    String? profilePic,
    PrivacySettings? privacySettings,
    DateTime? lastSeen,
  }) =>
      ReonUser(
        id: id,
        fullName: fullName ?? this.fullName,
        email: email,
        username: username,
        profilePic: profilePic ?? this.profilePic,
        bio: bio ?? this.bio,
        location: location ?? this.location,
        nativeLanguage: nativeLanguage,
        isOnboarded: isOnboarded,
        isOnline: isOnline ?? this.isOnline,
        hasPassword: hasPassword,
        privacySettings: privacySettings ?? this.privacySettings,
        lastSeen: lastSeen ?? this.lastSeen,
      );

  String get displayName => username != null ? '@$username' : email;
}
