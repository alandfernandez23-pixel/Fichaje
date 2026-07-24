// Este archivo se genera AUTOMÁTICAMENTE al correr:
//
//   flutterfire configure
//
// desde la carpeta mobile/, después de crear tu proyecto en
// https://console.firebase.google.com
//
// No lo edites a mano: el comando de arriba va a reemplazar
// este archivo completo con tus credenciales reales de Firebase
// (para Android e iOS).
//
// Ver el README.md en la raíz del proyecto para el paso a paso.

import 'package:firebase_core/firebase_core.dart' show FirebaseOptions;
import 'package:flutter/foundation.dart'
    show defaultTargetPlatform, kIsWeb, TargetPlatform;

class DefaultFirebaseOptions {
  static FirebaseOptions get currentPlatform {
    if (kIsWeb) {
      throw UnsupportedError(
        'Este proyecto es solo para Android e iOS. Corré "flutterfire configure".',
      );
    }
    switch (defaultTargetPlatform) {
      case TargetPlatform.android:
      case TargetPlatform.iOS:
        throw UnsupportedError(
          'Todavía no configuraste Firebase. Corré "flutterfire configure" '
          'desde la carpeta mobile/ para generar este archivo con tus '
          'credenciales reales.',
        );
      default:
        throw UnsupportedError(
          'DefaultFirebaseOptions no soporta esta plataforma.',
        );
    }
  }
}
