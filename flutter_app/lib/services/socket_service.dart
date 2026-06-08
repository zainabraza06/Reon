import 'dart:async';
import 'package:socket_io_client/socket_io_client.dart' as sio;
import '../config.dart';

typedef EventCallback = void Function(dynamic data);

class SocketService {
  SocketService._();
  static final SocketService instance = SocketService._();

  sio.Socket? _socket;
  String? _userId;
  Timer? _heartbeat;

  final _listeners = <String, Set<EventCallback>>{};

  bool get connected => _socket?.connected ?? false;

  void connect(String userId) {
    if (_socket?.connected == true && _userId == userId) return;
    _userId = userId;

    _socket = sio.io(
        kSocketUrl,
        sio.OptionBuilder()
            .setTransports(['websocket', 'polling'])
            .enableReconnection()
            .setReconnectionAttempts(10)
            .setReconnectionDelay(1000)
            .build());

    _socket!.onConnect((_) {
      _socket!.emit('authenticate', userId);
      _socket!.emit('join-groups');
      _startHeartbeat();
    });

    _socket!.onDisconnect((_) => _stopHeartbeat());

    // Bridge all events to our listener map
    _socket!.onAny((event, data) {
      _listeners[event]?.forEach((fn) => fn(data));
    });
  }

  void disconnect() {
    _stopHeartbeat();
    _socket?.disconnect();
    _socket = null;
    _userId = null;
  }

  void on(String event, EventCallback fn) {
    _listeners.putIfAbsent(event, () => {}).add(fn);
  }

  void off(String event, EventCallback fn) {
    _listeners[event]?.remove(fn);
  }

  void emit(String event, [dynamic data]) {
    _socket?.emit(event, data);
  }

  void _startHeartbeat() {
    _stopHeartbeat();
    _heartbeat = Timer.periodic(const Duration(seconds: 12), (_) {
      _socket?.emit('heartbeat');
    });
  }

  void _stopHeartbeat() {
    _heartbeat?.cancel();
    _heartbeat = null;
  }
}
