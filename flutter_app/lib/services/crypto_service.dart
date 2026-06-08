// E2E Encryption — RSA-OAEP-SHA256 + AES-GCM-256
// Compatible with the web app's Web Crypto API implementation.
//
// Key format: JWK (JSON Web Key) — same structure as the web app so keys
// stored on the backend are interoperable across platforms.

import 'dart:convert';
import 'dart:math';
import 'dart:typed_data';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';
import 'package:pointycastle/export.dart';

class CryptoService {
  CryptoService._();
  static final CryptoService instance = CryptoService._();

  static const _storage = FlutterSecureStorage(
    aOptions: AndroidOptions(encryptedSharedPreferences: true),
  );
  static const _kPrivKey = 'reon_priv_key_jwk';
  static const _kPubKey = 'reon_pub_key_jwk';

  // ── Secure storage ────────────────────────────────────────────────────────────

  Future<bool> hasKeyPair() async {
    final priv = await _storage.read(key: _kPrivKey);
    final pub = await _storage.read(key: _kPubKey);
    return priv != null && pub != null;
  }

  Future<Map<String, dynamic>?> getStoredPublicKey() async {
    final s = await _storage.read(key: _kPubKey);
    if (s == null) return null;
    return jsonDecode(s) as Map<String, dynamic>;
  }

  Future<Map<String, dynamic>?> getStoredPrivateKey() async {
    final s = await _storage.read(key: _kPrivKey);
    if (s == null) return null;
    return jsonDecode(s) as Map<String, dynamic>;
  }

  Future<void> clearKeys() async {
    await _storage.delete(key: _kPrivKey);
    await _storage.delete(key: _kPubKey);
  }

  Future<void> importKeyPairFromPrivateJwk(Map<String, dynamic> privJwk) async {
    final pubJwk = {
      'kty': 'RSA',
      'alg': 'RSA-OAEP-256',
      'n': privJwk['n'],
      'e': privJwk['e'],
      'ext': true,
      'key_ops': ['encrypt'],
    };
    await _storage.write(key: _kPrivKey, value: jsonEncode(privJwk));
    await _storage.write(key: _kPubKey, value: jsonEncode(pubJwk));
  }

  // ── Key generation ────────────────────────────────────────────────────────────

  Future<Map<String, dynamic>> generateKeyPair() async {
    final rng = _buildSecureRandom();
    final gen = RSAKeyGenerator()
      ..init(ParametersWithRandom(
          RSAKeyGeneratorParameters(BigInt.from(65537), 2048, 64), rng));
    final pair = gen.generateKeyPair();
    final pub = pair.publicKey as RSAPublicKey;
    final priv = pair.privateKey as RSAPrivateKey;

    final pubJwk = _rsaPublicToJwk(pub);
    final privJwk = _rsaPrivateToJwk(priv);

    await _storage.write(key: _kPubKey, value: jsonEncode(pubJwk));
    await _storage.write(key: _kPrivKey, value: jsonEncode(privJwk));

    return pubJwk;
  }

  // ── JWK ↔ pointycastle ───────────────────────────────────────────────────────

  Map<String, dynamic> _rsaPublicToJwk(RSAPublicKey k) => {
        'kty': 'RSA',
        'alg': 'RSA-OAEP-256',
        'n': _b64url(k.modulus!),
        'e': _b64url(k.publicExponent!),
        'ext': true,
        'key_ops': ['encrypt'],
      };

  Map<String, dynamic> _rsaPrivateToJwk(RSAPrivateKey k) {
    final p = k.p!, q = k.q!, d = k.privateExponent!, n = k.modulus!;
    final e = k.publicExponent!;
    final dp = d % (p - BigInt.one);
    final dq = d % (q - BigInt.one);
    final qi = q.modInverse(p);
    return {
      'kty': 'RSA',
      'alg': 'RSA-OAEP-256',
      'n': _b64url(n),
      'e': _b64url(e),
      'd': _b64url(d),
      'p': _b64url(p),
      'q': _b64url(q),
      'dp': _b64url(dp),
      'dq': _b64url(dq),
      'qi': _b64url(qi),
      'ext': true,
      'key_ops': ['decrypt'],
    };
  }

  RSAPublicKey _jwkToPublic(Map<String, dynamic> jwk) => RSAPublicKey(
      _b64urlToBigInt(jwk['n'] as String), _b64urlToBigInt(jwk['e'] as String));

  RSAPrivateKey _jwkToPrivate(Map<String, dynamic> jwk) => RSAPrivateKey(
        _b64urlToBigInt(jwk['n'] as String),
        _b64urlToBigInt(jwk['d'] as String),
        _b64urlToBigInt(jwk['p'] as String),
        _b64urlToBigInt(jwk['q'] as String),
      );

  // ── RSA-OAEP encrypt/decrypt ──────────────────────────────────────────────────

  Uint8List _rsaEncrypt(Uint8List data, RSAPublicKey pub) {
    final cipher = OAEPEncoding.withSHA256(RSAEngine())
      ..init(true, PublicKeyParameter<RSAPublicKey>(pub));
    return cipher.process(data);
  }

  Uint8List _rsaDecrypt(Uint8List data, RSAPrivateKey priv) {
    final cipher = OAEPEncoding.withSHA256(RSAEngine())
      ..init(false, PrivateKeyParameter<RSAPrivateKey>(priv));
    return cipher.process(data);
  }

  // Encrypt an AES key (raw bytes) with a JWK public key → base64
  String rsaEncryptAesKey(
      Uint8List aesKeyBytes, Map<String, dynamic> recipientPubJwk) {
    final pub = _jwkToPublic(recipientPubJwk);
    return base64.encode(_rsaEncrypt(aesKeyBytes, pub));
  }

  // Decrypt an encrypted AES key (base64) with stored private JWK → raw bytes
  Future<Uint8List> rsaDecryptAesKey(String encryptedB64) async {
    final privJwk = await getStoredPrivateKey();
    if (privJwk == null) throw Exception('No private key stored');
    final priv = _jwkToPrivate(privJwk);
    return _rsaDecrypt(base64.decode(encryptedB64), priv);
  }

  // ── AES-GCM ───────────────────────────────────────────────────────────────────

  static const _tagBits = 128;

  Uint8List _aesGcmEncrypt(Uint8List key, Uint8List iv, Uint8List plain) {
    final gcm = GCMBlockCipher(AESEngine())
      ..init(
          true, AEADParameters(KeyParameter(key), _tagBits, iv, Uint8List(0)));
    return gcm.process(plain);
  }

  Uint8List _aesGcmDecrypt(Uint8List key, Uint8List iv, Uint8List cipher) {
    final gcm = GCMBlockCipher(AESEngine())
      ..init(
          false, AEADParameters(KeyParameter(key), _tagBits, iv, Uint8List(0)));
    return gcm.process(cipher);
  }

  // ── Text message encrypt ──────────────────────────────────────────────────────
  // Output matches web app: base64(12-byte IV ++ ciphertext) + RSA-encrypted AES keys

  Future<({String ciphertext, String encryptedKey, String senderEncryptedKey})>
      encryptText(
    String plaintext,
    Map<String, dynamic> receiverPubJwk,
  ) async {
    final myPubJwk = await getStoredPublicKey();
    if (myPubJwk == null) throw Exception('No public key stored');

    final aesKey = _randomBytes(32);
    final iv = _randomBytes(12);
    final encoded = Uint8List.fromList(utf8.encode(plaintext));
    final cipher = _aesGcmEncrypt(aesKey, iv, encoded);

    // Prepend IV (matches web app's decryptText)
    final combined = Uint8List(12 + cipher.length)
      ..setRange(0, 12, iv)
      ..setRange(12, 12 + cipher.length, cipher);

    final encKey = rsaEncryptAesKey(aesKey, receiverPubJwk);
    final senderEncKey = rsaEncryptAesKey(aesKey, myPubJwk);

    return (
      ciphertext: base64.encode(combined),
      encryptedKey: encKey,
      senderEncryptedKey: senderEncKey,
    );
  }

  // ── Text message decrypt ──────────────────────────────────────────────────────

  Future<String?> decryptText(
      String ciphertextB64, String encryptedKeyB64) async {
    try {
      final aesKeyBytes = await rsaDecryptAesKey(encryptedKeyB64);
      final combined = base64.decode(ciphertextB64);
      final iv = combined.sublist(0, 12);
      final cipher = combined.sublist(12);
      final plain = _aesGcmDecrypt(Uint8List.fromList(aesKeyBytes),
          Uint8List.fromList(iv), Uint8List.fromList(cipher));
      return utf8.decode(plain);
    } catch (_) {
      return null;
    }
  }

  // ── Device-linking (ECDH P-256 + AES-GCM) ───────────────────────────────────

  ECDomainParameters get _p256 => ECDomainParameters('prime256v1');

  Future<({Map<String, dynamic> publicKey, ECPrivateKey privateKey})>
      generateECDHKeyPair() async {
    final keyGen = ECKeyGenerator()
      ..init(ParametersWithRandom(
          ECKeyGeneratorParameters(_p256), _buildSecureRandom()));
    final pair = keyGen.generateKeyPair();
    return (
      publicKey: _ecPublicToJwk(pair.publicKey as ECPublicKey),
      privateKey: pair.privateKey as ECPrivateKey,
    );
  }

  Map<String, dynamic> _ecPublicToJwk(ECPublicKey pub) {
    final x = _fixedBytes(pub.Q!.x!.toBigInteger()!, 32);
    final y = _fixedBytes(pub.Q!.y!.toBigInteger()!, 32);
    return {
      'kty': 'EC',
      'crv': 'P-256',
      'x': base64Url.encode(x).replaceAll('=', ''),
      'y': base64Url.encode(y).replaceAll('=', ''),
      'ext': true,
    };
  }

  ECPublicKey _jwkToEcPublic(Map<String, dynamic> jwk) {
    final x = _b64urlToBigInt(jwk['x'] as String);
    final y = _b64urlToBigInt(jwk['y'] as String);
    return ECPublicKey(_p256.curve.createPoint(x, y), _p256);
  }

  Uint8List deriveTransferAesKey(
      ECPrivateKey myPrivate, Map<String, dynamic> theirPubJwk) {
    final agreement = ECDHBasicAgreement()..init(myPrivate);
    final secret = agreement.calculateAgreement(_jwkToEcPublic(theirPubJwk));
    return _fixedBytes(secret, 32);
  }

  Future<({String ciphertext, String iv})> encryptForTransfer(
    Map<String, dynamic> data,
    Uint8List aesKey,
  ) async {
    final iv = _randomBytes(12);
    final encoded = Uint8List.fromList(utf8.encode(jsonEncode(data)));
    final cipher = _aesGcmEncrypt(aesKey, iv, encoded);
    return (ciphertext: base64.encode(cipher), iv: base64.encode(iv));
  }

  Map<String, dynamic> decryptFromTransfer(
      String ciphertextB64, String ivB64, Uint8List aesKey) {
    final plain = _aesGcmDecrypt(
        aesKey, base64.decode(ivB64), base64.decode(ciphertextB64));
    return jsonDecode(utf8.decode(plain)) as Map<String, dynamic>;
  }

  Uint8List _fixedBytes(BigInt n, int length) {
    final bytes = _bigIntToBytes(n);
    if (bytes.length == length) return bytes;
    final out = Uint8List(length);
    if (bytes.length < length) {
      out.setRange(length - bytes.length, length, bytes);
    } else {
      out.setRange(0, length, bytes.sublist(bytes.length - length));
    }
    return out;
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  Uint8List _randomBytes(int length) {
    final rng = Random.secure();
    return Uint8List.fromList(List.generate(length, (_) => rng.nextInt(256)));
  }

  SecureRandom _buildSecureRandom() {
    final rng = FortunaRandom();
    final seed = _randomBytes(32);
    rng.seed(KeyParameter(seed));
    return rng;
  }

  String _b64url(BigInt n) {
    final bytes = _bigIntToBytes(n);
    return base64Url.encode(bytes).replaceAll('=', '');
  }

  BigInt _b64urlToBigInt(String s) {
    final padded = s.padRight((s.length + 3) ~/ 4 * 4, '=');
    return _bytesToBigInt(base64Url.decode(padded));
  }

  Uint8List _bigIntToBytes(BigInt n) {
    final hex = n.toRadixString(16).padLeft((n.bitLength + 7) ~/ 8 * 2, '0');
    final bytes = Uint8List(hex.length ~/ 2);
    for (var i = 0; i < bytes.length; i++) {
      bytes[i] = int.parse(hex.substring(i * 2, i * 2 + 2), radix: 16);
    }
    return bytes;
  }

  BigInt _bytesToBigInt(Uint8List bytes) {
    BigInt result = BigInt.zero;
    for (final b in bytes) {
      result = (result << 8) | BigInt.from(b);
    }
    return result;
  }
}
