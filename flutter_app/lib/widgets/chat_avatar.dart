import 'package:flutter/material.dart';
import '../theme/app_theme.dart';

class ChatAvatar extends StatelessWidget {
  final String name;
  final String? imageUrl;
  final double size;
  final bool isOnline;

  const ChatAvatar({
    super.key,
    required this.name,
    this.imageUrl,
    this.size = 46,
    this.isOnline = false,
  });

  String get _initials {
    final parts = name.trim().split(' ');
    if (parts.length >= 2) return '${parts[0][0]}${parts[1][0]}'.toUpperCase();
    return name.isNotEmpty ? name[0].toUpperCase() : '?';
  }

  Color _avatarColor() {
    const colors = [
      Color(0xFF7C3AED), Color(0xFF0891B2), Color(0xFF059669),
      Color(0xFFDC2626), Color(0xFFD97706), Color(0xFF7C3AED),
    ];
    return colors[name.codeUnitAt(0) % colors.length];
  }

  @override
  Widget build(BuildContext context) {
    final double radius = size / 2;

    return Stack(
      clipBehavior: Clip.none,
      children: [
        Container(
          width: size,
          height: size,
          decoration: BoxDecoration(
            shape: BoxShape.circle,
            gradient: imageUrl == null ? LinearGradient(
              begin: Alignment.topLeft,
              end: Alignment.bottomRight,
              colors: [_avatarColor(), _avatarColor().withValues(alpha: 0.7)],
            ) : null,
            color: imageUrl != null ? Colors.transparent : null,
          ),
          child: imageUrl != null
              ? ClipOval(child: Image.network(imageUrl!, fit: BoxFit.cover, width: size, height: size,
                  errorBuilder: (_, __, ___) => _InitialsCircle(initials: _initials, radius: radius, color: _avatarColor())))
              : Center(child: Text(_initials, style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: size * 0.38))),
        ),
        if (isOnline)
          Positioned(
            right: 0,
            bottom: 0,
            child: Container(
              width: size * 0.28,
              height: size * 0.28,
              decoration: BoxDecoration(
                shape: BoxShape.circle,
                color: ReonColors.online,
                border: Border.all(color: Theme.of(context).scaffoldBackgroundColor, width: 2),
              ),
            ),
          ),
      ],
    );
  }
}

class _InitialsCircle extends StatelessWidget {
  final String initials;
  final double radius;
  final Color color;
  const _InitialsCircle({required this.initials, required this.radius, required this.color});

  @override
  Widget build(BuildContext context) => Container(
    width: radius * 2, height: radius * 2,
    decoration: BoxDecoration(shape: BoxShape.circle, color: color),
    child: Center(child: Text(initials, style: TextStyle(color: Colors.white, fontWeight: FontWeight.w700, fontSize: radius * 0.76))),
  );
}
