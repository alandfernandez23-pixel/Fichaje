import 'package:flutter/material.dart';
import '../services/auth_service.dart';
import '../services/fichaje_service.dart';

class FichajeScreen extends StatefulWidget {
  const FichajeScreen({super.key});

  @override
  State<FichajeScreen> createState() => _FichajeScreenState();
}

class _FichajeScreenState extends State<FichajeScreen> {
  bool _procesando = false;

  @override
  Widget build(BuildContext context) {
    final user = AuthService.instance.currentUser!;

    return Scaffold(
      appBar: AppBar(
        title: Text(user.displayName ?? 'Fichaje'),
        actions: [
          IconButton(
            icon: const Icon(Icons.logout),
            tooltip: 'Cerrar sesión',
            onPressed: () => AuthService.instance.signOut(),
          ),
        ],
      ),
      body: StreamBuilder<EstadoFichaje>(
        stream: FichajeService.instance.estadoActual(user.uid),
        builder: (context, snapshot) {
          if (!snapshot.hasData) {
            return const Center(child: CircularProgressIndicator());
          }

          final estado = snapshot.data!;
          final adentro = estado == EstadoFichaje.adentro;
          final color = adentro ? const Color(0xFF2E7D32) : const Color(0xFFC62828);
          final texto = adentro
              ? 'Estás fichado.\nTocá para marcar tu salida.'
              : 'Estás afuera.\nTocá para marcar tu entrada.';

          return Center(
            child: Column(
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                GestureDetector(
                  onTap: _procesando
                      ? null
                      : () => _alternarFichaje(user.uid, adentro),
                  child: AnimatedContainer(
                    duration: const Duration(milliseconds: 250),
                    width: 180,
                    height: 180,
                    decoration: BoxDecoration(
                      shape: BoxShape.circle,
                      color: color,
                      boxShadow: [
                        BoxShadow(
                          color: color.withOpacity(0.4),
                          blurRadius: 24,
                          spreadRadius: 4,
                        ),
                      ],
                    ),
                    child: _procesando
                        ? const Center(
                            child: CircularProgressIndicator(color: Colors.white),
                          )
                        : const Icon(Icons.fingerprint,
                            size: 96, color: Colors.white),
                  ),
                ),
                const SizedBox(height: 32),
                Padding(
                  padding: const EdgeInsets.symmetric(horizontal: 32),
                  child: Text(
                    texto,
                    textAlign: TextAlign.center,
                    style: const TextStyle(fontSize: 18, color: Colors.black87),
                  ),
                ),
              ],
            ),
          );
        },
      ),
    );
  }

  Future<void> _alternarFichaje(String uid, bool estabaAdentro) async {
    setState(() => _procesando = true);
    try {
      if (estabaAdentro) {
        await FichajeService.instance.ficharSalida(uid);
      } else {
        await FichajeService.instance
            .ficharEntrada(AuthService.instance.currentUser!);
      }
    } catch (e) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Error al fichar: $e')),
        );
      }
    } finally {
      if (mounted) setState(() => _procesando = false);
    }
  }
}
