import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:pointycastle/ecc/api.dart';
import '../theme/app_theme.dart';
import '../services/api_service.dart';
import '../services/crypto_service.dart';

class LinkDeviceScreen extends StatefulWidget {
  const LinkDeviceScreen({super.key});
  @override
  State<LinkDeviceScreen> createState() => _LinkDeviceScreenState();
}

class _LinkDeviceScreenState extends State<LinkDeviceScreen> {
  final _manual = TextEditingController();

  String _step = 'scan'; // scan | connecting | done | error
  String _error = '';
  ECPrivateKey? _ecdhPrivate;

  @override
  void dispose() {
    _manual.dispose();
    super.dispose();
  }

  // ── Open live scanner ─────────────────────────────────────────────────────────

  Future<void> _openScanner() async {
    setState(() => _error = '');
    final raw = await Navigator.push<String>(
      context,
      MaterialPageRoute(builder: (_) => const _QRScannerPage()),
    );
    if (raw == null || !mounted) return;
    _handleRaw(raw);
  }

  // ── Payload extraction ────────────────────────────────────────────────────────

  String? _extractPayload(String raw) {
    try {
      final uri = Uri.parse(raw);
      final d = uri.queryParameters['d'];
      if (d != null && d.isNotEmpty) return d;
    } catch (_) {}
    try {
      final decoded = utf8.decode(base64.decode(raw));
      final parsed = jsonDecode(decoded) as Map<String, dynamic>;
      if (parsed['sessionId'] != null && parsed['ecdhPublicKey'] != null) {
        return raw;
      }
    } catch (_) {}
    return null;
  }

  void _handleRaw(String raw) {
    final payload = _extractPayload(raw);
    if (payload != null) {
      _processPayload(payload);
    } else {
      if (mounted) {
        setState(() => _error =
            'Invalid QR code. Make sure you scan the one shown on your other device.');
      }
    }
  }

  // ── Key-exchange flow ─────────────────────────────────────────────────────────

  Future<void> _processPayload(String encoded) async {
    setState(() {
      _step = 'connecting';
      _error = '';
    });
    try {
      final json =
          jsonDecode(utf8.decode(base64.decode(Uri.decodeComponent(encoded))))
              as Map<String, dynamic>;
      final sessionId = json['sessionId'] as String;
      final ecdhPubA = json['ecdhPublicKey'] as Map<String, dynamic>;

      final pair = await CryptoService.instance.generateECDHKeyPair();
      _ecdhPrivate = pair.privateKey;

      await ApiService.instance.claimLinkSession(sessionId, pair.publicKey);

      for (var i = 0; i < 60; i++) {
        final session = await ApiService.instance.getLinkSession(sessionId);
        if (session.status == 'ready' &&
            session.encryptedPrivateKey != null &&
            session.iv != null) {
          final aesKey = CryptoService.instance
              .deriveTransferAesKey(_ecdhPrivate!, ecdhPubA);
          final privJwk = CryptoService.instance.decryptFromTransfer(
              session.encryptedPrivateKey!, session.iv!, aesKey);
          await CryptoService.instance.importKeyPairFromPrivateJwk(privJwk);
          if (mounted) setState(() => _step = 'done');
          return;
        }
        await Future.delayed(const Duration(seconds: 1));
      }
      throw Exception('Timed out waiting for key transfer');
    } catch (e) {
      if (mounted) setState(() {
        _error = e.toString();
        _step = 'error';
      });
    }
  }

  void _submitManual() {
    final payload = _extractPayload(_manual.text.trim());
    if (payload == null) {
      setState(() => _error = 'Invalid link or payload');
      return;
    }
    _processPayload(payload);
  }

  // ── UI ────────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return Scaffold(
      backgroundColor:
          isDark ? const Color(0xFF080816) : const Color(0xFFF5F7FF),
      appBar: AppBar(
        title: const Text('Link This Device'),
        backgroundColor: isDark ? ReonColors.surfaceDark : Colors.white,
        elevation: 0,
      ),
      body: Padding(
        padding: const EdgeInsets.all(24),
        child: _buildBody(isDark),
      ),
    );
  }

  Widget _buildBody(bool isDark) {
    switch (_step) {
      case 'connecting':
        return const Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            CircularProgressIndicator(color: ReonColors.primary),
            SizedBox(height: 16),
            Text('Receiving encryption keys…'),
          ]),
        );

      case 'done':
        return Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.shield_rounded, color: Colors.teal, size: 56),
            const SizedBox(height: 12),
            Text('Device linked!',
                style: GoogleFonts.inter(
                    fontWeight: FontWeight.w700, fontSize: 18)),
            const SizedBox(height: 8),
            Text(
              'Your encryption keys are ready. You can now read your encrypted messages on this device.',
              style: GoogleFonts.inter(color: ReonColors.textMuted),
              textAlign: TextAlign.center,
            ),
            const SizedBox(height: 20),
            FilledButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Done'),
            ),
          ]),
        );

      case 'error':
        return Center(
          child: Column(mainAxisSize: MainAxisSize.min, children: [
            const Icon(Icons.error_outline,
                color: ReonColors.danger, size: 48),
            const SizedBox(height: 12),
            Text(_error,
                textAlign: TextAlign.center,
                style: GoogleFonts.inter(fontSize: 14)),
            const SizedBox(height: 16),
            FilledButton(
              onPressed: () => setState(() {
                _step = 'scan';
                _error = '';
              }),
              child: const Text('Try Again'),
            ),
          ]),
        );

      default: // 'scan'
        return Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text('Scan QR Code',
                  style: GoogleFonts.inter(
                      fontWeight: FontWeight.w700, fontSize: 17)),
              const SizedBox(height: 6),
              Text(
                'Open the scanner and point it at the QR code shown on your other device, or pick a screenshot from your gallery.',
                style: GoogleFonts.inter(
                    fontSize: 13, color: ReonColors.textMuted),
              ),
              const SizedBox(height: 28),

              _ScanOption(
                icon: Icons.qr_code_scanner_rounded,
                label: 'Scan QR Code',
                description: 'Live camera · torch · gallery picker',
                color: ReonColors.primary,
                onTap: _openScanner,
              ),

              const SizedBox(height: 28),

              Row(children: [
                const Expanded(child: Divider()),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 12),
                  child: Text('or paste manually',
                      style: GoogleFonts.inter(
                          fontSize: 12, color: ReonColors.textMuted)),
                ),
                const Expanded(child: Divider()),
              ]),

              const SizedBox(height: 16),

              TextField(
                controller: _manual,
                decoration: const InputDecoration(
                  hintText: 'Paste link or payload here…',
                  prefixIcon: Icon(Icons.link_rounded),
                ),
                maxLines: 2,
              ),

              if (_error.isNotEmpty) ...[
                const SizedBox(height: 8),
                Text(_error,
                    style: GoogleFonts.inter(
                        color: ReonColors.danger, fontSize: 13)),
              ],

              const SizedBox(height: 12),
              FilledButton(
                onPressed: _submitManual,
                child: const Text('Connect'),
              ),
            ]);
    }
  }
}

// ── Scan option card ──────────────────────────────────────────────────────────

class _ScanOption extends StatelessWidget {
  final IconData icon;
  final String label;
  final String description;
  final Color color;
  final VoidCallback onTap;

  const _ScanOption({
    required this.icon,
    required this.label,
    required this.description,
    required this.color,
    required this.onTap,
  });

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return GestureDetector(
      onTap: onTap,
      child: Container(
        padding:
            const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: isDark ? ReonColors.cardDark : Colors.white,
          borderRadius: BorderRadius.circular(14),
          border: Border.all(
              color: color.withValues(alpha: 0.3), width: 1.5),
          boxShadow: [
            BoxShadow(
              color: Colors.black
                  .withValues(alpha: isDark ? 0.2 : 0.05),
              blurRadius: 8,
              offset: const Offset(0, 2),
            ),
          ],
        ),
        child: Row(children: [
          Container(
            width: 46,
            height: 46,
            decoration: BoxDecoration(
              color: color.withValues(alpha: 0.12),
              shape: BoxShape.circle,
            ),
            child: Icon(icon, color: color, size: 24),
          ),
          const SizedBox(width: 14),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(label,
                    style: GoogleFonts.inter(
                        fontSize: 14,
                        fontWeight: FontWeight.w600,
                        color: isDark
                            ? ReonColors.textDark
                            : ReonColors.textLight)),
                const SizedBox(height: 2),
                Text(description,
                    style: GoogleFonts.inter(
                        fontSize: 12, color: ReonColors.textMuted)),
              ],
            ),
          ),
          Icon(Icons.arrow_forward_ios_rounded,
              size: 14, color: ReonColors.textMuted),
        ]),
      ),
    );
  }
}

// ── Full-screen live QR scanner page ─────────────────────────────────────────

class _QRScannerPage extends StatefulWidget {
  const _QRScannerPage();
  @override
  State<_QRScannerPage> createState() => _QRScannerPageState();
}

class _QRScannerPageState extends State<_QRScannerPage> {
  late final MobileScannerController _controller;
  final _picker = ImagePicker();
  bool _scanned = false;
  bool _analyzing = false;
  String? _galleryError;
  bool _torchOn = false;

  @override
  void initState() {
    super.initState();
    _controller = MobileScannerController(
      autoStart: true,
      torchEnabled: false,
    );
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  Future<void> _pickFromGallery() async {
    if (_analyzing) return;
    setState(() {
      _analyzing = true;
      _galleryError = null;
    });
    try {
      final f = await _picker.pickImage(source: ImageSource.gallery);
      if (f == null) {
        if (mounted) setState(() => _analyzing = false);
        return;
      }
      final capture = await _controller.analyzeImage(f.path);
      final raw = capture?.barcodes.firstOrNull?.rawValue;
      if (!mounted) return;
      if (raw != null) {
        _scanned = true;
        Navigator.pop(context, raw);
      } else {
        setState(() {
          _analyzing = false;
          _galleryError = 'No QR code found in this image. Try another photo.';
        });
      }
    } catch (e) {
      if (mounted) {
        setState(() {
          _analyzing = false;
          _galleryError = 'Could not read image: $e';
        });
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        backgroundColor: Colors.black,
        foregroundColor: Colors.white,
        title: Text('Scan QR Code',
            style: GoogleFonts.inter(
                color: Colors.white, fontWeight: FontWeight.w600)),
        actions: [
          IconButton(
            icon: Icon(
              _torchOn ? Icons.flash_on_rounded : Icons.flash_off_rounded,
              color: _torchOn ? Colors.amber : Colors.white60,
            ),
            tooltip: 'Toggle torch',
            onPressed: () {
              _controller.toggleTorch();
              setState(() => _torchOn = !_torchOn);
            },
          ),
        ],
      ),
      body: Stack(children: [
        // Live camera view
        MobileScanner(
          controller: _controller,
          onDetect: (capture) {
            if (_scanned) return;
            final raw = capture.barcodes.firstOrNull?.rawValue;
            if (raw != null) {
              _scanned = true;
              Navigator.pop(context, raw);
            }
          },
        ),

        // Scan frame
        Center(
          child: Container(
            width: 248,
            height: 248,
            decoration: BoxDecoration(
              border: Border.all(
                  color: ReonColors.primary,
                  width: 2.5,
                  strokeAlign: BorderSide.strokeAlignOutside),
              borderRadius: BorderRadius.circular(16),
            ),
          ),
        ),

        // Corner accents
        Center(
          child: SizedBox(
            width: 248,
            height: 248,
            child: CustomPaint(painter: _CornerPainter()),
          ),
        ),

        // Bottom overlay: hint + gallery button
        Positioned(
          bottom: 0,
          left: 0,
          right: 0,
          child: Container(
            padding: EdgeInsets.fromLTRB(
                24, 20, 24, MediaQuery.of(context).padding.bottom + 28),
            decoration: BoxDecoration(
              gradient: LinearGradient(
                begin: Alignment.bottomCenter,
                end: Alignment.topCenter,
                colors: [
                  Colors.black.withValues(alpha: 0.85),
                  Colors.transparent,
                ],
              ),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  'Point at the QR code on your other device',
                  textAlign: TextAlign.center,
                  style: GoogleFonts.inter(
                      color: Colors.white70, fontSize: 13, height: 1.4),
                ),
                const SizedBox(height: 16),
                OutlinedButton.icon(
                  icon: const Icon(Icons.photo_library_rounded,
                      color: Colors.white, size: 18),
                  label: Text('Choose from Gallery',
                      style: GoogleFonts.inter(
                          color: Colors.white,
                          fontSize: 14,
                          fontWeight: FontWeight.w500)),
                  style: OutlinedButton.styleFrom(
                    side: const BorderSide(color: Colors.white38),
                    padding: const EdgeInsets.symmetric(vertical: 12),
                    shape: RoundedRectangleBorder(
                        borderRadius: BorderRadius.circular(10)),
                  ),
                  onPressed: _analyzing ? null : _pickFromGallery,
                ),
                if (_galleryError != null) ...[
                  const SizedBox(height: 8),
                  Text(_galleryError!,
                      textAlign: TextAlign.center,
                      style: GoogleFonts.inter(
                          color: Colors.redAccent, fontSize: 12)),
                ],
              ],
            ),
          ),
        ),

        // Overlay while analyzing gallery image
        if (_analyzing)
          Container(
            color: Colors.black54,
            child: const Center(
                child: CircularProgressIndicator(color: Colors.white)),
          ),
      ]),
    );
  }
}

// ── Corner accent painter ─────────────────────────────────────────────────────

class _CornerPainter extends CustomPainter {
  @override
  void paint(Canvas canvas, Size size) {
    final paint = Paint()
      ..color = ReonColors.primary
      ..strokeWidth = 4
      ..style = PaintingStyle.stroke
      ..strokeCap = StrokeCap.round;
    const len = 28.0;
    const r = 16.0;

    // top-left
    canvas.drawLine(const Offset(0, r), const Offset(0, len), paint);
    canvas.drawLine(const Offset(r, 0), const Offset(len, 0), paint);
    // top-right
    canvas.drawLine(
        Offset(size.width - r, 0), Offset(size.width - len, 0), paint);
    canvas.drawLine(Offset(size.width, r), Offset(size.width, len), paint);
    // bottom-left
    canvas.drawLine(
        Offset(0, size.height - r), Offset(0, size.height - len), paint);
    canvas.drawLine(
        Offset(r, size.height), Offset(len, size.height), paint);
    // bottom-right
    canvas.drawLine(Offset(size.width - r, size.height),
        Offset(size.width - len, size.height), paint);
    canvas.drawLine(Offset(size.width, size.height - r),
        Offset(size.width, size.height - len), paint);
  }

  @override
  bool shouldRepaint(_CornerPainter o) => false;
}
