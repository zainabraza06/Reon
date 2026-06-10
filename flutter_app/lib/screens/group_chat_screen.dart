import 'dart:async';
import 'dart:convert';
import 'dart:io';
import 'dart:typed_data';
import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:google_fonts/google_fonts.dart';
import 'package:image_picker/image_picker.dart';
import 'package:file_picker/file_picker.dart';
import 'package:intl/intl.dart';
import 'package:path_provider/path_provider.dart';
import 'package:provider/provider.dart';
import 'package:record/record.dart';
import '../theme/app_theme.dart';
import '../models/group_chat.dart';
import '../providers/auth_provider.dart';
import '../services/api_service.dart';
import '../services/notification_service.dart';
import '../services/socket_service.dart';
import '../services/crypto_service.dart';
import '../widgets/chat_avatar.dart';
import '../widgets/message_bubble.dart';

// 50 common emoji stickers (shared with ChatScreen)
const _stickers = [
  '😀', '😂', '😍', '🥰', '😊', '😎', '🤔', '😭', '😡', '🥺',
  '👍', '👎', '❤️', '💯', '🔥', '✨', '🎉', '👀', '💪', '🙏',
  '😅', '😆', '🤩', '🥳', '😴', '🤒', '🤗', '😏', '🫠', '🫡',
  '🐶', '🐱', '🦁', '🐼', '🦊', '🐸', '🌸', '🌟', '⭐', '💎',
  '🍕', '🍔', '🍣', '🍦', '🎂', '🍩', '☕', '🎮', '🎵', '🏆',
];

class GroupChatScreen extends StatefulWidget {
  final String groupId;
  final String groupName;

  const GroupChatScreen(
      {super.key, required this.groupId, required this.groupName});
  @override
  State<GroupChatScreen> createState() => _GroupChatScreenState();
}

class _GroupChatScreenState extends State<GroupChatScreen> {
  final _input = TextEditingController();
  final _scroll = ScrollController();
  final _imagePicker = ImagePicker();
  final _audioRecorder = AudioRecorder();

  List<GroupMessage> _messages = [];
  GroupChat? _group;
  bool _loading = true;
  bool _hasMore = true;
  bool _uploading = false;
  bool _showEmojiPanel = false;
  bool _recording = false;
  Duration _recordDuration = Duration.zero;
  Timer? _recordTimer;

  @override
  void initState() {
    super.initState();
    NotificationService.activeGroupId = widget.groupId;
    _loadMessages();
    _loadGroup();
    _listenSocket();
  }

  @override
  void dispose() {
    if (NotificationService.activeGroupId == widget.groupId) {
      NotificationService.activeGroupId = null;
    }
    _input.dispose();
    _scroll.dispose();
    _recordTimer?.cancel();
    _audioRecorder.dispose();
    SocketService.instance.off('new-group-message', _onNewMsg);
    SocketService.instance.off('group-message-delivered', _onDelivered);
    SocketService.instance.off('group-messages-read', _onRead);
    super.dispose();
  }

  // ── Load ──────────────────────────────────────────────────────────────────────

  Future<void> _loadMessages({String? before}) async {
    setState(() => _loading = true);
    try {
      final raw = await ApiService.instance
          .getGroupMessages(widget.groupId, before: before);
      if (!mounted) return;
      final myId = context.read<AuthProvider>().user!.id;
      final dec = await Future.wait(raw.map((m) => _decrypt(m, myId)));
      if (mounted) {
        setState(() {
          _messages = before != null ? [...dec, ..._messages] : dec;
          _hasMore = raw.length == 50;
          _loading = false;
        });
      }
      _scrollToBottom();
    } catch (_) {
      if (mounted) setState(() => _loading = false);
    }
    await ApiService.instance.markGroupRead(widget.groupId).catchError((_) {});
  }

  Future<void> _loadGroup() async {
    try {
      final g = await ApiService.instance.getGroup(widget.groupId);
      if (mounted) setState(() => _group = g);
    } catch (_) {}
  }

  // ── Decrypt ───────────────────────────────────────────────────────────────────

  Future<GroupMessage> _decrypt(GroupMessage m, String myId) async {
    if (m.isSystem) return m; // system messages are plain text, no encryption
    if (m.ciphertext == null || m.encryptedKey == null) return m;
    final plain = await CryptoService.instance
        .decryptText(m.ciphertext!, m.encryptedKey!);
    return m.copyWith(plaintext: plain ?? '[decryption failed]');
  }

  // ── Send text ─────────────────────────────────────────────────────────────────

  Future<void> _send() async {
    final text = _input.text.trim();
    if (text.isEmpty || _group == null) return;
    _input.clear();
    setState(() {});

    final prepared = await CryptoService.instance.encryptGroupText(text);

    final memberKeys = <Map<String, dynamic>>[];
    for (final mem in _group!.members) {
      try {
        final jwkStr = await ApiService.instance.tryGetPublicKey(mem.user.id);
        if (jwkStr != null) {
          final jwk = jsonDecode(jwkStr) as Map<String, dynamic>;
          memberKeys.add({
            'userId': mem.user.id,
            'encryptedKey': prepared.encryptKeyFor(jwk),
          });
        }
      } catch (_) {}
    }
    if (memberKeys.isEmpty) return;

    final payload = jsonEncode({
      'ciphertext': prepared.ciphertext,
      'contentType': 'text',
      'memberKeys': memberKeys,
    });
    final fd = FormData.fromMap({'data': payload});

    try {
      final sent =
          await ApiService.instance.sendGroupMessage(widget.groupId, fd);
      final dec = sent.copyWith(plaintext: text);
      if (mounted) {
        setState(() {
          // Replace if socket already added this message (may be encrypted),
          // otherwise append (socket hasn't fired yet).
          final idx = _messages.indexWhere((m) => m.id == dec.id);
          if (idx >= 0) {
            _messages[idx] = dec;
          } else {
            _messages.add(dec);
          }
        });
      }
      _scrollToBottom();
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Send failed: $e')));
      }
    }
    await ApiService.instance.markGroupRead(widget.groupId).catchError((_) {});
  }

  // ── Send media ────────────────────────────────────────────────────────────────

  Future<void> _sendMedia(
    Uint8List fileBytes,
    String contentType,
    String myId, {
    String? fileName,
    bool isVoiceMessage = false,
  }) async {
    if (_uploading || _group == null) return;
    setState(() => _uploading = true);

    // Show optimistic preview while uploading
    final me = context.read<AuthProvider>().user!;
    final tempId = 'temp_${DateTime.now().millisecondsSinceEpoch}';
    final optimistic = GroupMessage(
      id: tempId,
      groupId: widget.groupId,
      sender: me,
      contentType: contentType,
      sentAt: DateTime.now(),
      localBytes: contentType == 'image' ? fileBytes : null,
      localFileName: fileName,
    );
    if (mounted) setState(() => _messages.add(optimistic));
    _scrollToBottom();

    try {
      final enc = await CryptoService.instance.encryptGroupMedia(fileBytes);

      final memberKeys = <Map<String, dynamic>>[];
      for (final mem in _group!.members) {
        try {
          final jwkStr = await ApiService.instance.tryGetPublicKey(mem.user.id);
          if (jwkStr != null) {
            final jwk = jsonDecode(jwkStr) as Map<String, dynamic>;
            memberKeys.add({
              'userId': mem.user.id,
              'encryptedKey': enc.encryptKeyFor(jwk),
            });
          }
        } catch (_) {}
      }

      final mediaKeys = [
        {'memberKeys': memberKeys, 'encryptionIV': enc.iv}
      ];

      final payload = jsonEncode({
        'contentType': contentType,
        'mediaKeys': mediaKeys,
      });

      final mimeType = _mimeFor(contentType, fileName);
      final form = FormData.fromMap({
        'data': payload,
        'files': MultipartFile.fromBytes(
          enc.encryptedBytes,
          filename: fileName ?? '$contentType.bin',
          contentType: DioMediaType.parse(mimeType),
        ),
      });

      final sent = await ApiService.instance.sendGroupMessage(widget.groupId, form);
      if (mounted) {
        setState(() {
          // Replace optimistic bubble with real server message
          final tempIdx = _messages.indexWhere((m) => m.id == tempId);
          if (tempIdx >= 0) {
            _messages[tempIdx] = sent;
          } else {
            // Socket may have already added it
            final serverIdx = _messages.indexWhere((m) => m.id == sent.id);
            if (serverIdx >= 0) _messages[serverIdx] = sent;
            else _messages.add(sent);
          }
        });
      }
      _scrollToBottom();
    } catch (e) {
      if (mounted) {
        setState(() => _messages.removeWhere((m) => m.id == tempId));
        ScaffoldMessenger.of(context)
            .showSnackBar(SnackBar(content: Text('Upload failed: $e')));
      }
    }

    if (mounted) setState(() => _uploading = false);
  }

  String _mimeFor(String contentType, String? fileName) {
    if (contentType == 'image') {
      final ext = fileName?.split('.').last.toLowerCase();
      if (ext == 'png') return 'image/png';
      if (ext == 'gif') return 'image/gif';
      if (ext == 'webp') return 'image/webp';
      return 'image/jpeg';
    }
    if (contentType == 'video') return 'video/mp4';
    if (contentType == 'audio') return 'audio/aac';
    return 'application/octet-stream';
  }

  // ── Voice recording ───────────────────────────────────────────────────────────

  Future<void> _startRecording() async {
    if (!await _audioRecorder.hasPermission()) return;
    final dir = await getTemporaryDirectory();
    final path =
        '${dir.path}/voice_${DateTime.now().millisecondsSinceEpoch}.aac';
    await _audioRecorder.start(
      const RecordConfig(encoder: AudioEncoder.aacLc, numChannels: 1),
      path: path,
    );
    setState(() {
      _recording = true;
      _recordDuration = Duration.zero;
    });
    _recordTimer = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) setState(() => _recordDuration += const Duration(seconds: 1));
    });
  }

  Future<void> _stopAndSendVoice(String myId) async {
    _recordTimer?.cancel();
    final path = await _audioRecorder.stop();
    setState(() => _recording = false);
    if (path == null) return;
    final bytes = await File(path).readAsBytes();
    await _sendMedia(bytes, 'audio', myId,
        fileName: 'voice.aac', isVoiceMessage: true);
  }

  Future<void> _cancelRecording() async {
    _recordTimer?.cancel();
    await _audioRecorder.stop();
    if (mounted) setState(() {
      _recording = false;
      _recordDuration = Duration.zero;
    });
  }

  String _formatDuration(Duration d) =>
      '${d.inMinutes.toString().padLeft(2, '0')}:'
      '${(d.inSeconds % 60).toString().padLeft(2, '0')}';

  // ── Attachment sheet ──────────────────────────────────────────────────────────

  Future<void> _showAttachmentSheet(String myId) async {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    await showModalBottomSheet<void>(
      context: context,
      backgroundColor: isDark ? ReonColors.surfaceDark : Colors.white,
      shape: const RoundedRectangleBorder(
          borderRadius: BorderRadius.vertical(top: Radius.circular(20))),
      builder: (ctx) => SafeArea(
        child: Padding(
          padding: const EdgeInsets.symmetric(vertical: 24, horizontal: 16),
          child: Row(
            mainAxisAlignment: MainAxisAlignment.spaceAround,
            children: [
              _AttachOption(
                icon: Icons.camera_alt_rounded,
                label: 'Camera',
                color: Colors.blue,
                onTap: () async {
                  Navigator.pop(ctx);
                  final f = await _imagePicker.pickImage(
                      source: ImageSource.camera, imageQuality: 80);
                  if (f != null && mounted) {
                    await _sendMedia(await f.readAsBytes(), 'image', myId,
                        fileName: f.name);
                    _scrollToBottom();
                  }
                },
              ),
              _AttachOption(
                icon: Icons.photo_library_rounded,
                label: 'Gallery',
                color: Colors.purple,
                onTap: () async {
                  Navigator.pop(ctx);
                  final f = await _imagePicker.pickImage(
                      source: ImageSource.gallery, imageQuality: 80);
                  if (f != null && mounted) {
                    await _sendMedia(await f.readAsBytes(), 'image', myId,
                        fileName: f.name);
                    _scrollToBottom();
                  }
                },
              ),
              _AttachOption(
                icon: Icons.videocam_rounded,
                label: 'Video',
                color: Colors.red,
                onTap: () async {
                  Navigator.pop(ctx);
                  final f = await _imagePicker.pickVideo(
                      source: ImageSource.gallery);
                  if (f != null && mounted) {
                    await _sendMedia(await f.readAsBytes(), 'video', myId,
                        fileName: f.name);
                    _scrollToBottom();
                  }
                },
              ),
              _AttachOption(
                icon: Icons.insert_drive_file_rounded,
                label: 'Document',
                color: Colors.orange,
                onTap: () async {
                  Navigator.pop(ctx);
                  final result =
                      await FilePicker.platform.pickFiles(withData: true);
                  if (result != null &&
                      result.files.isNotEmpty &&
                      mounted) {
                    final file = result.files.first;
                    if (file.bytes != null) {
                      await _sendMedia(file.bytes!, 'document', myId,
                          fileName: file.name);
                      _scrollToBottom();
                    }
                  }
                },
              ),
            ],
          ),
        ),
      ),
    );
  }

  // ── Socket ────────────────────────────────────────────────────────────────────

  void _listenSocket() {
    SocketService.instance.on('new-group-message', _onNewMsg);
    SocketService.instance.on('group-message-delivered', _onDelivered);
    SocketService.instance.on('group-messages-read', _onRead);
  }

  void _onNewMsg(dynamic d) async {
    final m = d as Map?;
    if (m == null) return;
    if ((m['groupId'] as String?) != widget.groupId) return;

    final rawMsg = Map<String, dynamic>.from(m['message'] as Map);
    final myId = context.read<AuthProvider>().user?.id ?? '';

    // The socket payload contains the full memberKeys array; extract our key.
    if (rawMsg['encryptedKey'] == null) {
      final memberKeys = rawMsg['memberKeys'] as List? ?? [];
      for (final k in memberKeys) {
        final entry = Map<String, dynamic>.from(k as Map);
        if (entry['userId']?.toString() == myId) {
          rawMsg['encryptedKey'] = entry['encryptedKey'];
          break;
        }
      }
    }

    final msg = GroupMessage.fromJson(rawMsg);

    // Skip if already added (e.g. HTTP response arrived first)
    if (_messages.any((e) => e.id == msg.id)) return;

    final dec = await _decrypt(msg, myId);
    if (mounted) {
      setState(() {
        if (!_messages.any((e) => e.id == msg.id)) {
          _messages.add(dec);
        }
      });
      _scrollToBottom();
    }
    SocketService.instance.emit('group-message-delivered',
        {'messageId': msg.id, 'groupId': widget.groupId});
    await ApiService.instance.markGroupRead(widget.groupId).catchError((_) {});
  }

  void _onDelivered(dynamic d) {
    final m = d as Map?;
    if (m == null) return;
    final mid = m['messageId'] as String?;
    if (mid == null) return;
    final count = m['deliveredCount'] as int? ?? 0;
    if (mounted) {
      setState(() {
        _messages = [
          for (final msg in _messages)
            msg.id == mid
                ? msg.copyWith(
                    deliveredTo: List.generate(
                        count + 1,
                        (i) => {
                              'userId': i == 0
                                  ? (context.read<AuthProvider>().user?.id ?? '')
                                  : 'member_$i',
                              'at': DateTime.now().toIso8601String()
                            }))
                : msg
        ];
      });
    }
  }

  void _onRead(dynamic d) {
    final m = d as Map?;
    if (m == null) return;
    if ((m['groupId'] as String?) != widget.groupId) return;
    final ids = List<String>.from(
        (m['messageIds'] as List? ?? []).map((e) => e as String));
    final by = m['readBy'] as String? ?? '';
    final idSet = ids.toSet();
    if (mounted) {
      setState(() {
        _messages = [
          for (final msg in _messages)
            idSet.contains(msg.id)
                ? msg.copyWith(readBy: [
                    ...msg.readBy,
                    {'userId': by, 'at': DateTime.now().toIso8601String()}
                  ])
                : msg
        ];
      });
    }
  }

  // ── Helpers ───────────────────────────────────────────────────────────────────

  void _scrollToBottom() => WidgetsBinding.instance.addPostFrameCallback((_) {
        if (_scroll.hasClients) {
          _scroll.animateTo(_scroll.position.maxScrollExtent,
              duration: const Duration(milliseconds: 300),
              curve: Curves.easeOut);
        }
      });

  // ── Build ─────────────────────────────────────────────────────────────────────

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final me = context.watch<AuthProvider>().user!;
    final memberCount = (_group?.memberCount ?? 1) - 1;

    return Scaffold(
      backgroundColor:
          isDark ? const Color(0xFF080816) : const Color(0xFFEEF2FF),
      appBar: AppBar(
          backgroundColor: isDark ? ReonColors.surfaceDark : Colors.white,
          elevation: 0,
          titleSpacing: 0,
          leading: IconButton(
              icon: Icon(Icons.arrow_back_ios_new,
                  size: 18,
                  color: isDark ? Colors.white : ReonColors.textLight),
              onPressed: () => Navigator.of(context).pop()),
          title: Row(children: [
            ChatAvatar(name: widget.groupName, size: 38),
            const SizedBox(width: 10),
            Expanded(
                child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    mainAxisSize: MainAxisSize.min,
                    children: [
                  Text(widget.groupName,
                      style: GoogleFonts.inter(
                          fontSize: 15,
                          fontWeight: FontWeight.w600,
                          color: isDark ? Colors.white : ReonColors.textLight)),
                  Text('${_group?.memberCount ?? 0} members',
                      style: GoogleFonts.inter(
                          fontSize: 12, color: ReonColors.textMuted)),
                ])),
          ])),
      body: Column(children: [
        if (_hasMore && !_loading)
          GestureDetector(
              onTap: () => _loadMessages(
                  before: _messages.isNotEmpty
                      ? _messages.first.sentAt.toIso8601String()
                      : null),
              child: Container(
                  padding: const EdgeInsets.symmetric(vertical: 8),
                  child: Text('Load earlier',
                      style: GoogleFonts.inter(
                          fontSize: 12,
                          color: ReonColors.primary,
                          fontWeight: FontWeight.w600)))),
        Expanded(
            child: _loading && _messages.isEmpty
                ? const Center(child: CircularProgressIndicator())
                : CustomPaint(
                    painter: _DotGrid(isDark: isDark),
                    child: ListView.builder(
                        controller: _scroll,
                        padding: const EdgeInsets.symmetric(vertical: 10),
                        itemCount: _messages.length,
                        itemBuilder: (_, i) {
                          final msg = _messages[i];
                          // System messages render as centered chips
                          if (msg.isSystem) {
                            return _SystemChip(
                                text: msg.ciphertext ?? '', isDark: isDark);
                          }
                          final isMine = msg.sender.id == me.id;
                          return _GroupBubble(
                              message: msg,
                              isMine: isMine,
                              memberCount: memberCount,
                              myId: me.id);
                        }))),
        if (_uploading)
          LinearProgressIndicator(
              backgroundColor: ReonColors.primary.withValues(alpha: 0.1),
              color: ReonColors.primary),
        // Emoji sticker panel
        if (_showEmojiPanel)
          _EmojiPanel(
            isDark: isDark,
            onEmoji: (emoji) {
              final pos = _input.selection;
              final text = _input.text;
              if (pos.isValid && pos.start >= 0) {
                final start = pos.start.clamp(0, text.length);
                final end = pos.end.clamp(0, text.length);
                _input.text = text.replaceRange(start, end, emoji);
                _input.selection =
                    TextSelection.collapsed(offset: start + emoji.length);
              } else {
                _input.text = text + emoji;
              }
              setState(() {});
            },
          ),
        // Input bar
        _buildInputBar(isDark, me.id),
      ]),
    );
  }

  Widget _buildInputBar(bool isDark, String myId) {
    if (_recording) {
      return Container(
        color: isDark ? ReonColors.surfaceDark : Colors.white,
        padding: EdgeInsets.only(
          left: 12,
          right: 12,
          top: 8,
          bottom: MediaQuery.of(context).padding.bottom + 8,
        ),
        child: Row(children: [
          IconButton(
            icon: const Icon(Icons.close_rounded, color: Colors.red),
            onPressed: _cancelRecording,
            tooltip: 'Cancel',
          ),
          Container(
            width: 8,
            height: 8,
            decoration:
                const BoxDecoration(color: Colors.red, shape: BoxShape.circle),
          ),
          const SizedBox(width: 10),
          Expanded(
            child: Text(
              'Recording  ${_formatDuration(_recordDuration)}',
              style: GoogleFonts.inter(
                  fontSize: 14,
                  color: isDark ? ReonColors.textDark : ReonColors.textLight),
            ),
          ),
          GestureDetector(
            onTap: () => _stopAndSendVoice(myId),
            child: _SendButton(),
          ),
        ]),
      );
    }

    return Container(
      color: isDark ? ReonColors.surfaceDark : Colors.white,
      padding: EdgeInsets.only(
        left: 4,
        right: 8,
        top: 8,
        bottom: MediaQuery.of(context).padding.bottom + 8,
      ),
      child: Row(crossAxisAlignment: CrossAxisAlignment.end, children: [
        // Emoji toggle
        IconButton(
          icon: Icon(
            _showEmojiPanel
                ? Icons.keyboard_rounded
                : Icons.emoji_emotions_outlined,
            color: isDark ? ReonColors.textMuted : Colors.grey.shade500,
            size: 22,
          ),
          onPressed: () {
            setState(() => _showEmojiPanel = !_showEmojiPanel);
            if (_showEmojiPanel) FocusScope.of(context).unfocus();
          },
        ),
        // Attachment (only when empty)
        if (_input.text.trim().isEmpty)
          IconButton(
            icon: Icon(Icons.attach_file_rounded,
                color: isDark ? ReonColors.textMuted : Colors.grey.shade500,
                size: 22),
            onPressed: () => _showAttachmentSheet(myId),
          ),
        // Text field
        Expanded(
          child: Container(
            constraints: const BoxConstraints(maxHeight: 120),
            decoration: BoxDecoration(
              color: isDark ? ReonColors.bgDark : const Color(0xFFF3F4F6),
              borderRadius: BorderRadius.circular(22),
            ),
            child: TextField(
              controller: _input,
              maxLines: null,
              onChanged: (v) => setState(() {}),
              onTap: () {
                if (_showEmojiPanel) setState(() => _showEmojiPanel = false);
              },
              style: GoogleFonts.inter(
                  fontSize: 14.5,
                  color: isDark ? ReonColors.textDark : ReonColors.textLight),
              decoration: InputDecoration(
                hintText: 'Message ${widget.groupName}…',
                hintStyle: GoogleFonts.inter(
                    fontSize: 14.5, color: ReonColors.textMuted),
                contentPadding: const EdgeInsets.symmetric(
                    horizontal: 16, vertical: 10),
                border: InputBorder.none,
              ),
            ),
          ),
        ),
        const SizedBox(width: 6),
        // Send or Mic
        if (_input.text.trim().isNotEmpty)
          GestureDetector(onTap: _send, child: _SendButton())
        else
          GestureDetector(onTap: _startRecording, child: _MicButton()),
      ]),
    );
  }
}

// ── System message chip ───────────────────────────────────────────────────────

class _SystemChip extends StatelessWidget {
  final String text;
  final bool isDark;
  const _SystemChip({required this.text, required this.isDark});

  @override
  Widget build(BuildContext context) => Padding(
        padding: const EdgeInsets.symmetric(vertical: 6),
        child: Center(
          child: Container(
            padding:
                const EdgeInsets.symmetric(horizontal: 14, vertical: 5),
            decoration: BoxDecoration(
              color: isDark
                  ? Colors.white.withValues(alpha: 0.08)
                  : Colors.black.withValues(alpha: 0.06),
              borderRadius: BorderRadius.circular(20),
            ),
            child: Text(
              text,
              style: GoogleFonts.inter(
                  fontSize: 12,
                  color: isDark
                      ? Colors.white60
                      : Colors.black54),
              textAlign: TextAlign.center,
            ),
          ),
        ),
      );
}

// ── Group message bubble ───────────────────────────────────────────────────────

class _GroupBubble extends StatelessWidget {
  final GroupMessage message;
  final bool isMine;
  final int memberCount;
  final String myId;
  const _GroupBubble(
      {required this.message,
      required this.isMine,
      required this.memberCount,
      required this.myId});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    final time = DateFormat('HH:mm').format(message.sentAt);
    final hasMedia = message.media.isNotEmpty;
    final isLocalPreview = !hasMedia && message.localBytes != null;
    final text = message.plaintext ??
        (hasMedia ? null : message.ciphertext);
    final senderName = message.sender.fullName;

    return Padding(
      padding: EdgeInsets.only(
          top: 2, bottom: 2, left: isMine ? 64 : 12, right: isMine ? 12 : 64),
      child: Column(
          crossAxisAlignment:
              isMine ? CrossAxisAlignment.end : CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            if (!isMine)
              Row(children: [
                ChatAvatar(
                    name: senderName,
                    imageUrl: message.sender.profilePic,
                    size: 20),
                const SizedBox(width: 6),
                Text(senderName,
                    style: GoogleFonts.inter(
                        fontSize: 11.5,
                        fontWeight: FontWeight.w600,
                        color: ReonColors.primary)),
              ]),
            const SizedBox(height: 2),
            Container(
              decoration: isMine
                  ? gradientBubbleDecoration(roundBR: false)
                  : BoxDecoration(
                      color: isDark ? ReonColors.cardDark : Colors.white,
                      borderRadius: const BorderRadius.only(
                          topLeft: Radius.circular(4),
                          topRight: Radius.circular(18),
                          bottomLeft: Radius.circular(18),
                          bottomRight: Radius.circular(18)),
                      boxShadow: [
                          BoxShadow(
                              color: Colors.black
                                  .withValues(alpha: isDark ? 0.25 : 0.06),
                              blurRadius: 6,
                              offset: const Offset(0, 2))
                        ]),
              // No padding for image-only bubbles
              padding: ((hasMedia && message.media.first.type == 'image' &&
                          (text == null || text.isEmpty)) ||
                      (isLocalPreview && message.contentType == 'image'))
                  ? EdgeInsets.zero
                  : const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
              child: Column(
                  crossAxisAlignment: CrossAxisAlignment.end,
                  mainAxisSize: MainAxisSize.min,
                  children: [
                    // Server media content
                    if (hasMedia)
                      buildMediaContentWidget(message.media.first, isMine),
                    // Local preview while uploading
                    if (isLocalPreview) ...[
                      if (message.contentType == 'image')
                        ClipRRect(
                          borderRadius: BorderRadius.circular(12),
                          child: Stack(children: [
                            Image.memory(message.localBytes!,
                                width: 200, height: 150, fit: BoxFit.cover),
                            const Positioned.fill(
                                child: ColoredBox(color: Color(0x55000000))),
                            const Center(
                                child: SizedBox(
                                    width: 28,
                                    height: 28,
                                    child: CircularProgressIndicator(
                                        color: Colors.white, strokeWidth: 2))),
                          ]),
                        )
                      else
                        Row(mainAxisSize: MainAxisSize.min, children: [
                          const SizedBox(
                              width: 16,
                              height: 16,
                              child: CircularProgressIndicator(
                                  strokeWidth: 2, color: Colors.white)),
                          const SizedBox(width: 8),
                          Text(
                              'Uploading ${message.localFileName ?? message.contentType}…',
                              style: GoogleFonts.inter(
                                  fontSize: 13,
                                  color: isMine
                                      ? Colors.white70
                                      : ReonColors.textMuted)),
                        ]),
                    ],
                    // Text content
                    if (text != null && text.isNotEmpty)
                      Padding(
                        padding: hasMedia
                            ? const EdgeInsets.only(top: 6)
                            : EdgeInsets.zero,
                        child: Text(text,
                            style: GoogleFonts.inter(
                                fontSize: 14.5,
                                height: 1.45,
                                color: isMine
                                    ? Colors.white
                                    : (isDark
                                        ? ReonColors.textDark
                                        : ReonColors.textLight))),
                      ),
                    // Encrypted fallback
                    if (!hasMedia && !isLocalPreview &&
                        text == null && message.ciphertext != null)
                      Text('🔒 Encrypted',
                          style: GoogleFonts.inter(
                              fontSize: 13,
                              fontStyle: FontStyle.italic,
                              color: isMine
                                  ? Colors.white70
                                  : ReonColors.textMuted)),
                    const SizedBox(height: 4),
                    Row(mainAxisSize: MainAxisSize.min, children: [
                      Text(time,
                          style: GoogleFonts.inter(
                              fontSize: 11,
                              color: isMine
                                  ? Colors.white.withValues(alpha: 0.6)
                                  : ReonColors.textMuted)),
                      if (isMine) ...[
                        const SizedBox(width: 3),
                        _GroupTick(
                            senderId: message.sender.id,
                            readBy: message.readBy,
                            deliveredTo: message.deliveredTo,
                            memberCount: memberCount)
                      ],
                    ]),
                  ]),
            ),
          ]),
    );
  }
}

class _GroupTick extends StatelessWidget {
  final String senderId;
  final List<Map<String, dynamic>> readBy, deliveredTo;
  final int memberCount;
  const _GroupTick(
      {required this.senderId,
      required this.readBy,
      required this.deliveredTo,
      required this.memberCount});

  @override
  Widget build(BuildContext context) {
    final otherRead = readBy.where((r) => r['userId'] != senderId).length;
    final otherDelivered =
        deliveredTo.where((d) => d['userId'] != senderId).length;
    final allRead = memberCount > 0 && otherRead >= memberCount;

    if (allRead) {
      return Icon(Icons.done_all_rounded,
          size: 14, color: ReonColors.accent.withValues(alpha: 0.9));
    }
    if (otherDelivered > 0) {
      return Icon(Icons.done_all_rounded,
          size: 14, color: Colors.white.withValues(alpha: 0.6));
    }
    return Icon(Icons.done_rounded,
        size: 14, color: Colors.white.withValues(alpha: 0.5));
  }
}

// ── Emoji panel ───────────────────────────────────────────────────────────────

class _EmojiPanel extends StatelessWidget {
  final bool isDark;
  final void Function(String) onEmoji;
  const _EmojiPanel({required this.isDark, required this.onEmoji});

  @override
  Widget build(BuildContext context) => Container(
        height: 200,
        color: isDark ? ReonColors.surfaceDark : Colors.white,
        child: GridView.builder(
          padding: const EdgeInsets.all(8),
          gridDelegate: const SliverGridDelegateWithFixedCrossAxisCount(
            crossAxisCount: 10,
            mainAxisSpacing: 4,
            crossAxisSpacing: 4,
          ),
          itemCount: _stickers.length,
          itemBuilder: (_, i) => GestureDetector(
            onTap: () => onEmoji(_stickers[i]),
            child: Center(
                child: Text(_stickers[i],
                    style: const TextStyle(fontSize: 22))),
          ),
        ),
      );
}

// ── Attachment option ─────────────────────────────────────────────────────────

class _AttachOption extends StatelessWidget {
  final IconData icon;
  final String label;
  final Color color;
  final VoidCallback onTap;
  const _AttachOption(
      {required this.icon,
      required this.label,
      required this.color,
      required this.onTap});

  @override
  Widget build(BuildContext context) {
    final isDark = Theme.of(context).brightness == Brightness.dark;
    return GestureDetector(
      onTap: onTap,
      child: Column(mainAxisSize: MainAxisSize.min, children: [
        Container(
          width: 56,
          height: 56,
          decoration: BoxDecoration(
            color: color.withValues(alpha: 0.12),
            shape: BoxShape.circle,
          ),
          child: Icon(icon, color: color, size: 26),
        ),
        const SizedBox(height: 6),
        Text(label,
            style: GoogleFonts.inter(
                fontSize: 12,
                color: isDark ? ReonColors.textMuted : Colors.grey.shade700)),
      ]),
    );
  }
}

// ── Send / Mic buttons ────────────────────────────────────────────────────────

class _SendButton extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
            gradient: kBrandGradient,
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                  color: ReonColors.primary.withValues(alpha: 0.35),
                  blurRadius: 10,
                  offset: const Offset(0, 3))
            ]),
        child: const Icon(Icons.send_rounded, color: Colors.white, size: 20),
      );
}

class _MicButton extends StatelessWidget {
  @override
  Widget build(BuildContext context) => Container(
        width: 44,
        height: 44,
        decoration: BoxDecoration(
            gradient: kBrandGradient,
            shape: BoxShape.circle,
            boxShadow: [
              BoxShadow(
                  color: ReonColors.primary.withValues(alpha: 0.35),
                  blurRadius: 10,
                  offset: const Offset(0, 3))
            ]),
        child: const Icon(Icons.mic_rounded, color: Colors.white, size: 20),
      );
}

// ── Background dot grid ───────────────────────────────────────────────────────

class _DotGrid extends CustomPainter {
  final bool isDark;
  const _DotGrid({required this.isDark});
  @override
  void paint(Canvas c, Size s) {
    final p = Paint()
      ..color = ReonColors.primary.withValues(alpha: isDark ? 0.18 : 0.07)
      ..style = PaintingStyle.fill;
    for (double x = 0; x < s.width; x += 22) {
      for (double y = 0; y < s.height; y += 22) {
        c.drawCircle(Offset(x, y), 1, p);
      }
    }
  }

  @override
  bool shouldRepaint(_DotGrid o) => o.isDark != isDark;
}
