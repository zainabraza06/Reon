import 'dart:async';
import 'dart:convert';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:mobile_scanner/mobile_scanner.dart';
import 'package:permission_handler/permission_handler.dart';
import 'package:pointycastle/ecc/api.dart';
import '../theme/app_theme.dart';
import '../services/api_service.dart';
import '../services/crypto_service.dart';

class LinkDeviceScreen extends StatefulWidget {
  const LinkDeviceScreen({super.key});
  @override
  State<LinkDeviceScreen> createState() => _LinkDeviceScreenState();
}

class _LinkDeviceScreenState extends State<LinkDeviceScreen>
    with WidgetsBindingObserver {
  final _manual = TextEditingController();
  MobileScannerController _scannerController = MobileScannerController(autoStart: false);
  String _step = 'scan';
  String _error = '';
  bool _permGranted = false;
  bool _permChecked = false;
  bool _permPermanentlyDenied = false;
  bool _cameraLoading = false;
  ECPrivateKey? _ecdhPrivate;

  @override
  void initState() {
    super.initState();
    WidgetsBinding.instance.addObserver(this);
    WidgetsBinding.instance
        .addPostFrameCallback((_) => _requestCameraPermission());
  }

  @override
  void didChangeAppLifecycleState(AppLifecycleState state) {
    if (!_permGranted) return;
    switch (state) {
      case AppLifecycleState.resumed:
        _startCameraWithDelay();
      case AppLifecycleState.inactive:
      case AppLifecycleState.paused:
        _scannerController.stop();
      default:
        break;
    }
  }

  Future<void> _startCameraWithDelay() async {
    // Brief delay prevents genericError on devices where camera
    // takes a moment to become available after permission/resume.
    await Future.delayed(const Duration(milliseconds: 400));
    if (mounted) _scannerController.start();
  }

  /// Disposes the current controller and creates a fresh one, then starts it.
  /// Required because a controller in an error state cannot be recovered with start().
  Future<void> _recreateAndStartCamera() async {
    if (!mounted) return;
    setState(() => _cameraLoading = true);
    await _scannerController.dispose();
    if (!mounted) return;
    setState(() {
      _scannerController = MobileScannerController(autoStart: false);
      _cameraLoading = false;
    });
    await _startCameraWithDelay();
  }

  Future<void> _requestCameraPermission() async {
    var status = await Permission.camera.status;
    if (!mounted) return;

    if (!status.isGranted) {
      status = await Permission.camera.request();
      if (!mounted) return;
    }

    if (status.isGranted) {
      setState(() {
        _permGranted = true;
        _permChecked = true;
        _permPermanentlyDenied = false;
      });
      await _startCameraWithDelay();
    } else {
      setState(() {
        _permChecked = true;
        _permGranted = false;
        _permPermanentlyDenied = status.isPermanentlyDenied;
        _step = 'error';
        _error = status.isPermanentlyDenied
            ? 'Camera access is permanently blocked.\nTap "Open Settings" and enable Camera for Reon.'
            : 'Camera permission is required to scan the QR code.\nTap Retry to grant access.';
      });
    }
  }

  @override
  void dispose() {
    WidgetsBinding.instance.removeObserver(this);
    _scannerController.dispose();
    _manual.dispose();
    super.dispose();
  }

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

      // Poll until keys are ready
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
      if (mounted) {
        setState(() {
          _error = e.toString();
          _step = 'error';
        });
      }
    }
  }

  void _onScan(BarcodeCapture capture) {
    final raw = capture.barcodes.firstOrNull?.rawValue;
    if (raw == null || _step != 'scan') return;
    final payload = _extractPayload(raw);
    if (payload != null) _processPayload(payload);
  }

  void _submitManual() {
    final payload = _extractPayload(_manual.text.trim());
    if (payload == null) {
      setState(() => _error = 'Invalid link or payload');
      return;
    }
    _processPayload(payload);
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(title: const Text('Link This Device')),
      body: Padding(
        padding: const EdgeInsets.all(20),
        child: _buildBody(),
      ),
    );
  }

  Widget _buildBody() {
    return switch (_step) {
      'connecting' => const Center(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
          CircularProgressIndicator(color: ReonColors.primary),
          SizedBox(height: 16),
          Text('Receiving encryption keys…'),
        ])),
      'done' => Center(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.shield_rounded, color: Colors.teal, size: 56),
          const SizedBox(height: 12),
          Text('Device linked!',
              style:
                  GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 18)),
          const SizedBox(height: 8),
          Text(
              'Your encryption keys are ready. You can now read your encrypted messages on this device.',
              style: GoogleFonts.inter(color: ReonColors.textMuted),
              textAlign: TextAlign.center),
          const SizedBox(height: 20),
          ElevatedButton(
              onPressed: () => Navigator.pop(context),
              child: const Text('Done')),
        ])),
      'error' => Center(
            child: Column(mainAxisSize: MainAxisSize.min, children: [
          const Icon(Icons.error_outline, color: ReonColors.danger, size: 48),
          const SizedBox(height: 12),
          Text(_error,
              textAlign: TextAlign.center,
              style: GoogleFonts.inter(fontSize: 14)),
          const SizedBox(height: 16),
          if (_permPermanentlyDenied)
            ElevatedButton(
              onPressed: () async {
                await openAppSettings();
                // Re-check permission after user returns from Settings
                if (!mounted) return;
                setState(() { _step = 'scan'; _error = ''; });
                await _requestCameraPermission();
              },
              child: const Text('Open Settings'),
            )
          else
            ElevatedButton(
              onPressed: () async {
                setState(() { _step = 'scan'; _error = ''; });
                await _requestCameraPermission();
              },
              child: const Text('Retry'),
            ),
        ])),
      _ => Column(crossAxisAlignment: CrossAxisAlignment.stretch, children: [
          Text('Scan QR Code',
              style:
                  GoogleFonts.inter(fontWeight: FontWeight.w700, fontSize: 17)),
          const SizedBox(height: 8),
          Text(
              'Scan the QR code shown on your other device, or paste the link below.',
              style:
                  GoogleFonts.inter(fontSize: 13, color: ReonColors.textMuted)),
          const SizedBox(height: 16),
          ClipRRect(
            borderRadius: BorderRadius.circular(16),
            child: SizedBox(
              height: 260,
              child: _permGranted
                  ? MobileScanner(
                      controller: _scannerController,
                      onDetect: _onScan,
                      errorBuilder: (context, error, child) {
                        // Auto-recreate controller on first error — broken
                        // controllers cannot recover with start() alone.
                        WidgetsBinding.instance.addPostFrameCallback((_) {
                          if (mounted && !_cameraLoading) {
                            _recreateAndStartCamera();
                          }
                        });
                        return const ColoredBox(
                          color: Colors.black,
                          child: Center(
                            child: Column(
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                CircularProgressIndicator(color: Colors.white54),
                                SizedBox(height: 10),
                                Text('Starting camera…',
                                    style: TextStyle(color: Colors.white54, fontSize: 12)),
                              ],
                            ),
                          ),
                        );
                      },
                    )
                  : ColoredBox(
                      color: Colors.black,
                      child: Center(
                        child: _permChecked
                            ? Column(mainAxisSize: MainAxisSize.min, children: [
                                const Icon(Icons.no_photography_outlined,
                                    color: Colors.white54, size: 40),
                                const SizedBox(height: 8),
                                Text(_error,
                                    style: const TextStyle(
                                        color: Colors.white70, fontSize: 12),
                                    textAlign: TextAlign.center),
                              ])
                            : const CircularProgressIndicator(
                                color: Colors.white),
                      ),
                    ),
            ),
          ),
          const SizedBox(height: 20),
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
                style:
                    GoogleFonts.inter(color: ReonColors.danger, fontSize: 13)),
          ],
          const SizedBox(height: 12),
          ElevatedButton(
              onPressed: _submitManual, child: const Text('Connect')),
        ]),
    };
  }
}
