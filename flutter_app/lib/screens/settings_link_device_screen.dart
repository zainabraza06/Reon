import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:flutter/services.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:pointycastle/ecc/api.dart';
import 'package:qr_flutter/qr_flutter.dart';
import '../config.dart';
import '../theme/app_theme.dart';
import '../services/api_service.dart';
import '../services/crypto_service.dart';
import '../services/socket_service.dart';

class SettingsLinkDeviceScreen extends StatefulWidget {
  const SettingsLinkDeviceScreen({super.key});
  @override State<SettingsLinkDeviceScreen> createState() => _SettingsLinkDeviceScreenState();
}

class _SettingsLinkDeviceScreenState extends State<SettingsLinkDeviceScreen> {
  String _step = 'generating';
  String _linkUrl = '';
  String _error = '';
  bool _copied = false;
  ECPrivateKey? _ecdhPrivate;
  String? _sessionId;

  @override
  void initState() {
    super.initState();
    _init();
    SocketService.instance.on('device-link-claimed', _onClaimed);
  }

  @override
  void dispose() {
    SocketService.instance.off('device-link-claimed', _onClaimed);
    super.dispose();
  }

  Future<void> _init() async {
    try {
      setState(() => _step = 'generating');
      final pair = await CryptoService.instance.generateECDHKeyPair();
      _ecdhPrivate = pair.privateKey;
      final sessionId = await ApiService.instance.createLinkSession(pair.publicKey);
      _sessionId = sessionId;

      final payload = base64.encode(utf8.encode(jsonEncode({
        'sessionId': sessionId,
        'ecdhPublicKey': pair.publicKey,
      })));
      final link = '$kSiteUrl/link-device?d=${Uri.encodeComponent(payload)}';
      if (mounted) setState(() { _linkUrl = link; _step = 'waiting'; });
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _step = 'error'; });
    }
  }

  Future<void> _onClaimed(dynamic data) async {
    final m = data as Map?;
    if (m == null || _ecdhPrivate == null || _sessionId == null) return;
    final sid = m['sessionId'] as String?;
    if (sid != _sessionId) return;

    try {
      if (mounted) setState(() => _step = 'transferring');
      final theirPub = m['ecdhPublicKey_B'] as Map<String, dynamic>;
      final aesKey = CryptoService.instance.deriveTransferAesKey(_ecdhPrivate!, theirPub);

      final privJwk = await CryptoService.instance.getStoredPrivateKey();
      if (privJwk == null) throw Exception('No private key on this device');

      final enc = await CryptoService.instance.encryptForTransfer(privJwk, aesKey);
      await ApiService.instance.transferLinkKey(_sessionId!, enc.ciphertext, enc.iv);
      if (mounted) setState(() => _step = 'done');
    } catch (e) {
      if (mounted) setState(() { _error = e.toString(); _step = 'error'; });
    }
  }

  Future<void> _copyLink() async {
    await Clipboard.setData(ClipboardData(text: _linkUrl));
    setState(() => _copied = true);
    Future.delayed(const Duration(seconds: 2), () { if (mounted) setState(() => _copied = false); });
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Link New Device')),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    return switch (_step) {
      'generating' || 'transferring' => const Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        CircularProgressIndicator(color: ReonColors.primary),
        SizedBox(height: 16),
        Text('Setting up secure transfer…'),
      ])),
      'error' => Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.error_outline, color: ReonColors.danger, size: 48),
        const SizedBox(height: 12),
        Text(_error, textAlign: TextAlign.center),
        const SizedBox(height: 16),
        ElevatedButton(onPressed: _init, child: const Text('Try Again')),
      ])),
      'done' => Center(child: Column(mainAxisSize: MainAxisSize.min, children: [
        const Icon(Icons.check_circle_rounded, color: Colors.teal, size: 56),
        const SizedBox(height: 12),
        Text('Keys transferred!', style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 18)),
        const SizedBox(height: 8),
        Text('The new device can now decrypt your messages.', style: GoogleFonts.inter(color: ReonColors.textMuted), textAlign: TextAlign.center),
      ])),
      _ => Column(children: [
        const Icon(Icons.shield_outlined, color: ReonColors.primary, size: 40),
        const SizedBox(height: 12),
        Text('Scan with your new device', style: GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 17)),
        const SizedBox(height: 8),
        Text(
          'Open Reon on the device you want to link and scan this QR code. Your private key is encrypted — the server never sees it.',
          style: GoogleFonts.inter(fontSize: 13, color: ReonColors.textMuted),
          textAlign: TextAlign.center,
        ),
        const SizedBox(height: 24),
        if (_linkUrl.isNotEmpty)
          Container(
            padding: const EdgeInsets.all(16),
            decoration: BoxDecoration(color: Colors.white, borderRadius: BorderRadius.circular(16)),
            child: QrImageView(data: _linkUrl, size: 220, backgroundColor: Colors.white),
          ),
        const SizedBox(height: 16),
        OutlinedButton.icon(
          onPressed: _copyLink,
          icon: Icon(_copied ? Icons.check_rounded : Icons.copy_rounded, size: 18),
          label: Text(_copied ? 'Copied!' : 'Copy link'),
        ),
        const SizedBox(height: 12),
        Text('Waiting for device to connect…', style: GoogleFonts.inter(fontSize: 12, color: ReonColors.textMuted)),
      ]),
    };
  }
}
