import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:provider/provider.dart';
import '../theme/app_theme.dart';
import '../providers/auth_provider.dart';
import 'login_screen.dart' show LoginScreen, AuthField, GradButton, ErrorBox;

class SignupScreen extends StatefulWidget {
  const SignupScreen({super.key});
  @override
  State<SignupScreen> createState() => _SignupScreenState();
}

class _SignupScreenState extends State<SignupScreen> {
  final _name = TextEditingController();
  final _email = TextEditingController();
  final _password = TextEditingController();
  bool _showPw = false, _loading = false;

  @override
  void dispose() {
    _name.dispose();
    _email.dispose();
    _password.dispose();
    super.dispose();
  }

  Future<void> _submit() async {
    if (_name.text.trim().isEmpty ||
        _email.text.trim().isEmpty ||
        _password.text.length < 8) return;
    setState(() => _loading = true);
    final ok = await context
        .read<AuthProvider>()
        .signup(_name.text.trim(), _email.text.trim(), _password.text);
    if (!ok && mounted) setState(() => _loading = false);
  }

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final error = context.watch<AuthProvider>().error;

    return Scaffold(
      backgroundColor: isDark ? ReonColors.bgDark : ReonColors.bgLight,
      body: SafeArea(
          child: SingleChildScrollView(
        padding: const EdgeInsets.all(24),
        child:
            Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          const SizedBox(height: 40),
          Center(
              child: Container(
                  width: 60,
                  height: 60,
                  decoration: BoxDecoration(
                      gradient: kBrandGradient,
                      borderRadius: BorderRadius.circular(17),
                      boxShadow: [
                        BoxShadow(
                            color: ReonColors.primary.withValues(alpha: 0.35),
                            blurRadius: 18,
                            offset: const Offset(0, 5))
                      ]),
                  child: Center(
                      child: Text('R',
                          style: GoogleFonts.inter(
                              fontSize: 26,
                              fontWeight: FontWeight.w900,
                              color: Colors.white))))),
          const SizedBox(height: 28),
          Text('Create account',
              textAlign: TextAlign.center,
              style: GoogleFonts.inter(
                  fontSize: 24,
                  fontWeight: FontWeight.w800,
                  color: isDark ? Colors.white : ReonColors.textLight)),
          const SizedBox(height: 4),
          Text('Join Reon for encrypted messaging',
              textAlign: TextAlign.center,
              style:
                  GoogleFonts.inter(fontSize: 13, color: ReonColors.textMuted)),
          const SizedBox(height: 32),
          AuthField(
              controller: _name,
              hint: 'Full name',
              icon: Icons.person_outline_rounded),
          const SizedBox(height: 12),
          AuthField(
              controller: _email,
              hint: 'Email',
              icon: Icons.mail_outline_rounded,
              type: TextInputType.emailAddress),
          const SizedBox(height: 12),
          AuthField(
              controller: _password,
              hint: 'Password (min 8)',
              icon: Icons.lock_outline_rounded,
              obscure: !_showPw,
              suffix: IconButton(
                  icon: Icon(
                      _showPw
                          ? Icons.visibility_off_rounded
                          : Icons.visibility_rounded,
                      size: 20,
                      color: ReonColors.textMuted),
                  onPressed: () => setState(() => _showPw = !_showPw))),
          // Password strength
          if (_password.text.isNotEmpty) ...[
            const SizedBox(height: 8),
            _StrengthBar(length: _password.text.length),
          ],
          if (error != null) ...[const SizedBox(height: 12), ErrorBox(error)],
          const SizedBox(height: 24),
          GradButton(
              label: 'Create Account',
              loading: _loading,
              onTap: _loading ? null : _submit),
          const SizedBox(height: 20),
          Row(mainAxisAlignment: MainAxisAlignment.center, children: [
            Text('Already have an account? ',
                style: GoogleFonts.inter(
                    fontSize: 14, color: ReonColors.textMuted)),
            GestureDetector(
                onTap: () => Navigator.of(context).pushReplacement(
                    MaterialPageRoute(builder: (_) => LoginScreen())),
                child: Text('Sign in',
                    style: GoogleFonts.inter(
                        fontSize: 14,
                        fontWeight: FontWeight.w700,
                        color: ReonColors.primary))),
          ]),
        ]),
      )),
    );
  }
}

class _StrengthBar extends StatelessWidget {
  final int length;
  const _StrengthBar({required this.length});
  @override
  Widget build(BuildContext context) {
    final strength = length < 8
        ? 1
        : length < 12
            ? 2
            : 3;
    final colors = [Colors.red, Colors.orange, Colors.green];
    final labels = ['Weak', 'Good', 'Strong'];
    return Row(children: [
      ...List.generate(
          3,
          (i) => Expanded(
              child: Container(
                  height: 4,
                  margin: EdgeInsets.only(right: i < 2 ? 4 : 0),
                  decoration: BoxDecoration(
                      color: i < strength
                          ? colors[strength - 1]
                          : Colors.grey.shade300,
                      borderRadius: BorderRadius.circular(2))))),
      const SizedBox(width: 8),
      Text(labels[strength - 1],
          style: TextStyle(
              fontSize: 11,
              fontWeight: FontWeight.w600,
              color: colors[strength - 1])),
    ]);
  }
}
