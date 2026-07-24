import 'package:cloud_firestore/cloud_firestore.dart';
import 'package:firebase_auth/firebase_auth.dart';

/// Representa el estado actual de fichaje de un usuario:
/// si está "adentro" (ya fichó entrada y no fichó salida) o "afuera".
enum EstadoFichaje { adentro, afuera }

class FichajeService {
  FichajeService._();
  static final FichajeService instance = FichajeService._();

  final FirebaseFirestore _db = FirebaseFirestore.instance;

  CollectionReference<Map<String, dynamic>> get _fichajes =>
      _db.collection('fichajes');

  /// Escucha en tiempo real si el usuario tiene una entrada abierta
  /// (fichó entrada pero todavía no fichó salida).
  Stream<EstadoFichaje> estadoActual(String uid) {
    return _fichajes
        .where('uid', isEqualTo: uid)
        .where('horaSalida', isNull: true)
        .snapshots()
        .map((snap) =>
            snap.docs.isEmpty ? EstadoFichaje.afuera : EstadoFichaje.adentro);
  }

  /// Registra la entrada: crea un documento nuevo con horaEntrada
  /// y horaSalida en null.
  Future<void> ficharEntrada(User user) async {
    await _fichajes.add({
      'uid': user.uid,
      'nombre': user.displayName ?? '',
      'email': user.email ?? '',
      'horaEntrada': FieldValue.serverTimestamp(),
      'horaSalida': null,
    });
  }

  /// Registra la salida: busca la entrada abierta del usuario
  /// y le completa horaSalida.
  Future<void> ficharSalida(String uid) async {
    final abiertos = await _fichajes
        .where('uid', isEqualTo: uid)
        .where('horaSalida', isNull: true)
        .orderBy('horaEntrada', descending: true)
        .limit(1)
        .get();

    if (abiertos.docs.isEmpty) return;

    await abiertos.docs.first.reference.update({
      'horaSalida': FieldValue.serverTimestamp(),
    });
  }
}
