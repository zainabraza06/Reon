import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../theme/app_theme.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import 'login_screen.dart' show AuthField, GradButton, ErrorBox;

class OnboardingScreen extends StatefulWidget {
  const OnboardingScreen({super.key});
  @override State<OnboardingScreen> createState() => _OnboardingScreenState();
}

class _OnboardingScreenState extends State<OnboardingScreen> {
  final _username = TextEditingController();
  final _lang     = TextEditingController();
  final _bio      = TextEditingController();
  final _location = TextEditingController();
  bool _loading = false;
  String? _error;

  @override void dispose() { _username.dispose(); _lang.dispose(); _bio.dispose(); _location.dispose(); super.dispose(); }

  Future<void> _submit() async {
    if (_username.text.trim().isEmpty || _lang.text.trim().isEmpty) {
      setState(() => _error = 'Username and language are required');
      return;
    }
    setState(() { _loading = true; _error = null; });
    try {
      await ApiService.instance.onboard(
        username: _username.text.trim(),
        nativeLanguage: _lang.text.trim(),
        bio: _bio.text.trim().isEmpty ? null : _bio.text.trim(),
        location: _location.text.trim().isEmpty ? null : _location.text.trim(),
      );
      await context.read<AuthProvider>().checkAuth();
    } catch (e) {
      setState(() { _error = e.toString(); _loading = false; });
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      backgroundColor: isDark ? ReonColors.bgDark : ReonColors.bgLight,
      body: SafeArea(child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const SizedBox(height: 32),
          Text('Set up your profile', textAlign: TextAlign.center,
            style: GoogleFonts.inter(fontSize: 22, fontWeight: FontWeight.w800, color: isDark ? Colors.white : ReonColors.textLight)),
          const SizedBox(height: 4),
          Text('Tell others who you are', textAlign: TextAlign.center,
            style: GoogleFonts.inter(fontSize: 14, color: ReonColors.textMuted)),
          const SizedBox(height: 32),
          AuthField(controller: _username, hint: 'Username *',       icon: Icons.alternate_email_rounded),
          const SizedBox(height: 12),
          AuthField(controller: _lang,     hint: 'Native language *', icon: Icons.language_rounded),
          const SizedBox(height: 12),
          AuthField(controller: _bio,      hint: 'Bio',              icon: Icons.edit_note_rounded),
          const SizedBox(height: 12),
          AuthField(controller: _location, hint: 'Location',         icon: Icons.location_on_outlined),
          if (_error != null) ...[const SizedBox(height: 12), ErrorBox(_error!)],
          const SizedBox(height: 28),
          GradButton(label: 'Complete Setup', loading: _loading, onTap: _loading ? null : _submit),
        ]),
      )),
    );
  }
}
