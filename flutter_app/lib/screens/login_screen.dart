import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import 'package:url_launcher/url_launcher.dart';
import '../config.dart';
import '../theme/app_theme.dart';
import '../providers/auth_provider.dart';
import 'link_device_screen.dart';
import 'signup_screen.dart';

class LoginScreen extends StatefulWidget {
  const LoginScreen({super.key});
  @override State<LoginScreen> createState() => _LoginScreenState();
}

class _LoginScreenState extends State<LoginScreen> {
  final _email    = TextEditingController();
  final _password = TextEditingController();
  bool _showPw = false;
  bool _loading = false;
  bool _slowNetwork = false;

  @override void dispose() { _email.dispose(); _password.dispose(); super.dispose(); }

  Future<void> _submit() async {
    if (_email.text.trim().isEmpty || _password.text.isEmpty) return;
    setState(() { _loading = true; _slowNetwork = false; });
    // Show "waking up server" hint after 6 s (Render free-tier cold start)
    Future.delayed(const Duration(seconds: 6), () {
      if (mounted && _loading) setState(() => _slowNetwork = true);
    });
    final ok = await context.read<AuthProvider>().login(_email.text.trim(), _password.text);
    if (mounted) setState(() { _loading = false; _slowNetwork = false; });
    if (!ok) {} // error shown via AuthProvider.error
  }

  Future<void> _googleSignIn() async {
    final uri = Uri.parse('${kSiteUrl.replaceAll('/api', '')}/login');
    if (await canLaunchUrl(uri)) {
      await launchUrl(uri, mode: LaunchMode.externalApplication);
    }
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final error  = context.watch<AuthProvider>().error;

    return Scaffold(
      backgroundColor: isDark ? ReonColors.bgDark : ReonColors.bgLight,
      body: SafeArea(child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child: Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const SizedBox(height: 48),
          Center(child: Container(width: 64, height: 64,
            decoration: BoxDecoration(gradient: kBrandGradient, borderRadius: BorderRadius.circular(18),
              boxShadow: [BoxShadow(color: ReonColors.primary.withValues(alpha: 0.35), blurRadius: 20, offset: const Offset(0, 6))]),
            child: Center(child: Text('R', style: GoogleFonts.inter(fontSize: 28, fontWeight: FontWeight.w900, color: Colors.white))))),
          const SizedBox(height: 32),
          Text('Welcome back', textAlign: TextAlign.center,
            style: GoogleFonts.inter(fontSize: 26, fontWeight: FontWeight.w800, color: isDark ? Colors.white : ReonColors.textLight)),
          const SizedBox(height: 6),
          Text('Sign in to continue', textAlign: TextAlign.center,
            style: GoogleFonts.inter(fontSize: 14, color: ReonColors.textMuted)),
          const SizedBox(height: 36),
          AuthField(controller: _email, hint: 'Email', icon: Icons.mail_outline_rounded, type: TextInputType.emailAddress),
          const SizedBox(height: 14),
          AuthField(controller: _password, hint: 'Password', icon: Icons.lock_outline_rounded, obscure: !_showPw,
            suffix: IconButton(icon: Icon(_showPw ? Icons.visibility_off_rounded : Icons.visibility_rounded, size: 20, color: ReonColors.textMuted),
              onPressed: () => setState(() => _showPw = !_showPw))),
          if (error != null) ...[
            const SizedBox(height: 12),
            ErrorBox(error),
          ],
          if (_slowNetwork) ...[
            const SizedBox(height: 10),
            Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              const SizedBox(width: 12, height: 12, child: CircularProgressIndicator(strokeWidth: 1.5)),
              const SizedBox(width: 8),
              Text('Server waking up, please wait…',
                style: GoogleFonts.inter(fontSize: 12, color: ReonColors.textMuted)),
            ]),
          ],
          const SizedBox(height: 24),
          GradButton(label: 'Sign In', loading: _loading, onTap: _loading ? null : _submit),
          const SizedBox(height: 16),
          Row(children: [
            Expanded(child: Divider(color: ReonColors.textMuted.withValues(alpha: 0.3))),
            Padding(
              padding: const EdgeInsets.symmetric(horizontal: 12),
              child: Text('or', style: GoogleFonts.inter(fontSize: 13, color: ReonColors.textMuted)),
            ),
            Expanded(child: Divider(color: ReonColors.textMuted.withValues(alpha: 0.3))),
          ]),
          const SizedBox(height: 16),
          _GoogleButton(onTap: _googleSignIn),
          const SizedBox(height: 20),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Text("Don't have an account? ", style: GoogleFonts.inter(fontSize: 14, color: ReonColors.textMuted)),
            GestureDetector(
              onTap: () => Navigator.of(context).pushReplacement(MaterialPageRoute(builder: (_) => const SignupScreen())),
              child: Text('Sign up', style: GoogleFonts.inter(fontSize: 14, fontWeight: FontWeight.w700, color: ReonColors.primary))),
          ]),
          const SizedBox(height: 12),
          GestureDetector(
            onTap: () => Navigator.push(context, MaterialPageRoute(builder: (_) => const LinkDeviceScreen())),
            child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
              Icon(Icons.qr_code_scanner_rounded, size: 16, color: ReonColors.textMuted),
              const SizedBox(width: 6),
              Text('Transfer from another device', style: GoogleFonts.inter(fontSize: 13, color: ReonColors.textMuted, decoration: TextDecoration.underline)),
            ]),
          ),
        ]),
      )),
    );
  }
}

// ── Shared widgets (exported for use in other screens) ──────────────────────────

class AuthField extends StatelessWidget {
  final TextEditingController controller;
  final String hint;
  final IconData icon;
  final bool obscure;
  final TextInputType type;
  final Widget? suffix;
  const AuthField({super.key, required this.controller, required this.hint, required this.icon,
    this.obscure = false, this.type = TextInputType.text, this.suffix});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return TextField(
      controller: controller, obscureText: obscure, keyboardType: type,
      style: GoogleFonts.inter(fontSize: 14.5, color: isDark ? ReonColors.textDark : ReonColors.textLight),
      decoration: InputDecoration(
        hintText: hint, hintStyle: GoogleFonts.inter(fontSize: 14.5, color: ReonColors.textMuted),
        prefixIcon: Icon(icon, size: 20, color: ReonColors.textMuted), suffixIcon: suffix,
        filled: true, fillColor: isDark ? ReonColors.surfaceDark : Colors.white,
        contentPadding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        border:        OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: isDark ? ReonColors.borderDark : ReonColors.borderLight)),
        enabledBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: BorderSide(color: isDark ? ReonColors.borderDark : ReonColors.borderLight)),
        focusedBorder: OutlineInputBorder(borderRadius: BorderRadius.circular(14), borderSide: const BorderSide(color: ReonColors.primary, width: 1.5)),
      ),
    );
  }
}

class GradButton extends StatelessWidget {
  final String label; final bool loading; final VoidCallback? onTap;
  const GradButton({super.key, required this.label, required this.loading, this.onTap});
  @override
  Widget build(BuildContext context) => GestureDetector(onTap: onTap,
    child: Container(height: 52, decoration: BoxDecoration(
      gradient: onTap != null ? kBrandGradient : null,
      color: onTap == null ? Colors.grey.shade300 : null,
      borderRadius: BorderRadius.circular(14),
      boxShadow: onTap != null ? [BoxShadow(color: ReonColors.primary.withValues(alpha: 0.35), blurRadius: 16, offset: const Offset(0, 4))] : null),
      child: Center(child: loading
        ? const SizedBox(width: 22, height: 22, child: CircularProgressIndicator(strokeWidth: 2.5, color: Colors.white))
        : Text(label, style: GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w700, color: Colors.white)))));
}

class ErrorBox extends StatelessWidget {
  final String message;
  const ErrorBox(this.message, {super.key});
  @override
  Widget build(BuildContext context) => Container(
    padding: const EdgeInsets.all(12),
    decoration: BoxDecoration(color: ReonColors.danger.withValues(alpha: 0.1), borderRadius: BorderRadius.circular(12),
      border: Border.all(color: ReonColors.danger.withValues(alpha: 0.3))),
    child: Text(message, style: GoogleFonts.inter(fontSize: 13, color: ReonColors.danger)));
}

class _GoogleButton extends StatelessWidget {
  final VoidCallback onTap;
  const _GoogleButton({required this.onTap});
  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        height: 52,
        decoration: BoxDecoration(
          color: isDark ? ReonColors.surfaceDark : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(color: isDark ? ReonColors.borderDark : ReonColors.borderLight),
          boxShadow: [BoxShadow(color: Colors.black.withValues(alpha: 0.05), blurRadius: 8, offset: const Offset(0, 2))],
        ),
        child: Row(mainAxisAlignment: MainAxisAlignment.center, children: [
          // Google 'G' logo colours
          Text('G', style: GoogleFonts.inter(
            fontSize: 20, fontWeight: FontWeight.w700,
            foreground: Paint()..shader = const LinearGradient(colors: [
              Color(0xFF4285F4), Color(0xFFEA4335),
            ]).createShader(const Rect.fromLTWH(0, 0, 20, 20)),
          )),
          const SizedBox(width: 10),
          Text('Continue with Google',
            style: GoogleFonts.inter(fontSize: 15, fontWeight: FontWeight.w600,
              color: isDark ? Colors.white : ReonColors.textLight)),
        ]),
      ),
    );
  }
}
